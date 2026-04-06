# Testing Self-Service

Testing Self-ServiceIn this final module, you'll comprehensively test your Self-Service AI Agent implementation using industry-specific scenarios and sample conversations.
What You'll Learn

Test self-service flows end-to-end
Use industry-specific test scripts
Validate tool execution and responses
Verify escalation and context transfer

Testing Methods
Testing Streaming Chat
If you completed the AI Message Streaming section, you can open the test widget to begin testing.
Test Chat (Recommended for Development)

From Amazon Connect home, click Channels -> Test chat
Select your Self Service flow
Start a conversation

Advantages:

Quick iteration
No phone required
Easy to copy/paste test scripts

Voice Testing

Call your assigned phone number
Interact with the AI Agent via voice

Advantages:

Tests Nova Sonic voice quality
Validates barge-in behavior

Bot Not Responding?If your chat or voice bot isn't responding, you may need to reset the Lex bot management settings in the Amazon Connect console:
Open the Amazon Connect console (not the Connect admin interface)
Select your Connect instance
Navigate to Flows in the left menu
Locate the Enable Lex Bot Management in Amazon Connect checkbox and:

Turn it OFF (if currently enabled)
Click Save
Turn it back ON
Click Save

Ensure both options are enabled:

✅ Enable Lex Bot Management in Amazon Connect
✅ Enable Bot Analytics and Transcripts in Amazon Connect

Click Save
This toggle refresh can resolve issues where the Amazon Connect Assistant was enabled after instance creation and using a Lex bot.
Industry-Specific Test Scripts
For comprehensive testing with detailed sample conversations, API commands, and edge cases, see the dedicated industry test script modules:
IndustryDescriptionLinkHotelHotel search, reservations, modifications, cancellationsHotel Test ScriptsBillingTransactions, invoices, refunds, disputesBilling Test ScriptsHealthcareAppointments, prescriptions, providers, billing inquiriesHealthcare Test ScriptsInsurancePolicies, claims, quotes, billing, paymentsInsurance Test ScriptsAutomotiveVehicles, warranties, service appointments, partsAutomotive Test ScriptsFacilitiesWork orders, problem classification, technician dispatchFacilities Test ScriptsManufacturingProducts, warranties, service requests, parts, troubleshootingManufacturing Test ScriptsRetailOrders, returns, products, loyalty pointsRetail Test ScriptsTelecomAccounts, data usage, outages, troubleshooting ticketsTelecom Test ScriptsUtilitiesAccounts, bills, usage, outages, service requestsUtilities Test ScriptsPublic SectorPermits, service requests, appointments, casesPublic Sector Test Scripts
Quick Test Examples
Below are quick examples for each industry. For complete test scripts with API commands and edge cases, visit the dedicated modules above.
Hotel - Check Availability

```
You: Hi, I'm looking for a hotel room in New York
AI: Hello! I'd be happy to help you find a hotel in New York.
    [Tool: searchHotels]
AI: I found several options including The Skyward Manhattan (4.7 stars) 
    and Luminous Broadway Suites (4.8 stars). Which interests you?
```

Billing - View Transactions

```
You: I want to check my recent transactions
AI: I'd be happy to help you review your account.
    [Tool: getTransactions]
AI: I found your recent transactions including a $149.99 charge on Jan 15.
    I notice there may be a duplicate charge. Would you like to dispute it?
```

Healthcare - Schedule Appointment

```
You: I need to schedule a doctor's appointment
AI: I'd be happy to help. What type of appointment do you need?
You: Annual checkup
AI: [Tool: getProviders]
AI: Dr. Emily Rodriguez has availability on February 18th at 9:00 AM.
    Would you like me to book that for you?
```

Insurance - File a Claim

```
You: I was in a car accident and need to file a claim
AI: I'm sorry to hear about your accident. Let me help you file a claim.
    [Tool: createClaim]
AI: Your claim CLM-008 has been submitted. An adjuster will contact you 
    within 24 hours.
```

Automotive - Warranty Check

```
You: Is my car still under warranty?
AI: I'd be happy to check. What's your vehicle's VIN?
You: 1HGBH41JXMN109186
AI: [Tool: getWarrantiesByVin]
AI: Your 2024 Honda Accord has active basic and powertrain warranties.
    You're fully covered with 12,500 miles on the odometer!
```

Facilities - Report an Issue

```
You: The AC in my office isn't cooling properly
AI: I'm sorry to hear about the AC issue. Let me help you report this.
    [Tool: searchClassifications]
AI: I've classified this as an urgent HVAC issue. What's your location?
You: Building A, 3rd floor, suite 301
AI: [Tool: createWorkOrder]
AI: Work order WO-2024-002001 created. Mike Johnson (HVAC specialist) 
    will contact you shortly.
```

