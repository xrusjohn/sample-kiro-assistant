# Exercise 1.2 - Testing

Exercise 1.2 - TestingIn this exercise we are going to test the Real-time Metric Rule created in the previous exercise.

Test the rule by calling your contact center and transferring the call to an agent.

NoteFor steps to call your contact center refer Place a test call to your Amazon Connect instance

Login as agent johndoe and when the call rings on Agent Workspace do not Accept the call and let it ring. This will mark the agent's activity as Missed. Continue to be in this status for one minute for the rule to be invoked.

Agent's Activity can be verified on the Real-time metrics page.

Login with the supervisor1 username and password you set up for the instance.

ImportantGo to CloudFormation from the AWS Services Menu and select cft-create-amazon-connect-instance stack and refer Outputs tab to get the login credentials.

You are now on the Amazon Connect admin console. Select 'Agent Workspace' in the top control bar of Amazon Connect admin console. Accept any permissions request you receive in the browser.

Change the supervisor1 status to 'Available'. Wait for the Real-time metric rule to invoke which then sends a Task to supervisor1. Click on Accept task.

After accepting Task supervisor1 can view the Task fields like the Description and References within the CCP.

supervisor1 can also click on the link under References to open the Real-time metrics landing page.

Congratulations!You have successfully tested out a Real-time Metrics Rule.

An email notification is also sent to the email recipients configured in the rule like supervisor1.

NoteIn order to test email notification either update the existing user supervisor1's email address to an email address that you have access to using the UpdateUserIdentityInfo API  or add a new user  with a valid email address and edit the rule [Step 12] to add this new user to the email recipient list.