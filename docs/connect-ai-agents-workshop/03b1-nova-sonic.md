# Nova Sonic Voice

Nova Sonic VoiceAmazon Connect offers Agentic Voice powered by Amazon Nova Sonic, providing more natural, conversational AI interactions. In this module, you'll enable speech-to-speech capabilities for your Self-Service AI Agent.
What You'll Learn

Understand the difference between traditional TTS and Nova Sonic
Enable speech-to-speech on your Lex bot
Experience natural conversation flow with barge-in support
Test the enhanced voice experience

What is Agentic Voice?
Agentic Voice uses Amazon Nova Sonic to deliver:
FeatureTraditional TTSNova SonicConversation FlowWait for AI to finish speakingNatural interruption supportBarge-inLimited or noneFull barge-in supportVoice QualityRobotic, predictableHuman-like, expressiveContext HandlingLoses context on interruptionMaintains context across interruptionsEmotional AwarenessNoneConveys appropriate emotion and tonality
Why Amazon Lex?
Amazon Lex serves as the scaffolding that blends agentic AI with structured conversational AI and life-like speech models:

While your AI Agent handles intelligence and decision-making, Lex provides the voice interface layer-managing speech recognition, text-to-speech, and now speech-to-speech with Nova Sonic.
Step 1: Access Your Lex Bot

In your Amazon Connect admin interface, navigate to Routing → Flows → Conversational AI

Click on your bot (e.g., HotelBookingBot or SelfServiceBot)

Step 2: Navigate to Language Settings

From the Configuration tab, under Speech model section click Edit

Step 3: Enable Speech-to-Speech

For Model type, select Speech-to-speech

For Voice provider, select Amazon Nova Sonic

Click Confirm

Regional AvailabilityNova Sonic is available in select regions. Check Amazon Connect feature availability by region  for current availability.If you are unable to see or configure this option,  ensure that your instance is enabled with Unlimited AI and you are using a supported language .You can learn more about enabling this experience here .
Step 4: Build the Bot

Click the Build language button to rebuild the bot with the new speech model

Wait for the build to complete (you'll see "Successfully built")

Build RequiredYou must rebuild the bot after changing the speech model. Changes won't take effect until the build completes.
Step 5: About the Experience
Voice Quality

Human-like voice - Remarkably natural with realistic intonation
Emotional awareness - Voice conveys appropriate emotion based on context
Natural pauses - Conversation feels like talking to a real person

Conversation Flow

Try interrupting - Start speaking while the AI is talking
Experience barge-in - The AI stops and listens to you
Context preservation - The AI remembers what you said even after interruption

Sample Conversation

```
AI: "Welcome to AnyCompany Hotels! I'm Sunny, your virtual assistant. 
     How can I help you today?"

You: [Interrupt mid-sentence] "I need a room"

AI: [Stops immediately] "Of course! I'd be happy to help you find a room. 
     What city are you looking for?"

You: "Seattle, next weekend"

AI: "Let me check availability in Seattle for next weekend..."
```

You can test your bot with your defined scenario in the testing section.
What's Next
Your Self-Service AI Agent now provides natural, human-like voice interactions. Explore other Agentic Experiences or proceed to Testing to validate your complete implementation.