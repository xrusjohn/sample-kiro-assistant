#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { KiroRemoteStack } from "../lib/cdk-stack";

const app = new cdk.App();

new KiroRemoteStack(app, "KiroRemoteStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? "441262788356",
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  vpcId: "vpc-0eca3b0efc598dc16",
  publicSubnetIds: [
    "subnet-0b7746dac5b0a0764",  // us-east-1a public
    "subnet-0ecfa05a0c9302f9e",  // us-east-1b public
  ],
  privateSubnetIds: [
    "subnet-0c023c99dd96bf3bb",  // us-east-1a private
    "subnet-06005c0716da0c590",  // us-east-1b private
  ],
  availabilityZones: ["us-east-1a", "us-east-1b"],
  certificateArn: "arn:aws:acm:us-east-1:441262788356:certificate/9612cb7f-9768-4c30-a2b9-7f6da4ee594e",
  domainName: "kiro.xrusjohn.people.aws.dev",
  clusterName: "relay",
});
