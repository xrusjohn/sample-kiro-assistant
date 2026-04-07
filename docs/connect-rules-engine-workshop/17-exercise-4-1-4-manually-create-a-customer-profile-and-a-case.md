# Exercise 4.1.4 - Manually create a customer profile and a case

Exercise 4.1.4 - Manually create a customer profile and a caseThis section is meant to provide guidance on how to manually create a customer profile and create a new case that will be used in the later section for testing the Case Rule.

In the AWS Services search box, type Amazon Connect.

Select Amazon Connect, select the Access URL for the instance that was created.

You are now on the login page for your Amazon Connect instance. Please log in with the Supervisor1 username and password you set up for the instance.

ImportantGo to CloudFormation from the AWS Services Menu and select cft-create-amazon-connect-instance stack and refer Outputs tab to get the login credentials.

You are now on the Amazon Connect admin console. Select 'Agent Workspace' in the top control bar of Amazon Connect admin console. Accept any permissions request you receive in the browser.

Create a new Customer Profile using the Agent Workspace

Navigate to the Customer Profile tab and click +Profile to create a profile.

Fill in your name and any other profile fields you like > click Save.

NoteIf you have an active Contact, you can create profile directly from the active call screen or associate the number with an existing profile by clicking Associate to associate the contact to the profile.

Once a Profile gets created for the Contact, navigate to the Cases tab and click on +Cases to create a new case.

Enter the Case details and click on save.

NotePlease have the word compliance in the summary since this will be used for testing later.

Case created successfully

Congratulations!You have created a Customer Profile and a Case for your Amazon Connect instance which will be used in the Testing Exercise 4.3. Proceed to the next module to create a Case rule.