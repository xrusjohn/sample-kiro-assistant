# Knowledge Base Configuration

Knowledge Base ConfigurationKnowledge bases provide the content that AI Agents use to answer questions and provide recommendations. Amazon Connect supports multiple knowledge base connector types, allowing you to use your existing content repositories.
Knowledge Base Overview
AI Agents retrieve information from knowledge bases to:

Answer customer questions during self-service interactions
Provide real-time recommendations to human agents
Generate accurate responses with source citations

Supported Connectors
Amazon Connect Assistant supports the following managed knowledge base connectors:
Native Connect Connectors
ConnectorDescriptionContent SegmentationAmazon S3Upload documents directly to S3✅ SupportedSalesforceConnect to Salesforce Knowledge✅ SupportedServiceNowConnect to ServiceNow KB articles✅ SupportedZendeskConnect to Zendesk Help Center✅ SupportedSharePoint OnlineConnect to Microsoft SharePoint✅ SupportedWeb CrawlerCrawl and index web content❌ Not SupportedBedrock Knowledge BaseUse existing Amazon Bedrock KB❌ Not Supported
Content SegmentationContent Segmentation refers to filtering content within a Connect Assistant managed KB using the TagResource API .Web Crawler and Bedrock Knowledge Base KBs can be used in multi-KB implementations, and Bedrock provides abilities to filter content  separately from the TagResource API.
Integrating with Amazon Connect:
Once your knowledge base is created, integration into Amazon Connect follows the same pattern as other managed connectors:

Select from dropdown: In the Amazon Connect console, navigate to your Assistant domain and select the knowledge base from the available connectors
Associate: Complete the association by following the setup wizard
Configure as Retrieve tool: Add the knowledge base as a Retrieve tool in your AI Agent configuration

Workshop ScopeThis workshop covers S3, Salesforce, ServiceNow, and Bedrock KB connectors. For other connectors (Zendesk, SharePoint, Web Crawler), see the Amazon Connect Administrator Guide .
Connector Comparison (Workshop Focus)
The following connectors are covered in this workshop:
ConnectorUse CaseContent SegmentationSetup ComplexityS3File-based KB, workshop default✅ SupportedLowSalesforceExisting Salesforce Knowledge users✅ SupportedMediumServiceNowExisting ServiceNow KB users✅ SupportedMediumBedrock KBAdvanced RAG, custom embeddings❌ Not SupportedMedium
When to Use Each Connector
S3 Connector

Best for: New knowledge bases, document uploads, workshop scenarios
Content types: PDF, TXT, HTML, Word documents
Advantages: Simple setup, no external dependencies, supports content segmentation, real-time sync

Salesforce Connector

Best for: Organizations already using Salesforce Knowledge
Content types: Salesforce Knowledge articles
Advantages: Scheduled sync, leverages existing content investment

ServiceNow Connector

Best for: Organizations already using ServiceNow Knowledge Management
Content types: ServiceNow KB articles
Advantages: Scheduled sync, integrates with ITSM workflows

Bedrock Knowledge Base (BYO-KB)

Best for: Advanced RAG scenarios, custom embedding models, existing Bedrock KB
Content types: Any supported by Bedrock KB
Advantages: Custom chunking, embedding model selection, advanced retrieval
Limitation: Does not support Content Segmentation. Billed separately from Connect AI Agents.

Multi-KB Support
Amazon Connect supports multiple knowledge bases per instance, enabling:

Different KBs for different use cases: Product info vs. policies vs. troubleshooting
Multiple Retrieve tools: Configure AI Agents with multiple knowledge sources
Content segmentation: Filter content based on contact context (S3, Salesforce, ServiceNow only)

Multi-KB Configuration Example
An AI Agent can be configured with multiple Retrieve tools:
ToolKnowledge BaseUse CaseRetrieve-ProductsProduct KB (S3)Product specifications, featuresRetrieve-PoliciesPolicy KB (Salesforce)Return policies, warranty termsRetrieve-TechnicalTechnical KB (ServiceNow)Troubleshooting guides
The AI Agent intelligently selects which knowledge base to query based on the customer's question.
Workshop Knowledge Base Content
The workshop CloudFormation stack deploys multi-industry knowledge base content:
IndustryContent ExamplesHotelReservation policies, amenities, loyalty programBillingPayment options, dispute process, billing cyclesFacilitiesWork order procedures, maintenance policiesHealthcareAppointment scheduling, prescription refillsInsurancePolicy coverage, claims process, billingAutomotiveWarranty coverage, service schedulingManufacturingProduct support, troubleshooting guidesPublic SectorPermit applications, service requestsRetailOrder tracking, returns, product informationTelecomAccount management, service plans, outagesUtilitiesBilling inquiries, service requests, outage reporting
This content is automatically loaded into an S3-based knowledge base during deployment.
Choose Your Connector
Select the connector type that matches your environment:
ModuleDescriptionConfigure S3Set up S3-based knowledge base (recommended for workshop)Configure SalesforceConnect to Salesforce KnowledgeConfigure ServiceNowConnect to ServiceNow KBConfigure Bedrock KBUse existing Bedrock Knowledge Base
Workshop RecommendationFor this workshop, we recommend starting with the S3 connector as it's pre-configured with multi-industry content. You can add additional connectors later.
Modules
Configure S3 Knowledge BaseConfigure Salesforce Knowledge BaseConfigure ServiceNow IntegrationConfigure Bedrock Knowledge Base