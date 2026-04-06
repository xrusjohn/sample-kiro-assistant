# NoteTaking

NoteTakingIn this module, you'll test the NoteTaking capability for automatic note generation, helping agents document interactions efficiently and reducing after-call work time.
What You'll Learn

Understand how the NoteTaking capability works
Test automatic note generation during contacts
Understand the structured output format

What NoteTaking Does
The NoteTaking capability automatically generates structured contact summaries based on the conversation transcript. It uses a specialized AI Prompt that analyzes the conversation and extracts key information into a consistent HTML format.
SectionDescriptionCustomer IssueMain problem(s) and context from the customerAgent ResolutionOnly confirmed, completed actions taken by the agentNext StepsExplicitly committed future actionsProfile InformationDirectly stated customer details
Smart Section HandlingIf no information is found for a section, it's automatically omitted from the output. This keeps notes clean and relevant.
How NoteTaking Works

The GenerateNotes tool is pre-configured on your Agent Assistance AI Agent. When invoked, it:

Passes the conversation transcript to the NoteTaking AI Prompt
Queries with RESULT_TYPE: NOTES to get structured output
Returns HTML-formatted notes that render in the Agent Workspace

When to Generate Notes
You can generate notes at any point during a contact - not just at the end. Each time you request notes, the AI analyzes the current transcript and produces an updated summary.
Use Cases for Mid-Contact Notes
Use CaseWhen to GenerateBenefitRecall earlier detailsAfter a long conversationQuickly review what the customer said 10 minutes agoPrepare for transferBefore escalating to specialistHand off with complete contextDocument progressAfter resolving one issue, before addressing anotherTrack multi-issue contactsVerify understandingAfter complex explanationsConfirm you captured key points correctlyUpdate CRM mid-callWhile customer is on holdEnter notes while information is fresh
How Notes Evolve During a Contact
Notes are cumulative - each generation reflects everything discussed up to that point:

Example: Generating Notes Multiple Times
After 5 minutes (customer describes problem):

```
1
2
3
4
5
<b>Customer Issue</b>
<ul>
  <li>Customer reporting duplicate charge of $149.99</li>
  <li>Both charges dated January 15th</li>
</ul>
```

After 10 minutes (agent investigates and acts):

```
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
<b>Customer Issue</b>
<ul>
  <li>Customer reporting duplicate charge of $149.99</li>
  <li>Both charges dated January 15th</li>
</ul>

<b>Agent Resolution</b>
<ul>
  <li>Reviewed transaction history</li>
  <li>Confirmed duplicate charge exists</li>
  <li>Filed dispute for refund</li>
</ul>

<b>Next Steps</b>
<ul>
  <li>Refund to be processed within 3-5 business days</li>
</ul>
```

Pro Tip: Use Notes as a Memory AidOn long or complex calls, generate notes periodically to help you recall what was discussed. This is especially useful when a customer mentions multiple issues or provides lots of details early in the conversation.

Testing NoteTaking
To test NoteTaking, you'll simulate a conversation and then request notes. Use the scripts below for your selected industry.
Step 1: Start a Test Contact

Open Agent Workspace and set status to Available
In a separate tab, go to Channels → Test chat
Select Test Settings and choose your Agent Assistance Test Flow
Select Apply to start the contact

Step 2: Run the Conversation Script
Use the script for your industry. You'll play both roles - type the Customer lines in Test Chat, and speak/type the Agent lines as responses.
Scenario: Patient checking appointments and prescriptionsCustomer: Hi, I'm calling to check on my upcoming appointment.Agent: I'd be happy to help. Can I get your patient ID?Customer: It's PAT-001.Agent: I've pulled up your record. You have an appointment scheduled with Dr. Sarah Johnson on February 15th at 9:00 AM in Room 101 at the Main Clinic.Customer: Great. I also wanted to check on my prescription refill for Lisinopril.Agent: I've checked your prescription status. Your Lisinopril 10mg refill has been processed and is ready for pickup at the pharmacy.Customer: Wonderful. That's all I needed.Agent: You're all set. Is there anything else I can help you with?Customer: No, thank you!
Step 3: Request Notes
After completing the conversation, use the AI Agent search box to generate notes. When your cursor is in the input box, you should see a button labeled Generate Notes. Select it.
Alternatively, you can type:
Generate notes for this contact
Step 4: Review the Generated Notes
The output follows this HTML structure:

