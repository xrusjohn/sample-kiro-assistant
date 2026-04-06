# Email AI Capabilities

Email AI CapabilitiesIn this module, you'll explore AI-powered email capabilities in Amazon Connect. You'll learn how to configure email conversation overviews, knowledge base recommendations, and generated email response drafts to help agents handle email contacts more efficiently.
Enable EmailFor more information on enabling Email refer to the documentation .
What You'll Learn

Understand email AI capabilities for agent assistance
Configure email conversation overview for automatic thread analysis
Set up knowledge base and guide recommendations for email contacts
Enable generated email response drafts
Customize email AI prompts for your organization
Test and validate email AI capabilities in Agent Workspace

Overview
Amazon Connect provides comprehensive AI capabilities for email contacts through three main AI Agent types:
AI Agent TypeDescriptionConfigurationEmailOverviewAutomatic analysis of email threads with key issues, context, and next stepsEMAIL_OVERVIEW type with emailOverviewAIAgentConfigurationEmailResponseKnowledge base recommendations and guide suggestions for email contactsEMAIL_RESPONSE type with emailResponseAIAgentConfigurationEmailGenerativeAnswerProfessional email response drafts incorporating knowledge base contentEMAIL_GENERATIVE_ANSWER type with emailGenerativeAnswerAIAgentConfiguration
Email AI Prompts
Each AI Agent uses one or more AI Prompts:
AI Prompt TypePurposeUsed ByEMAIL_OVERVIEWGenerates structured summaries of email threadsEmailOverview AgentEMAIL_RESPONSEExtracts relevant knowledge base content for agent referenceEmailResponse AgentEMAIL_GENERATIVE_ANSWERCreates professional email response draftsEmailGenerativeAnswer AgentEMAIL_QUERY_REFORMULATIONConverts email content into optimized search queriesEmailResponse & EmailGenerativeAnswer Agents
Shared Query ReformulationThe EMAIL_QUERY_REFORMULATION prompt is shared between EmailResponse and EmailGenerativeAnswer agents. It analyzes email threads and generates precise search queries to find relevant knowledge base articles.
Key Benefits

Faster Context Gathering: Agents quickly understand email thread history without reading all messages
Relevant Recommendations: AI suggests knowledge articles and guides based on email content
Professional Responses: AI generates well-formatted email drafts with proper tone
Consistent Quality: Responses incorporate knowledge base content for accuracy
Improved Efficiency: Agents can copy, edit, and send responses faster
Multi-Language Support: Configure locale settings to generate content in different languages

Locale Configuration
All Email AI Agents support locale configuration to generate content in different languages:
Locale CodeLanguageen_USEnglish (US)es_ESSpanish (Spain)ja_JPJapanesede_DEGermanfr_FRFrenchpt_BRPortuguese (Brazil)
Locale BehaviorThe locale setting determines the language of AI-generated content. The AI will generate summaries, recommendations, and response drafts in the specified language, regardless of the original email language.

Email Conversation Overview
The Email Conversation Overview provides automatic analysis of email threads, giving agents a structured summary of the customer's issue and conversation history.
What Email Conversation Overview Does
When an agent accepts an email contact, the AI automatically analyzes the email thread and provides:
ElementDescriptionKey IssuesPrimary customer concerns identified from the email threadPrevious ActionsSummary of any actions already taken or discussedContextRelevant background information from the conversationNext StepsRecommended actions for the agent to take
Default AI Agent and Prompt
Amazon Connect provides system-default resources for email conversation overview:

AI Agent Type: EMAIL_OVERVIEW
AI Prompt Type: EMAIL_OVERVIEW
Model: us.anthropic.claude-3-7-sonnet-20250219-v1:0
API Format: MESSAGES

Agent Configuration Structure:

```
1
2
3
4
5
6
{
  "emailOverviewAIAgentConfiguration": {
    "emailOverviewAIPromptId": "<prompt-id>:<version>",
    "locale": "en_US"
  }
}
```

Supported Locales: You can customize the locale to generate summaries in different languages (e.g., es_ES for Spanish, ja_JP for Japanese).
You can customize the prompt to:

Adjust the summary format and detail level
Include specific information relevant to your business
Match your organization's terminology
Add industry-specific context

How Email Conversation Overview Works

Example Email Conversation Overview
Email Thread: Customer inquiring about order status and requesting a refund
AI-Generated Overview:

