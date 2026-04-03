import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export interface KiroRemoteStackProps extends cdk.StackProps {
  /** VPC ID to deploy into */
  vpcId: string;
  /** Public subnet IDs (for ALB) */
  publicSubnetIds: string[];
  /** Private subnet IDs (for ECS tasks) */
  privateSubnetIds: string[];
  /** Availability zones matching the subnets */
  availabilityZones: string[];
  /** ACM certificate ARN for CloudFront + ALB (must cover *.xrusjohn.people.aws.dev) */
  certificateArn: string;
  /** Custom domain for CloudFront (e.g., kiro.xrusjohn.people.aws.dev) */
  domainName: string;
  /** Existing ECS cluster name to use (optional — creates new if not set) */
  clusterName?: string;
  /** Secrets Manager ARN for kiro auth sqlite (injected as KIRO_AUTH_JSON via ECS native secrets) */
  kiroAuthSecretArn: string;
  /** S3 bucket name for orchestrator sessions.db checkpoint */
  sessionsBucketName: string;
  /** S3 key for sessions.db checkpoint (default: orchestrator/sessions.db) */
  sessionsS3Key?: string;
}

export class KiroRemoteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: KiroRemoteStackProps) {
    super(scope, id, props);

    // --- VPC (from attributes — no lookup needed) ---
    const vpc = ec2.Vpc.fromVpcAttributes(this, "Vpc", {
      vpcId: props.vpcId,
      availabilityZones: props.availabilityZones,
      publicSubnetIds: props.publicSubnetIds,
      privateSubnetIds: props.privateSubnetIds,
    });

