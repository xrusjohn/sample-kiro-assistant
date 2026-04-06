# Security Profiles

Security ProfilesSecurity Profiles in Amazon Connect control what users can access and what actions they can perform. For AI Agents, security profiles govern:

Which tools an AI Agent can invoke
What data the agent can access
Which users can configure AI Agents and Prompts

Security Profile Permissions for AI Agents
Agent Workspace Permissions
For human agents using AI Agent assistance in the Agent Workspace, assign these permissions:
PermissionLocationPurposeConnect assistant - View AccessAgent ApplicationsEnables agents to search content and receive AI recommendationsCustomer Profiles - ViewCustomer ProfilesAllows viewing customer profile dataCases - View/EditCasesEnables case creation and viewing
Administrator Permissions
For administrators configuring AI Agents and Prompts:
PermissionLocationPurposeAI Agents - All AccessAI agent designerCreate, edit, and manage AI AgentsAI Prompts - All AccessAI agent designerCreate, edit, and manage AI PromptsAI Guardrails - All AccessAI agent designerCreate, edit, and manage AI GuardrailsConversational AI  - All AccessChannels and FlowsView, edit, and create conversational AI botsFlows - All AccessChannels and FlowsCreate and manage contact flowsFlow Modules - All AccessChannels and FlowsCreate flow modules as tools
Configuring Security Profiles
Step 1: Access Security Profiles

Log in to the Amazon Connect admin console
Navigate to Users → Security profiles
Select the security profile to modify (or create a new one)

Step 2: Configure Agent Permissions
For agents who will use AI assistance:

In the security profile, expand Agent Applications
Enable Connect assistant - View Access
If using Customer Profiles, enable Customer Profiles - View
If using Cases, enable appropriate Cases permissions

Step 3: Configure Administrator Permissions
For administrators who will configure AI Agents:

Expand AI agent designer

Enable AI Agents - All Access

Enable AI Prompts - All Access

Enable AI Guardrails - All Access

Expand Channels and Flows

Enable Conversational AI - All Access

Enable Flows - All Access

Enable Flow Modules - All Access (if using flow modules as tools)

Step 4: Save Changes

Click Save to apply the security profile changes

Tool-Level Permissions
Beyond security profiles, you can control tool access at the AI Agent level:
Shared Permissions Requirement
Important: Shared PermissionsWhen using AI Agents for Agent Assistance, the human agent's security profile must include the same permissions as the AI Agent's configured tools. The AI Agent operates within the context of the human agent's session, so tool invocations are authorized against the combination of the AI agent and human agent's permissions.Example: If an AI Agent has access to the Cases tool (CreateCase, SearchCases), the human agent using that AI Agent must also have Cases permissions in their security profile. Otherwise, the AI Agent's tool invocations will fail.
AI Agent ToolRequired Human Agent PermissionCases (Create, Update, Search)Cases - View/Edit in Agent ApplicationsCustomer ProfilesCustomer Profiles - View in Agent ApplicationsKnowledge Base (Retrieve)Connect assistant - View AccessTasks (StartTaskContact)Tasks - Create in Agent Applications
Configuring Tool Access
When creating or editing an AI Agent:

Navigate to AI agent designer → AI Agents
Select or create an AI Agent
In the Tools section, select which tools this agent can access

Workshop Tool ConfigurationYou won't have any Tools available yet if following the workshop. We will configure the Tools in AgentCore Gateway and then come back to add them in the security profile later.
Next Steps
With security profiles configured, proceed to:

Deployment Options - Set up your workshop infrastructure
Knowledge Base Configuration - Configure knowledge sources

Reference DocumentationFor detailed information, see:
Update security profiles 
Security profile permissions