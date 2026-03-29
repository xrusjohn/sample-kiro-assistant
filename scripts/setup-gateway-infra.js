#!/usr/bin/env node
/**
 * AgentCore Gateway Infrastructure Setup
 * 
 * Captures the manual CLI steps as a reproducible script.
 * Run: node scripts/setup-gateway-infra.js
 * 
 * Prerequisites:
 *   - AWS credentials configured (Isengard)
 *   - Cognito user pool with Midway IdP already exists
 * 
 * What it creates:
 *   1. IAM role for the gateway (trusts bedrock-agentcore + lambda)
 *   2. AgentCore Gateway with Cognito JWT auth
 *   3. A sample Lambda tool (joke-teller)
 *   4. Gateway target wiring the Lambda as an MCP tool
 * 
 * Configuration is at the top — edit for your environment.
 */

const { execSync } = require("child_process");

// === CONFIGURATION ===
const CONFIG = {
  region: "us-west-2",
  accountId: "441262788356",

  // Gateway
  gatewayName: "kiro-assistant-gateway",
  gatewayRoleName: "kiro-assistant-gateway-role",

  // Cognito (existing)
  cognitoPoolId: "us-east-1_oq5s80PlL",
  cognitoClientId: "434321f0nj66bmo12i2qg7eled",
  cognitoDomain: "https://xrusjohn-demo.auth.us-east-1.amazoncognito.com",

  // Federate (via Cognito)
  // The gateway validates JWTs from Cognito, which federates to Midway via Federate integ
  cognitoDiscoveryUrl: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_oq5s80PlL/.well-known/openid-configuration",

  // Sample tool
  jokeLambdaName: "kiro-gateway-joke-teller",
};