    // --- ECR Repository ---
    const repo = new ecr.Repository(this, "Repo", {
      repositoryName: "kiro-remote",
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // --- ECS Cluster ---
    const cluster = props.clusterName
      ? ecs.Cluster.fromClusterAttributes(this, "Cluster", {
          clusterName: props.clusterName,
          vpc,
          securityGroups: [],
        })
      : new ecs.Cluster(this, "Cluster", { vpc, clusterName: "kiro-remote" });

    // --- CloudWatch Log Groups ---
    const orchLogs = new logs.LogGroup(this, "OrchLogs", {
      logGroupName: "/ecs/kiro-remote/orchestrator",
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const saLogs = new logs.LogGroup(this, "SubAgentLogs", {
      logGroupName: "/ecs/kiro-remote/subagent",
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- Security Groups ---

    // ALB SG: restricted to CloudFront IPs via managed prefix list
    const albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc,
      description: "ALB - CloudFront origin-facing IPs only",
      allowAllOutbound: true,
    });
    // Use the AWS-managed CloudFront origin-facing prefix list
    // In us-east-1 this is pl-3b927c52; CDK will resolve it at deploy time
    albSg.addIngressRule(
      ec2.Peer.prefixList("pl-3b927c52"),
      ec2.Port.tcp(443),
      "HTTPS from CloudFront"
    );
    albSg.addIngressRule(
      ec2.Peer.prefixList("pl-3b927c52"),
      ec2.Port.tcp(80),
      "HTTP from CloudFront"
    );

    // Orchestrator SG: only from ALB
    const orchSg = new ec2.SecurityGroup(this, "OrchSg", {
      vpc,
      description: "Orchestrator - ALB only",
      allowAllOutbound: true,
    });
    orchSg.addIngressRule(albSg, ec2.Port.tcp(3001), "From ALB");

    // Sub-Agent SG: only from Orchestrator
    const saSg = new ec2.SecurityGroup(this, "SubAgentSg", {
      vpc,
      description: "Sub-Agent - Orchestrator only",
      allowAllOutbound: true,
    });
    saSg.addIngressRule(orchSg, ec2.Port.tcp(8080), "From Orchestrator");

    // --- Origin verify secret (CloudFront → ALB header validation) ---
    const originVerifySecret = cdk.Names.uniqueResourceName(this, { maxLength: 32 });

    // --- IAM: Sub-Agent task role ---
    const saTaskRole = new iam.Role(this, "SubAgentTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Sub-Agent: read secrets + S3 for auth bootstrap",
    });
    saTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: ["*"],
    }));
    saTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: ["*"],
    }));

    // --- IAM: Orchestrator task role ---
    const orchTaskRole = new iam.Role(this, "OrchTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Orchestrator: manage ECS tasks + read secrets",
    });
    orchTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["ecs:RunTask", "ecs:StopTask", "ecs:DescribeTasks"],
      resources: ["*"],
    }));
    orchTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["iam:PassRole"],
      resources: ["*"],
      conditions: { StringLike: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } },
    }));
    orchTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: ["*"],
    }));

    // --- S3: sessions checkpoint bucket ---
    const sessionsKey = props.sessionsS3Key ?? "orchestrator/sessions.db";
    const sessionsBucket = s3.Bucket.fromBucketName(this, "SessionsBucket", props.sessionsBucketName);
    sessionsBucket.grantReadWrite(orchTaskRole, sessionsKey);

    // --- Secrets Manager: kiro auth ---
    const kiroAuthSecret = secretsmanager.Secret.fromSecretCompleteArn(this, "KiroAuthSecret", props.kiroAuthSecretArn);

    // --- ECS Task Definitions ---

    // Get private subnet IDs as comma-separated string for env var
    const privateSubnetIds = props.privateSubnetIds.join(",");

    // Sub-Agent task definition
    const saTaskDef = new ecs.FargateTaskDefinition(this, "SubAgentTaskDef", {
      family: "kiro-remote-subagent",
      cpu: 1024,
      memoryLimitMiB: 4096,
      taskRole: saTaskRole,
    });
    // Execution role needs GetSecretValue for ECS native secrets injection
    kiroAuthSecret.grantRead(saTaskDef.obtainExecutionRole());
    saTaskDef.addContainer("kiro-subagent", {
      image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
      portMappings: [{ containerPort: 8080 }],
      environment: { AWS_REGION: cdk.Stack.of(this).region },
      secrets: {
        KIRO_AUTH_JSON: ecs.Secret.fromSecretsManager(kiroAuthSecret),
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "sa", logGroup: saLogs }),
    });

    // Orchestrator task definition
    const orchTaskDef = new ecs.FargateTaskDefinition(this, "OrchTaskDef", {
      family: "kiro-remote-orchestrator",
      cpu: 1024,
      memoryLimitMiB: 2048,
      taskRole: orchTaskRole,
    });
    orchTaskDef.addContainer("orchestrator", {
      image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
      entryPoint: ["node", "dist-server/server/index.js"],
      portMappings: [{ containerPort: 3001 }],
      environment: {
        PORT: "3001",
        ECS_RUNNER_ENABLED: "true",
        ECS_CLUSTER: props.clusterName ?? "kiro-remote",
        ECS_SUBAGENT_TASK_FAMILY: "kiro-remote-subagent",
        ECS_SUBAGENT_SUBNETS: privateSubnetIds,
        ECS_SUBAGENT_SECURITY_GROUP: saSg.securityGroupId,
        ORIGIN_VERIFY_HEADER: originVerifySecret,
        SESSIONS_S3_URI: `s3://${props.sessionsBucketName}/${sessionsKey}`,
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "orch", logGroup: orchLogs }),
    });

    // --- ALB ---
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // HTTPS listener — default action is 403 (only CloudFront with correct header gets through)
    const cert = acm.Certificate.fromCertificateArn(this, "Cert", props.certificateArn);
    const httpsListener = alb.addListener("Https", {
      port: 443,
      certificates: [cert],
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: "text/plain",
        messageBody: "Forbidden - direct ALB access not allowed",
      }),
    });

    // --- ECS Service (private subnets) ---
    const orchService = new ecs.FargateService(this, "OrchService", {
      cluster: cluster as ecs.ICluster,
      taskDefinition: orchTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
      securityGroups: [orchSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    });

    // Target group with stickiness for WebSocket
    const targetGroup = new elbv2.ApplicationTargetGroup(this, "OrchTg", {
      vpc,
      port: 3001,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/healthz",
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      stickinessCookieDuration: cdk.Duration.days(1),
    });
    targetGroup.addTarget(orchService);

    // Listener rule: forward only if X-Origin-Verify header matches
    new elbv2.ApplicationListenerRule(this, "OriginVerifyRule", {
      listener: httpsListener,
      priority: 1,
      conditions: [
        elbv2.ListenerCondition.httpHeader("X-Origin-Verify", [originVerifySecret]),
      ],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    // --- CloudFront Distribution ---
    const distribution = new cloudfront.Distribution(this, "Cdn", {
      domainNames: [props.domainName],
      certificate: cert,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      comment: `Kiro Remote ECS - ${props.domainName}`,
      defaultBehavior: {
        origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          customHeaders: {
            "X-Origin-Verify": originVerifySecret,
          },
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, "CloudFrontDomain", {
      value: distribution.distributionDomainName,
      description: "CloudFront domain — create CNAME: " + props.domainName + " → this value",
    });
    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
    });
    new cdk.CfnOutput(this, "AlbDns", {
      value: alb.loadBalancerDnsName,
      description: "ALB DNS (not directly accessible — CloudFront only)",
    });
    new cdk.CfnOutput(this, "EcrUri", {
      value: repo.repositoryUri,
      description: "Push container image here",
    });
    new cdk.CfnOutput(this, "Endpoint", {
      value: `https://${props.domainName}`,
      description: "Your endpoint (after DNS CNAME is created)",
    });
    new cdk.CfnOutput(this, "OriginVerifySecret", {
      value: originVerifySecret,
      description: "Shared secret for CloudFront → ALB origin verification",
    });
  }
}
