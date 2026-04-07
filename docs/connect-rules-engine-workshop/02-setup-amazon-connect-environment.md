# Setup Amazon Connect Environment

Setup Amazon Connect EnvironmentImportantIn this workshop, you will use us-east-1 (N. Virginia) region for all modules. You are able to select any region where the Amazon Connect is available 
Access to AWS Console
AWS Account is required for this workshop. Your account must have the ability to create new IAM roles and scope other IAM permissions.
Important
If you do not have an active AWS account, please follow the steps under the Personal AWS Account tab.
If you will complete this workshop hosted by AWS and provisioned account, please refer to the AWS Provisioned Account tab.

Open Sign Up  page and follow these steps  to create and activate AWS account

Once your account is created you will be able to login to your AWS console.

If you do not want to use the root user of your account for this workshop, please follow these steps  to create an IAM user with administrator access to the AWS account

Log in to the AWS Management Console  with your AWS account.

Select the Region.

Information notificationIn this workshop, the template will claim a DID in the United States. We recommend to select a number that suits your region. If you need to claim, start here Attachment download

Download the below CloudFormation template file*. Download CFT_Create_Amazon_Connect_Instance.yaml

When you use CloudFormation template in your personnel AWS account, it is recommended to follow the best practices for your development code. This includes to enable access logging and to deploy AWS Lambda functions inside a VPC  (Virtual Private Cloud).

This template will configure the following:
Setup an Amazon Connect instance.
Setup queues BasicQueue and SupervisorQueue.
Setup routing profiles Basic Routing Profile and Supervisor Routing Profile.
Setup users johndoe and supervisor1.
Assign routing profiles to users.
Claim a DID in the United States.
Apply the Sample Recording Behavior call flow to the DID.
Create and configure a Customer Profiles domain.

Select CloudFormation from the AWS Services Menu or search for the Service CloudFormation in the Search box.
ImportantDelete the resources created by the CloudFormation stack after completing the workshop to avoid incurring unnecessary costs. Follow the steps in the Cleanup module to do so.
In the CloudFormation Console, select Create Stack > With new resources (standard)

Select Template is ready. Select Upload template file and upload the CloudFormation template that you have downloaded earlier.

Provide stack name as cft-create-amazon-connect-instance in the stack details page and leave the other Stack options on the default values.

Review the settings for your CloudFormation Stack. Confirm that CloudFormation is allowed to create IAM-Resources and select on Create stack.

The creation of the CloudFormation stack will take a couple of minutes. You are able to view the progress under the tab "Stack-Info".

Select the Outputs tab and note the InstanceUrl, AdminUsername and AdminPassword. These are your Amazon Connect instance URL, admin user ID and password, respectively. Additionally, make a note of the AgentUsername and AgentPassword as you will use these credentials to log in as an agent.
Congratulations!You have successfully Created an Amazon connect instance
Amazon Connect configurations

In the AWS Services search box, type Amazon Connect.

Select Amazon Connect, select the Access URL for the instance that was created.

You are now on the login page for your Amazon Connect instance. Please log in with the administrator username and password you set up for the instance.

ImportantGo to CloudFormation from the AWS Services Menu and select cft-create-amazon-connect-instance stack and refer Outputs tab to get the login credentials.

You are now on the Amazon Connect admin console. On the left is the navigation menu. Your instance name (called an alias) displays in the URL.

Congratulations!You have successfully logged in as an Administrator to the Amazon Connect instance. Let's start the Rules Engine workshop!