```
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
<b>Customer Issue</b>
<ul>
  <li>Main problem or request</li>
  <li>Additional context</li>
</ul>

<b>Agent Resolution</b>
<ul>
  <li>Completed action 1</li>
  <li>Completed action 2</li>
</ul>

<b>Next Steps</b>
<ul>
  <li>Committed future action</li>
</ul>

<b>Profile Information</b>
<ul>
  <li>Customer detail</li>
</ul>
```

Understanding Note Quality
The NoteTaking prompt uses strict verification rules to ensure accuracy.
Agent Resolution vs Next Steps
The system distinguishes between completed actions and future commitments:
Agent SaysClassificationReason"I've sent the email"✅ Agent ResolutionPast tense = completed"I've analyzed your account"✅ Agent ResolutionPerfect tense = completed"I'll send the email"✅ Next StepsFuture tense = not done"I'm setting up the account"✅ Next StepsPresent continuous = in progress"I can send the email"❌ ExcludedNo commitment made"Let me know if you need help"❌ ExcludedGeneral availability, not commitment
What Gets Excluded
The NoteTaking prompt is designed to avoid common documentation errors:

Assumed information - Only includes what's explicitly stated
Polite closings as commitments - "Feel free to reach out" is not a next step
In-progress actions as completed - "I'm working on it" goes to Next Steps
Recommendations as actions - "I recommend X" is not "I did X"

Multi-Language Support
NoteTaking automatically generates notes in the customer's locale. The same conversation produces localized output:

```
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
<b>Customer Issue</b>
<ul>
  <li>Customer experiencing frequent WiFi disconnections</li>
  <li>Problem reported with XYZ-2000 router</li>
</ul>

<b>Agent Resolution</b>
<ul>
  <li>Completed diagnostic test showing weak signal</li>
  <li>Confirmed device is under warranty</li>
</ul>

<b>Next Steps</b>
<ul>
  <li>Process warranty replacement for router</li>
</ul>
```

Example Outputs by Industry
Based on the conversation scripts above, here are the expected note outputs for each industry:

```
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
<b>Customer Issue</b>
<ul>
  <li>Customer requested cancellation of reservation for next week</li>
  <li>Confirmation number RES-12345</li>
</ul>

<b>Agent Resolution</b>
<ul>
  <li>Verified reservation details (March 15-18, The Skyward Manhattan, Suite room)</li>
  <li>Processed cancellation</li>
  <li>Confirmed no charges due to 24-hour cancellation window</li>
</ul>

<b>Next Steps</b>
<ul>
  <li>Send confirmation email to address on file</li>
</ul>

<b>Profile Information</b>
<ul>
  <li>Guest Name: John Smith</li>
  <li>Confirmation Number: RES-12345</li>
  <li>Property: The Skyward Manhattan</li>
</ul>
```

Edge Cases
The NoteTaking system handles special situations:
ScenarioOutputMinimal conversationOnly includes sections with evidenceNo actionable contentReturns "Unable to create notes"Agent corrects themselvesUses final state onlyTransfer to another departmentDocuments transfer as resolution
Example - Agent Correction:

Agent: I just put the return through.
Agent: Actually, it did not go through. I need to send you to my manager.

Output: Documents the escalation to manager, not the failed return attempt.

Troubleshooting
IssueSolutionGenerate Notes button not appearingEnsure you are on a contact that has the Connect Assistant block configuredNotes not generatingEnsure there's enough conversation content to summarizeMissing sectionsSections are omitted when no evidence exists - this is expectedWrong languageCheck the contact's locale settingActions in wrong sectionReview if agent used past vs future tense

Next Steps
Now that you've tested NoteTaking, proceed to:

Additional Capabilities - Explore Task Summary, Email AI Agents, and other capabilities