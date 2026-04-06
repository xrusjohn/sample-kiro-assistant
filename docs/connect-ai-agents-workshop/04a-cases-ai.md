# Cases AI Capabilities

Cases AI CapabilitiesIn this module, you'll explore AI-powered case management capabilities in Amazon Connect. You'll learn how to use the Case Summary AI Agent for automatic case summarization and configure 1P MCP Cases tools for creating, updating, and searching cases through AI Agents.
Enable CasesTo learn how to enable Cases refer to the documentation .
What You'll Learn

Understand Case Summary AI Agent capabilities for case summarization
Configure 1P MCP Cases tools for AI-powered case management
Implement Agent Assistance use cases for case handling
Implement Self-Service use cases for customer case creation
Test and validate case AI capabilities

Overview
Amazon Connect provides comprehensive AI capabilities for case management through two main components:
ComponentDescriptionUse CasesCase Summary AI AgentGenerative AI-powered summarization of existing casesAgent Assistance - faster context gathering1P MCP Cases ToolsCreate, update, search, and manage cases via AI AgentsBoth Agent Assistance and Self-Service
Key Benefits

Faster Context Gathering: Agents quickly understand case history without reading all notes
Automated Case Creation: Self-service customers can create cases via voice/chat
Intelligent Case Search: AI Agents find related cases to avoid duplicates
Seamless Updates: Cases can be updated during customer interactions

Case Summary AI Agent
Agent Workspace OnlyCase Summarization is exclusive to Agent Assistance mode. It's designed to help human agents understand case context, not for customer-facing self-service scenarios.
What Case Summarization Does
The Case Summary AI Agent provides generative AI-powered summarization by analyzing:
CategoryData ElementsCase Fieldssummary, status, title, reference_number, custom fieldsAudit Eventscase updates, related items createdRelated Itemscomments, email contacts, task contacts, SLAsAgent NotesPrevious agent notes (supplemented in summary)
Default Configuration
Amazon Connect provides a default Case Summary AI Agent that is automatically available in your instance.
Case Summary AI Agent
PropertyValueNameCaseSummarizationTypeCASE_SUMMARIZATIONConfigurationcaseSummarizationAIAgentConfigurationOriginSYSTEM (AWS-provided)StatusACTIVE
The Case Summary AI Agent references an AI Prompt via the caseSummarizationAIPromptId property in the format {promptId}:{version}.
Example Configuration:

```
1
2
3
4
5
{
  "caseSummarizationAIAgentConfiguration": {
    "caseSummarizationAIPromptId": "abc12345-6789-0def-ghij-klmnopqrstuv:1"
  }
}
```

System-Provided DefaultThe default CaseSummarization AI Agent is automatically created by AWS and ready to use. You can customize the behavior by creating a custom AI Prompt and associating it with the agent.
Case Summary AI Prompt
PropertyValueNameCaseSummarizationTypeCASE_SUMMARIZATIONModelus.anthropic.claude-sonnet-4-20250514-v1:0API FormatMESSAGESTemplate TypeTEXTOriginSYSTEM (AWS-provided)
Amazon Connect provides a default case summarization prompt: ConnectCaseSummarizationPrompt
You can customize this prompt to:

Adjust summary length and detail level
Include specific fields or information
Match your organization's terminology
Add industry-specific context

Output Format
The Case Summary AI Agent outputs responses in a single-line XML format with two distinct sections:
TagPurposeVisibility<thinking>Contains the AI's reasoning and verification processHidden from agents<summary>Contains the formatted case summaryDisplayed to agents
Example XML Output:

