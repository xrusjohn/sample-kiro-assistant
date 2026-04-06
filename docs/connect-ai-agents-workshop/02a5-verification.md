# Verification and Architecture

Verification and ArchitectureBefore proceeding to test your AI Agent, verify your setup is complete and understand how all the components connect.
Verifying Your Configuration
Before proceeding, verify your setup:
Checklist

 Identified which industry AI Agent you'll work with
 Reviewed the AI Agent configuration (type, prompt, tools)
 Examined the AI Prompt structure and key placeholders
 Configured Human Agent Security Profile with:

 Industry tool namespace(s) enabled
 TellMeAJoke flow module enabled

 Configured AI Agent Security Profile (Workshop AI Agent - all) with:

 Same industry tool namespace(s) enabled
 TellMeAJoke flow module enabled

 Saved all changes to both security profiles
 Added industry MCP tools to your AI Agent
 Added TellMeAJoke flow module tool to your AI Agent
 Published your AI Agent
 Created and published Agent Assistance Test Flow with:

 Set logging behavior block
 Set Amazon Connect Assistant block (with your AI Agent)
 Set working queue block (BasicQueue)
 Transfer to queue block

How It All Connects

Next Steps
Now that you understand how your AI Agent is configured, proceed to:

Testing Your AI Agent - Add tools and test with real conversations