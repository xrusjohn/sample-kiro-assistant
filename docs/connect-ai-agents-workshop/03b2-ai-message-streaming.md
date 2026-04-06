# AI Message Streaming

AI Message StreamingIn this optional module, you'll learn about AI Message Streaming and implement a simple web chat widget to experience progressive text display during AI agent conversations.
What You'll Learn

Understand what AI Message Streaming is and its benefits
Check enablement status for your Amazon Connect instance
Create and configure a Communications Widget
Set up a localhost testing environment
Test the streaming experience with your AI Agent

What is AI Message Streaming?
AI Message Streaming is an Amazon Connect feature that enables progressive display of AI agent responses during chat interactions. Instead of waiting for the AI to generate a complete response before showing anything to the customer, streaming displays text as it's being generated-creating a more natural, conversational experience.
How It Works
With standard chat responses, customers wait while the AI generates its entire response, then the complete message appears all at once. With AI Message Streaming, customers see a growing text bubble where words appear progressively as the AI generates them, similar to watching someone type in real-time.
Official Documentation: For the complete technical reference, see Enable message streaming for AI-powered chat  in the Amazon Connect Administrator Guide.
Benefits of Progressive Text Display
AI Message Streaming provides several key benefits for customer experience:

Reduced perceived wait time - Customers see immediate activity rather than staring at a loading spinner
More natural conversation flow - Progressive text mimics human typing, creating a more engaging interaction
Better engagement - Customers can start reading the response while it's still being generated
Fulfillment messages - AI agents can provide interim messages like "One moment while I review your account" during processing

Standard Chat vs Streaming Chat
The following table compares the customer experience between standard chat and streaming chat:
AspectStandard ChatStreaming ChatResponse DisplayComplete message appears all at onceText appears progressively (growing bubble)Customer ExperienceWait for full response with loading indicatorSee words appear in real-timePerceived Wait TimeLonger (waiting for complete response)Shorter (immediate visual feedback)Conversation FeelTransactionalNatural, like chatting with a personFulfillment MessagesNot availableAI can send interim status updatesLex Timeout HandlingSubject to Lex timeout limitsEliminates Lex timeout limitations
Integration Options
Amazon Connect supports AI Message Streaming with two integration approaches:
Option 1: Amazon Connect AI Agents (Recommended)
When using Amazon Connect's native AI agents (which you've configured in this workshop), you get the full streaming experience:

✅ Progressive text display (growing text bubble)
✅ Fulfillment messages during processing
✅ Eliminates Amazon Lex timeout limitations
✅ Seamless integration with Amazon Connect

Option 2: Third-Party Bots via Amazon Lex or Lambda
If you're using third-party bots integrated through Amazon Lex or Lambda:

✅ Eliminates Amazon Lex timeout limitations
⚠️ Standard bot response behavior (no progressive text)

Workshop Focus: This workshop uses Amazon Connect AI Agents, so you'll experience the full streaming capability with progressive text display.
Enablement Status
AI Message Streaming availability depends on when your Amazon Connect instance was created and how it's configured.
Workshop Accounts: If you're using an AWS-provided workshop account, AI Message Streaming is already enabled. You can skip directly to the Create Communications Widget section.
Automatic Enablement for New Instances
Amazon Connect instances created after December 2025 have AI Message Streaming enabled by default. The MESSAGE_STREAMING instance attribute is automatically set to true for these instances, so no additional configuration is required.
BYO Account Users: If you're using your own AWS account with an Amazon Connect instance created before December 2025, you may need to manually enable AI Message Streaming.Follow the instructions in the Enable message streaming for AI-powered chat  documentation to check your instance's MESSAGE_STREAMING attribute and enable it if needed.
Amazon Lex Bot Permissions
AI Message Streaming requires the lex:RecognizeMessageAsync permission to function correctly. This permission allows Amazon Connect to invoke the asynchronous message recognition API that enables streaming responses.
For new Lex bot associations: When you associate a new Amazon Lex bot with your Amazon Connect instance, the required lex:RecognizeMessageAsync permission is automatically included in the bot's resource-based policy. No additional configuration is needed.
BYO Account Users with Existing Lex Bots: If you have an Amazon Lex bot that was associated with your Amazon Connect instance before AI Message Streaming was enabled, you may need to update the bot's resource-based policy to include the lex:RecognizeMessageAsync permission.To update your existing Lex bot policy:
Navigate to the Amazon Lex console
Select your bot and go to Resource-based policy
Add the lex:RecognizeMessageAsync action to the policy statement that grants Amazon Connect access
Save the updated policy
For detailed instructions, see the Lex bot permissions  section in the AWS documentation.
Create Communications Widget
The Amazon Connect Communications Widget is an embeddable chat interface that you can add to any website. In this section, you'll create and configure a widget to test AI Message Streaming.
Step 1: Navigate to Communications Widget

In the Amazon Connect console, navigate to your instance

Click Channels in the left navigation menu

Click Communications widget

You'll see the Communications Widget management page

What is the Communications Widget?The Communications Widget is Amazon Connect's out-of-the-box chat solution. It provides a fully functional chat interface that you can embed in websites using a simple JavaScript snippet. The widget handles all the complexity of establishing connections, managing sessions, and displaying messages.
Step 2: Create a New Widget

