# Verification

VerificationBefore proceeding to testing, verify that your Self-Service AI Agent configuration is complete and correct. This section provides a comprehensive checklist, architecture overview, and end-to-end flow explanation to ensure all components are properly configured.
Configuration Checklist
Use this checklist to verify that all previous sub-sections have been completed. Whe
AI Agent Setup

 AI Agent created or copied from system default
 AI Agent name is descriptive (e.g., "Hotel-Self-Service-Agent")
 AI Agent type is set to ORCHESTRATION
 AI Agent visibility status is PUBLISHED

Security Profile Configuration

 Security Profile created or selected for AI Agent tools
 Security Profile has appropriate tool namespace permissions enabled
 AI Agent is associated with the Security Profile
 MCP tools show Sufficient permissions in the Security Profile

MCP Tools Added

 Retrieve tool added to AI Agent (for knowledge base access)
 Industry-specific MCP tools added (e.g., Hotel API tools)
 All MCP tools have appropriate descriptions and instructions

Flow Module Tools Added (Optional)

 TellMeAJoke Flow Module tool added (optional, for demonstration)
 Flow Module tool has appropriate instructions configured

RTC Tools Configured

 Escalate tool configured (for human transfer)
 Complete tool configured (for conversation end)
 User confirmation is enabled for action tools (Escalate, Complete)

Self-Service Contact Flow (Simplified - No Modules)

 Self-Service contact flow imported from downloadable template
 Flow has descriptive name (e.g., "Hotel-Self-Service-Flow")
 Logging enabled in the flow
 Connect Assistant block configured
 Lex bot created and configured in Get Customer Input block
 AI Agent routing configured in the flow
 Escalation path configured for human transfer to Queue
 Contact flow is Published
 Phone number associated with the flow (for voice testing)

Agent Guide Flow Configuration

 Agent Guide Flow imported from template
 Agent Guide Flow is Published
 Set Event Flow block configured in Self-Service flow to trigger Agent Guide
 Agent Guide Flow works with pre-deployed Guides

Lex Bot Integrated

 Lex bot created in Amazon Connect
 Lex bot configured in the Get Customer Input block
 Bot alias selected (e.g., TestBotAlias)

Architecture Diagram
The following diagram shows the simplified architecture with all components connected. Note the flat configuration with no modules - logging and Connect Assistant are configured inline in the Self-Service flow.

Simplified Component Connections Summary
ComponentConnects ToPurposeSelf-Service FlowLogging (inline)Enables conversation logging without module importSelf-Service FlowConnect Assistant (inline)Sets AI session without module importSelf-Service FlowSet Event FlowTriggers Agent Guide Flow on escalationSelf-Service FlowGet Customer InputRoutes to Lex bot for conversational AILex BotAI AgentProcesses speech/text and invokes AI AgentAI AgentAI PromptApplies voice-friendly response formattingAI AgentSecurity ProfileDetermines tool access permissionsAI AgentMCP ToolsExecutes backend API calls via AgentCore GatewayAI AgentRTC ToolsControls conversation flow (escalate/complete)AI AgentFlow Module ToolsInvokes Lambda functions or Connect Flow blocksMCP ToolsAgentCore GatewayRoutes to MCP Server for backend servicesAgentCore GatewayBackend APIsExecutes business logic (Hotel, Billing, etc.)AgentCore GatewayKnowledge BaseRetrieves information via Retrieve toolFlow Module ToolsLambda FunctionsExecutes custom logic (e.g., TellMeAJoke)Set Event FlowAgent Guide FlowTriggers screen pop for human agent on escalationAgent Guide FlowPre-deployed GuidesDisplays relevant guide to human agent
End-to-End Flow Explanation
Here's how a customer interaction flows through your Self-Service AI Agent system from start to finish, including both MCP Server and Flow Module tool invocation paths.
1. Customer Initiates Contact

Customer calls the phone number or sends a chat message
Contact is routed to your Amazon Connect instance
Self-Service flow enables logging inline (no module import needed)
Self-Service flow sets Connect Assistant inline (no module import needed)
Set Event Flow block configures Agent Guide trigger for escalation

2. Lex Bot Receives Customer Input

Get Customer Input block routes to the configured Lex bot
Lex bot processes the customer's voice or text input
Speech is converted to text (for voice calls)
Customer message is passed to the AI Agent

3. AI Agent Processes Request

AI Agent receives the customer message and context
AI Prompt is applied to structure the response (voice-friendly, no HTML)
AI Agent analyzes available tools based on Security Profile permissions
AI Agent determines which tools to use based on customer intent

4. AI Agent Invokes MCP Server Tools
When the AI Agent needs to access backend APIs or the knowledge base, it invokes MCP Server tools via AgentCore Gateway:

MCP Server Tool Invocation Path:

AI Agent identifies need for backend data (e.g., hotel availability)
AI Agent invokes MCP tool (e.g., get-hotels, search-reservations)
MCP tool routes request to AgentCore Gateway (MCP Server)
AgentCore Gateway executes API call to backend service
Backend API returns data
Response flows back through AgentCore Gateway → MCP Tool → AI Agent

5. AI Agent Invokes Flow Module Tools
When the AI Agent needs to execute custom logic or Connect Flow blocks, it invokes Flow Module tools:

Flow Module Tool Invocation Path:

AI Agent identifies need for custom logic (e.g., tell a joke)
AI Agent invokes Flow Module tool (e.g., TellMeAJoke)
Flow Module routes to Lambda function OR Connect Flow block
Lambda/Flow executes custom logic
Response flows back through Flow Module → AI Agent

6. Response Delivered to Customer

AI Agent generates response using voice-friendly format (no HTML, no markdown)
Response uses <message> tags for structured output
Response is converted to speech (for voice) or displayed (for chat)
Customer can ask follow-up questions

7. Conversation Ends or Escalates

On Escalation:

AI Agent invokes Escalate RTC tool with context (reason, summary, intent)
Self-Service flow receives escalation signal
Set Event Flow block triggers Agent Guide Flow
Agent Guide Flow displays relevant pre-deployed Guide to human agent (screen pop)
Contact is transferred to human agent queue
Human agent receives full context and Guide information

Next Steps
Once you've verified all configuration items:

Optional Enhancements: Explore Agentic Experiences for Nova Sonic voice and AI Message Streaming
Testing: Proceed to Testing to validate your implementation with real scenarios
Troubleshooting: If you encounter issues, refer to the Common Issues table above or consult the Foundation Module for additional guidance

Configuration Complete!If all checklist items are verified, your Self-Service AI Agent is ready for testing. Proceed to the Testing section to validate your implementation with real customer scenarios.