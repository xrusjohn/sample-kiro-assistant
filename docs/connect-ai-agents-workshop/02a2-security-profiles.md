# Configuring Security Profiles

Configuring Security ProfilesFor Agent Assistance, both the Human Agent and the AI Agent need appropriate security profile permissions. The AI Agent can only use tools that are enabled in both profiles.
Security Profile IntersectionIn Agent Assistance, the AI Agent's effective permissions are the intersection of:
The Human Agent's security profile (what the agent is allowed to access)
The AI Agent's security profile (what the AI is allowed to use)
If a tool is enabled for the AI Agent but not the Human Agent, the AI cannot use it during that agent's contacts.
Step 1: Configure Human Agent Security Profile

In the Amazon Connect instance, go to Users > Security profiles
Select the security profile assigned to your agent user (e.g., "Admin" if using the workshop user, or your custom profile)

Configure AI Agent Tools
Under Tools, find the available tools within your associated AgentCore Gateway.
Missing ToolsIf you do not see any Tools in the list, you should validate your AgentCore Gateway configuration. Likely issues include not properly replacing the Placeholder value with the Gateway ID, typo in the audience, or a misconfigured identity.
If you want access to tools from all industries:
Enable All tools within the gateway to grant access to all MCP tool namespaces configured
This is the simplest option for workshop environments

Configure Flow Modules
Under Agent Applications, find the Flow Modules section:

Enable the TellMeAJoke flow module (created in the Foundation module)

This allows the human agent to trigger the flow module during contacts

Click Save to apply changes to the Human Agent security profile

Step 2: Configure AI Agent Security Profile
The AI Agent also needs its own security profile configured with the same tools.

In the Amazon Connect instance, go to Users > Security profiles
Find and select Workshop AI Agent - all (pre-deployed for this workshop)

Configure AI Agent Tools
Under Agent Applications, find the AI Agent tools section:

Enable the same tool namespaces you configured for the Human Agent:

For all industries: Enable All tools within the gateway
For single industry: Select the specific namespace(s)

Configure Flow Modules
Under Agent Applications, find the Flow Modules section:

Enable the TellMeAJoke flow module

This allows the AI Agent to invoke the flow module as a tool

Click Save to apply changes to the AI Agent security profile

Understanding the Intersection
Here's how the security profile intersection works:

In this example:

hotel-api and billing-api are in both profiles → AI can use them ✓
retail-api is only in AI Agent profile → AI cannot use it ✗
TellMeAJoke is in both profiles → AI can invoke it ✓

Step 3: Verify Both Profiles
Before proceeding, verify both security profiles are configured and saved:
ProfileAI Agent ToolsFlow ModulesHuman Agent ProfileIndustry namespace(s) enabledTellMeAJoke enabledWorkshop AI Agent - allSame industry namespace(s) enabledTellMeAJoke enabled
Next Steps
Now that security profiles are configured, proceed to add tools to your AI Agent:

Adding Tools to Your AI Agent