# Key Concepts

Key ConceptsThis module introduces the core concepts you need to understand before building AI-powered customer experiences with Amazon Connect.
Orchestration AI Agents
Amazon Connect uses Orchestration AI Agents as the primary agent type for both self-service and agent assistance scenarios. Unlike traditional rule-based systems, Orchestration AI Agents use large language models to:

Dynamically plan multi-step workflows based on customer intent
Reason over results at each step to determine the next best action
Invoke tools to retrieve data, create records, or trigger workflows
Adapt behavior based on what they discover during the conversation

How Orchestration Works

Customer interaction begins: The AI agent analyzes the request and available tools
Planning: The agent creates a plan based on customer intent and configured instructions
Tool invocation: The agent calls tools to retrieve information or take actions
Reasoning: After each tool response, the agent reasons about what to do next
Response generation: The agent formulates a response based on accumulated context

This is fundamentally different from traditional IVR systems that follow predetermined decision trees.
Agent Assistance vs Self-Service
Both use cases leverage the same Orchestration AI Agent architecture, but serve different purposes:
AspectAgent AssistanceSelf-ServiceUserHuman agents in Agent WorkspaceCustomers via voice/chatPurposeHelp agents resolve issues fasterEnable customers to self-serveInteractionReal-time recommendations during contactsDirect conversation with AIToolsKnowledge search, case creation, note-takingReservations, account lookup, escalationChannelsVoice, chat, tasks, emailVoice, chat
Agent Assistance Use Cases

Real-time recommendations: AI detects customer issues and displays relevant solutions
Knowledge search: Agents ask questions and receive generated responses with sources
Note-taking: AI generates contact summaries automatically
Case summarization: AI summarizes case history for quick context
Email assistant: AI generates summaries, responses, and next actions for emails to help agents quickly understand and complete contacts

Self-Service Use Cases

Conversational IVR: Customers speak naturally to resolve issues
Chatbot automation: Handle common requests without human intervention
Tool-enabled actions: Book appointments, check balances, update accounts
Intelligent escalation: Transfer to human agents with full context when needed

Tool Types
AI Agents access capabilities through tools. Amazon Connect supports three categories of tools:

First-Party (1P) Tools
Native Amazon Connect and AWS service capabilities available out-of-the-box:
CategoryToolsPurposeAmazon ConnectDescribeContact, SearchContactFlows, GetContactAttributes, StartTaskContactAccess contact and flow informationKnowledge BaseRetrieve (QueryAssistant API)Search and retrieve content from knowledge basesCasesCreateCase, UpdateCase, SearchCases, ListTemplatesManage customer casesCustomer ProfilesListRecommenders, GetProfileInsights, ListProfileObjectsAccess customer data and insightsFlow ModulesCustom flow componentsExecute reusable business logic
1P tools are automatically available when you enable the corresponding Amazon Connect features.
Third-Party (3P) Tools via MCP
External integrations through Model Context Protocol (MCP) and Amazon Bedrock AgentCore Gateway. AgentCore Gateway acts as a bridge between AI agents and external systems, supporting multiple target types:
Target TypeUse CaseAWS LambdaCustom business logic, data transformationsAPI Gateway REST APIExisting REST APIs, microservicesOpenAPI SchemaThird-party REST APIs with OpenAPI docsSmithy ModelAWS services, structured API definitionsMCP ServersPre-built MCP tool providersIntegration Provider TemplatesQuick integration with Salesforce, ServiceNow, Zendesk, Jira, and more
You can connect multiple gateways to a single AI agent, each with different targets. See MCP Server Setup for hands-on configuration.
Return-to-Control (RTC) Tools
RTC tools transfer control from the AI agent back to Amazon Connect contact flows, optionally passing data back.
ToolPurposeCompleteEnd the AI conversation successfullyEscalateTransfer to a human agent with contextCustom RTCHand off to specific queues, payment flows, callback workflows, etc.
Custom RTC tools can include an input schema to pass structured data back to the contact flow as contact attributes.
AI Agents and Prompts
AI Agents
An AI Agent is a configured entity that defines:

Which tools the agent can access
Security profile permissions
Associated AI Prompts
Locale settings for language support
Guardrails for content filtering and safety controls

AI Prompts
AI Prompts define the agent's behavior through:

System instructions: How the agent should behave
Tool instructions: When and how to use each tool
Persona: The agent's personality and communication style
Guardrails: Content filtering and safety rules

Amazon Connect provides system AI agents and prompts for common use cases:

Self-service agents for voice and chat
Agent assistance agents for real-time recommendations
Case summary agent for documentation
Email agents for assisting human agents with responding to emails
Sales Agent for utilizing Customer Profiles predictive insights data to provide tailored hyper-personalized recommendations

