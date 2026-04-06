# AI Agent Configuration

AI Agent ConfigurationIn this module, you'll configure a Self-Service AI Agent that interacts directly with your customers via voice and chat. Unlike Agent Assistance (which helps human agents), Self-Service AI Agents handle customer conversations autonomously, using Return-to-Control (RTC) tools to manage conversation flow.
Self-Service vs Agent Assistance
Self-Service AI Agents have key differences from Agent Assistance:
AspectSelf-ServiceAgent AssistanceAudienceCustomers via voice/chatHuman agents in Agent WorkspaceRTC ToolsEscalate, Complete (control conversation flow)N/A (human controls flow)Output FormatVoice-friendly text (no HTML, no bullets)HTML formatting for Agent WorkspaceConversation ControlAI controls the flowHuman agent controls the flowChannelVoice (phone) and ChatAgent Workspace during contacts
Key Concepts

RTC Tools (Return-to-Control): The Escalate and Complete tools signal the contact flow to take action - either transferring to a human agent or ending the conversation gracefully
Voice-Friendly Output: Self-Service prompts must produce output suitable for speech synthesis - no HTML, bullet points, or special formatting
AI-Controlled Flow: The AI Agent manages the entire conversation, deciding when to use tools, ask clarifying questions, or escalate to a human

What You'll Do

Understand how Self-Service AI Agents differ from Agent Assistance
Configure Security Profile tools for your selected industry
Add MCP tools and Flow Module tools to your AI Agent
Configure RTC tools (Escalate, Complete) for conversation control
Create a contact flow with Lex bot integration
Verify your complete configuration

Choose Your Industry
The workshop includes sample AI Agents for multiple industries. Choose one to work with throughout this track - the configuration steps are the same regardless of which industry you select.
Healthcare Appointments
Schedule and reschedule appointments
Check prescription refill status
Answer billing inquiries
Sample Patient: Patient PAT-001 with upcoming appointments and prescription refills
All Industries Follow the Same StepsRegardless of which industry you choose, the configuration process is identical. The only differences are the specific data and scenarios you'll test with.
Get Started
This module is organized into the following sections:

Understanding AI Agents - Learn how Self-Service AI Agents are configured and how they differ from Agent Assistance
Configuring Security Profiles - Set up permissions for AI Agent tools
Adding Tools to Your AI Agent - Add MCP tools, Flow Modules, and RTC tools
Creating the Flow - Build the contact flow with Lex bot integration
Verification - Verify your setup and understand the architecture

Start with Understanding AI Agents to begin.