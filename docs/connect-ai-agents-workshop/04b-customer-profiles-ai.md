# Customer Profiles AI Capabilities

Customer Profiles AI CapabilitiesThis module explains the AI-powered Customer Profiles capabilities in Amazon Connect, focusing on how the Sales AI Agent leverages 1P MCP Customer Profiles tools to deliver personalized recommendations during customer interactions.
Enabling Customer ProfilesLearn more about enabling Customer Profiles  and enabling Predictive Insights .
Overview
Amazon Connect Customer Profiles provides AI capabilities for personalized customer experiences through:
ComponentDescriptionPredictive InsightsML-powered recommendations based on customer behavior patternsSales AI AgentPre-built Orchestration AI Agent optimized for sales-focused interactions1P MCP Customer Profiles ToolsFirst-party tools that enable AI Agents to access customer data and recommendations
The Sales AI Agent demonstrates how to combine these components to deliver intelligent, context-aware product recommendations in both Self-Service and Agent Assistance scenarios.

Predictive Insights Algorithms
Predictive Insights uses machine learning to generate personalized recommendations. Amazon Connect provides five distinct recommendation algorithms:
AlgorithmRecipe NameDescriptionUse CaseRecommended for Yourecommended-for-youPersonalized recommendations based on individual interaction patternsTailored suggestions based on customer history and preferencesSimilar Itemssimilar-itemsGenerative AI finds thematically similar itemsSuggesting alternatives or substitutionsFrequently Paired Itemsfrequently-paired-itemsItems commonly co-purchased with the current itemCross-selling complementary productsPopular Itemspopular-itemsMost consistently popular products over timeProduct discovery for new or browsing customersTrending Nowtrending-nowItems with the largest engagement velocity increaseTime-sensitive offers and seasonal promotions
Data Requirements
Predictive Insights requires sufficient data for model training:
RequirementMinimum ThresholdInteractions1,000+ customer interactionsUnique Users25+ unique users with interactionsItem CatalogItems uploaded to Customer ProfilesTraining Time~1 hour for initial model training

Sales AI Agent
The Sales AI Agent is a pre-built Orchestration AI Agent that demonstrates how to leverage Customer Profiles tools for intelligent product recommendations. It uses a sophisticated strategy to determine when and what to recommend based on customer context.
Sales Agent Tools
The Sales AI Agent uses 11 tools organized into three categories:
Context Gathering Tools
These tools collect customer information before making recommendations:
ToolUnderlying 1P MCP ToolPurposeGetProfileIdaws_service__connect_DescribeContactRetrieves the customer's ProfileId from contact attributesGetDomainNameaws_service__customerprofiles_ListAccountIntegrationsGets the Customer Profiles domain nameGetProfileSummaryaws_service__customerprofiles_GetProfileInsightsRetrieves profile summary, segments, and calculated attributesGetRecentActivitiesaws_service__customerprofiles_ListProfileObjectsGets recent customer activities and purchase historyListRecommendersaws_service__customerprofiles_ListRecommendersLists available recommenders to find the appropriate one for each strategy
Recommendation Tools
Each tool maps to a specific Predictive Insights algorithm:
ToolRecipeWhen to UseGetRecommendedForYouRecommendationrecommended-for-youCustomer has established preferences or asks for personalized suggestionsGetFrequentlyPairedTogetherItemsRecommendationfrequently-paired-itemsCustomer mentions a specific item or has recent purchasesGetSemanticallySimilarItemsRecommendationsimilar-itemsCustomer asks for alternatives or "more like this"GetTrendingItemsRecommendationtrending-nowSeasonal opportunities or customer shows brand affinityGetPopularItemsRecommendationpopular-itemsCustomer is exploring or comparing options
Control Tools
ToolTypePurposeCOMPLETERETURN_TO_CONTROLCloses the conversation when the customer has no more questions

Recommendation Strategy
The Sales AI Agent uses a prioritized decision tree to select the most appropriate recommendation strategy based on customer context. The agent evaluates conditions in order and uses the first matching strategy.
Strategy Priority Order

Strategy Selection Criteria
PriorityStrategyTrigger Conditions1Recommended for YouCustomer has established preferences, asks "What would you recommend?", mentions favorites2Frequently PairedCustomer mentions specific item by name/ID, post-purchase context ("I just bought..."), asks "What works with...?"3Similar ItemsCustomer asks for alternatives ("Something like..."), wants to explore comparable items4Trending NowCustomer shows brand affinity, seasonal opportunity, asks "What's new?"5Popular ItemsCustomer is browsing/comparing, asks "What's popular?", broad category interest
Opportunity Assessment
Before recommending, the Sales Agent assesses whether it's appropriate to make suggestions:
Positive Indicators (proceed with recommendations):

Customer uses positive language or expresses satisfaction
Query is straightforward (not a complex multi-issue problem)
Customer is in browsing/buying mode

Negative Indicators (skip recommendations):

Complaint, frustration, or urgency expressed
Multiple failed attempts to resolve an issue
Billing or payment dispute

1P MCP Customer Profiles Tools
The Sales AI Agent leverages first-party Model Context Protocol (MCP) tools provided by Amazon Connect. These tools enable AI Agents to access Customer Profiles data natively.
Available 1P MCP Tools
1P MCP ToolDescriptionUsed By Sales Agent Asaws_service__customerprofiles_GetProfileInsightsRetrieves profile insights, recommendations, segments, and calculated attributesGetProfileSummary, GetRecommendedForYouRecommendation, GetTrendingItemsRecommendation, GetPopularItemsRecommendation, GetFrequentlyPairedTogetherItemsRecommendation, GetSemanticallySimilarItemsRecommendationaws_service__customerprofiles_ListRecommendersLists available recommenders in the domainListRecommendersaws_service__customerprofiles_ListProfileObjectsLists profile objects for a customerGetRecentActivitiesaws_service__customerprofiles_ListAccountIntegrationsLists account integrations for the domainGetDomainNameaws_service__connect_DescribeContactRetrieves contact details including attributesGetProfileId
Tool Configuration Pattern
The Sales Agent demonstrates how to create specialized tools from generic 1P MCP tools using:

Custom tool names: Descriptive names like GetProfileSummary instead of the generic GetProfileInsights
Override input values: Pre-configure parameters like Include: ["PROFILE_SUMMARY"] or Include: ["RECOMMENDATION"]
Custom instructions: Guide the AI on how to use each tool for its specific purpose
Output filters: Extract specific fields like ProfileId from contact attributes

Example: GetProfileInsights Variations
The aws_service__customerprofiles_GetProfileInsights tool is configured multiple ways:
Sales Agent ToolInclude ParameterPurposeGetProfileSummary["PROFILE_SUMMARY"]Get customer profile summary and segmentsGetRecommendedForYouRecommendation["RECOMMENDATION"]Get personalized recommendationsGetTrendingItemsRecommendation["RECOMMENDATION"]Get trending itemsGetPopularItemsRecommendation["RECOMMENDATION"]Get popular itemsGetFrequentlyPairedTogetherItemsRecommendation["RECOMMENDATION"]Get complementary items (requires Context)GetSemanticallySimilarItemsRecommendation["RECOMMENDATION"]Get similar items (requires Context)

How It Works Together

Learn More

Predictive Insights Documentation 
Customer Profiles Documentation 
AI Agent Designer 

Next Steps
Explore other AI capabilities:

Cases AI Capabilities - Configure Case Summary AI Agent
Email AI Capabilities - Set up AI-powered email responses

Or return to the main tracks:

Agent Assistance Track
Self-Service Track