```
1
<thinking>Evidence collection: Customer reported duplicate charge on Jan 12. Agent verified in billing system. Refund submitted Jan 15. Statement verification: All facts confirmed against case data. Classification: Billing dispute - duplicate charge.</thinking><summary>**Customer Issue:** Customer was charged twice ($149.99 each) for annual subscription renewal on January 12, 2025.\n\n**Current Status:** Refund approved and processing. Customer expects resolution by January 22.\n\n**Key Details:**\n- Account: #A-789456\n- Duplicate charge amount: $149.99\n- Original charge date: January 12, 2025\n\n**Timeline of Events:**\n- Jan 15: Initial report via chat, refund request submitted\n- Jan 17: Customer follow-up via email\n- Jan 19: Escalated to billing team</summary>
```

Agent Workspace DisplayThe Agent Workspace automatically parses the XML response and displays only the content within the <summary> tags. The <thinking> section is used internally for verification but is not shown to agents.
Verification Process
The Case Summary AI Agent performs a rigorous verification process before generating the final summary. This process occurs within the <thinking> section of the XML output.
StepDescription1. Evidence CollectionGathers all relevant facts from case data, comments, audit events, and related items2. Statement VerificationValidates each statement in the summary against the collected evidence3. Classification CheckEnsures proper categorization of the issue type and status4. Final ValidationConfirms accuracy and completeness before generating the summary
Verification TransparencyWhile the <thinking> section is not displayed to agents, it ensures that every statement in the summary is backed by evidence from the case data. This verification process helps maintain accuracy and prevents hallucination.
Summary Structure
The Case Summary AI Agent generates summaries with five distinct sections:
SectionDescriptionCustomer IssueWhat the customer is experiencing or reportingCurrent StatusAgent commitments and current case stateKey DetailsImportant facts, data points, and identifiersTimeline of EventsChronological history of interactions and updatesSupplementsAdditional context from previous agent notes
Agent Commitment Rules
The Current Status section specifically captures explicit agent commitments:
✅ Include (Explicit Commitments):

Explicit promises: "I will call you back by 3pm"
Scheduled actions: "Refund will be processed within 48 hours"
Confirmed next steps: "Technician visit scheduled for Tuesday"

❌ Exclude (Implied Support):

Implied support: "We're here to help"
Polite closings: "Thank you for your patience"
General statements: "We value your business"

Commitment AccuracyThe AI Agent only includes commitments that are explicitly stated in the case data. This ensures agents have accurate information about what has been promised to the customer.
Locale Configuration
The Case Summary AI Agent supports multi-language summarization through locale configuration. Configure the response language in the AI Agent configuration.
Supported Locales
LocaleLanguageen_USEnglish (US)es_ESSpanish (Spain)ja_JPJapanesede_DEGermanfr_FRFrench
Configuration Example

```
1
2
3
4
5
6
{
  "caseSummarizationAIAgentConfiguration": {
    "caseSummarizationAIPromptId": "{promptId}:{version}",
    "locale": "es_ES"
  }
}
```

Language OutputWhen a locale is configured, the Case Summary AI Agent generates the entire summary in the specified language. This is useful for multi-language contact centers where agents may prefer summaries in their native language.
Creating Custom Prompts
While the default CaseSummarization prompt works well for most use cases, you may want to create a custom prompt for specific requirements.
When to Customize
ScenarioRecommendationStandard case summarizationUse default promptAdjust summary length or detail levelCreate custom promptInclude organization-specific terminologyCreate custom promptAdd industry-specific guidanceCreate custom promptChange output structureCreate custom prompt
Required Settings
When creating a custom Case Summarization prompt, you must use these settings:
PropertyRequired ValueTypeCASE_SUMMARIZATIONTemplate TypeTEXTAPI FormatMESSAGES
Maintaining XML Output Format
XML Format RequiredYour custom prompt must maintain the XML output format with <thinking> and <summary> tags. The Agent Workspace expects this format to properly parse and display the summary.
Required Output Structure:

```
1
<thinking>Your verification reasoning here...</thinking><summary>Your formatted summary here...</summary>
```

Associating Custom Prompt with AI Agent
To use your custom prompt:

