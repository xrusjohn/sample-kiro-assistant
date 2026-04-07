# Exercise 3.2 - Create Contact Lens Rules

Exercise 3.2 - Create Contact Lens RulesThis section guides participants through below steps

Create Amazon Connect Contact Lens Rules to notify Supervisors when evaluation score is less than or equal to 50%.

Create Contact Lens Rule

In the AWS Services search box, type Amazon Connect.

Choose Amazon Connect, select the Access URL for the instance that was created.

You are now on the login page for your Amazon Connect instance. Please log in with the administrator username and password you set up for the instance.

You are now on the Amazon Connect admin console.

Navigate to Analytics and optimization and Rules

On the Rules page, select Create a rule and Evaluation forms

In the definition page, choose A Contact Lens evaluation result is available

Select Add condition and choose Evaluation - Form score

ImportantAmazon Connect Contact Lens rules can be created for specific section scores, individual question answers, or when an overall evaluation score is available for a form. For detailed guidance on creating and managing Contact Lens rules, please refer to the Amazon Connect Admin Guide .

Choose AgentBehaviorForm from dropdown, and operator <= and value 50% and choose 'Next'

In the next page, choose Add action and Create task

In the Description provide a meaningful description for Supervisors to take action. Such as Agent scored 50% or below in evaluation. Supervisor: Analyze results to identify training opportunities. For Select the flow that should route the task choose Task_QueueFlow from the drop down. Leave rest of the field at default.

In the next page, provide your Contact Lens rule a name, such as, low-score-agent-review-alert and select Save and publish

Congratulations!You've successfully created an Amazon Connect Contact Lens rule that notifies supervisors via the native Amazon Connect Tasks channel when an agent receives a low evaluation score.