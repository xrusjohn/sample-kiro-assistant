# Understanding AI Agents and Prompts

Understanding AI Agents and PromptsIn this section, you'll explore how Self-Service AI Agents are configured and understand the key differences from Agent Assistance agents.
Self-Service AI Agent Architecture
Self-Service AI Agents interact directly with customers via voice (phone) and chat channels. Unlike Agent Assistance agents that help human agents, Self-Service agents are the primary point of contact for customers.

Key Characteristics
CharacteristicDescriptionAudienceEnd customersChannelsVoice (phone) and ChatConversation ControlAI controls the flow of conversationResponse FormatVoice-friendly text (no HTML, no markdown)EscalationCan transfer to human agents when needed
Understanding RTC Tools (Return-to-Control)
Self-Service AI Agents use RTC (Return-to-Control) tools to signal the contact flow to take specific actions. These tools are unique to Self-Service agents.
Escalate Tool
The Escalate tool transfers the conversation to a human agent when:

The customer explicitly requests to speak with a person
The AI cannot resolve the customer's issue
The situation requires human judgment or authorization

```
1
2
3
Tool: Escalate
Purpose: Transfer to human agent with context
Behavior: Gathers summary of conversation, ends AI session, routes to queue, presents summary and next steps to human agent
```

Complete Tool
The Complete tool gracefully ends the conversation when:

The customer's issue has been resolved
The customer indicates they have no more questions
The interaction has reached a natural conclusion

```
1
2
3
Tool: Complete
Purpose: End conversation gracefully
Behavior: Ends AI session, terminates contact
```

RTC Tools Work by DefaultKey Insight: RTC tools (Escalate and Complete) work by default without any Security Profile configuration. They are built-in capabilities that don't require additional permissions.This is different from MCP tools (like Retrieve or industry-specific tools) which require Security Profile association to show "Sufficient" permissions.
AI Prompt Structure for Self-Service
Self-Service AI Prompts have specific requirements because responses are spoken aloud to customers or displayed in chat. The output must be natural and conversational.
Voice-Friendly Output Requirements
Self-Service prompts must produce output that sounds natural when spoken:
✅ Allowed❌ ForbiddenPlain conversational textBullet points (-, *, •)Natural sentence structureNumbered lists (1., 2., 3.)Spoken-friendly phrasingMarkdown formatting (**, __, #)Simple paragraphsHTML tags (<b>, <ul>, <li>)Special characters that don't speak wellCode blocks or technical formatting
Message and Thinking Tags
Self-Service prompts use structured tags for output:

```
1
2
<message>Your conversational response here </message>
<thinking>Internal reasoning not shown to customer</thinking>
```

TagPurposeVisible to Customer?<message>Customer-facing response✅ Yes - spoken/displayed<thinking>AI's internal reasoning❌ No - hidden
Message Tag FormatThe <message> tag must include a space before the closing tag: <message>Response here </message>. This is required for proper parsing.
Example Self-Service Response

```
1
2
3
4
5
6
7
<thinking>
Customer is asking about room availability. I should check the hotel inventory 
using the search tool and respond conversationally.
</thinking>
<message>I'd be happy to help you find a room. Let me check what's available 
for your dates. Could you tell me when you're planning to arrive and how many 
nights you'd like to stay? </message>
```

Notice how the response:

Uses natural, conversational language
Avoids bullet points or lists
Sounds natural when spoken aloud
Asks follow-up questions conversationally

Comparison: Self-Service vs Agent Assist Prompts
Agent Assistance prompts have different requirements because they display in the Agent Workspace (a visual interface), not spoken to customers.
Agent Assist Output Format
Agent Assistance prompts use HTML formatting for the Agent Workspace:

```
1
2
3
4
5
6
7
8
9
<message>
<b>Customer Issue:</b> Room upgrade request<br>
<ul>
<li>Current booking: Standard Room</li>
<li>Requested: Suite</li>
<li>Loyalty Status: Gold Member</li>
</ul>
<b>Recommended Action:</b> Approve upgrade based on loyalty status.
</message>
```

Why the Difference?
AspectSelf-ServiceAgent AssistanceDisplay MediumVoice synthesis / Chat bubbleAgent Workspace UIConsumerCustomer hearing/readingHuman agent readingFormatting SupportNone (plain text only)HTML (<b>, <ul>, <li>, <br>)Optimal StyleConversational sentencesStructured, scannable
Same Tags, Different ContentBoth Self-Service and Agent Assistance use <message> tags, but the content inside is formatted differently:
Self-Service: Plain conversational text
Agent Assistance: HTML-formatted structured content

Default AI Agent Limitation
Important: Default Agent Cannot Be EditedThe system default Self-Service AI Agent cannot be edited directly. To customize your AI Agent or apply a Security Profile, you must:
Create a new AI Agent (you can copy from the system default)
Configure the new agent with your desired settings
Associate the appropriate Security Profile
Use the new agent in your contact flows
This is necessary to enable MCP tools like Retrieve to show "Sufficient" permissions.
Why Create a New Agent?
ReasonExplanationSecurity Profile AssociationDefault agent has no Security Profile; MCP tools won't workCustomizationCannot modify default prompts or tool configurationsVersion ControlCustom agents support versioning for safe updatesIndustry-Specific ToolsNeed to add your industry's MCP tools
Key Takeaways

Self-Service agents talk directly to customers - responses must be natural and conversational
RTC tools (Escalate, Complete) work immediately - no Security Profile needed
MCP tools require Security Profile - must create a new agent to configure
No formatting in Self-Service - plain text only, suitable for voice synthesis
Agent Assistance uses HTML - structured content for the Agent Workspace

Next Steps
Now that you understand how Self-Service AI Agents work, proceed to:

Security Profiles - Configure permissions for MCP tools