# Adding Tools

Adding ToolsNow that security profiles are configured, you'll add tools to your Self-Service AI Agent. This includes industry MCP tools, the TellMeAJoke Flow Module, and configuring the RTC tools (Escalate and Complete).
Tool Types Overview
Self-Service AI Agents use three types of tools:
Tool TypeExamplesPurposeMCP ToolsIndustry APIs, RetrieveConnect to backend services via AgentCore GatewayFlow Module ToolsTellMeAJokeExecute contact flow modules as toolsRTC ToolsEscalate, CompleteSignal the contact flow to take action

Step 1: Navigate to Your AI Agent

Open the Amazon Connect instance
Go to AI agent designer > AI agents
Select your industry's Self-Service agent (e.g., "Hotel-Self-Service")
Click Edit to open the Agent Builder

Pre-Deployed Workshop AI AgentsThe workshop deployment includes pre-configured Self-Service AI Agents for each industry:
Hotel-Self-Service - Hotel reservation management
Billing-Self-Service - Billing and dispute resolution
Healthcare-Self-Service - Healthcare appointments
Retail-Self-Service - Retail orders and returns
Insurance-Self-Service - Insurance policies and claims
Telecom-Self-Service - Telecom account management
Utilities-Self-Service - Utilities billing and outages
Facilities-Self-Service - Facilities work orders
Public-Sector-Self-Service - Government services
Automotive-Self-Service - Automotive warranty and service
Manufacturing-Self-Service - Manufacturing support
These agents come with industry-specific prompts and basic tool configurations already set up.
Creating a New AI AgentIf you prefer to create a custom Self-Service AI Agent, you'll need to create one first. The system default cannot be edited. You can copy the configuration from the system default when creating your new agent.
Step 2: Add Industry MCP Tools
Add the MCP tools for your selected industry. These tools connect to your backend APIs via AgentCore Gateway.

In the Agent Builder, click Add Tool
Under Add existing AI Tool, find the Namespace dropdown
Select your gateway (starts with gateway_...)
In the AI Tool selection, choose tools that match your industry:

Add these tools from the healthcare-api namespace:
get-appointments - View scheduled appointments
get-prescription-refills - Check prescription status
schedule-appointment - Book a new appointment

Review the tool configuration
Click Add
Repeat steps 1-6 until all industry tools are added

Step 3: Add the TellMeAJoke Flow Module Tool
The TellMeAJoke flow module demonstrates how AI Agents can invoke contact flow modules as tools. This is useful for operations that require flow logic.

Click Add Tool
Under Namespace, select Flow Modules
Under AI Tool, select the flowID that matches your TellMeAJoke module (created in the Foundation module)
Under Version, select the latest published version
In the Instructions field, add guidance for when the AI should use this tool:

```
Use this tool when the customer asks for a joke, wants to hear something funny, or needs a moment of levity during the conversation. The jokes are family-friendly and appropriate for customer service interactions.
```

Click Add

Flow Module Tool BehaviorWhen the AI Agent invokes the TellMeAJoke tool:
The flow module executes and returns a random joke
The AI Agent receives the joke in the tool response
The AI Agent naturally incorporates the joke into the conversation
This demonstrates how flow modules can extend AI Agent capabilities beyond API calls.
Step 4: Configure RTC Tools
RTC (Return-to-Control) tools are special tools that signal the contact flow to take action. Unlike MCP tools that call external services, RTC tools control the conversation flow itself.
Understanding RTC Tools
ToolPurposeWhen to UseEscalateTransfer to human agentCustomer requests human, issue too complex, authorization neededCompleteEnd the conversationIssue resolved, customer satisfied, no more questions
RTC Tools Work by DefaultRTC tools (Escalate and Complete) are built-in capabilities that work immediately without Security Profile configuration. They're already available in your AI Agent.
Configuring the Escalate Tool
The Escalate tool transfers the conversation to a human agent with context. Configure it to capture relevant information:

In the Agent Builder, find the Escalate tool (pre-configured)
Select it and Edit to expand the tool configuration
Update the Instructions field - this guides when the AI should escalate:

```
Use this tool when:
- The customer explicitly asks to speak with a human agent
- You cannot resolve the customer's issue after reasonable attempts
- The situation requires human judgment or authorization
- The customer expresses frustration or dissatisfaction with AI assistance

Before escalating, summarize the conversation context so the human agent can continue seamlessly.
```

