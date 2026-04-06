# Security Profiles

Security ProfilesIn this section, you'll configure Security Profiles to enable MCP tools for your Self-Service AI Agent.
Understanding Self-Service Security Profiles
Self-Service AI Agents have simpler security requirements compared to Agent Assistance. There's no human agent involved during the AI interaction, so you only need to configure the AI Agent's security profile.
Key Difference from Agent AssistanceIn Agent Assistance, both the Human Agent and AI Agent need security profiles configured, and the effective permissions are the intersection of both.In Self-Service, only the AI Agent's security profile matters-there's no human agent intersection to consider.
Tool Permission Requirements
Different tool types have different permission requirements:
Tool TypeExamplesSecurity Profile Required?RTC ToolsEscalate, Complete❌ No - work by defaultMCP ToolsRetrieve, Industry APIs✅ Yes - require configurationFlow Module ToolsTellMeAJoke✅ Yes - require configuration
RTC Tools Work by Default
Return-to-Control (RTC) tools like Escalate and Complete are built-in capabilities that work immediately without any Security Profile configuration:

Escalate: Transfers to human agent
Complete: Ends the conversation

These tools signal the contact flow to take action and don't require external permissions.
MCP Tools Require Security Profile
MCP (Model Context Protocol) tools connect to external services via AgentCore Gateway. These tools require Security Profile association to function:

Retrieve: Searches the knowledge base
Industry APIs: Hotel, Billing, Healthcare, etc.

Without proper Security Profile configuration, these tools will show "Insufficient" permissions and the AI Agent cannot use them.
Default AI Agent Cannot Be EditedThe system default Self-Service AI Agent cannot be edited directly. To configure Security Profile permissions for MCP tools, you must:
Create a new AI Agent (can copy from system default)
Associate the appropriate Security Profile
Use the new agent in your contact flows
This was covered in the Understanding AI Agents section.
Step 1: Navigate to Security Profiles

In the Amazon Connect admin console, go to Users > Security profiles
Find and select Workshop AI Agent - all (pre-deployed for this workshop)

Workshop AI Agent ProfileThe Workshop AI Agent - all security profile was created during the Foundation module deployment. This profile is specifically designed for AI Agents (not human agents).
Step 2: Configure AI Agent Tools
Under Tools, find the tools associated with your gateway.
Missing ToolsIf you do not see any Tools in the list, you should validate your AgentCore Gateway configuration. Likely issues include not properly replacing the Placeholder value with the Gateway ID, typo in the audience, or a misconfigured identity.
If you want access to tools from all industries:
Enable All tools within the gateway to grant access to all MCP tool namespaces
This is the simplest option for workshop environments
Click Save to apply changes
This grants the AI Agent access to all industry APIs configured in your AgentCore Gateway.
Step 3: Configure Flow Modules (Optional)
If you plan to use Flow Module tools like TellMeAJoke:

Under Flow modules, enable the TellMeAJoke flow module (created in the Foundation module)
Click Save to apply changes

This allows the AI Agent to invoke the flow module as a tool during conversations.
Key Points

No human agent configuration needed - Self-Service doesn't involve human agents during AI interactions
RTC tools work immediately - Escalate and Complete need no configuration
MCP tools need Security Profile - Configure the AI Agent's security profile
One profile to configure - Unlike Agent Assistance, there's no intersection to manage

Next Steps
Now that Security Profiles are configured, proceed to add tools to your AI Agent:

Adding Tools - Add MCP tools and configure RTC tools