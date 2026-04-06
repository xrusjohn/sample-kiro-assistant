#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { RelayNetworkStack } from "../lib/network-stack";
import { RelayOrchestratorStack } from "../lib/orchestrator-stack";
import { RelayEcsSubAgentStack } from "../lib/ecs-subagent-stack";
import { RelayAgentCoreStack } from "../lib/agentcore-subagent-stack";

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
const network = new RelayNetworkStack(app, "RelayNetwork", {
  env,
  ...vpcConfig,
  certificateArn: "arn:aws:acm:us-east-1:441262788356:certificate/9612cb7f-9768-4c30-a2b9-7f6da4ee594e",
  domainName: "kiro.xrusjohn.people.aws.dev",
});

// Stack 2: Orchestrator ECS service
const orchestrator = new RelayOrchestratorStack(app, "RelayOrchestrator", {
  env,
  network,
  privateSubnetIds: vpcConfig.privateSubnetIds,
  sessionsBucketName: "kiro-relay-sessions",
});

// Stack 3: ECS sub-agent task definitions (kiro-cli + claude-code)
const ecsSubAgents = new RelayEcsSubAgentStack(app, "RelayEcsSubAgents", {
  env,
  network,
  kiroAuthSecretArn: "arn:aws:secretsmanager:us-east-1:441262788356:secret:kiro/auth-sqlite-u9E7FN",
});

// Stack 4: AgentCore Runtime (cowboy's stack)
const agentCore = new RelayAgentCoreStack(app, "RelayAgentCore", {
  env,
  network,
});
