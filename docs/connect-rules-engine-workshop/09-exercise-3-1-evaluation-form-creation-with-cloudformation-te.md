# Exercise 3.1 - Evaluation Form creation with CloudFormation template

Exercise 3.1 - Evaluation Form creation with CloudFormation templateThis section guides participants through the steps to create an Evaluation Form in your Amazon Connect instance through AWS (CloudFormation Template ).
Pre-requisite

Before importing the CloudFormation Template in your AWS Account, you need to capture your Amazon Connect Amazon Resource Names (ARN), which will be passed as a parameter for the template. To obtain Amazon Connect ARN, in your AWS Console, search for Amazon Connect and select 'Amazon Connect'

Select the Amazon Connect instance deployed in 'Setup Amazon Connect Environment' Exercise.

Copy the complete Amazon Connect ARN displayed under 'Distribution Settings'

ARN Format: arn:partition:service:region:account-id:resource-type/resource-id

Make a note of the Amazon Connect ARN.
Steps to import CloudFormation Template

Download the below CloudFormation template file*. Download Create_Agent_Eval_Form.yaml

In your AWS Console, search for CloudFormation and select 'CloudFormation'

In the 'CloudFormation Console', select 'Create Stack' - 'With new resources (standard)'

Select 'Choose an existing template' and 'Upload a template file'. From the 'Upload a template file', upload the CloudFormation Template named 'Create_Agent_Eval_Form.yaml' that you downloaded in step 1. Choose Next

Provide a unique stack name, such as 'cft-create-agent-eval' in the stack details page.

Provide Amazon Connect ARN noted in 'Pre-Requisite' under 'ConnectInstanceArn'

ImportantThe complete Account Number and the instance ID are masked in the screenshot.

Continue by selecting 'Next'. In the Review and Create page, select 'Submit'

Wait for the CloudFormation to complete deployment. Once complete, validate the status reflects CREATE_COMPLETE

Steps to verify the Agent Evaluation Form is deployed and activated

In the AWS Console, search for Amazon Connect and select 'Amazon Connect'

Choose Amazon Connect, select the Access URL for the instance that was created.

You are now on the login page for your Amazon Connect instance. Please log in with the administrator username and password you set up for the instance.

ImportantGo to CloudFormation from the AWS Services Menu and select cft-create-amazon-connect-instance stack and refer Outputs tab to get the login credentials.

After logging in, navigate to 'Analytics and optimization' and select 'Evaluation forms'

Verify AgentBehaviorForm is available in the list and 'Active Version' is showing 'Version 1'

Congratulations!You have successfully implemented the CloudFormation template and verified that the Agent Evaluation Form is deployed and activated.