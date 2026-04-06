# Self-Service Track

Self-Service TrackThe Self-Service track teaches you how to build AI-powered customer experiences that enable customers to resolve issues without human agent involvement. Using Orchestration AI Agents in contact flows, you'll create intelligent self-service systems that handle routine requests while seamlessly escalating complex issues to human agents.
What You'll Learn
In this track, you'll build on the Foundation module to create powerful self-service capabilities:

AI Agent Configuration: Understand Self-Service AI Agents, configure security profiles, add tools, build contact flows, and verify your setup
Agentic Experiences (Optional): Enable Nova Sonic voice and AI Message Streaming for enhanced interactions
Testing: Validate your self-service implementation with industry-specific scenarios

Prerequisites
Before starting this track, complete the required Foundation modules:
ModuleDescriptionStatusKey ConceptsOrchestration AI Agents and tool typesRequiredSecurity ProfilesAI Agent permissionsRequiredDeployment OptionsInfrastructure setupRequiredKnowledge Base ConfigS3/Salesforce/ServiceNow/Bedrock KBRequiredMCP Server SetupAgentCore Gateway toolsRequiredFlow Module SetupReusable actions as toolsRequired
Optional Foundation ModulesContent Segmentation, Guardrails, and Logging/Observability are optional but recommended for production deployments. You can complete them before or after this track.
Track Overview

Module Details
ModuleDescriptionTimeAI Agent ConfigurationComplete setup including understanding agents, security, tools, flows, and verification45 minAgentic Experiences (Optional)Nova Sonic voice and AI Message Streaming enhancements25 minTestingComprehensive testing with industry-specific scenarios20 min
AI Agent Configuration Sub-Sections
Sub-SectionDescriptionTimeUnderstanding AI AgentsSelf-Service architecture, RTC tools, prompt structure differences10 minSecurity ProfilesConfigure permissions for MCP tools10 minAdding ToolsAdd industry MCP tools, Flow Module tools, and RTC tools10 minCreating the FlowBuild contact flow with Lex bot integration and escalation10 minVerificationConfiguration checklist and end-to-end flow verification5 min
Agentic Experiences (Optional)
Sub-SectionDescriptionTimeNova Sonic VoiceEnable natural speech-to-speech voice interactions10 minAI Message StreamingProgressive text display for chat interactions15 min
Self-Service vs Agent Assistance
Self-Service AI Agents differ from Agent Assistance agents in several key ways:
AspectSelf-ServiceAgent AssistanceAudienceCustomers via voice/chatHuman agents in Agent WorkspaceToolsEscalate, Complete, Retrieve, MCP toolsGenerateNotes, Retrieve, Cases, Customer ProfilesOutput FormatVoice-friendly conversational textHTML or plain text for Agent WorkspaceConversation ControlAI Agent controls flowHuman agent controls flowChannelVoice (phone) and chatAgent Workspace during contacts
What's Pre-Deployed
If you're using Workshop Accounts or deployed the unified CloudFormation stack, you already have:

Self-Service AI Agent - Pre-configured Orchestration agent with MCP tools
Self-Service AI Prompt - Default prompt optimized for customer interactions
Industry APIs - Backend APIs for hotel, billing, healthcare, and other industries
MCP Server - AgentCore Gateway server connected to your industry APIs
Knowledge Base - Industry-specific content for testing
Lex Bot - Pre-configured bot for intent detection

This track focuses on using and customizing these pre-deployed resources.
Industry Scenarios
The Self-Service track supports multiple industry scenarios for testing:
IndustryUse CasesHotelCheck availability, make reservations, modify bookings, cancel reservationsBillingView transactions, dispute charges, set up payment plansHealthcareSchedule appointments, refill prescriptions, check resultsInsuranceFile claims, check coverage, update policiesAutomotiveWarranty claims, service appointments, recall informationFacilitiesWork orders, problem classification, technician dispatchManufacturingProduct support, warranty claims, parts orderingRetailOrder tracking, returns, loyalty pointsTelecomAccount management, data usage, outage reportingUtilitiesBill inquiries, usage history, service requestsPublic SectorPermits, service requests, appointments
You'll test your self-service implementation using industry-specific scenarios in the Testing module.
After This Track
Once you complete the Self-Service track, you can:

Explore Additional AI Agent Capabilities - Learn about Cases, Customer Profiles, and Email AI capabilities
Complete the Agent Assistance Track - Learn to build AI-powered agent productivity tools
Return to Optional Foundation Modules - Add Content Segmentation, Guardrails, or Logging
Proceed to Cleanup - Remove workshop resources when finished

Modules
AI Agent ConfigurationAgentic ExperiencesTesting Self-Service