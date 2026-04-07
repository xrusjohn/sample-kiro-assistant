# Exercise 1.1 - Create Real-time Metrics Rule

Exercise 1.1 - Create Real-time Metrics RuleThis section guides participants through below steps
Create Real-time Metrics Rule

In the AWS Services search box, type Amazon Connect.

Choose Amazon Connect, select the Access URL for the instance that was created.

You are now on the login page for your Amazon Connect instance. Please log in with the administrator username and password you set up for the instance.

You are now on the Amazon Connect admin console.

Navigate to Analytics and optimization and Rules

On the Rules page click the Create a Rule button and then choose Real-time metrics from the drop-down menu.

Under When for the Select an event source dropdown choose There is an update in agent metrics.

For the If condition choose any of these conditions are met from the drop-down menu and then click Add condition button.

In the Select agents dropdown, choose the agent John Doe. Click the Add metric button and select Agent Activity. Keep the remaining rule conditions unchanged as shown.

Set the Agent activity as shown below to check if the agent has been on Missed status for more than 1 minute. Click Next.

Click Add action button and then select Send email notification.

For To choose Select recipients by login, first or last name and then for Select agents choose supervisor1 to send the email to. Enter “ACTION NEEDED: [RuleName] - Agent on missed status for more than one minute” as the Subject. Click Add action to add the second action.

NoteTo specify contact attributes in the subject or body of the email, type [ and a list of available attributes appears. For details refer Contact Lens Rules email 

Select Create task for the second action. Enter “ACTION NEEDED: [RuleName] - Agent on missed status for more than one minute” as the Description. For Select the flow that should route the task choose Task_QueueFlow from the drop down. Leave rest of the field at default.Click Next.

Name the rule as OneMinuteAgentMissedStatus or a name of your choice and then click Save and Publish

Congratulations!You have created a Real-time metrics rule. Proceed to the next exercise to test out this Rule.