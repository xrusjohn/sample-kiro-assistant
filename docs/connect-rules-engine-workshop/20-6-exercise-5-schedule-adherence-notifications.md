# 6. Exercise 5 - Schedule Adherence Notifications

6. Exercise 5 - Schedule Adherence NotificationsAmazon Connect now supports agent schedule adherence notifications, making it easier for you to proactively identify when agents aren't adhering to their scheduled activities. You can define rules to automatically send email or text notifications (via EventBridge) to supervisors when agents exceed adherence thresholds. For example, if agent adherence drops below 85% in a trailing 15-minute window, supervisors can receive an email alert. These automated notifications eliminate the need for continuous dashboard monitoring and enable proactive intervention before service levels decline, improving both supervisor productivity and customer satisfaction.
TipThis feature is available in all AWS Regions  where Amazon Connect agent scheduling is available. To learn more about Amazon Connect agent scheduling, click here .
Step 1: Define rule conditions

On the navigation menu, choose Analytics and optimization, Rules.
Select Create a rule, Real-time metrics.
Under When, use the dropdown list to choose There is an update in agent metrics
Do not change the channel selection and use the default selection.

To set up adherence notifications, click Add condition and choose trailing windows of time, then specify the required minutes. Next, select a filter type from the dropdown menu based on your needs. In this example, staffing groups is selected as the filter type, followed by choosing the specific staffing groups you want to receive adherence notifications from the next dropdown menu.

Next click on Add metric and select either Adherence or Non-adherent time. In this example, we will select Non-adherent time

Next, configure the condition rule for monitoring. For this example, the system will monitor instances where non-adherent time exceeds 10 minutes.

Choose Next.

Step 2: Define rule actions

Choose Add action. You can choose the following actions:
Create task:  this option is not available for real-time chat
Send email notification 
Generate an EventBridge event 

For this example, we have selected Send email notification and then set To field to Supervisors of agents that triggered the notification

Choose Next.

Step 3: Assign contact category
Rules enables you to automatically categorize contacts to identify top drivers, customer experience, and agent behavior for your contacts. Contacts that meet the criteria defined in the previous conditions will be assigned a contact category which can be used to search, and filter contacts from the Contact details page.

Give this category an appropriate name.

Review and make any edits, then choose Save and publish.

NoteTo test the system, place an agent in a non-adherent status for over 10 minutes, then verify that their assigned supervisor receives an email notification alerting them to this adherence violation.
Congratulations!You have successfully created a rule to configure notifications to be sent when agents are out of adherence.