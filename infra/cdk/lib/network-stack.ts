/**
 * KiroNetworkStack — shared networking, ECR, CloudFront, ALB, security groups.
 * Changes rarely. Deploy once.
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export interface RelayNetworkStackProps extends cdk.StackProps {
  vpcId: string;
  publicSubnetIds: string[];
  privateSubnetIds: string[];
  availabilityZones: string[];
  certificateArn: string;
  domainName: string;
}

export class RelayNetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly cluster: ecs.ICluster;
  public readonly kiroCliRepo: ecr.IRepository;
  public readonly claudeCodeRepo: ecr.IRepository;
  public readonly orchestratorRepo: ecr.Repository;
  public readonly albSg: ec2.SecurityGroup;
  public readonly orchSg: ec2.SecurityGroup;
  public readonly saSg: ec2.SecurityGroup;
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly httpsListener: elbv2.ApplicationListener;
  public readonly distribution: cloudfront.Distribution;
  public readonly originVerifySecret: string;
  public readonly orchLogs: logs.LogGroup;
  public readonly saLogs: logs.LogGroup;
  public readonly cert: acm.ICertificate;

  constructor(scope: Construct, id: string, props: RelayNetworkStackProps) {
    super(scope, id, props);

    // --- VPC ---
    this.vpc = ec2.Vpc.fromVpcAttributes(this, "Vpc", {
      vpcId: props.vpcId,
      availabilityZones: props.availabilityZones,
      publicSubnetIds: props.publicSubnetIds,
      privateSubnetIds: props.privateSubnetIds,
    });
    // --- ECS Cluster (new, in app-vpc private subnets) ---
    this.cluster = new ecs.Cluster(this, "Cluster", {
      vpc: this.vpc,
      clusterName: "relay",
      containerInsightsV2: ecs.ContainerInsights.ENHANCED,
    });

    // --- ECR Repositories ---
    this.kiroCliRepo = ecr.Repository.fromRepositoryName(this, "KiroCliRepo", "relay");
    this.claudeCodeRepo = ecr.Repository.fromRepositoryName(this, "ClaudeCodeRepo", "relay-claude-code");

    this.orchestratorRepo = new ecr.Repository(this, "OrchestratorRepo", {
      repositoryName: "relay-orchestrator",
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // --- CloudWatch Log Groups ---
    this.orchLogs = new logs.LogGroup(this, "OrchLogs", {
      logGroupName: "/ecs/relay/orchestrator",
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.saLogs = new logs.LogGroup(this, "SubAgentLogs", {
      logGroupName: "/ecs/relay/subagent",
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- Security Groups ---
    this.albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc: this.vpc,
      description: "ALB - CloudFront origin-facing IPs only",
      allowAllOutbound: true,
    });
    // CloudFront origin-facing prefix list — only HTTPS (CF→ALB is HTTPS_ONLY)
    this.albSg.addIngressRule(ec2.Peer.prefixList("pl-3b927c52"), ec2.Port.tcp(443), "HTTPS from CloudFront");

    this.orchSg = new ec2.SecurityGroup(this, "OrchSg", {
      vpc: this.vpc,
      description: "Orchestrator - ALB only",
      allowAllOutbound: true,
    });
    this.orchSg.addIngressRule(this.albSg, ec2.Port.tcp(3001), "From ALB");

    this.saSg = new ec2.SecurityGroup(this, "SubAgentSg", {
      vpc: this.vpc,
      description: "Sub-Agent - Orchestrator only",
      allowAllOutbound: true,
    });
    this.saSg.addIngressRule(this.orchSg, ec2.Port.tcp(8080), "From Orchestrator");

    // --- Origin verify secret ---
    this.originVerifySecret = cdk.Names.uniqueResourceName(this, { maxLength: 32 });

    // --- ALB ---
    this.cert = acm.Certificate.fromCertificateArn(this, "Cert", props.certificateArn);
    this.alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc: this.vpc,
      internetFacing: true,
      securityGroup: this.albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    this.httpsListener = this.alb.addListener("Https", {
      port: 443,
      certificates: [this.cert],
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: "text/plain",
        messageBody: "Forbidden - direct ALB access not allowed",
      }),
    });

    // --- CloudFront ---
    this.distribution = new cloudfront.Distribution(this, "Cdn", {
      domainNames: [props.domainName],
      certificate: this.cert,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      comment: `Relay - ${props.domainName}`,
      defaultBehavior: {
        origin: new origins.HttpOrigin(this.alb.loadBalancerDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          customHeaders: { "X-Origin-Verify": this.originVerifySecret },
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, "CloudFrontDomain", { value: this.distribution.distributionDomainName });
    new cdk.CfnOutput(this, "AlbDns", { value: this.alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, "Endpoint", { value: `https://${props.domainName}` });
    new cdk.CfnOutput(this, "KiroCliEcrUri", { value: this.kiroCliRepo.repositoryUri });
    new cdk.CfnOutput(this, "ClaudeCodeEcrUri", { value: this.claudeCodeRepo.repositoryUri });
    new cdk.CfnOutput(this, "OriginVerifySecret", { value: this.originVerifySecret });
  }
}
