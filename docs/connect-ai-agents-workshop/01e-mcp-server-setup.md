# MCP Server Setup

MCP Server SetupThis module covers how to configure Model Context Protocol (MCP) servers to enable your AI Agents to interact with external systems and APIs. MCP tools work with both Self-Service and Agent Assistance Orchestration Agents.
What is MCP?
Model Context Protocol (MCP) provides a standardized mechanism for AI agents to discover and invoke tools across your systems. Instead of building custom integrations for each application, MCP offers a unified framework that transforms diverse APIs into standardized tools.

Key Benefits

Connect once, use everywhere: Register MCP servers through Amazon Bedrock AgentCore Gateway to transform APIs into tools any AI agent can use
Standardized interface: AI agents interact with all tools through a consistent protocol
Fine-grained control: Override input values, filter outputs, and require user confirmations for sensitive operations

AgentCore Gateway Target Types
Amazon Bedrock AgentCore Gateway supports multiple target types for connecting to your systems:
Target TypeDescriptionUse CaseAWS LambdaConnect to Lambda functions that implement custom toolsCustom business logic, data transformationsAPI Gateway REST APIConnect to API Gateway stagesExisting REST APIs, microservicesOpenAPI SchemaDefine APIs using OpenAPI 3.0 specificationsThird-party REST APIs with OpenAPI docsSmithy ModelConnect to services defined using Smithy API modelsAWS services, structured API definitionsMCP ServersConnect to external MCP serversPre-built MCP tool providersIntegration Provider TemplatesPre-built templates from integration providersQuick integration with popular services
Built-in Integration Provider Templates
AgentCore Gateway includes pre-built templates for popular services:
ProviderCapabilitiesSalesforceCRM data, accounts, opportunitiesServiceNowIncidents, requests, knowledgeZendeskTickets, users, organizationsJiraIssues, projects, workflowsConfluencePages, spaces, searchSlackMessages, channels, usersMicrosoftOffice 365, Teams, SharePointPagerDutyIncidents, escalations
You can learn more about AgentCore Gateway supported gateway targets here .
Tool Naming Convention
Tools in AgentCore Gateway follow a naming pattern that combines the target name with the tool name:

```
${target_name}__${tool_name}
```

For example, if your target is named ReservationAPI and has a tool called get_booking, the full tool name visible to the AI agent is ReservationAPI__get_booking.
Both Tracks Use MCP
MCP tools configured in this Foundation module work with both workshop tracks:
TrackHow MCP Tools Are UsedSelf-ServiceAI agent directly invokes tools to help customers (e.g., book reservations, check account status)Agent AssistanceAI agent invokes tools to provide recommendations to human agents (e.g., lookup customer history, suggest resolutions)
The same MCP server can serve both use cases - you simply configure which AI agents have access to which tools.
What Was Deployed
Your CloudFormation deployment created the following AgentCore Gateway resources:
ResourceDescriptionGatewayMCP server that transforms APIs into toolsCredential ProviderAPI key configuration for backend authenticationGateway TargetsIndustry API targets with placeholder OpenAPI specs
The targets are created with minimal placeholder specifications. In this module, you'll update them with the full OpenAPI specs from S3 to enable all API operations.
Key Authentication Concepts
Understanding how AgentCore Gateway handles authentication is essential for configuring secure communication between Amazon Connect and your backend APIs. The gateway uses a two-way authentication model: inbound (verifying callers) and outbound (authenticating to APIs).
Discovery URL
The Discovery URL is a well-known OpenID Connect (OIDC) endpoint that allows AgentCore Gateway to dynamically accept tokens from an identity provider - in this case, Amazon Connect.

What it does: Provides the gateway with the information needed to validate JWT tokens issued by Amazon Connect
Format: https://{instance-alias}.my.connect.aws/.well-known/openid-configuration
How it works: When Amazon Connect calls the gateway, it includes a JWT token. The gateway uses the Discovery URL to fetch the public keys needed to verify the token's signature.

Allowed Audience
The Allowed Audience is a validation parameter that checks the aud (audience) claim in JWT tokens.

What it does: Ensures that tokens are intended for this specific gateway, preventing token reuse across different gateways
Value: Set to the Gateway ID after the gateway is created
Why it matters: Even if a valid JWT token is intercepted, it cannot be used against a different gateway because the audience claim won't match

Inbound Authentication
Inbound authentication verifies the identity of callers (Amazon Connect) before allowing them to invoke tools through the gateway.

How it works:

Amazon Connect sends a request with a JWT token
The gateway validates the token using the Discovery URL
The gateway checks that the token's aud claim matches the Allowed Audience
If validation passes, the request proceeds; otherwise, it's rejected

