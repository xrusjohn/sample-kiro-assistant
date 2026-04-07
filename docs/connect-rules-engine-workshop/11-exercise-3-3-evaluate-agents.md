# Exercise 3.3 - Evaluate Agents

Exercise 3.3 - Evaluate AgentsThis section guides participants through below steps

Place a test call and answer it on the agent soft phone (John Doe).
Log in as a Quality Analyst and perform an agent evaluation on the recently concluded call.
Log in as a Supervisor and verify that a Task has been routed.

Place a test call to your Amazon Connect instance

In the AWS Services search box, type Amazon Connect.

Choose Amazon Connect, select the Access URL for the instance that was created.

You are now on the login page for your Amazon Connect instance. Please log in with the Agent username and password you set up for the instance.

ImportantGo to CloudFormation from the AWS Services Menu and select cft-create-amazon-connect-instance stack and refer Outputs tab to get the login credentials.

You are now on the Amazon Connect admin console. Click Agent Workspace in the top control bar of Amazon Connect admin console. Accept any permissions request you receive in the browser.

Change the agent status to Available

Place a call to the contact center phone number assigned to the Sample recording behavior flow and select the below options:

Press 1 to turn on agent and customer recording.
Press 1 to be put in queue for an agent.
Press 1 to move to the front of the queue.
Press 1 to go into queue.

NoteGo to CloudFormation from the AWS Services Menu and select cft-create-amazon-connect-instance stack and refer Outputs tab to get the MainPhoneNumber. Ensure that this phone number is assigned to the Sample recording behavior flow.

The call will be routed to the Agent Workspace. Accept the incoming call on agent desktop and converse normally.

Disconnect the call after a few minutes.

Perform Agent Evaluation
ImportantAttention: Please perform the following steps either:
After logging out of the Agent user in your current browser, OR
In a different browser or Incognito/Private mode

In the AWS Services search box, type Amazon Connect.

Choose Amazon Connect, select the Access URL for the instance that was created.

You are now on the login page for your Amazon Connect instance. Please log in with the Analyst username and password you set up for the instance.

Important
Go to the AWS Services Menu and navigate to CloudFormation.
Select the cft-create-amazon-connect-instance stack.
Refer to the Outputs tab to get the login credentials for the analyst1 user.
If the analyst1 user is not present in the Outputs tab, use the supervisor1 user credentials instead.
Alternatively, you can manually create an analyst1 user. please see Add users to Amazon Connect 

Navigate to 'Analytics and optimization' and 'Contact search' page to view the latest call you placed. Adjust filters if needed.

Select the 'contact ID' to navigate to 'Contact Details Page'

In the Contact details page select Evaluations to evaluate agent, John Doe, for specific contact.

From the resulting pane, choose AgentBehaviorForm from the dropdown and select Start evaluation

For Agent Behavior question 1, select No as the answer. For Agent Behavior question 2, choose the value 0. Then click Submit.

Confirm form status is showing Completed and the overall form score is 50% or less

Login as Supervisor to accept Amazon Connect Task
ImportantAttention: Please perform the following steps either:
After logging out of the Agent user in your current browser, OR
In a different browser or Incognito/Private mode

In the AWS Services search box, type Amazon Connect.

Choose Amazon Connect, select the Access URL for the instance that was created.

You are now on the login page for your Amazon Connect instance. Please log in with the Supervisor1 username and password you set up for the instance.

ImportantGo to CloudFormation from the AWS Services Menu and select cft-create-amazon-connect-instance stack and refer Outputs tab to get the login credentials.

Launch the agent desktop by selecting Agent Workspace to accept the Task contact. This Task was created and routed by Contact Lens Rules due to a low agent score. Accept any browser permissions requests that appear.

Change Supervisor status to Available in agent workspace.

Ensure you are receiving a Task Contact, then accept the new task request.

The References section provides a link to the Contact Details Page of the contact analyzed by the QA analyst that received a low score. Click on the reference link to navigate to the Contact Details page.

In the Contact Details page select Evaluations to review 'In progress' and 'Completed' evaluations for the contact.

Select AgentBehaviorForm to review the evaluations.

Congratulations!You have successfully completed agent evaluation and supervisor review.