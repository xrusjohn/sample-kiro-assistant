# Creating the Contact Flow

Creating the Contact FlowTo test your AI Agent with a human agent, you need a contact flow that routes contacts to a queue where your agent can receive them.
Step 1: Create a New Contact Flow

In the Amazon Connect instance, go to Routing > Flows
Click Create flow
Enter a name: Agent Assistance Test Flow.

Step 2: Add Flow Blocks
Add the following blocks in order:
1. Set logging behavior

From the Analyze category, drag Set logging behavior onto the canvas

This enables CloudWatch logging for troubleshooting

Connect it to the Entry point

2. Set Amazon Connect Assistant

From the Set category, drag Connect Assistant onto the canvas

This starts the Connect Assistant session, which associates the current contact to the AI Agent

Connect it to the Set logging behavior block (Success branch)
Configure:

Under Select a domain, select your assistant domain
Under AI Agent, select your industry's Agent Assistance agent (e.g., "Hotel-Agent-Assist"). Select the Latest version
Select Confirm to save the block

3. Set working queue

From the Set category, drag Set working queue onto the canvas
Connect it to the Connect Assistant block (Success branch)
Configure:

Select By queue
Choose BasicQueue (or your preferred queue)

4. Transfer to queue

From the Terminate category, drag Transfer to queue onto the canvas
Connect it to the Set working queue block (Success branch)
Use default settings

5. Handle errors

Connect any Error branches to a Disconnect block
This ensures contacts are properly terminated if something fails

Ensure you properly handle your errors in production

Step 3: Review Flow Structure
Your flow should look like this:

Step 4: Save and Publish

Click Save
Click Publish
Confirm the publish action

Flow Must Be PublishedThe contact flow must be published before it can be used for testing. Draft flows cannot receive contacts.
Next Steps
Now that you've created the contact flow, proceed to verify your complete configuration:

Verification and Architecture - Verify your setup and understand how components connect