Manufacturing - Product Support

```
You: My grill igniter isn't working
AI: I'm sorry to hear that. Let me check your warranty status.
    [Tool: getWarrantiesBySerial]
AI: Your Traeger Pro 780 has an active warranty. I can file a claim 
    for the igniter replacement at no cost. Would you like me to proceed?
```

Retail - Track Order

```
You: Where is my order?
AI: Let me look up your recent orders.
    [Tool: getOrdersByCustomer]
AI: Your order ORD-002 with the Smart Watch is shipped and tracking 
    shows delivery by February 16th. Would you like more details?
```

Telecom - Check Data Usage

```
You: How much data have I used this month?
AI: [Tool: getUsageByAccount]
AI: You've used 45GB on your Unlimited Plus plan. Since you have 
    unlimited data, there are no overage charges. Your billing cycle 
    ends February 28th.
```

Utilities - Check Bill

```
You: How much is my electric bill?
AI: [Tool: getBillsByAccount]
AI: Your current bill is $145.67 for 850 kWh used in January. 
    Payment is due February 15th. You're enrolled in AutoPay, so 
    it will be processed automatically.
```

Public Sector - Check Permit Status

```
You: What's the status of my building permit?
AI: [Tool: getPermitsByCitizen]
AI: Your building permit PRM-2024-001 for the kitchen remodel has 
    been approved! You can begin your renovation project.
```

Escalation Testing
Testing human escalation validates that your AI Agent correctly recognizes when to hand off to a human and preserves conversation context.
What You're Testing

AI Agent recognizes when to escalate
Contact Attributes are captured correctly
Contact routes to the queue
Agent sees conversation context in their workspace (Step-by-step Guide)

Test Scenario: Complex Booking
This request should trigger escalation because it involves multiple special requirements that exceed the AI's capabilities.
Say something like:

"I need to book 15 rooms for a wedding party next spring. We need wheelchair accessible rooms, connecting rooms for the groomsmen, and some guests have food allergies that need to be coordinated with catering."

The AI should recognize this complexity and offer to connect you with a human agent.
Step 1: Make the Test Call

Call your Amazon Connect phone number (or use Test Chat)

When the AI greets you, deliver the complex booking request

Listen for the AI's escalation response-it should acknowledge the complexity and offer to transfer you

Step 2: Accept as an Agent

Open a second browser window

Log in to the Amazon Connect agent workspace

Set your status to Available

Accept the incoming contact

Step 3: Verify the Step-by-step Guide
When you accept the contact, the Step-by-step Guide should display with:
FieldExpected ValueEscalation Reasoncomplex_bookingCustomer IntentBook 15 rooms for wedding party with special requirementsConversation SummaryDetails about the wedding, accessibility needs, and food allergiesSentimentpositive (or neutral)
TroubleshootingIf you see dashes (-) instead of values, the Contact Attributes aren't being passed correctly. Verify:
The Escalate tool has the correct input schema configured
The Set Contact Attributes block maps Lex session attributes correctly
The Set Event Flow block points to the Agent Screen Pop flow

Additional Test Scenarios
Try these to test different escalation triggers:
Frustrated customer:

"I've been trying to change my reservation for 20 minutes and nothing is working. This is ridiculous!"

Policy exception:

"I need to cancel my reservation for tomorrow. I know it's past the deadline, but I have a family emergency. Can you waive the fee?"

Technical issue:

"The system keeps giving me errors when I try to book. Can you help?"

Understanding the Escalation Context
When the AI Agent invokes the Escalate tool, it captures:
FieldDescriptionescalationReasonCategory: complex_booking, technical_issue, customer_frustration, policy_exception, out_of_scope, otherescalationSummaryDetailed summary for the human agentcustomerIntentBrief phrase describing what the customer wantssentimentCustomer's emotional state: positive, neutral, frustrated
This context helps agents immediately understand the situation without asking customers to repeat themselves.
What's Next
Congratulations! You've completed the Self-Service Track. Your AI Agent can now:

✅ Handle customer requests via voice and chat
✅ Execute tools to take actions
✅ Provide natural voice interactions with Nova Sonic (optional)
✅ Escalate complex issues to human agents

Next Steps

Explore Agentic Experiences - Add Nova Sonic Voice or AI Message Streaming
Complete the Agent Assistance Track - Build AI-powered agent productivity tools
Return to Optional Foundation Modules - Add Content Segmentation, Guardrails, or Logging
Explore Additional AI Agent capabilities in Amazon Connect
Proceed to Cleanup - Remove workshop resources when finished