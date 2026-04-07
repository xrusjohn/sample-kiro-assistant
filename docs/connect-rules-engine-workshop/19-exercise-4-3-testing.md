# Exercise 4.3 - Testing

Exercise 4.3 - TestingIn this exercise we are going to test the Case Rule created in the previous exercise.

In the AWS Services search box, type Amazon Connect.

Select Amazon Connect, select the Access URL for the instance that was created.

You are now on the login page for your Amazon Connect instance. Please log in with the Supervisor1 username and password you set up for the instance.

ImportantGo to CloudFormation from the AWS Services Menu and select cft-create-amazon-connect-instance stack and refer Outputs tab to get the login credentials.

You are now on the Amazon Connect admin console. Select 'Agent Workspace' in the top control bar of Amazon Connect admin console. Accept any permissions request you receive in the browser.

Change the Supervisor1 status to 'Available'. Go to the Cases tab and click on the Case Reference Number

Click on Edit

Make edits to the Case Summary filed and save the changes.

Case changes saved

Wait for the Case Rule to invoke which then sends a Task to Supervisor1. Click on Accept task.

After accepting Task Supervisor1 can view the Task fields like the Case Id and Description within the CCP.

Supervisor1 can also click on the link under References to open the associated Case and make any edits as required.

Congratulations!You have successfully tested out a Case Rule.