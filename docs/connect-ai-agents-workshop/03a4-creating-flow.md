# Creating the Flow

Creating the FlowIn this module, you'll build the contact flow that connects customers to your Self-Service AI Agent. Contact flows orchestrate the customer journey - from initial contact through AI conversation to human escalation when needed.
What You'll Learn

Understand the simplified contact flow architecture for self-service
Import a pre-built Self-Service contact flow
Create and configure a Lex bot for conversational AI
Configure the Agent Guide flow for human escalation
Understand human escalation routing to queues

Simplified Flow Architecture
This workshop uses a simplified, flat architecture - all settings are configured directly in the main flow without separate modules. This makes it easier to understand and maintain.

Key Architecture Points
ComponentDescriptionContact FlowSingle flow with inline settings (logging, Connect Assistant)Lex BotHandles voice/text interface, routes to AI AgentAI AgentProcesses requests, invokes toolsMCP ServerConnects to backend APIs via AgentCore GatewayFlow ModuleExecutes Lambda functions or Connect Flow blocks
Simplified ArchitectureUnlike complex production deployments, this workshop uses a flat flow structure without separate modules for Basic Settings or Customer Profile Lookup. All configuration is done inline in the main flow.
Step 1: Download and Import the Self-Service Flow
We provide a pre-built Self-Service flow that includes all necessary configuration:

Download the Self-Service flow:

Self-Service Flow

You may need to right-click and save link as to download, depending on your browser.

In Amazon Connect, navigate to Routing → Flows

Click Create flow

Click the dropdown arrow next to Save and select Import

Select the downloaded self-service-flow.json file

Review the flow structure:

Set logging behavior - Enables flow logging for troubleshooting
Create Connect Assistant session - Initializes the AI assistant
Set voice - Configures text-to-speech voice
Get customer input - Routes to Lex bot for AI Agent conversation
Check contact attributes - Detects escalation or completion
Set contact attributes - Stores escalation context for human agent
Transfer to queue - Routes escalated contacts to human agents

Configuration RequiredAfter importing, you'll need to:
Configure the Lex bot in the Get Customer Input block
Configure the Connect Assistant in the Create Connect Assistant session block
Update the Set Working Queue block to use your queue
Add the Set Event Flow block (Step 5) after deploying the Agent Screen Pop guide

Step 2: Create a Lex Bot
Your AI Agent needs a Lex bot to handle the conversational interface. The Lex bot serves as the voice/text interface layer while the AI Agent handles intelligence and decision-making.

In Amazon Connect, navigate to Routing -> Flows → Conversational AI

Click Create Conversational AI Bot

Configure the bot:

Bot name: [Industry]-SelfServiceBot
Description: Bot for Self-Service AI Agent

Click Create

Wait for the bot to be created (this may take a few moments)

Lex Bot RoleIn self-service flows, the Lex bot serves as the voice/text interface layer. The AI Agent handles the intelligence and decision-making, while Lex manages speech recognition and text-to-speech.

Once the bot is created, select Add language and select English (US)
Language SupportYour can see the languages supported by Amazon Lex here .

Within the bot, enable Amazon Connect AI agent in Connect intent  by toggling, selecting your assistant ID, and confirming.

Select Build language to build the bot.

Lex Bot Permissions UpdatePrior to proceeding you may need to reset the Lex bot management settings in the Amazon Connect console:
Open the Amazon Connect console (not the Connect admin interface)
Select your Connect instance
Navigate to Flows in the left menu
Locate the Enable Lex Bot Management in Amazon Connect checkbox and:

Turn it OFF (if currently enabled)
Click Save
Turn it back ON
Click Save

Ensure both options are enabled:

✅ Enable Lex Bot Management in Amazon Connect
✅ Enable Bot Analytics and Transcripts in Amazon Connect

Click Save
This toggle refresh can resolve issues where the Amazon Connect Assistant was enabled after instance creation and using a Lex bot.
Step 3: Update the Get Customer Input Block
Now configure your imported flow to use the Lex bot you created:

Open your imported Self-Service flow named Self Service Test Flow

Click on the Get customer input block

Select the Amazon Lex tab

Configure the Lex bot:

Select a Lex bot: Choose [Industry]-SelfServiceBot (or your bot name)
Alias: Select TestBotAlias

Provide a greeting under Text-to-speech or chat text

Scroll down and select Enable AI Agent

Select your Industry AI Agent and choose the latest version

Click Confirm

Configure Connect Assistant

Click on the Create Connect Assistant session block

Select your Connect Assistant ARN from the dropdown

Click Confirm

Step 4: Deploy the Agent Screen Pop Guide
The Agent Screen Pop guide displays escalation context to human agents when they accept an escalated contact. This guide shows the escalation reason, customer intent, conversation summary, and sentiment.
Deploy the Agent Screen Pop guide using CloudFormation:

Download the CloudFormation template:

Agent Screen Pop Template

Open the AWS CloudFormation Console 

Click Create stack → With new resources (standard)

Select Upload a template file and upload the downloaded template

Configure the stack:

Stack name: connect-agent-screen-pop
ConnectInstanceArn: Your Amazon Connect instance ARN

Click Next through the remaining screens and Submit

Wait for the stack to complete (approximately 2-3 minutes)

The template creates:

Agent Screen Pop View - The visual layout for the agent workspace
Agent Screen Pop Contact Flow - The flow that displays the view

Understanding the Set Contact Attributes Block
The imported flow includes a Set contact attributes block that captures escalation context from the Lex session attributes. This block maps the AI Agent's escalation data to Contact Attributes that persist through the transfer.
The block is pre-configured with these mappings:
Destination KeySourceSession Attribute KeyescalationReasonLex Session AttributesescalationReasonescalationSummaryLex Session AttributesescalationSummarycustomerIntentLex Session AttributescustomerIntentsentimentLex Session Attributessentiment

How Context FlowsWhen the AI Agent invokes the Escalate tool, it populates these session attributes. The Set Contact Attributes block copies them to Contact Attributes, which the Agent Guide then displays to the human agent.
Step 5: Add the Set Event Flow Block
The Set Event Flow block enables the Agent Guide to display escalation context when a contact is transferred to a human agent. You need to add this block to your imported flow.

In your Self-Service flow, drag a Set event flow block from the block library onto the canvas

Position it between the Set contact attributes block and the Set working queue block

Connect the blocks:

Connect the output of Set contact attributes → Set event flow
Connect the output of Set event flow → Set working queue

Configure the Set event flow block:

Event: Select Default flow for agent UI
Flow: Select Agent Screen Pop (deployed in Step 4)

Click Save

Agent Guide IntegrationThe Set Event Flow block triggers the Agent Guide when a contact is transferred to a human agent. This provides the agent with context about the customer's conversation with the AI, including escalation reason and summary.
Step 6: Configure the Set Working Queue Block
The imported flow has a placeholder queue configuration that needs to be updated for your Connect instance.

In your Self-Service flow, click on the Set working queue block

Configure the queue:

Queue: Select BasicQueue (or your preferred queue)

Click Save

Queue SelectionThe queue you select determines which agents can receive escalated contacts. Ensure agents are assigned to this queue and have the appropriate routing profile.
Step 7: Understand Human Escalation Routing
When the AI Agent invokes the Escalate tool, control returns to your contact flow. The flow detects this and routes the contact to a human agent queue.
How Escalation Works

AI Agent decides to escalate - Based on customer request or complexity
Escalate tool is invoked - AI provides escalation reason and summary
Flow detects escalation - Check contact attributes block reads the Tool session attribute
Context is preserved - Escalation reason, summary, and sentiment are stored
Agent Guide is triggered - Set Event Flow activates the Agent Guide
Contact is queued - Transfer to queue routes to human agents

Check Contact Attributes Block
The imported flow includes a Check contact attributes block that detects when the AI Agent has invoked the Escalate tool:

The block checks if $.Lex.SessionAttributes.Tool equals Escalate. When true, the flow routes to the escalation path.
Escalation Context
When a human agent accepts an escalated contact, they see:
FieldExample ValueCustomer IntentBook 15 rooms for wedding partySentimentPositiveEscalation Reasoncomplex_bookingSummaryCustomer planning daughter's wedding, needs 15 rooms including wheelchair-accessible room
This context helps the agent immediately understand the situation without asking the customer to repeat themselves.
Completed Flow Structure
Your completed flow should look similar to this:

Flow Structure for Escalation

Key Flow Blocks
BlockPurposeSet logging behaviorEnable flow logging for troubleshootingCreate Connect Assistant sessionInitialize AI assistant for the contactSet voiceConfigure TTS voice (e.g., Matthew, Joanna)Get customer inputRoute to Lex bot for AI Agent conversationCheck contact attributesDetect escalation or completionSet contact attributesStore escalation context for human agentSet event flowTrigger Agent Guide for agent screen popSet working queueSelect the queue for human agentsTransfer to queueRoute escalated contact to human agentsDisconnectEnd the contact (normal completion)
Step 8: Publish and Test

Review all block configurations in your Self-Service flow

Click Publish to make the flow active

Error PublishingYou may encounter an error with your Check Contact Attributes block. If so, open and save the block, and connect the No Match output to the Play Prompt.

Associate the flow with a phone number:

Navigate to Channels → Phone numbers
Select or claim your phone number
Under Contact flow / IVR, select your Self-Service flow
Click Save

Flow CompleteYour Self-Service contact flow is now configured with AI Agent routing and human escalation handling.
What's Next
Your contact flow is now routing customers to your AI Agent with escalation handling. In the next module, you'll verify your complete configuration and understand the end-to-end flow.