This ensures that only authorized Amazon Connect instances can invoke your MCP tools.
Credential Provider (Outbound Authentication)
The Credential Provider handles authentication from the gateway to your backend APIs - this is outbound authentication.

What it does: Automatically injects authentication credentials (like API keys) into requests sent to your backend APIs
How it works: When the gateway calls your API, it retrieves the configured credentials and adds them to the request headers
Supported types: API keys, OAuth 2.0 client credentials

For this workshop, the Credential Provider is pre-configured with an API key that authenticates requests to the industry APIs.
Understanding Gateway AuthenticationInbound Auth (Connect → Gateway): Verifies Amazon Connect's identity using JWT tokens validated against the Discovery URL and Allowed AudienceOutbound Auth (Gateway → APIs): Injects API keys or OAuth tokens for backend API calls using the Credential Provider
Configuring Your MCP Server
Your CloudFormation deployment has already created an AgentCore Gateway with pre-configured targets. In this section, you'll review the gateway configuration and update the targets with the full OpenAPI specifications from S3.
Pre-Deployed Resources
Your deployment includes the following pre-configured resources:

AgentCore Gateway with inbound JWT authentication configured
API Key Credential Provider for backend API authentication
Gateway Targets with placeholder OpenAPI specifications

Your workshop environment has all AgentCore Gateway resources pre-deployed and ready for configuration. The gateway, credential provider, and targets are already created - you just need to update the targets with the full OpenAPI specs.
Step 1: Navigate to Your Pre-Deployed Gateway

Open the AWS Console and search for Amazon Bedrock AgentCore
Click Gateways in the left navigation
Locate your pre-deployed gateway:

Look for a gateway name starting with workshop-gw-
Or find the Gateway ID from your CloudFormation stack outputs (GatewayId)

Click on the gateway name to view its configuration

Pre-Deployed GatewayYour gateway was created by CloudFormation with inbound JWT authentication already configured. The Discovery URL and Allowed Audience are set up to accept tokens from your Amazon Connect instance.
Step 2: Update Target with Full OpenAPI Specification
The pre-deployed targets have placeholder OpenAPI specifications. Update them with the full specifications from S3 to enable all API operations.

From your gateway details page, scroll down to the Targets section
Click on a target to update (e.g., Hotel-API-Target)
Click Edit to modify the target configuration
In the Schema section:

Change Schema Source from Inline to S3 resource
Enter the S3 URI from your CloudFormation stack outputs
For Hotel, use the value from HotelOpenApiSpecS3Location

Click Update target to apply the changes

Finding S3 URIsYour CloudFormation stack outputs contain the S3 URIs for each industry's OpenAPI specification. Navigate to CloudFormation → your stack → Outputs tab to find values like HotelOpenApiSpecS3Location.
Repeat this process for each industry target you want to configure with full API capabilities.
Industry Targets Reference
Your CloudFormation deployment pre-deployed targets for all 11 industries. Use the table below to update any target with its full OpenAPI specification from S3.
IndustryTarget NameCloudFormation OutputHotelHotel-API-TargetHotelOpenApiSpecS3LocationBillingBilling-API-TargetBillingOpenApiSpecS3LocationFacilitiesFacilities-API-TargetFacilitiesOpenApiSpecS3LocationHealthcareHealthcare-API-TargetHealthcareOpenApiSpecS3LocationInsuranceInsurance-API-TargetInsuranceOpenApiSpecS3LocationRetailRetail-API-TargetRetailOpenApiSpecS3LocationTelecomTelecom-API-TargetTelecomOpenApiSpecS3LocationUtilitiesUtilities-API-TargetUtilitiesOpenApiSpecS3LocationPublic SectorPublicSector-API-TargetPublicSectorOpenApiSpecS3LocationAutomotiveAutomotive-API-TargetAutomotiveOpenApiSpecS3LocationManufacturingManufacturing-API-TargetManufacturingOpenApiSpecS3Location
Shared API KeyAll industry APIs use the same pre-configured API key credential provider, so you don't need to configure authentication separately for each target.
Associating MCP Server with Amazon Connect
Your AgentCore Gateway is pre-deployed and configured. The final step is to associate it with your Amazon Connect instance so your AI Agents can invoke the MCP tools.

Open the Amazon Connect Console
Go to Third-party applications in the left navigation
Click Add application
Configure the application:

Display name: A descriptive name (e.g., workshop-gateway)
Description: Brief description
Application type: Select MCP server

Select your Connect instance in the Instance association section
Click Add application

