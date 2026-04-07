/**
 * KiroOrchestratorStack — CodeBuild image build + ECS service for the orchestrator.
 * Changes when you update orchestrator code or config.
 */
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import { Construct } from "constructs";
import { RelayNetworkStack } from "./network-stack";
import { join } from "path";

export interface RelayOrchestratorStackProps extends cdk.StackProps {
  network: RelayNetworkStack;
  privateSubnetIds: string[];
  sessionsBucketName: string;
  sessionsS3Key?: string;
}

export class RelayOrchestratorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RelayOrchestratorStackProps) {
    super(scope, id, props);

    const { network } = props;
    const sessionsKey = props.sessionsS3Key ?? "orchestrator/sessions.db";
    const repo = network.orchestratorRepo;

    // --- Source asset: repo root (Dockerfile.server + src/) ---
    const source = new s3assets.Asset(this, "Source", {
      path: join(__dirname, "..", "..", ".."),
      exclude: ["node_modules", ".git", "cdk.out", "infra/cdk/node_modules", "infra/cdk/cdk.out"],
    });

    // --- CodeBuild: build Dockerfile.server → relay-orchestrator:latest ---
    const buildRole = new iam.Role(this, "BuildRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
      inlinePolicies: {
        build: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
              resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/codebuild/*`],
            }),
            new iam.PolicyStatement({ actions: ["ecr:GetAuthorizationToken"], resources: ["*"] }),
            new iam.PolicyStatement({
              actions: ["ecr:BatchCheckLayerAvailability", "ecr:PutImage", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload"],
              resources: [repo.repositoryArn],
            }),
            new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: [`${source.bucket.bucketArn}/*`] }),
          ],
        }),
      },
    });

    const buildProject = new codebuild.Project(this, "Build", {
      projectName: "relay-orchestrator-build",
      role: buildRole,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
        privileged: true,
      },
      source: codebuild.Source.s3({ bucket: source.bucket, path: source.s3ObjectKey }),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: { commands: ["aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $REPO_URI"] },
          build: { commands: ["docker build -f Dockerfile.server -t $REPO_URI:latest ."] },
          post_build: { commands: ["docker push $REPO_URI:latest"] },
        },
      }),
      environmentVariables: {
        AWS_DEFAULT_REGION: { value: this.region },
        REPO_URI: { value: repo.repositoryUri },
      },
    });

    // --- Lambda trigger: runs CodeBuild on deploy, waits for completion ---
    const triggerFn = new lambda.Function(this, "BuildTrigger", {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: "index.handler",
      timeout: cdk.Duration.minutes(15),
      code: lambda.Code.fromInline(`
import boto3, time, urllib3, json
def send(event, context, status, data):
    body = json.dumps({'Status': status, 'Reason': 'See CloudWatch', 'PhysicalResourceId': context.log_stream_name, 'StackId': event['StackId'], 'RequestId': event['RequestId'], 'LogicalResourceId': event['LogicalResourceId'], 'Data': data})
    urllib3.PoolManager().request('PUT', event['ResponseURL'], headers={'content-type': '', 'content-length': str(len(body))}, body=body)
def handler(event, context):
    if event['RequestType'] == 'Delete':
        send(event, context, 'SUCCESS', {}); return
    cb = boto3.client('codebuild')
    build_id = cb.start_build(projectName=event['ResourceProperties']['ProjectName'])['build']['id']
    while True:
        status = cb.batch_get_builds(ids=[build_id])['builds'][0]['buildStatus']
        if status == 'SUCCEEDED':
            send(event, context, 'SUCCESS', {'BuildId': build_id}); return
        elif status in ['FAILED', 'FAULT', 'STOPPED', 'TIMED_OUT']:
            send(event, context, 'FAILED', {'Error': status}); return
        time.sleep(30)
`),
      initialPolicy: [new iam.PolicyStatement({
        actions: ["codebuild:StartBuild", "codebuild:BatchGetBuilds"],
        resources: [buildProject.projectArn],
      })],
    });

    const triggerBuild = new cdk.CustomResource(this, "TriggerBuild", {
      serviceToken: triggerFn.functionArn,
      properties: { ProjectName: buildProject.projectName, SourceHash: source.assetHash },
    });

    // --- Cluster (from network stack) ---
    const cluster = network.cluster;

    // --- IAM: Orchestrator task role ---
    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Orchestrator: manage ECS tasks + read secrets",
    });
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["ecs:RunTask", "ecs:StopTask", "ecs:DescribeTasks"],
      resources: ["*"],
    }));
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["iam:PassRole"],
      resources: ["*"],
      conditions: { StringLike: { "iam:PassedToService": "ecs-tasks.amazonaws.com" } },
    }));
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: ["*"],
    }));

    // S3 for session checkpoint
    const sessionsBucket = s3.Bucket.fromBucketName(this, "SessionsBucket", props.sessionsBucketName);
    sessionsBucket.grantReadWrite(taskRole, sessionsKey);

    // --- Task Definition (uses image built by CodeBuild) ---
    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      family: "relay-orchestrator",
      cpu: 1024,
      memoryLimitMiB: 2048,
      taskRole,
    });
    taskDef.addContainer("orchestrator", {
      image: ecs.ContainerImage.fromEcrRepository(repo, "latest"),
      portMappings: [{ containerPort: 3001 }],
      environment: {
        PORT: "3001",
        ECS_RUNNER_ENABLED: "true",
        ECS_CLUSTER: network.cluster.clusterName,
        ECS_SUBAGENT_TASK_FAMILY: "relay-subagent",
        ECS_SUBAGENT_SUBNETS: props.privateSubnetIds.join(","),
        ECS_SUBAGENT_SECURITY_GROUP: network.saSg.securityGroupId,
        ORIGIN_VERIFY_HEADER: network.originVerifySecret,
        SESSIONS_S3_URI: `s3://${props.sessionsBucketName}/${sessionsKey}`,
        IMAGE_VERSION: source.assetHash.slice(0, 8),
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "orch", logGroup: network.orchLogs }),
    });
    taskDef.node.addDependency(triggerBuild);

    // --- ECS Service ---
    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: false,
      securityGroups: [network.orchSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      circuitBreaker: { enable: true, rollback: true },
    });

    // --- Target Group + Listener Rule ---
    const targetGroup = new elbv2.ApplicationTargetGroup(this, "Tg", {
      vpc: network.vpc,
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
    targetGroup.addTarget(service);

    new elbv2.ApplicationListenerRule(this, "OriginVerifyRule", {
      listener: network.httpsListener,
      priority: 1,
      conditions: [
        elbv2.ListenerCondition.httpHeader("X-Origin-Verify", [network.originVerifySecret]),
      ],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });
  }
}
