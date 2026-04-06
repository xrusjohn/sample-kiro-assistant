# Testing Your AI Agent

Testing Your AI AgentIn this module, you'll test your AI Agent with real conversations. You'll place test calls over Voice or Chat, observe AI recommendations in the Agent Workspace, and learn how to use manual search during contacts.
What You'll Do

Place test conversations over Voice or Chat using the Agent Assistance Test Flow
Observe AI Agent recommendations in the Agent Workspace
Use manual search on-contact (and understand why off-contact isn't supported)

Setting Up Your Test Environment
You'll need two browser windows to test:

Window 1: Test Chat (simulating the customer)
Window 2: Agent Workspace (where you'll see AI Agent recommendations)

Step 1: Open Agent Workspace

Navigate to Agent Workspace by selecting Connect Workspace at the top of the Connect instance and selecting Agent Workspace or by navigating to https://<instance-alias>.my.connect.aws/agent-app-v2/
Set your status to Available

Step 2: Open Test Chat

In a separate browser tab, open the Amazon Connect instance and navigate to Channels -> Test chat in the left navigation
Select Test Settings and choose the Agent Assistance Test Flow you created in the previous module
Select Apply to start the contact

Voice TestingYou can also test via voice by calling your claimed phone number (if you've associated it with the Agent Assistance Test Flow). The AI Agent works the same way for both voice and chat contacts.
Test Data Reference
Before testing, familiarize yourself with the sample data available in each industry. This data is pre-loaded into the APIs and can be used to test tool invocations.
Patients & AppointmentsPatient IDProviderAppointment TypeDateLocationPAT-001Dr. Sarah JohnsonCheckupFeb 15, 9:00 AMMain Clinic Room 101PAT-001Dr. Michael ChenSpecialistFeb 20, 2:30 PMCardiology Center Suite 300PAT-002Dr. Emily RodriguezFollow-upFeb 18, 11:00 AMMain Clinic Room 205Prescription RefillsRefill IDPatientMedicationStatusPharmacyRX-001PAT-001Lisinopril 10mgReadyHealthMart PharmacyRX-002PAT-001Metformin 500mgProcessingHealthMart PharmacyRX-003PAT-002Atorvastatin 20mgRequestedCareFirst PharmacyProvidersProvider IDNameSpecialtyAccepting New PatientsPRV-001Dr. Sarah JohnsonPrimary CareYesPRV-002Dr. Emily RodriguezPrimary CareYesPRV-003Dr. Michael ChenCardiologyNo

Test Conversation Scripts
Use these industry-specific scripts to test your AI Agent. Each scenario is structured to demonstrate three key capabilities:
CapabilityWhat It TestsHow to TriggerProactive AssistanceAI automatically retrieves KB content based on conversationCustomer asks policy/procedure questionsTool InvocationAI calls MCP tools to look up or modify dataCustomer provides identifiers (IDs, confirmation numbers)Manual SearchHuman agent queries AI directly during contactType question in AI Agent search box
Scenario: Guest inquiring about hotels and policiesTest Data:
Hotel: The Skyward Manhattan (hotel-newyork-001)
City: New York
Amenities: wifi, fitness-center, restaurant, bar, business-center, concierge
Note on ReservationsReservations are created dynamically. For testing tool invocations, use the searchHotels tool with a city name, or create a reservation first and use the returned confirmation number.Part 1: Proactive Assistance (KB Retrieval)Start the conversation with a policy question to trigger KB retrieval:Customer: Hi, I'm reaching out about your cancellation policy. What happens if I need to cancel my reservation?✅ Expected: AI proactively retrieves cancellation policy from knowledge base and displays it to you.Part 2: Tool Invocation (MCP Tool Call)Now trigger a hotel search:Customer: I'm looking for a hotel in New York. What options do you have?✅ Expected: AI calls the searchHotels MCP tool and displays hotels including The Skyward Manhattan (4.7 stars) and Luminous Broadway Suites (4.8 stars).Customer: What amenities does The Skyward Manhattan offer?✅ Expected: AI displays hotel amenities (wifi, fitness-center, restaurant, bar, business-center, concierge).Part 3: Manual SearchWhile still on the contact, use the search box in the AI Agent panel:Manual Search Query: What is the check-in time policy?✅ Expected: AI retrieves check-in/check-out policies from the knowledge base.Part 4: Action Tool (Optional)If you want to test a booking action:Customer: I'd like to book a room at The Skyward Manhattan for next weekend.✅ Expected: AI may suggest using the createBooking tool or provide booking procedures.
Observing AI Recommendations
As you conduct the test conversation, watch the AI Agent panel in the Agent Workspace.
What to Look For
CapabilityWhat You'll See in Agent WorkspaceProactive AssistanceAI automatically displays KB content when customer asks policy/procedure questionsTool InvocationAI shows "Calling tool..." indicator, then displays structured data from MCP toolsManual Search ResultsYour query results appear in the AI panel with relevant KB content or tool data
Real-Time Recommendations
The AI Agent:

Listens to the conversation via the transcript
Analyzes customer intent and questions
Decides whether to retrieve KB content or call MCP tools
Presents recommendations to you (the human agent)

Understanding the AI Panel
ElementDescriptionGenerated AnswerAI-synthesized response combining KB content and tool dataSource ReferencesLinks to knowledge base articles used (from Retrieve tool)Tool ResultsStructured data from MCP tools (reservations, accounts, etc.)
Using Manual Search On-Contact
You can also query the AI Agent directly during a contact.
How to Use Manual Search

While handling a contact, locate the search box in the AI Agent panel
Type your question (e.g., "What is the refund policy?")
Press Enter or click the search icon
Review the AI-generated response

On-Contact vs Off-Contact
Manual Search Requires Active ContactManual search is only available during an active contact. Off-contact search is not supported because:
The AI Agent needs conversation context to provide relevant recommendations
MCP tools may require contact-specific data to function

Manual Search Examples
Try these searches during your test contact. Each example demonstrates different search types:
IndustryKB Policy SearchTool-Invoking SearchHotel"What is the cancellation policy?""Search for hotels in New York"Billing"How long do refunds take?""Show transactions for CUST-12345"Healthcare"What is the prescription refill process?""Check appointments for PAT-001"Retail"What is the return policy?""Look up order ORD-002"Insurance"How long does claim processing take?""Check claims for CUST-001"Telecom"What troubleshooting steps for slow internet?""Check outages in Seattle"Utilities"What payment options are available?""Look up bill for UTL-001"Facilities"What's the work order process?""Check available technicians"Public Sector"What documents needed for building permit?""Check permit PRM-2024-001"Automotive"What's covered under basic warranty?""Look up vehicle 1HGBH41JXMN109186"Manufacturing"How to troubleshoot temperature issues?""Check warranty for SN-GRL-001"
Validation Checklist
After testing, verify these items for each capability:
Proactive Assistance (KB Retrieval)

 AI Agent panel appears in Agent Workspace during contact
 Policy/procedure questions trigger automatic KB retrieval
 Source references are included with KB-based recommendations

Tool Invocation (MCP Tools)

 Providing customer IDs triggers tool lookups
 Tool results display structured data (accounts, orders, etc.)
 Tool indicators show which tools were called

Manual Search

 Search box is accessible during active contact
 Policy searches return KB content
 Data searches invoke appropriate MCP tools
 Results are relevant to the query

Troubleshooting
AI Agent Panel Not Visible
IssueSolutionPanel doesn't appearCheck Security Profile has AI Agent permissionsNo recommendationsVerify contact flow has AI Agent block enabledTools not workingConfirm MCP tool namespaces are enabled in Security Profile
Recommendations Not Relevant
IssueSolutionGeneric responsesEnsure knowledge base content is synced. This is also where content segmentation can helpMissing tool dataVerify MCP server is running and accessible
Next Steps
Now that you've tested your AI Agent with real conversations, proceed to:

NoteTaking - Configure automatic note generation