Gateway Already ConfiguredYour gateway's inbound authentication is already configured to accept tokens from your Amazon Connect instance. The association step simply registers the gateway as an available MCP server for your AI Agents.
Instance SelectionIf you cannot select an instance, verify that your AgentCore Gateway discovery URL matches your Connect instance.
Troubleshooting AgentCore Gateway
If your AI Agent fails to invoke MCP tools with errors like "MCP tool execution failed: An internal error occurred", follow these steps to diagnose and resolve the issue.
Enable Gateway Logging
AgentCore Gateway supports detailed logging to help diagnose issues. Enable logging in the AWS Console:

Open Amazon Bedrock AgentCore in the AWS Console
Navigate to Gateways and select your gateway
Click Edit and scroll to the Logging section
Enable the following log types:

Identity logs - Captures authentication and authorization events
Invocation logs - Captures tool invocation requests and responses

Select a CloudWatch Log Group for the logs
Click Save changes

Log Group NamingCreate a dedicated log group like /aws/bedrock-agentcore/gateway-logs to keep gateway logs separate from other application logs.
Common Gateway Errors
After enabling logging, check CloudWatch Logs for these common errors:
ErrorCauseSolutionAccessDeniedException: GetResourceApiKeyGateway role missing token-vault/* permissionUpdate GatewayExecutionRole IAM policyAccessDeniedException: GetSecretValueGateway role missing Secrets Manager permissionAdd secretsmanager:GetSecretValue with Resource: '*'AccessDeniedException: GetWorkloadAccessTokenGateway role missing workload identity permissionAdd workload-identity-directory/* resources401 Unauthorized from backend APIAPI key not being passed correctlyVerify credential provider configuration403 Forbidden from backend APIAPI key invalid or expiredCheck API key value in credential provider
Required IAM Permissions for GatewayExecutionRole
The GatewayExecutionRole IAM role must have these permissions for the gateway to function correctly:

```
1
2
3
4
5
6
7
8
9
10
11
12
# API key retrieval from token vault
- Effect: Allow
  Action: [bedrock-agentcore:GetResourceApiKey]
  Resource:
    - !Sub 'arn:aws:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:token-vault/*'
    - !Sub 'arn:aws:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:workload-identity-directory/default'
    - !Sub 'arn:aws:bedrock-agentcore:${AWS::Region}:${AWS::AccountId}:workload-identity-directory/default/workload-identity/*'

# Secrets Manager access for API keys
- Effect: Allow
  Action: [secretsmanager:GetSecretValue]
  Resource: '*'
```

Why Resource: * for Secrets Manager?AgentCore stores API key credentials in Secrets Manager with a naming pattern that includes a random suffix: bedrock-agentcore-identity!default/apikey/{name}-{random}. The random suffix makes it impractical to specify exact ARNs, so Resource: '*' is required.
Verifying Backend API Connectivity
If gateway logs show successful authentication but tool invocations still fail:

Test the API directly using the API key from your CloudFormation outputs. Check the industry's OpenAPI spec for the correct endpoint path and HTTP method:

Billing API (GET with query parameters):

```
1
2
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://YOUR_BILLING_API_URL/transactions?customerId=CUST-12345"
```

Hotel API (POST with JSON body):

```
1
2
3
4
5
curl -X POST \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"city": "Seattle"}' \
  https://YOUR_HOTEL_API_URL/hotels/search
```

Check the OpenAPI SpecEach industry API has different paths and HTTP methods. Always refer to the OpenAPI specification for the correct endpoint. Using the wrong path will return {"message":"Missing Authentication Token"} which means the path doesn't exist.

Check the OpenAPI specification is correctly loaded:

Navigate to your gateway target in the console
Verify the S3 URI points to the correct OpenAPI spec
Ensure the spec includes all required operations

Verify credential provider configuration:

Check that the credential provider ARN is correctly associated with the target
Verify the API key value matches what the backend API expects

CloudWatch Logs Insights Query for Gateway Errors
Use this query to find gateway errors:

```
1
2
3
4
5
fields @timestamp, @message
| filter @logStream like /gateway/
| filter @message like /error/i or @message like /exception/i or @message like /denied/i
| sort @timestamp desc
| limit 50
```

Learn More
For more information about AgentCore Gateway and MCP integration, see the following AWS documentation:

Set up an AgentCore Gateway  - Introduction to AgentCore Gateway concepts and setup
Supported Gateway Targets  - Detailed information about target types (Lambda, API Gateway, OpenAPI, etc.)
Set up Inbound Authorization  - Configure Discovery URL and Allowed Audience for inbound JWT authentication
Configure Credential Providers  - Set up API key and OAuth credential providers for outbound authentication
Amazon Connect MCP Server Integration  - Associate MCP servers with Amazon Connect

Next Steps
Now that your MCP server is configured, proceed to:

Flow Module Setup - Create reusable contact flow components as tools
Agent Assistance Track or Self-Service Track - Configure AI Agents to use your tools