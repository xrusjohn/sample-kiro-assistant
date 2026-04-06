# Configure ServiceNow Integration

Configure ServiceNow IntegrationThis module walks you through integrating Amazon Connect Assistant with ServiceNow Knowledge Management. This connector is ideal for organizations already using ServiceNow for IT service management and knowledge articles.
Overview
The ServiceNow connector allows you to:

Sync ServiceNow Knowledge Base articles to Connect Assistant
Leverage existing ServiceNow content investment
Configure scheduled sync intervals
Support Content Segmentation for targeted recommendations

Content Segmentation SupportedUnlike Bedrock Knowledge Base, ServiceNow integration supports Content Segmentation, allowing you to filter content based on contact context.
Prerequisites
Before starting, ensure you have:

An Amazon Connect instance with an Assistant domain created
A ServiceNow instance with Knowledge Management enabled
ServiceNow administrator credentials (username and password)
Your ServiceNow instance URL

Step 1: Add ServiceNow Integration

Open the Amazon Connect Console: https://console.aws.amazon.com/connect/ 
Select your Connect instance
In the navigation pane, choose Connect Assistant / Amazon Q
Choose Add integration
On the Add integration page, choose Create a new integration
Select ServiceNow as the source

Step 2: Configure Integration Settings
2.1 Acknowledge Requirements

Select the checkbox to acknowledge that your ServiceNow account meets the integration requirements

2.2 Name Your Integration

In the Integration name box, enter a descriptive name for the integration

Naming ConventionIf you plan to create multiple integrations, develop a naming convention to make them easy to distinguish (e.g., servicenow-it-kb, servicenow-hr-kb).
2.3 Create Connection
Choose one of the following options:
Use an existing connection:

Select Use an existing connection
Open the Select an existing connection list and choose a connection
Choose Next

Create a new connection:

Select Create a new connection
In the User name box, enter your ServiceNow user name (must have administrator permissions)
In the Password box, enter your password
In the Instance URL box, enter your ServiceNow URL (e.g., https://yourinstance.service-now.com)
In the Connection name box, enter a name for the connection
Choose Connect

2.4 Configure Encryption

Under Encryption, open the AWS KMS Key list and choose a key
-OR-
Choose Create an AWS KMS Key to create a new customer-managed key

2.5 Configure Sync Settings (Optional)

Under Sync frequency, open the list and select a synchronization interval (defaults to one hour)

Under Ingestion start date, optionally choose Ingest records created after and select a start date (defaults to ingesting all records)

Choose Next

Step 3: Select Knowledge Base Fields
Select the fields for the knowledge base. The following fields are required:
FieldDescriptionshort_descriptionArticle title/summarynumberArticle numberworkflow_statePublication statesys_mod_countModification countactiveActive statustextArticle contentsys_updated_onLast update timestampwikiWiki contentsys_idSystem ID

Select all required fields (and any additional fields you want to include)
Choose Next

Step 4: Review and Create

Review your integration settings
Make any necessary changes
Choose Add integration

Integration CreatedYour ServiceNow integration is now configured. The initial sync will begin automatically based on your sync frequency settings.
Sync Behavior
Automatic Sync

Content syncs automatically based on your configured sync frequency
New and modified articles are added to the knowledge base
The sync respects the workflow_state field to only include published articles

Content Removal
ImportantIf you delete articles in ServiceNow, Amazon Connect knowledge bases do not process those deletions automatically. You must retire articles in ServiceNow to remove them from your Connect knowledge base.
Next Steps
With your ServiceNow knowledge base configured, you can:

Add more connectors - Configure S3, Salesforce, or Bedrock KB
Enable Content Segmentation - Tag content for targeted recommendations
Proceed to MCP Server Setup - Configure third-party tool integration

Reference DocumentationFor detailed information, see the Amazon Connect Administrator Guide - Initial setup for AI agents .