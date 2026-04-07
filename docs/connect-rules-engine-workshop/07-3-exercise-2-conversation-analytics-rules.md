# 3. Exercise 2 - Conversation Analytics Rules

3. Exercise 2 - Conversation Analytics RulesContact Lens rules allow you to automatically categorize contacts, receive alerts, or generate tasks based on keywords that are used during a call or chat, sentiment scores, customer attributes, and other criteria.
This topic explains how to create rules using the Amazon Connect admin website. To create and manage rules programmatically, see Rules actions  and the Amazon Connect Rules Function language  in the Amazon Connect API Reference Guide.
TipFor a list of rules feature specifications (for example, how many rules you can create), see Amazon Connect Rules feature specifications. 
Step 1: Define rule conditions

On the navigation menu, choose Analytics and optimization, Rules.
Select Create a rule, Conversational analytics.
Under When, use the dropdown list to choose post-call analysis, real-time analysis, or post-chat analysis.

Choose Add condition.

You can combine criteria from a large set of conditions to build very specific Contact Lens rules. Following are the available conditions:

Words or phrases: Choose from Exact match, Pattern match, or Semantic match  to trigger an alert or task when keywords are uttered.
Natural Language - Semantic Match: Provide a natural language statement (e.g., customer called to cancel their account) to match with conversation transcripts using generative AI, and take an action (for example, triggering a task, performing an evaluation, etc.) For more information, see Use Generative AI to semantically match contacts with natural language statements 
Agent: Build rules that run on a subset of agents. For example, create a rule to ensure newly hired agents comply with company standards.
Queues: Build rules that run on a subset of queues. Often organizations use queues to indicate a line of business, topic, or domain. For example, you could build rules specifically for your sales queues, tracking the impact of a recent marketing campaign or alternatively rules for your customer support queues, tracking overall sentiment.
Contact attributes: Build rules that run on the values of custom contact attributes.  For example, you can build rules specifically for a particular line of business or for specific customers, such as based on their membership level, their current country of residence, or if they have an outstanding order.
You can add up to five contact attributes to a rule.
Sentiment - Time period: Build rules that run on the sentiment analysis results (positive, negative, or neutral) over a trailing window of time.
For example, you can build a rule for when customer sentiment has remained negative for a set period of time. If the participant joined the contact later, the time period set here applies to when participant was present.
When rules are applied to contacts that don't have sentiment data, neutral sentiment is used.
Sentiment - Entire contact: Build rules that run on the value of sentiment scores over an entire contact. For example, you can build a rule when customer sentiment has remained low for the entire contact, you can create a task for a customer experience analyst to review the call transcript and follow-up.
When rules are applied to contacts that don't have sentiment data, neutral sentiment is used.
Interruptions: Build rules that detect when the agent has interrupted the customer for more than X times. This feature applies to calls only.
Non-talk time: Build rules that run when periods of no talk time are detected. For example, when a customer and agent have not spoken for over 30 seconds which may indicate unnecessary customer wait time or highlight a customer services process that would benefit from optimization. This feature applies to calls only.
Response time: Build rules to identify contacts where the participant had a response time longer or shorter than what was expected: Average or Maximum.
For example, you can set a rule on the Agent greeting time, also known as First response time: after the agent joined the chat, how long until they sent the first greeting message. This will help you to identify when an agent took too long to engage with the customer.

The following image shows a sample rule with multiple conditions for a voice contact. Go ahead and configure a similar one in your environment using parameters that meet a use-case you wish to experiment with.

The following image shows a sample rule with multiple conditions for a chat contact. The rule is triggered when the First response time is greater than or equal to 1 minute, and the agent did not mention any of the listed greeting words or phrases in their first response.
First response time = after the agent has joined the chat, how long until they sent the first message to the customer.

Choose Next.

Step 2: Assign contact category
Contact Lens conversational analytics enables you to automatically categorize contacts to identify top drivers, customer experience, and agent behavior for your contacts. Contacts that meet the criteria defined in the previous conditions will be assigned a contact category which can be used to search, and filter contacts from the Contact details page.

Give this category an appropriate name.

Step 3: Define rule actions

Choose Add action. You can choose the following actions:
Create case 
Create task:  this option is not available for real-time chat
Generate an EventBridge event 
Send email notification 
Submit automated evaluation 

For this workshop, it isn't necessary to define an action. Experiment with these actions if you wish, otherwise just click Next without selecting an action.

Choose Next

Review and make any edits, then choose Save and publish.

After you add rules, they are only applied to new contacts that occur after the rule was added. Rules are applied when Contact Lens analyzes conversations.
You cannot apply rules to conversations that occurred in the past.

Place a test call into your system, and answer it with the agent you configured earlier (johndoe)

NoteFor steps to call your contact center refer Place a test call to your Amazon Connect instance

Answer the call, and speak the pattern or phrase that matches the rule you defined in step one.

Disconnect the call, and close the contact

TipContacts are not considered complete until they are closed by the agent. This is to account for work that may still occur after the contact is disconnected (ACW)

On the navigation menu, choose Analytics and optimization, Contact search

Locate the contact record for your test call, and verify that the category you set in Step 2 is displayed.

Congratulations!You have successfully analyzed conversations using conversational analytics in Amazon Connect Contact Lens.