function aws(cmd) {
  const full = `aws ${cmd} --region ${CONFIG.region} --output json`;
  try {
    const result = execSync(full, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return JSON.parse(result);
  } catch (e) {
    const stderr = e.stderr?.toString() || "";
    if (stderr.includes("already exists") || stderr.includes("EntityAlreadyExists")) {
      console.log("  (already exists, skipping)");
      return null;
    }
    throw new Error(`AWS CLI failed: ${stderr}`);
  }
}

function awsRaw(cmd) {
  const full = `aws ${cmd} --region ${CONFIG.region}`;
  try {
    execSync(full, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e) {
    const stderr = e.stderr?.toString() || "";
    if (!stderr.includes("already exists") && !stderr.includes("EntityAlreadyExists")) {
      console.warn("  Warning:", stderr.trim());
    }
  }
}

async function main() {
  console.log("=== AgentCore Gateway Infrastructure Setup ===\n");

  // 1. IAM Role
  console.log("1. Creating IAM role:", CONFIG.gatewayRoleName);
  const trustPolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "bedrock-agentcore.amazonaws.com" },
        Action: "sts:AssumeRole",
        Condition: { StringEquals: { "aws:SourceAccount": CONFIG.accountId } },
      },
      {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  });

  aws(`iam create-role --role-name ${CONFIG.gatewayRoleName} --assume-role-policy-document '${trustPolicy}' --description "Execution role for Kiro Assistant AgentCore Gateway"`);
  awsRaw(`iam attach-role-policy --role-name ${CONFIG.gatewayRoleName} --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`);
  console.log("  ✓ Role ready\n");

  const roleArn = `arn:aws:iam::${CONFIG.accountId}:role/${CONFIG.gatewayRoleName}`;

  // 2. AgentCore Gateway
  console.log("2. Creating AgentCore Gateway:", CONFIG.gatewayName);
  const authConfig = JSON.stringify({
    customJWTAuthorizer: {
      discoveryUrl: CONFIG.cognitoDiscoveryUrl,
      allowedAudience: [CONFIG.cognitoClientId],
    },
  });

  let gateway = aws(
    `bedrock-agentcore-control create-gateway --name "${CONFIG.gatewayName}" --description "Kiro Assistant gateway with Cognito/Midway auth" --protocol-type MCP --role-arn ${roleArn} --authorizer-type CUSTOM_JWT --authorizer-configuration '${authConfig}'`
  );

  let gatewayId, gatewayUrl;
  if (gateway) {
    gatewayId = gateway.gatewayId;
    gatewayUrl = gateway.gatewayUrl;
  } else {
    // Already exists — find it
    const list = aws("bedrock-agentcore-control list-gateways");
    const existing = list.items.find((g) => g.name === CONFIG.gatewayName);
    if (!existing) throw new Error("Gateway not found after creation");
    gatewayId = existing.gatewayId;
    const details = aws(`bedrock-agentcore-control get-gateway --gateway-identifier ${gatewayId}`);
    gatewayUrl = details.gatewayUrl;
  }

  // Wait for READY
  for (let i = 0; i < 30; i++) {
    const status = aws(`bedrock-agentcore-control get-gateway --gateway-identifier ${gatewayId}`);
    if (status.status === "READY") break;
    console.log(`  Status: ${status.status}...`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`  ✓ Gateway ready: ${gatewayId}`);
  console.log(`  URL: ${gatewayUrl}\n`);

  // 3. Sample Lambda (joke-teller)
  console.log("3. Creating sample Lambda:", CONFIG.jokeLambdaName);
  const lambdaCode = `
import json, random
JOKES = [
    {"setup": "Why do programmers prefer dark mode?", "punchline": "Because light attracts bugs."},
    {"setup": "Why did the developer go broke?", "punchline": "Because he used up all his cache."},
    {"setup": "What's a cloud architect's favorite meal?", "punchline": "Serverless spaghetti."},
    {"setup": "Why do Java developers wear glasses?", "punchline": "Because they can't C#."},
    {"setup": "What did the router say to the doctor?", "punchline": "It hurts when IP."},
    {"setup": "Why was the JavaScript developer sad?", "punchline": "Because he didn't Node how to Express himself."},
]
def handler(event, context):
    topic = (event.get("topic") or "").lower()
    pool = [j for j in JOKES if topic in j["setup"].lower() or topic in j["punchline"].lower()] if topic else JOKES
    joke = random.choice(pool or JOKES)
    return {"statusCode": 200, "body": json.dumps(joke)}
`;
  require("fs").writeFileSync("/tmp/_joke_lambda.py", lambdaCode);
  execSync("cd /tmp && zip -j _joke_lambda.zip _joke_lambda.py", { stdio: "pipe" });
  // Rename to index.py inside zip
  require("fs").renameSync("/tmp/_joke_lambda.py", "/tmp/index.py");
  execSync("cd /tmp && zip -j _joke_lambda.zip index.py", { stdio: "pipe" });

  aws(
    `lambda create-function --function-name ${CONFIG.jokeLambdaName} --description "Sample joke teller for AgentCore Gateway" --handler index.handler --role ${roleArn} --runtime python3.13 --timeout 10 --zip-file fileb:///tmp/_joke_lambda.zip`
  );

  const lambdaArn = `arn:aws:lambda:${CONFIG.region}:${CONFIG.accountId}:function:${CONFIG.jokeLambdaName}`;

  // Add invoke permission
  const invokePolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Action: "lambda:InvokeFunction", Resource: lambdaArn }],
  });
  awsRaw(`iam put-role-policy --role-name ${CONFIG.gatewayRoleName} --policy-name invoke-${CONFIG.jokeLambdaName} --policy-document '${invokePolicy}'`);
  console.log("  ✓ Lambda ready\n");

  // 4. Gateway Target
  console.log("4. Creating gateway target: joke-teller");
  const targetConfig = JSON.stringify({
    mcp: {
      lambda: {
        lambdaArn,
        toolSchema: {
          inlinePayload: [
            {
              name: "tell_joke",
              description: "Tell a random programming joke. Optionally filter by topic.",
              inputSchema: {
                type: "object",
                properties: {
                  topic: { type: "string", description: "Optional topic to filter jokes by (e.g. javascript, java, cloud)" },
                },
                required: [],
              },
            },
          ],
        },
      },
    },
  });

  const target = aws(
    `bedrock-agentcore-control create-gateway-target --gateway-identifier ${gatewayId} --name joke-teller --description "Tells programming jokes" --credential-provider-configurations '[{"credentialProviderType":"GATEWAY_IAM_ROLE"}]' --target-configuration '${targetConfig}'`
  );

  if (target) {
    for (let i = 0; i < 12; i++) {
      const status = aws(`bedrock-agentcore-control get-gateway-target --gateway-identifier ${gatewayId} --target-id ${target.targetId}`);
      if (status.status === "READY") break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    console.log(`  ✓ Target ready: ${target.targetId}\n`);
  }

  // Summary
  console.log("=== Setup Complete ===");
  console.log(`Gateway ID:  ${gatewayId}`);
  console.log(`Gateway URL: ${gatewayUrl}`);
  console.log(`Lambda:      ${lambdaArn}`);
  console.log(`Auth:        Cognito JWT (${CONFIG.cognitoPoolId})`);
  console.log(`\nTest with:`);
  console.log(`  1. Sign in via browser (Midway)`);
  console.log(`  2. curl -H "Authorization: Bearer <id_token>" \\`);
  console.log(`       -X POST -H "Content-Type: application/json" \\`);
  console.log(`       -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \\`);
  console.log(`       "${gatewayUrl}"`);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
