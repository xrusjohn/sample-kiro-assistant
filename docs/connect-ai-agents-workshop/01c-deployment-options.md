# Deployment Options

Deployment OptionsThis module covers the two deployment paths for the workshop infrastructure. Choose the path that matches your environment.
Deployment Paths Overview
PathBest ForInfrastructureTime to StartWorkshop AccountAWS-managed eventsPre-deployedImmediateBYO AccountSelf-paced learningManual deployment15-20 minutes

What Gets Deployed
Both paths deploy the same infrastructure:
ComponentDescriptionAmazon Connect InstanceContact center with storage configurationConnect AssistantAI assistant for agent support and self-serviceIndustry APIsREST APIs with DynamoDB backends (hotel, billing, etc.)AI Agents & PromptsPre-configured self-service and agent-assist agentsKnowledge BaseFAQ documents for AI assistantShared API KeySingle key for authenticating all API requests
Workshop Account DeploymentIf you're attending an AWS-managed event, infrastructure is already deployed for you.Step 1: Access Your Environment
Log in to the Workshop account using the provided URL
Navigate to your workshop environment
The AWS Console opens with your pre-provisioned account
Step 2: Get Stack OutputsThe CloudFormation stack outputs contain important values you'll need:
Open the CloudFormation Console: https://console.aws.amazon.com/cloudformation/ 
Find the stack named unified-workshop-stack
Click the stack name, then go to the Outputs tab
Note these key values:
OutputDescriptionUsed ForConnectInstanceAliasAmazon Connect instance nameConnect instance accessAdminUsernameAmazon Connect admin usernameConnect admin accessAdminPasswordAmazon Connect admin passwordConnect admin accessAssistantIdConnect Assistant IDAI Agent configuration{Industry}OpenApiSpecS3LocationS3 URL of OpenAPI spec (e.g., HotelOpenApiSpecS3Location)AgentCore Gateway target configuration{Industry}ApiUrlAPI Gateway endpoint URL (e.g., HotelApiUrl)AgentCore Gateway target server URLStep 3: Access Amazon Connect
Open Amazon Connect Console: https://console.aws.amazon.com/connect/  from the region you are running the workshop in
Find your instance (matches your ConnectInstanceAlias)
Click the Access URL to access the Connect admin dashboard
Login with the previously collected Admin username and password.
Step 4: Verify AI Agents
In Connect admin, navigate to AI Agent Designer → AI Agents
Verify you see pre-deployed agents:

Self-Service agents (one per industry)
Agent Assistance agents (one per industry)

Your infrastructure is ready! Proceed to Knowledge Base Configuration to set up your knowledge sources.
Next Steps
With infrastructure deployed, proceed to:

Knowledge Base Configuration - Set up your knowledge sources
MCP Server Setup - Configure third-party tool integration