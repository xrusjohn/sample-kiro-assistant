# Configure S3 Knowledge Base

Configure S3 Knowledge BaseThis module walks you through configuring an Amazon S3-based knowledge base for your Connect Assistant. S3 is the recommended connector for this workshop as it's simple to set up and supports content segmentation.
Overview
The S3 connector allows you to:

Upload documents directly to an S3 bucket
Support multiple file formats (PDF, TXT, HTML, DOCX)
Enable content segmentation with tags
Automatically sync content changes

If you're using a Workshop account, the knowledge base is already configured with multi-industry content.Verify Knowledge Base
In the AWS Console, navigate to Amazon Connect → Your instance → Applications → Connect Assistant / Amazon Q
Verify you see a domain with an S3 integration
Under Integrations, select the configured integration. Note the S3 URI
View Knowledge Base Content
Open Amazon S3 Console
Find the bucket starting with the S3 URI you noted starting with unified-workshop-stack-knowled or your stack's bucket
Browse the knowledge base folders:

hotel/ - Hotel FAQs
billing/ - Billing policies
healthcare/ - Healthcare FAQs
(other industries)

Add Custom Content (Optional)To add your own content:
Create a new folder in the S3 bucket (e.g., custom-content/)
Upload your documents (PDF, TXT, DOCX, HTML)
The Connect Assistant will automatically index new content
Your S3 knowledge base is configured! Proceed to MCP Server Setup to continue configuring foundational capabilities.
Next Steps
With your S3 knowledge base configured, you can:

Add more connectors - Configure Salesforce, ServiceNow, or Bedrock KB
Enable Content Segmentation - Tag content for targeted recommendations
Proceed to MCP Server Setup - Configure third-party tool integration