Email Conversation Overview
Key Issues

Customer ordered product on January 10, 2025
Order has not arrived after 2 weeks
Customer requesting full refund or expedited replacement

Previous Actions

Customer contacted support via chat on January 18 (no resolution documented)
Tracking shows package stuck at distribution center since January 15

Context

Order #ORD-456789
Product: Wireless Headphones ($149.99)
Shipping method: Standard (5-7 business days)
Customer is a repeat buyer (3 previous orders)

Recommended Next Steps

Check current tracking status with carrier
Offer expedited replacement or full refund
Consider courtesy credit for inconvenience

Knowledge Base and Guide Recommendations
When handling email contacts, the AI automatically suggests relevant knowledge articles and step-by-step guides based on the email content.
What Knowledge Base Recommendations Does
The AI analyzes the email content and provides:
Recommendation TypeDescriptionKnowledge ArticlesRelevant articles from your knowledge base that address the customer's issueStep-by-Step GuidesProcedural guides that help agents resolve the issueRelated ContentAdditional resources that may be helpful
Default AI Agent and Prompt
Amazon Connect provides system-default resources for knowledge base recommendations:

AI Agent Type: EMAIL_RESPONSE
AI Prompt Types: EMAIL_RESPONSE and EMAIL_QUERY_REFORMULATION
Model: us.anthropic.claude-3-7-sonnet-20250219-v1:0
API Format: MESSAGES

Agent Configuration Structure:

```
1
2
3
4
5
6
7
{
  "emailResponseAIAgentConfiguration": {
    "emailResponseAIPromptId": "<prompt-id>:<version>",
    "emailQueryReformulationAIPromptId": "<prompt-id>:<version>",
    "locale": "en_US"
  }
}
```

Query ReformulationThe EmailResponse agent uses the Query Reformulation prompt to analyze email threads and generate optimized search queries for the knowledge base. This ensures relevant articles are surfaced based on the customer's actual issue.
How Recommendations Work

Example Recommendations
For an email about a billing dispute:
Knowledge Articles:

"Billing Dispute Resolution Process"
"Refund Policy and Procedures"
"Payment Method Update Guide"

Step-by-Step Guides:

"Process a Refund Request"
"Investigate Duplicate Charges"
"Escalate Billing Issues"

Generated Email Responses
The AI generates professional email response drafts that incorporate knowledge base content and maintain proper formatting and tone.
What Generated Email Responses Does
The AI creates email drafts that include:
ElementDescriptionProfessional GreetingAppropriate salutation based on customer nameIssue AcknowledgmentRecognition of the customer's concernResolution ContentInformation from knowledge base addressing the issueNext StepsClear actions the customer should expectProfessional ClosingAppropriate sign-off
Default AI Agent and Prompt
Amazon Connect provides system-default resources for generated email responses:

AI Agent Type: EMAIL_GENERATIVE_ANSWER
AI Prompt Types: EMAIL_GENERATIVE_ANSWER and EMAIL_QUERY_REFORMULATION
Model: us.anthropic.claude-3-7-sonnet-20250219-v1:0
API Format: TEXT_COMPLETIONS

Agent Configuration Structure:

```
1
2
3
4
5
6
7
{
  "emailGenerativeAnswerAIAgentConfiguration": {
    "emailGenerativeAnswerAIPromptId": "<prompt-id>:<version>",
    "emailQueryReformulationAIPromptId": "<prompt-id>:<version>",
    "locale": "en_US"
  }
}
```

Output Format Options
Generated email responses support multiple output formats:
FormatDescriptionUse CaseHTMLRich text with formatting (default)Standard email responsesPlain TextSimple text without formattingBasic email systemsMarkdownMarkdown-formatted textSystems that render markdown
Default FormatHTML is the default output format, which integrates seamlessly with the Agent Workspace rich text editor.
How Generated Responses Work

Example Generated Email Response
Customer Email: "I was charged twice for my subscription. Please help."
AI-Generated Response Draft:

Dear [Customer Name],
Thank you for contacting us about the duplicate charge on your subscription.
I understand how frustrating it can be to see an unexpected charge on your account, and I'm here to help resolve this for you.
I've reviewed your account and can confirm that a duplicate charge of $29.99 was processed on January 15, 2025. I've initiated a refund for this amount, which should appear on your statement within 5-7 business days.
Here's what you can expect:

Refund amount: $29.99
Processing time: 5-7 business days
Reference number: REF-123456

Your subscription remains active and will continue without interruption.
If you have any questions or don't see the refund within the expected timeframe, please don't hesitate to reach out.
Best regards,
[Agent Name]
Customer Support Team

Configuration Steps
Step 1: Verify Email Channel is Enabled
Before configuring email AI capabilities, ensure email is enabled on your Connect instance:

Navigate to the Amazon Connect console
Select your instance
Go to Channels > Email
Verify email is enabled and configured

Step 2: Add Check Contact Attributes Block
Add a block to verify the contact is an email contact:

Open your inbound email contact flow
Add a Check contact attributes block
Configure to check the channel:

Type: System
Attribute: Channel
Condition: Equals "EMAIL"

Route email contacts to the appropriate branch

Step 3: Add Connect Assistant Block
Add the Connect Assistant block to enable email AI capabilities:

In your email contact flow, add the Connect Assistant block
Position it before the Transfer to queue block so the AI analysis runs prior to agent assignment
Configure the Connect AI agent domain if not already set. This associates your AI domain with the contact and enables the built-in email AI capabilities, including the following email AI agents defined in your domain:

EmailOverview – summarizes email thread content
EmailResponse – suggests relevant knowledge base content and guides
EmailGenerativeAnswer – proposes draft replies based on the email context

Agents then see the overview, suggestions, and draft responses in the Connect assistant panel in their workspace
Step 4: Configure for Inbound Email Contacts Only
Inbound OnlyEmail AI capabilities are designed for inbound email contacts only. Outbound email campaigns do not trigger these AI features.
Ensure your flow logic:

Identifies inbound email contacts
Routes them through the Connect Assistant block
Transfers to the appropriate queue for agent handling

Step 5: Customize Email AI Prompts
Customize the default prompts to match your organization's needs:
Email Overview Prompt (EMAIL_OVERVIEW)
The Email Overview prompt generates structured summaries with sections for Customer Issue, Agent Resolution, Next Steps, and Key Details.

Navigate to AI agents > AI prompts
Create a new prompt with type EMAIL_OVERVIEW
Key customization options:

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
# Available placeholders
{{$.transcript}}  # The email conversation thread
{{$.locale}}      # Language/region for the response (e.g., en_US, es_ES)

# Output format includes:
# - <thinking> section for analysis
# - <summary> with structured HTML sections:
#   - Customer Issue
#   - Agent Resolution
#   - Next Steps
#   - Key details
```

Customization Tips:

Adjust the summary sections to match your business terminology
Add industry-specific context extraction
Modify the thinking process for your use case

Email Query Reformulation Prompt (EMAIL_QUERY_REFORMULATION)
This prompt converts email content into optimized knowledge base search queries.

Create a new prompt with type EMAIL_QUERY_REFORMULATION
Key customization options:

```
1
2
3
4
5
6
# Available placeholders
{{$.transcript}}  # The email conversation thread
{{$.locale}}      # Language for the generated query

# Output format:
# <query> search query for knowledge base </query>
```

Customization Tips:

Add domain-specific terminology to improve search relevance
Include product names or service categories
Adjust query length and specificity

Email Response Prompt (EMAIL_RESPONSE)
This prompt extracts relevant knowledge base content for agent reference.

Create a new prompt with type EMAIL_RESPONSE
Key customization options:

```
1
2
3
4
5
6
7
# Available placeholders
{{$.contentExcerpt}}  # Knowledge base search results
{{$.query}}           # The reformulated search query
{{$.locale}}          # Language for the response

# Output format:
# <answer><answer_part><text>HTML content</text><sources>...</sources></answer_part></answer>
```

Customization Tips:

Define how knowledge base content should be formatted
Add company-specific response guidelines
Include citation requirements

Email Generative Answer Prompt (EMAIL_GENERATIVE_ANSWER)
This prompt generates professional email response drafts.

Create a new prompt with type EMAIL_GENERATIVE_ANSWER
Key customization options:

```
1
2
3
4
5
6
7
# Available placeholders
{{$.contentExcerpt}}  # Knowledge base search results
{{$.query}}           # The reformulated search query
{{$.locale}}          # Language for the response

