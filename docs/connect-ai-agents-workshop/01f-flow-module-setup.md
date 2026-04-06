# Flow Module Setup

Flow Module SetupThis module covers how to configure Flow Modules as reusable tools that AI Agents can invoke during customer interactions. You'll import a pre-built module, understand what's configured, and learn how to adapt these patterns for real business use cases.
What are Flow Modules?
Flow Modules are reusable contact flow components that encapsulate business logic. When configured as Tool Modules, AI Agents can invoke them to execute deterministic workflows - like processing payments, sending notifications, or routing contacts - using the same Connect Flow designer your team already knows.
This approach lets you define business logic once and execute it across multiple channels (voice, chat, SMS) and contexts (AI-driven self-service, agent-assisted interactions), ensuring consistency while reducing development overhead.

Why Use Flow Modules as AI Agent Tools?
Flow Modules as tools enable AI Agents to execute deterministic business logic during customer interactions. Instead of building bespoke APIs, you define workflows once using the familiar Connect Flow designer and execute them across multiple channels and contexts.
BenefitDescriptionDeterministic ExecutionCritical business logic (payments, escalations, notifications) runs as predictable, auditable workflows - not AI-generated codeFamiliar UIBuild with the Connect Flow designer your team already knows - no custom API development requiredDefine Once, Use EverywhereSame module works across voice, chat, SMS, and AI Agent interactionsBuilt-in GovernanceSame auditability, logging, and compliance controls as your existing Connect flowsVersion ControlSafely update modules with versioning and aliases - test before promoting to productionNo External InfrastructureExecute logic within Connect without Lambda or external APIs for simple workflows
Supported Blocks in Tool Modules
Tool modules support a specific set of Connect blocks. Here are some key categories:
CategoryBlocksMessagingSendMessage (SMS, Email, WhatsApp)TasksCreateTaskData & AttributesSetAttributes, CheckContactAttributes, DataTable, CustomerProfiles, CasesQueue OperationsSetQueue, GetQueueMetrics, CheckQueueStatus, ChangeRoutingPriorityRoutingSetRoutingCriteria, SetRoutingProficiency, DistributeByPercentageIntegrationInvokeLambdaFunction, InvokeFlowModule, InvokeThirdPartyActionFlow ControlLoop, Return, Resume, CheckHoursOfOperation
For the complete list of supported blocks, see Module as tool supported blocks  in the Amazon Connect documentation.
Hands-On: Import the TellMeAJoke Module
We've prepared a TellMeAJoke module that demonstrates key Flow Module concepts. This fun example uses native Connect blocks to randomly select and return a joke - no Lambda required!
Step 1: Download and Import

Download the module:

Download TellMeAJoke-Module.json
You may need to right-click and save link as depending on your browser.

In  your Amazon Connect instance, go to Routing → Flows

Connect Login CredentialsYour Amazon Connect instance username and password can be found in the CloudFormation outputs you collected earlier. Look for ConnectAdminUsername and ConnectAdminPassword.

Click the Modules tab
Click the drop-down to select Create flow module as tool

Important!Ensure you are creating the module as a tool. If you create it as a flow module, you will have to later save a copy as a tool for it to be used within your AI Agent.

Select the drop-down next to the Save button and select Import
Select the downloaded JSON file
Click Import

Step 2: Review What's Pre-Configured
After importing, open the module to explore what's been configured. Understanding these components is essential for building your own modules.
Input Schema
Click Settings → Input tab to see the input schema:

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
{
  "type": "object",
  "properties": {
    "category": {
      "type": "string",
      "description": "Optional category filter. Valid values: contact-center, animal, science, pun, food, tech, or leave empty for random"
    }
  }
}
```

Why this matters: The input schema defines what data the AI Agent can pass to the module. The AI Agent sees this schema and knows it can optionally provide a category parameter when invoking the tool.
Output Schema (Result Data)
Click Settings → Output tab to see the output schema:

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
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the joke was successfully retrieved"
    },
    "joke": {
      "type": "string",
      "description": "The complete joke text"
    },
    "category": {
      "type": "string",
      "description": "The category the joke belongs to"
    }
  }
}
```