You can use these out-of-the-box or customize them for your needs.
Connect Assistant
When you enable AI Agents in Amazon Connect, you create a Connect assistant. The assistant is the container that holds your AI agents, knowledge bases, and integrations.
Assistant and Instance Relationship

Each Amazon Connect instance can only be associated with one assistant
An assistant can support multiple knowledge bases through AI Agent configuration
You can create multiple assistants, but they don't share external application integrations or customer data between each other
All external application integrations you create are at the assistant level - all Amazon Connect instances associated with an assistant inherit its integrations

Assistant Naming
When you enable AI Agents, you're prompted to provide a friendly assistant name that's meaningful to you, such as your organization name (e.g., "Connect-Assistant-AnyCompany").
Encryption and Security
Amazon Connect AI Agents support encryption at rest using AWS Key Management Service (KMS).
Default Encryption
By default, the assistant and its connections are encrypted with an AWS owned key at no additional cost.
Customer Managed Keys (Optional)
You have the option to create or provide two AWS KMS keys for additional control:
Key PurposeWhat It EncryptsAssistant KeyExcerpts provided in recommendationsContent KeyContent imported from Amazon S3, Microsoft SharePoint Online, Salesforce, ServiceNow, and ZenDesk
NoteAI Agent search indices are always encrypted at rest using an AWS owned key, regardless of your KMS configuration.
KMS Key Requirements
If you use a customer managed key where someone else is the administrator, the key must have a policy that allows:

kms:CreateGrant
kms:DescribeKey

These permissions must be granted to the IAM identity using the key to invoke AI Agents.
AI Guardrails
Guardrails help ensure responsible AI usage by filtering and controlling AI agent responses. You can configure guardrails to protect against inappropriate content and ensure compliance with your organization's policies.
Guardrail Capabilities
CapabilityDescriptionTopic FilteringBlock responses about undesirable or off-topic subjectsContent FilteringScreen for harmful, inappropriate, or offensive contentWord FilteringControl specific terms, profanity, or competitor mentionsContextual GroundingDetect and prevent potential hallucinationsPII ProtectionAutomatically redact sensitive personal information
AI guardrails enable you to implement safeguards based on your use cases and responsible AI policies. Connect AI agents use Amazon Bedrock guardrails, which you can create and edit directly in the Amazon Connect admin website.
Session Management
AI Agent sessions are contextual containers that maintain state throughout customer interactions. Amazon Connect automatically creates and manages sessions for each contact where AI Agents are enabled.
Session Configuration (UpdateSession)
Configure session behavior dynamically using the UpdateSession API:
ConfigurationDescriptionAI Agent ConfigurationMap specific AI agents to use cases (Orchestration, Manual Search, Note-Taking, Case Summarization, Email Response, etc.)Orchestrator ConfigurationDefine which AI agents handle specific orchestration use casesTag FiltersApply content segmentation rules to filter knowledge base resultsDescriptionAdd context about the session purpose
This enables scenarios like:

Selecting different AI agents based on customer language or segment at session start
Applying different knowledge base filters based on customer tier
Configuring orchestrator use cases for the session

Session Data (UpdateSessionData)
Store custom key-value data on sessions for personalization using the UpdateSessionData API:
CapabilityDescriptionCustom NamespaceStore up to 50 key-value pairs in the "Custom" namespacePersonalization VariablesData is accessible in AI prompts via placeholders like {{$.Custom.firstName}}Dynamic UpdatesUpdate session data at any point during the interaction
Common use cases:

Customer context: Store customer name, account tier, or preferences
Conversation state: Track what the customer has already discussed
Business data: Pass order IDs, case numbers, or other identifiers to the AI agent

Session data enables AI agents to provide contextually relevant, personalized responses throughout the customer journey.
Key Terminology
TermDefinitionAssistantThe conversational interface (Connect assistant) through which users interact with AI agentsAI AgentAn intelligent component that accesses knowledge, invokes tools, and reasons over resultsAI PromptConfiguration that defines agent behavior, instructions, and personaMCPModel Context Protocol - standardized mechanism for AI agents to discover and invoke toolsAgentCore GatewayAmazon Bedrock service that hosts MCP servers for tool integrationFlow ModuleReusable contact flow component that can be invoked as a toolKnowledge BaseRepository of documents used by AI agents to answer questionsOrchestrationThe AI agent type that uses LLMs to plan and execute multi-step workflows
Next Steps
Now that you understand the core concepts, proceed to:

Security Profiles - Configure permissions for AI Agent access
Deployment Options - Set up your workshop infrastructure

Reference DocumentationFor detailed technical information, see:
Amazon Connect AI Agents Administrator Guide 
Create AI Agents in Amazon Connect