# Output format:
# <answer><answer_part><text>HTML email content</text><sources>...</sources></answer_part></answer>
```

Customization Tips:

Define company voice and tone guidelines
Include standard greetings and closings
Add compliance language requirements
Specify formatting preferences (HTML structure)

Step 6: Configure Output Format
Configure the output format for generated email responses:

Navigate to AI agents > AI agents
Select the email response AI agent
Configure output format:

HTML (recommended for rich text editor)
Plain Text (for basic email systems)
Markdown (for markdown-compatible systems)

Agent Workspace Experience
When agents handle email contacts, the AI capabilities appear automatically in the Agent Workspace.
Email Conversation Overview
When an agent accepts an email contact:

Automatic Display: The email conversation overview appears in the Connect Assistant panel
Structured Format: Key issues, context, and next steps are clearly organized
Quick Reference: Agents can quickly understand the email thread without reading all messages

Knowledge Base and Guide Recommendations
As the agent reviews the email:

Automatic Suggestions: Relevant knowledge articles appear in the recommendations panel
Guide Links: Step-by-step guides are suggested based on the issue type
One-Click Access: Agents can open articles and guides directly from the panel

Generated Email Response
When composing a response:

Draft Available: A generated email response draft appears in the response panel
Copy to Editor: Agents can copy the draft to the rich text editor
Edit as Needed: Agents can modify the draft before sending
Regenerate Option: If the draft isn't suitable, agents can request a new one

Feedback Mechanism
Agents can provide feedback on AI-generated content:
FeedbackPurposeThumbs UpIndicates the content was helpful and accurateThumbs DownIndicates the content needs improvement
Continuous ImprovementAgent feedback helps improve AI-generated content over time. Encourage agents to provide feedback regularly.
Agent Workflow

Best Practices
Train Agents to Review AI-Generated Content
Human Review RequiredAI-generated content should always be reviewed by agents before sending to customers. AI assists but doesn't replace human judgment.
Training recommendations:

Verify accuracy - Check facts, numbers, and customer-specific details
Check tone - Ensure the response matches the situation's sensitivity
Add personalization - Include relevant customer-specific information
Review completeness - Ensure all customer questions are addressed

Use Email Templates for Consistent Formatting
While AI generates response content, consider using email templates for:
Template ElementPurposeHeadersConsistent branding and formattingSignaturesStandard agent signatures with contact infoDisclaimersLegal or compliance languageFootersCompany information and links
Maintain Up-to-Date Knowledge Base Content
The quality of AI recommendations depends on your knowledge base:

Regular updates - Keep articles current with latest policies and procedures
Comprehensive coverage - Ensure common issues have corresponding articles
Clear structure - Organize content for easy AI retrieval
Accurate information - Verify all knowledge base content is correct

Monitor and Improve
Track email AI performance:
MetricWhat to MonitorResponse TimeTime from email receipt to agent responseFirst Contact ResolutionEmails resolved without follow-upAgent FeedbackThumbs up/down on AI-generated contentCustomer SatisfactionCSAT scores for email interactions

Troubleshooting
Email Overview Not Appearing

Check flow configuration - Verify Connect Assistant block is in the email flow
Verify channel - Ensure the contact is identified as an email contact
Check AI agent status - Verify the EMAIL_OVERVIEW type AI agent is published and active

Recommendations Not Showing

Check knowledge base - Verify knowledge base has relevant content
Verify integration - Ensure knowledge base is connected to the Connect Assistant
Check AI agent - Verify the EMAIL_RESPONSE type AI agent is configured and published

Generated Response Quality Issues

Review prompts - Customize EMAIL_GENERATIVE_ANSWER and EMAIL_QUERY_REFORMULATION prompts for your needs
Update knowledge base - Ensure relevant articles exist for common issues
Check formatting - Verify output format matches your email system
Verify locale - Ensure the locale setting matches your target language

Agent Cannot See AI Panel

Check security profile - Verify agent has Connect Assistant permissions
Verify workspace - Ensure agent is using the correct Agent Workspace
Check contact routing - Verify email contacts route through the AI-enabled flow

Next Steps
Now that you've configured Email AI Capabilities, explore other AI capabilities:

Cases AI Capabilities - Configure Case Summary AI Agent and case management
Customer Profiles AI Capabilities - Set up Predictive Insights and Sales AI Agent

Or return to the main tracks:

Agent Assistance Track - Continue with step-by-step guides and testing
Self-Service Track - Build self-service AI agents