Why this matters: The output schema defines what data the module returns to the AI Agent. The AI Agent receives joke and category in the response and uses them to formulate its reply to the customer.
The Flow Logic
The module uses these blocks:

Key components:
BlockPurposeDistributeByPercentageRandomly routes to different joke branchesSetAttributesStores the selected joke and category in contact attributesReturn (EndFlowModuleExecution)Returns ResultData containing the joke back to the AI Agent
The Return Block Configuration
The Return block is configured with ResultData that maps contact attributes to the output schema:

```
1
2
3
4
5
{
  "success": true,
  "joke": "$.Attributes.joke",
  "category": "$.Attributes.category"
}
```

Why this matters: The ResultData is what the AI Agent receives. Without this configuration, the module would execute but the AI Agent wouldn't receive any data back.
Step 3: Publish the Module

Click Publish and check create new version to create version 1
Note the module is now available as a tool

Versioning and AliasesFor production use, create an alias (like production) that points to a specific version. This allows you to update the module and test new versions before promoting them to production.
From Demo to Production
The TellMeAJoke module demonstrates patterns that translate directly to real business use cases.
Pattern: Static Data → Dynamic Data Sources
The demo uses SetAttributes with hardcoded jokes. In production, replace with:
Demo PatternProduction PatternUse CaseSetAttributes with static textInvokeLambdaFunctionCall external APIs, query databases, complex business logicSetAttributes with static textDataTable blockLook up configuration, mappings, business rulesSetAttributes with static textGetQueueMetricsRetrieve real-time queue statisticsSetAttributes with static textCheckHoursOfOperationGet current business hours status
When to Use Flow Modules vs MCP ToolsUse MCP Tools for Customer Profiles and Cases - they're available as first-party MCP tools and don't require Flow Modules.Use Flow Modules for Connect-specific actions like sending SMS, setting routing criteria, checking queue metrics, or orchestrating multi-step workflows with business logic.
Pattern: Random Distribution → Business Logic
The demo uses DistributeByPercentage for random selection. In production, use for:
Use CaseImplementationA/B TestingTest different offers, messages, or flowsLoad BalancingDistribute work across queues or teamsPromotional OffersShow different promotions to different segmentsGradual RolloutRoute 10% of traffic to new feature
Pattern: Single Success Branch → Multiple Outcomes
The demo has one success path. Production modules should handle multiple scenarios:
BranchWhen to UseSuccessOperation completed successfullyNotFoundCustomer or record not foundErrorSystem error or validation failureNeedsEscalationRequires human reviewUnauthorizedCustomer not authorized for action
Example: Production Module Architecture
Here's how a real SendConfirmationMessage module might look:

Input Schema:

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
{
  "type": "object",
  "properties": {
    "confirmationCode": {
      "type": "string",
      "description": "The confirmation code to send"
    },
    "channel": {
      "type": "string",
      "description": "Message channel: sms, email, or whatsapp"
    }
  },
  "required": ["confirmationCode"]
}
```

Output Schema:

```
1
2
3
4
5
6
7
8
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "messageId": { "type": "string", "description": "Message ID if sent successfully" },
    "error": { "type": "string", "description": "Error message if send failed" }
  }
}
```

Real-World Module Ideas
ModuleBlocks UsedPurposeSendConfirmationSendMessage, SetAttributesSend SMS/Email/WhatsApp confirmation to customerCreateFollowUpTaskCreateTask, SetAttributesCreate a task for agent follow-upGetQueueWaitTimeGetQueueMetrics, ReturnReturn estimated wait time for informed decisionsCheckBusinessHoursCheckHoursOfOperation, ReturnReturn whether currently in business hoursSetPriorityRoutingSetRoutingCriteria, ChangeRoutingPriorityAdjust routing priority based on contextPrepareQueueTransferSetQueue, SetCustomerQueueFlowConfigure queue settings before transfer
Next Steps
Now that you understand Flow Modules as AI Agent tools, proceed to your chosen learning track:

Agent Assistance Track - Configure AI Agents to help human agents with real-time recommendations
Self-Service Track - Build AI-powered customer self-service experiences

Reference DocumentationFor detailed technical information, see:
Amazon Connect Flow Modules Documentation 
Creating Tool Modules