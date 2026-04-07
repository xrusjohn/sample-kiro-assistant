# Exercise 4.2 - Create Contact Lens Rules

Exercise 4.2 - Create Contact Lens RulesThis section guides participants through below steps
Create Contact Lens Rule

In the AWS Services search box, type Amazon Connect.

Choose Amazon Connect, select the Access URL for the instance that was created.

You are now on the login page for your Amazon Connect instance. Please log in with the administrator username and password you set up for the instance.

You are now on the Amazon Connect admin console.

Navigate to 'Analytics and optimization' and 'Rules'

In 'Rules' page, select 'Create a rule' and 'Cases'

In the definition page, choose 'A case is updated'

Select 'Add condition' and choose 'Summary' field in the first drop down. Check if the Case
Summary contains the word 'Compliance'. Click Next.

ImportantRules can be defined for both Case creation and Case update event and can be based on any Case field. For detailed guidance on creating and managing Contact Lens rules, please refer to the Amazon Connect Admin Guide .

In the next page, choose 'Add action' and 'Create task'

NoteTake note of the additional actions such as End tasks which ends all related tasks for the case. There are also actions available to update the case details and send email notifications.

In the 'Description' provide a meaningful description for Supervisors to take action. Such as A Compliance Case got updated. Supervisor: Analyze Case to see if it needs any further action. For 'Select the flow that should route the task' choose Task_QueueFlow from the drop down. Leave rest of the field at default.

Click on Next.

In the next page, provide your Contact Lens rule a name, such as, compliance-case-update-alert and select 'Save and publish'

Congratulations!You've successfully created an Amazon Connect Contact Lens Rule that notifies supervisors via the native Amazon Connect Tasks channel when a Case with the Summary field containing word Compliance gets updated.  Proceed to the next exercise to test out this Rule.