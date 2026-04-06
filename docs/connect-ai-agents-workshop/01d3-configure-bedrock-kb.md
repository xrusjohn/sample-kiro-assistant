# Configure Bedrock Knowledge Base

Configure Bedrock Knowledge BaseThis module walks you through integrating Amazon Connect Assistant with an Amazon Bedrock Knowledge Base. This connector is ideal for organizations that want advanced RAG capabilities, custom embedding models, or already have a Bedrock Knowledge Base.
Overview
The Bedrock Knowledge Base (BYO-KB) connector allows you to:

Use an existing Amazon Bedrock Knowledge Base with Connect Assistant
Leverage custom chunking and embedding configurations
Choose from multiple vector store options (OpenSearch Serverless, Aurora PostgreSQL, Neptune Analytics)
Support advanced retrieval scenarios

Content Segmentation Not SupportedUnlike S3, Salesforce, and ServiceNow connectors, Bedrock Knowledge Base integration does not support Content Segmentation using the TagResource API. If you need to filter content based on contact context, use one of the other connector types.Content Segmentation refers to filtering content within a Connect Assistant managed KB using the TagResource API .Bedrock Knowledge Base KBs can be used in multi-KB implementations, and Bedrock provides abilities to filter content  separately from the TagResource API.
Architecture

Prerequisites
Before starting, ensure you have:

An Amazon Connect instance with an Assistant domain created
IAM permissions to create Bedrock Knowledge Bases and IAM roles
An S3 bucket with documents for the knowledge base (or other supported data source)

When to Use Bedrock KB vs Other Connectors
ScenarioRecommended ConnectorSimple document upload, workshop scenariosS3Existing Salesforce KnowledgeSalesforceExisting ServiceNow KBServiceNowCustom embedding modelsBedrock KBAdvanced chunking strategiesBedrock KBExisting Bedrock KB investmentBedrock KBNeed Content SegmentationS3, Salesforce, or ServiceNow
Step 1: Create a Bedrock Knowledge Base
Amazon Bedrock Knowledge Bases provides a fully managed RAG solution with advanced capabilities including custom embedding models, multiple vector store options, and flexible chunking strategies.
Bedrock Knowledge Base SetupFor comprehensive instructions on creating and configuring an Amazon Bedrock Knowledge Base, see the Amazon Bedrock Knowledge Bases User Guide .The guide covers:
Creating a knowledge base with vector store
Configuring data sources (S3, Confluence, SharePoint, Salesforce, Web Crawler)
Selecting embedding models
Choosing vector database options (OpenSearch Serverless, Aurora PostgreSQL, Neptune Analytics)
Syncing and managing your knowledge base

Key Configuration Decisions
When creating your Bedrock Knowledge Base, consider:
DecisionOptionsRecommendationEmbedding ModelAmazon Titan, Cohere EmbedTitan Embeddings G1 for text-only contentVector StoreOpenSearch Serverless, Aurora PostgreSQL, Neptune AnalyticsOpenSearch Serverless for simplicityChunking StrategyDefault, Fixed-size, SemanticDefault for most use cases
After Creating Your Knowledge Base
Once your Bedrock Knowledge Base is created and synced:

Note the Knowledge Base ARN - you'll need it for the Connect integration
Verify the data source sync completed successfully
Test retrieval in the Bedrock console to confirm content is indexed

Ready for IntegrationWith your Bedrock Knowledge Base created, proceed to Step 2 to set up the IAM role for Amazon Connect access.
Step 2: Connect Bedrock KB to Amazon Connect
Once your Bedrock Knowledge Base exists, integrating it with Amazon Connect follows the same pattern as other managed connectors - you select it from the dropdown in the Connect console and associate it.
2.1 Associate via Amazon Connect Console

Open the Amazon Connect Console: https://console.aws.amazon.com/connect/ 
Select your Connect instance
In the navigation pane, choose Connect Assistant / Amazon Q
Under Integrations, choose Add integration
Select Amazon Bedrock Knowledge Base from the connector dropdown and complete the wizard

2.2 Configure as Retrieve Tool
Once associated, you can add the Bedrock Knowledge Base as a Retrieve tool in your AI Agent configuration, similar to how you would configure an S3 or other knowledge base connector.
Multi-KB Usage: Bedrock KB + S3 KB
One powerful use case is combining a Bedrock Knowledge Base with an S3-based knowledge base. This allows you to:

Use Bedrock KB for specialized content with custom embeddings
Use S3 KB for general content with Content Segmentation support

Example Multi-KB Architecture

Configure Multiple Retrieve Tools
When creating your AI Agent, you can configure multiple Retrieve tools:

Retrieve-General - Points to S3 Knowledge Base

Use for: General FAQs, policies, procedures
Supports: Content Segmentation

Retrieve-Technical - Points to Bedrock Knowledge Base

Use for: Technical documentation, product specs
Supports: Custom embeddings, advanced retrieval

The AI Agent will intelligently select which knowledge base to query based on the customer's question.
Next Steps
With your Bedrock Knowledge Base configured, you can:

Add more connectors - Configure S3, Salesforce, or ServiceNow for Content Segmentation
Optimize retrieval - Tune chunking and embedding settings in Bedrock
Proceed to MCP Server Setup - Configure third-party tool integration

Reference DocumentationFor detailed information, see:
Amazon Bedrock Knowledge Bases User Guide 
Amazon Connect Assistant API - CreateAssistantAssociation 
ExternalBedrockKnowledgeBaseConfig