Navigate to AI agents > AI prompts
Create your custom prompt with Type = CASE_SUMMARIZATION
Publish the prompt and note the prompt ID and version
Navigate to AI agents > AI agents
Edit the CaseSummarization AI Agent
Update the caseSummarizationAIPromptId to reference your custom prompt: {promptId}:{version}
Save and publish the AI Agent

Agent Workspace Experience
In the Agent Workspace, agents interact with case summaries through:

Generate Button - Click to generate a new summary for the current case
Edit - Modify the generated summary before saving
Save - Store the summary with the case
Regenerate - Request a new summary if the first isn't satisfactory

When to Use Case Summarization
ScenarioBenefitCase HandoffNew agent quickly understands case historyEscalationSupervisor gets context without reading all notesFollow-up ContactAgent recalls previous interactions instantlyQuality ReviewManagers assess case handling efficiently
How Case Summarization Works

Example Case Summary
Agent Request: "Can you summarize case #12345?"
AI Agent Response:

Customer Issue
Customer reported being charged twice ($149.99 each) for a single annual subscription renewal. The duplicate charge occurred on January 12, 2025.
Current Status
Refund approved and processing. Agent committed to resolution by January 22, 2025. Billing team is investigating the processing delay.
Key Details

Case #12345
Customer: John Smith (Account #A-789456)
Status: In Progress
Priority: High
Duplicate charge amount: $149.99
Original charge date: January 12, 2025

Timeline of Events

Jan 15 (Chat): Initial report by customer. Agent verified duplicate charge in billing system. Refund request submitted.
Jan 17 (Email): Customer followed up asking about refund status. Agent confirmed refund is processing.
Jan 19 (Voice): Customer called - refund not yet visible. Agent escalated to billing team and committed to resolution by Jan 22.

Supplements
Previous agent note: "Customer is a long-term subscriber (5+ years). Consider courtesy credit if resolution is delayed."

Best Practices for AI-Generated Content
Review Before UsingAlways review AI-generated case summaries before taking action. AI summaries are meant to assist, not replace, human judgment.

Verify accuracy - Cross-check key facts with case data
Check completeness - Ensure critical information isn't missing
Update as needed - Edit summaries to add context or corrections
Use consistently - Train agents on when and how to use summaries

1P MCP Cases Tools
Amazon Connect provides first-party Model Context Protocol (MCP) tools for case management that can be used with Orchestration AI Agents.
Available Tools
ToolDescriptionPrimary Use CaseCreateCaseCreate new cases with specified fieldsSelf-service case creationUpdateCaseUpdate existing case fields and statusAgent/self-service case updatesSearchCasesSearch for cases by various criteriaFind related or existing casesListTemplatesList available case templatesDynamic template selection
Tool Configuration
To enable Cases tools in your AI Agent:

Navigate to Amazon Connect > AI agents > AI agents
Select or create an Orchestration AI Agent
In the Tools section, add the Cases tools you need
Configure tool permissions and parameters

Security Profile Permissions
Ensure your security profiles include the necessary Cases permissions:
PermissionRequired ForCases - ViewSearchCases, viewing case dataCases - CreateCreateCaseCases - EditUpdateCaseCases - TemplatesListTemplates
Tool Details
CreateCase
Creates a new case with specified fields.
Input Parameters:

templateId - Case template to use
fields - Case field values (subject, description, priority, etc.)
relatedContactId - Optional: Link to current contact

Example Use:

```
AI Agent: "I'll create a case for your billing inquiry. Can you confirm the issue is about a duplicate charge on your January statement?"
Customer: "Yes, that's correct."
AI Agent: "I've created case #54321 for your duplicate charge issue. You'll receive updates via email."
```

UpdateCase
Updates an existing case with new information.
Input Parameters:

caseId - The case to update
fields - Fields to update (status, priority, custom fields)
comment - Optional: Add a comment to the case

Example Use:

```
AI Agent: "I've updated your case #54321 with the additional information about the charge date. The status has been changed to 'Under Review'."
```

SearchCases
Searches for cases matching specified criteria.
Input Parameters:

filters - Search criteria (customer ID, status, date range, etc.)
maxResults - Maximum number of results to return

Example Use:

```
AI Agent: "Let me check if you have any existing cases... I found case #54321 from last week regarding a similar billing issue. Would you like me to update that case instead of creating a new one?"
```

ListTemplates
Lists available case templates for dynamic selection.
Input Parameters:

maxResults - Maximum number of templates to return

Example Use:

```
AI Agent: "Based on your issue, I'll use our 'Billing Dispute' template to create your case, which includes all the relevant fields for tracking refund requests."
```

Tool Override Configuration
1P MCP Cases tools reflect the underlying AWS Connect Cases APIs. You can configure property overrides to customize tool behavior based on what the API supports.
API-Based OverridesTool overrides allow you to pre-configure required parameters that the AI Agent will use when calling the underlying AWS API. This is useful for parameters that remain constant across calls, such as your Cases domain ID.
Override configuration is done in the AI Agent's tool settings. Each tool can have specific property overrides that are passed to the underlying API.
SearchCases Overrides
The SearchCases tool requires specific overrides to function properly.
Property KeyDescriptionRequireddomainIdYour Cases domain UUIDYesfields[]Array of field objects specifying which fields to returnYes
domainId Example:

```
7b6430b8-9d24-4e61-90a7-515b9833746e
```

Finding Your Domain ID:

Navigate to Amazon Connect > Cases > Domains
Select your Cases domain
Copy the Domain ID from the domain details

fields[] Configuration:
Specify which case fields to return in search results:

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
[
  {"id": "title"},
  {"id": "summary"},
  {"id": "status"},
  {"id": "case_reason"},
  {"id": "customer_id"},
  {"id": "assigned_queue"},
  {"id": "assigned_user"},
  {"id": "reference_number"},
  {"id": "created_datetime"},
  {"id": "last_updated_datetime"}
]
```

API ReferenceFor complete SearchCases API documentation, see SearchCases API Reference .
UpdateCase Overrides
The UpdateCase tool has simpler override requirements than SearchCases.
Property KeyDescriptionRequireddomainIdYour Cases domain UUIDYesfields[]Fields to updateConditional
Field Context OptimizationIf SearchCases was called earlier in the conversation, the AI Agent retains the field context from that call. In this case, you don't need to configure the fields[] override for UpdateCase - the agent already knows which fields are available.
When fields[] is Required:

UpdateCase is called without a prior SearchCases call
You want to update fields not returned by the previous SearchCases

When fields[] is NOT Required:

SearchCases was called first in the conversation
The AI Agent has field context from the search results

API ReferenceFor complete UpdateCase API documentation, see UpdateCase API Reference .

Agent Assistance Use Cases
Case Summarization for Faster Context
When an agent receives a contact related to an existing case:

Agent opens the associated case in Agent Workspace
Clicks Generate in the Summary panel
Reviews the AI-generated summary
Quickly understands case history and context
Continues the conversation with full context

Search Related Cases
When handling a new issue:

AI Agent searches for similar cases
Identifies patterns or related issues
Suggests relevant knowledge articles
Helps agent provide consistent resolution

Update Case During Contact
During a customer interaction:

Agent identifies new information
AI Agent updates case fields in real-time
Adds contact notes automatically
Maintains accurate case history

Create Follow-up Cases
After resolving a contact:

Agent identifies need for follow-up
AI Agent creates a new case linked to the contact
Populates relevant fields from the conversation

Self-Service Use Cases
Customer Creates Case via Voice/Chat

Conversation Example:

```
Customer: "I need to report a problem with my order."
AI Agent: "I'd be happy to help you report that. Can you tell me your order number?"
Customer: "It's ORD-789456."
AI Agent: "Thank you. What issue are you experiencing with order ORD-789456?"
Customer: "The item arrived damaged."
AI Agent: "I'm sorry to hear that. I've created case #12345 to track your damaged item report. You'll receive an email confirmation shortly with next steps for returning the item."
```

Customer Checks Case Status

```
Customer: "I want to check on my case."
AI Agent: "Of course. Can you provide your case number or the email address associated with your account?"
Customer: "My email is john@example.com"
AI Agent: "I found case #12345 regarding your damaged item. The current status is 'Replacement Shipped' - your replacement item was shipped yesterday and should arrive by Friday."
```

Customer Updates Case

```
Customer: "I need to add information to my existing case."
AI Agent: "I can help with that. What's your case number?"
Customer: "Case #12345"
AI Agent: "I found your case about the damaged item. What additional information would you like to add?"
Customer: "I also noticed the packaging was wet when it arrived."
AI Agent: "I've added that information to your case. This helps our team investigate the shipping issue. Is there anything else you'd like to add?"
```

Duplicate Prevention
Before creating a new case, the AI Agent can:

Search for existing cases with similar criteria
Ask the customer if the issue is related to an existing case
Update the existing case instead of creating a duplicate
Provide status on existing cases

Configuration Steps
Step 1: Enable Amazon Connect Cases

Navigate to the Amazon Connect console
Select your instance
Go to Cases in the left navigation
Enable Cases if not already enabled
Create or verify your Cases domain
Configure any additional fields or templates as needed

Step 2: Add the Connect Assistant Block to Flows
For Agent Assistance:

Open your inbound contact flow
Add the Connect Assistant block
Connect before the Transfer to queue block

For Self-Service:

Open your self-service contact flow
Add the Connect Assistant block
Connect before your Get customer input block

Step 3: Configure AI Agent with Cases Tools

Navigate to AI agents > AI agents
Create or edit an Orchestration AI Agent
Add Cases tools:

CreateCase (for case creation)
UpdateCase (for case updates)
SearchCases (for finding cases)
ListTemplates (for template selection)

Configure tool instructions as needed
Publish the AI Agent

Step 4: Customize Case Summarization Prompt

Navigate to AI agents > AI prompts
Find CaseSummarizationPrompt or create a custom prompt
Customize the prompt for your needs:

Adjust summary format and length
Include specific fields or terminology
Add industry-specific guidance

Associate the prompt with your Case Summary AI Agent

Step 5: Set Up Security Profile Permissions

Navigate to Users > Security profiles
Edit the relevant security profile
Enable Cases permissions:

Cases - View
Cases - Create
Cases - Edit
Cases - Case Templates

Save the security profile

Human - AI PermissionsRemember that for AI Agent tools, you need to ensure the AI agent and human agent have the same permissions to complete tool actions.

Testing
Test Case Summarization in Agent Workspace

Create a test case with multiple notes and activities
Log into Agent Workspace as an agent
Open the test case
Click Generate in the Summary panel
Verify the summary captures key information:

 Case overview (subject, status, priority)
 Issue summary
 Interaction history
 Current status
 Recommended next steps

Test Case Creation via Self-Service AI Agent

Initiate a test contact (voice or chat)
Request to create a case
Provide required information
Verify:

 AI Agent gathers necessary details
 Case is created with correct fields
 Confirmation is provided to customer
 Case appears in Cases console

Test Case Search and Update Operations

Create a test case
Initiate a new contact
Ask to check case status
Verify:

 AI Agent finds the correct case
 Status information is accurate
 Updates are saved correctly

Test Security Profile Restrictions

Create a security profile without Cases permissions
Assign to a test user
Verify:

 User cannot access Cases tools
 Appropriate error messages are shown
 No unauthorized case operations

Next Steps
Now that you've configured Cases AI Capabilities, explore other AI capabilities:

Customer Profiles AI Capabilities - Configure Predictive Insights and Sales AI Agent
Email AI Capabilities - Set up AI-powered email responses

Or return to the main tracks:

Agent Assistance Track - Continue with step-by-step guides and testing
Self-Service Track - Build self-service AI agents