Update the Input Schema - this defines what information to capture:

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
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
{
    "type": "object",
    "properties":
    {
        "customerIntent":
        {
            "type": "string",
            "description": "A brief phrase (10-15words) describing what the customer wants to accomplish"
        },
        "sentiment":
        {
            "type": "string",
            "description": "Customer's emotional state during the conversation",
            "enum":
            [
                "positive",
                "neutral",
                "frustrated"
            ]
        },
        "escalationSummary":
        {
            "type": "string",
            "description": "Detailed summary for the human agent including what the customer asked for, what was attempted, and why escalation is needed",
            "maxLength": 500
        },
        "escalationReason":
        {
            "type": "string",
            "description": "Category for the escalation reason",
            "enum":
            [
                "complex_booking",
                "technical_issue",
                "customer_frustration",
                "policy_exception",
                "out_of_scope",
                "other"
            ]
        }
    },
    "required":
    [
        "escalationReason",
        "escalationSummary",
        "customerIntent",
        "sentiment"
    ]
}
```

Add Examples
Examples help the AI understand the tone you want for escalation messages. Add these five  examples:

Example 1:

```
1
2
3
4
Good example - Complex coordination request:
<message>
Congratulations on your daughter's upcoming wedding! This sounds like a wonderful celebration that deserves special attention. Let me connect you with one of our wedding specialists who can help coordinate all these details-the room block, accessibility accommodations, and catering coordination. I'll share everything you've told me so they can start helping you right away.
</message>
```

Example 2:

```
1
2
3
4
Good example - Technical difficulties:
<message>
I'm having trouble accessing the information you need right now. Let me connect you with a human agent who can help you further and make sure you get taken care of.
</message>
```

Example 3:

```
1
2
3
4
Good example - Frustrated customer:
<message>
I understand your frustration with this issue, and I want to make sure you get the help you deserve. Let me connect you with a human agent who can give this their full attention.
</message>
```

Example 4:

```
1
2
3
4
Good example - Group booking requiring coordination:
<message>
This sounds like an important trip for your team! With 12 rooms and specific requirements, let me connect you with one of our group booking specialists who can ensure everything is coordinated perfectly. They'll have all the details you've shared with me.
</message>
```

Example 5:

```
1
2
3
4
Bad example (avoid this - too abrupt, no empathy):
<message>
I can't help with that. Let me transfer you to someone else.
</message>
```

Click Update to save your changes

Configuring the Complete Tool
The Complete tool gracefully ends the conversation. Configure it to ensure proper closure:

Find the Complete tool in the Agent Builder
Select is and choose Edit to expand the tool configuration
Update the Instructions field:

```
Use this tool when:
- The customer's issue has been fully resolved
- The customer confirms they have no more questions
- The customer says goodbye or indicates they want to end the call
- The interaction has reached a natural conclusion

Always confirm with the customer before ending the conversation.
```

Review the Input Schema:

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
10
11
12
{
  "type": "object",
  "properties": {
    "reason": {
      "type": "string",
      "description": "Reason of completion"
    }
  },
  "required": [
    "reason"
  ]
}
```

Click Update if you made changes

Step 5: Configure User Confirmation for Action Tools
For tools that perform actions (create, update, delete), you should consider enable User Confirmation. This ensures the AI Agent confirms with the customer before taking irreversible actions.
Why User Confirmation Matters
In Self-Service interactions, the AI Agent acts on behalf of the customer. User confirmation:

Prevents accidental actions (e.g., canceling the wrong reservation)
Gives customers control over important decisions
Builds trust in the AI Agent
Reduces errors and complaints

Enabling User Confirmation

For each action tool (create, update, cancel, delete operations), click to expand the configuration
Find the User Confirmation toggle
Enable it for tools that modify data:

Tool TypeUser Confirmationget-* (read operations)❌ Not neededcreate-* (create operations)✅ Recommendedupdate-* (modify operations)✅ Recommendedcancel-* (cancel operations)✅ Recommendeddelete-* (delete operations)✅ Recommended
Enable User Confirmation for:
✅ create-reservation
✅ update-reservation
✅ cancel-reservation
Keep disabled for:
❌ get-hotels
❌ get-reservations

How User Confirmation Works
When User Confirmation is enabled, the AI Agent will:

Gather information - Collect all required details from the customer
Summarize the action - Explain what will happen
Ask for confirmation - Wait for explicit customer approval
Execute or cancel - Proceed only if customer confirms

Example conversation flow:

```
AI: I can help you cancel your reservation. Let me confirm the details:
    - Confirmation number: RES-12345
    - Hotel: Grand Seattle Hotel
    - Check-in: March 15, 2026
    - Check-out: March 18, 2026
    
    Would you like me to proceed with the cancellation?

Customer: Yes, please cancel it.

AI: I've successfully cancelled your reservation RES-12345. 
    You'll receive a confirmation email shortly. 
    Is there anything else I can help you with?
```

Step 6: Verify Tool Permissions
After configuring the Security Profile and Tools, verify that tools show the correct permissions:

Review the Tools section
Verify each MCP and Flow Module tool shows "Sufficient" permissions

Expected Status
ToolExpected StatusEscalate (RTC)✅ Sufficient (always)Complete (RTC)✅ Sufficient (always)Retrieve (MCP)✅ Sufficient (after configuration)Industry API tools (MCP)✅ Sufficient (after configuration)TellMeAJoke (Flow Module)✅ Sufficient (if enabled)
Insufficient Permissions?If tools still show "Insufficient" permissions after configuration:
Verify you saved the Security Profile changes
Confirm the AI Agent is associated with the correct Security Profile
Check that the tool namespace is enabled in the Security Profile
Ensure the AgentCore Gateway is properly configured (see Foundation module)

Step 7: Save and Publish
After configuring all tools:

Click Save to save your changes
Review the tool summary to verify all tools are configured correctly
Click Publish to make the agent available

Tool Configuration Summary
Before publishing, verify your configuration:
CategoryToolsStatusMCP ToolsIndustry-specific APIs✅ AddedFlow ModuleTellMeAJoke✅ AddedRTC ToolsEscalate, Complete✅ ConfiguredUser ConfirmationAction tools✅ Enabled
Verify Tool PermissionsAfter saving, check that all MCP tools show "Sufficient" permissions. If any show "Insufficient", revisit the Security Profiles section.
Tools Summary
Here's a visual summary of the tools you've configured:

Next Steps
Now that you've added tools to your AI Agent, proceed to create the contact flow:

Creating the Flow - Build the contact flow for Self-Service interactions