#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { KiroNetworkStack } from "../lib/network-stack";
import { KiroOrchestratorStack } from "../lib/orchestrator-stack";
import { KiroEcsSubAgentStack } from "../lib/ecs-subagent-stack";
import { KiroAgentCoreStack } from "../lib/agentcore-subagent-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? "441262788356",
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

// Shared config — using app-vpc (HA NAT, proper subnet tiers)
const vpcConfig = {
  vpcId: "vpc-065fb69c911844826",
  publicSubnetIds: [
    "subnet-0b4a85e6a2059e86b",  // us-east-1a public
    "subnet-0432c23580371c7c3",  // us-east-1b public
  ],
  privateSubnetIds: [
    "subnet-0ebf4b0337a9850e1",  // us-east-1a private
    "subnet-041e640342fa93854",  // us-east-1b private
  ],
  availabilityZones: ["us-east-1a", "us-east-1b"],
};

// Stack 1: Network + shared resources
const network = new KiroNetworkStack(app, "KiroNetwork", {
  env,
  ...vpcConfig,
  certificateArn: "arn:aws:acm:us-east-1:441262788356:certificate/9612cb7f-9768-4c30-a2b9-7f6da4ee594e",
  domainName: "kiro.xrusjohn.people.aws.dev",
});

// Stack 2: Orchestrator ECS service
const orchestrator = new KiroOrchestratorStack(app, "KiroOrchestrator", {
  env,
  network,
  privateSubnetIds: vpcConfig.privateSubnetIds,
  sessionsBucketName: "kiro-relay-sessions",
});

// Stack 3: ECS sub-agent task definitions (kiro-cli + claude-code)
const ecsSubAgents = new KiroEcsSubAgentStack(app, "KiroEcsSubAgents", {
  env,
  network,
  kiroAuthSecretArn: "arn:aws:secretsmanager:us-east-1:441262788356:secret:kiro/auth-sqlite-XXXXXX",
});

// Stack 4: AgentCore Runtime (cowboy's stack)
const agentCore = new KiroAgentCoreStack(app, "KiroAgentCore", {
  env,
  network,
});
