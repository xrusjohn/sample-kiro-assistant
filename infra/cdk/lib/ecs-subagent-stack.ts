/**
 * KiroEcsSubAgentStack — ECS task definitions for kiro-cli and claude-code sub-agents.
 * Changes when you add agents, update images, or change resource limits.
 */
import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { RelayNetworkStack } from "./network-stack";

export interface RelayEcsSubAgentStackProps extends cdk.StackProps {
  network: RelayNetworkStack;
  /** Secrets Manager ARN for kiro-cli auth sqlite */
  kiroAuthSecretArn: string;
}

export class RelayEcsSubAgentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RelayEcsSubAgentStackProps) {
    super(scope, id, props);

    const { network } = props;

    // --- Shared IAM: Sub-Agent base permissions ---
    const baseTaskRole = new iam.Role(this, "BaseTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Sub-Agent base: read secrets + S3 for auth",
    });
    baseTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["secretsmanager:GetSecretValue"],
      resources: ["*"],
    }));
    baseTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: ["*"],
    }));

    // --- Claude Code task role (needs Bedrock) ---
    const claudeTaskRole = new iam.Role(this, "ClaudeTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Claude Code sub-agent: Bedrock access",
    });
    claudeTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      resources: ["*"],
    }));

    // --- AgentCore Identity permissions for Token Vault ---
    baseTaskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        "bedrock-agentcore:GetWorkloadAccessToken",
        "bedrock-agentcore:GetResourceApiKey",
      ],
      resources: ["*"],
    }));

    // --- kiro-cli auth secret ---
    const kiroAuthSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this, "KiroAuthSecret", props.kiroAuthSecretArn
    );

    // =============================================
    // kiro-cli Sub-Agent Task Definition
    // =============================================
    const kiroTaskDef = new ecs.FargateTaskDefinition(this, "KiroTaskDef", {
      family: "relay-subagent",
      cpu: 1024,
      memoryLimitMiB: 4096,
      taskRole: baseTaskRole,
    });
    kiroAuthSecret.grantRead(kiroTaskDef.obtainExecutionRole());
    kiroTaskDef.addContainer("kiro-subagent", {
      image: ecs.ContainerImage.fromEcrRepository(network.kiroCliRepo, "latest"),
      portMappings: [{ containerPort: 8080 }],
      environment: {
        AWS_REGION: cdk.Stack.of(this).region,
        KIRO_CREDENTIAL_PROVIDER: "kiro-cli-creds",
        KIRO_WORKLOAD_NAME: "kiro-subagent",
      },
      secrets: {
        KIRO_AUTH_JSON: ecs.Secret.fromSecretsManager(kiroAuthSecret),
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "kiro-sa", logGroup: network.saLogs }),
    });

    // =============================================
    // Claude Code Sub-Agent Task Definition
    // =============================================
    const claudeTaskDef = new ecs.FargateTaskDefinition(this, "ClaudeTaskDef", {
      family: "relay-claude-subagent",
      cpu: 1024,
      memoryLimitMiB: 4096,
      taskRole: claudeTaskRole,
    });
    claudeTaskDef.addContainer("claude-subagent", {
      image: ecs.ContainerImage.fromEcrRepository(network.claudeCodeRepo, "latest"),
      portMappings: [{ containerPort: 8080 }],
      environment: {
        KIRO_BINARY: "claude-agent-acp",
        AWS_REGION: cdk.Stack.of(this).region,
      },
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "claude-sa", logGroup: network.saLogs }),
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, "KiroTaskFamily", { value: kiroTaskDef.family! });
    new cdk.CfnOutput(this, "ClaudeTaskFamily", { value: claudeTaskDef.family! });
  }
}
