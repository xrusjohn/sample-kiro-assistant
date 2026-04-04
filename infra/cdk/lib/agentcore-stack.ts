import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";
import { Construct } from "constructs";
import { join } from "path";

export interface KiroAgentCoreStackProps extends cdk.StackProps {
  kiroAuthSecretArn: string;
}

export class KiroAgentCoreStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: KiroAgentCoreStackProps) {
    super(scope, id, props);

    // Import existing ECR repo
    const repo = ecr.Repository.fromRepositoryName(this, "Repo", "kiro-agentcore");

    // Source asset: repo root (Dockerfile.agentcore + scripts/)
    const source = new s3assets.Asset(this, "Source", {
      path: join(__dirname, "..", "..", ".."),
      exclude: ["node_modules", ".git", "cdk.out", "dist*", "infra/cdk/node_modules", "infra/cdk/cdk.out"],
    });

    // ARM64 CodeBuild project
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
      projectName: "kiro-agentcore-arm64",
      role: buildRole,
      environment: {
        buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0,
        computeType: codebuild.ComputeType.LARGE,
        privileged: true,
      },
      source: codebuild.Source.s3({ bucket: source.bucket, path: source.s3ObjectKey }),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          pre_build: { commands: ["aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $REPO_URI"] },
          build: { commands: ["docker build -f Dockerfile.agentcore -t $REPO_URI:latest ."] },
          post_build: { commands: ["docker push $REPO_URI:latest"] },
        },
      }),
      environmentVariables: {
        AWS_DEFAULT_REGION: { value: this.region },
        REPO_URI: { value: repo.repositoryUri },
      },
    });

    // Lambda trigger: runs CodeBuild on deploy, waits for completion
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

    // AgentCore Runtime (L2)
    const artifact = agentcore.AgentRuntimeArtifact.fromEcrRepository(repo, "latest");

    const runtime = new agentcore.Runtime(this, "Runtime", {
      runtimeName: "kiro_assistant",
      agentRuntimeArtifact: artifact,
      protocolConfiguration: agentcore.ProtocolType.A2A,
      networkConfiguration: agentcore.RuntimeNetworkConfiguration.usingPublicNetwork(),
      lifecycleConfiguration: { idleRuntimeSessionTimeout: cdk.Duration.minutes(15) },
      environmentVariables: {
        KIRO_AUTH_SECRET_ARN: props.kiroAuthSecretArn,
        AWS_REGION: this.region,
      },
    });
    runtime.node.addDependency(triggerBuild);

    runtime.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      resources: ["arn:aws:bedrock:*::foundation-model/*"],
    }));
    runtime.addToRolePolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: [props.kiroAuthSecretArn],
    }));

    new cdk.CfnOutput(this, "AgentCoreRuntimeArn", {
      value: runtime.agentRuntimeArn,
      description: "Set AGENTCORE_AGENT_RUNTIME_ARN on the orchestrator",
    });
  }
}