Click Add widget to create a new Communications Widget

Enter the following details:

Name: AI-Streaming-Demo-Widget
Description: Widget for testing AI Message Streaming

Under Communication options ensure Add chat is selected

Select Self Service Test Flow as your Chat contact flow

Click Save and continue to proceed to the configuration page

Contact Flow SelectionMake sure you select a contact flow that:
Has the Basic Settings configured (creates AI session, logging, etc)
Routes to your Lex bot with AI Agent integration
Has proper error handling for disconnects
If you haven't created a contact flow yet, complete the Creating the Flow section first.
Step 3: Customize Widget Appearance
Customize the look and feel of your chat widget to match your brand and select Save and continue.
Step 4: Configure Allowed Domains
The Communications Widget only loads on websites that are explicitly allowed. This security feature prevents unauthorized use of your widget.

Scroll down to Allowed domains

Click Add domain and add the following domain for localhost testing:

http://localhost

Select No under security

If you plan to deploy to a production website later, add those domains as well and ensure you configure security (e.g., https://www.example.com)

Step 5: Save and Get Widget Code

Click Save and continue to save your widget configuration

After creation, you'll see the Widget details page with your embed code

Important: Copy and save the following values from the embed code snippet:

Client URI - The URL to the widget JavaScript file
Widget ID - A unique identifier for your widget
Snippet ID - A Base64-encoded configuration string

Step 6: Set Up Local Testing Environment
To test the widget locally, you'll create a simple HTML file that loads the Communications Widget.

Create a new folder on your computer for testing (e.g., ai-streaming-test)

Download the background image for the demo page:

Download Background Image
Save it as background.jpg in your test folder

Create a new file called index.html in your test folder with the following content:

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
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <style>
        body { 
            background-image: url("background.jpg"); 
            background-repeat: no-repeat; 
            background-size: cover; 
        }
    </style>
    <title>AI Message Streaming Demo</title>
</head>
<body>    
    <div id="root"></div>            
    <script type="text/javascript">
      (function(w, d, x, id){
        s=d.createElement('script');
        s.src='REPLACE_WITH_CLIENT_URI';
        s.async=1;
        s.id=id;
        d.getElementsByTagName('head')[0].appendChild(s);
        w[x] = w[x] || function() { (w[x].ac = w[x].ac || []).push(arguments) };
      })(window, document, 'amazon_connect', 'REPLACE_WITH_WIDGET_ID');
      amazon_connect('styles', { 
        iconType: 'CHAT', 
        openChat: { color: '#ffffff', backgroundColor: '#ff9200' }, 
        closeChat: { color: '#ffffff', backgroundColor: '#ff9200'} 
      });
      amazon_connect('snippetId', 'REPLACE_WITH_SNIPPET_ID');
      amazon_connect('supportedMessagingContentTypes', [ 
        'text/plain', 
        'text/markdown', 
        'application/vnd.amazonaws.connect.message.interactive', 
        'application/vnd.amazonaws.connect.message.interactive.response' 
      ]);
      amazon_connect('customStyles', {
        global: { frameWidth: '500px', frameHeight: '900px'}
      });
    </script>
</body>
</html>
```

Replace the placeholder values in the HTML file with your actual widget values:

PlaceholderReplace WithExampleREPLACE_WITH_CLIENT_URIYour Client URI from Step 5https://d2s9x5slqf05.cloudfront.net/amazon-connect-chat-interface-client.jsREPLACE_WITH_WIDGET_IDYour Widget ID from Step 5amazon_connect_widget_abc123REPLACE_WITH_SNIPPET_IDYour Snippet ID from Step 5QVFJREFIaWJYbG... (long Base64 string)
Step 8: Start a Local Web Server
To test the widget, you need to serve the HTML file from a local web server. Here are several options:
Option A: Python (if installed)

```
1
python -m http.server 8001
```

Option B: Node.js (if installed)

```
1
npx http-server -p 8001
```

Option C: VS Code Live Server Extension

Install the "Live Server" extension in VS Code
Right-click on index.html and select "Open with Live Server"

After starting the server, open your browser and navigate to: http://localhost:8001
You should see the demo page with an orange chat button in the bottom-right corner.
Test the Streaming Experience
Now that your widget is loaded, it's time to test AI Message Streaming and observe the progressive text display in action.
What to Look For: Streaming vs Non-Streaming
Understanding the difference between streaming and non-streaming responses helps you verify that AI Message Streaming is working:
BehaviorNon-Streaming (Standard)Streaming (AI Message Streaming)Initial displayLoading indicator or typing dotsText starts appearing immediatelyText appearanceComplete message appears all at onceWords appear progressively (growing bubble)Response timingWait until AI finishes generatingSee response as it's being generatedVisual effect"Pop" of complete textSmooth, flowing text like watching someone type
What's Next
After completing this module, you have configured the required pieces to see AI Message Streaming in action. This feature enhances the customer experience by showing AI responses progressively as they're generated.
Explore other Agentic Experiences or proceed to Testing to validate your implementation.