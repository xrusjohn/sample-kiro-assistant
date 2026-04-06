# Agent Assistance Track

Agent Assistance TrackThe Agent Assistance track teaches you how to configure and customize AI Agents that help human agents during live customer interactions. These AI Agents provide real-time recommendations, generate notes, and integrate with step-by-step guides to improve agent productivity.
What You'll Learn
In this track, you'll build on the Foundation module to create powerful agent assistance capabilities:

AI Agent Configuration: Understand how AI Agents and Prompts work, configure Security Profile tools
Testing Your AI Agent: Place test conversations, use manual search, validate recommendations
NoteTaking: Automatically generate contact notes and summaries
Additional Capabilities: Explore Cases Summary, Email AI Agents, and other capabilities

Prerequisites
Before starting this track, complete the required Foundation modules:
ModuleDescriptionStatusKey ConceptsOrchestration AI Agents and tool typesRequiredSecurity ProfilesAI Agent permissionsRequiredDeployment OptionsInfrastructure setupRequiredKnowledge Base ConfigS3/Salesforce/ServiceNow/Bedrock KBRequiredMCP Server SetupAgentCore Gateway toolsRequiredFlow Module SetupReusable actions as toolsRequired
Optional Foundation ModulesContent Segmentation, Guardrails, and Logging/Observability are optional but recommended for production deployments. You can complete them before or after this track.
Track Overview

Module Details
ModuleDescriptionTimeAI Agent ConfigurationChoose an industry AI Agent, understand configuration, set up Security Profile tools20 minTesting Your AI AgentAdd tools, test Voice/Chat conversations, use manual search on-contact20 minNoteTakingConfigure and test automatic note generation10 minAdditional CapabilitiesExplore Cases Summary, Email AI Agents, and other capabilities10 min
Agent Assistance vs Self-Service
Agent Assistance AI Agents differ from Self-Service agents in several key ways:
AspectAgent AssistanceSelf-ServiceAudienceHuman agents in Agent WorkspaceCustomers via voice/chatChannelsVoice, Chat, Tasks, Email, CasesVoice, ChatMCP ToolsSame access to 1P and 3P MCP toolsSame access to 1P and 3P MCP toolsReturn to Control ToolsNot applicable (human controls flow)Complete, Escalate (for flow control)Additional ToolsNoteTaker-Additional AI AgentsCases Summary, Email AI Agents-Transcript AccessYes - {{$.transcript}} placeholderYes - {{$.transcript}} placeholderOutput FormatHTML or plain text for Agent WorkspaceVoice-friendly and chat-friendly conversational textConversation ControlHuman agent controls flowAI Agent controls flow
What's Pre-Deployed
If you're using Workshop Accounts or deployed the unified CloudFormation stack, you already have:

Industry AI Agents - Sample Orchestration agents for each industry (hotel, billing, healthcare, etc.) with knowledge base access to help you get started
Industry AI Prompts - Sample prompts for each industry optimized for agent assistance scenarios
Knowledge Base - Industry-specific content for testing
Security Profiles - Permissions for AI Agent access

This track focuses on using and customizing these pre-deployed resources.
After This Track
Once you complete the Agent Assistance track, you can:

Complete the Self-Service Track - Learn to build customer-facing AI experiences
Explore Additional AI Agent Capabilities - Learn about Cases, Customer Profiles, and Email AI capabilities
Return to Optional Foundation Modules - Add Content Segmentation, Guardrails, or Logging
Proceed to Cleanup - Remove workshop resources when finished

Modules
AI Agent ConfigurationTesting Your AI AgentNoteTakingAdditional Capabilities