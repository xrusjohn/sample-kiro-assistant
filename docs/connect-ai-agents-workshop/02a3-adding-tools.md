# Adding Tools to Your AI Agent

Adding Tools to Your AI AgentNow that security profiles are configured, you'll add your industry's MCP tools to the AI Agent.
Step 1: Navigate to Your AI Agent

Open the Amazon Connect instance
Go to AI agent designer > AI agents
Select your industry's Agent Assistance agent (e.g., "Hotel-Agent-Assist")
Click Edit to open the Agent Builder

Step 2: Review Pre-Deployed Tools
The template deploys the AI Agent with these tools already configured:
ToolTypePurposeRetrieveMODEL_CONTEXT_PROTOCOLSearch knowledge base for relevant contentGenerateNotesMODEL_CONTEXT_PROTOCOLGenerate contact summaries and notes
These are the default tools. You'll now add your industry-specific MCP tools.
Step 3: Add Industry MCP Tools
Add the MCP tools for your selected industry:

In the Agent Builder, click Add Tool
Under Add existing AI Tool, find the Namespace dropdown
Select your gateway (starts with gateway_...)
In the AI Tool selection, choose a tool that matches your industry:

Add these tools from the healthcare-api namespace:
get-appointments
get-prescription-refills
schedule-appointment

Review the tool configuration
Select User Confirmation if the tool performs actions that should require agent approval (recommended for create/update operations)
Click Add
Repeat steps 1-7 until all industry tools are added

Step 4: Add the Flow Module Tool
Now add the TellMeAJoke flow module as a tool:

Click Add Tool
Under Namespace, select Flow Modules
Under AI Tool, select the Flow ID that matches the TellMeAJoke module you created in the Foundation module
Under Version, select the latest version
In the Instructions field, add guidance for when the AI should use this tool:

```
Use this tool when the requester asks for a joke or wants to hear something funny.
```

Click Add

Step 5: Save and Publish

Click Save to save your changes
Click Publish to make the agent available

Next Steps
Now that you've added tools to your AI Agent, proceed to create the contact flow:

Creating the Contact Flow - Set up the contact flow for Agent Assistance testing