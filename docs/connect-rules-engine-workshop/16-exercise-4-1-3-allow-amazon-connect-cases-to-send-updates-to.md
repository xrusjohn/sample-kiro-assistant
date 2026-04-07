# Exercise 4.1.3 - Allow Amazon Connect Cases to send updates to Contact Lens rules

Exercise 4.1.3 - Allow Amazon Connect Cases to send updates to Contact Lens rulesNoteTo perform the instructions in this procedure, you need to have developer skills, or be experienced with Amazon Connect CLI. see here  .
Complete this one-time procedure so your users can set up rules that run when a case is created or updated.

Copy and run the put-case-event-configuration CLI command to include all case fields information in the event. Replace your-domain-id with your Case domain ID copied from the last section.

```
aws connectcases put-case-event-configuration --domain-id <your-domain-id> --event-bridge "{
    \"enabled\": true, 
    \"includedData\": {
       \"caseData\": {
           \"fields\": [
             {
               \"id\": \"status\"
             },
             {
               \"id\": \"title\"
             },
             {
               \"id\": \"assigned_queue\"
             },
             {
               \"id\": \"assigned_user\"
             },
             {
               \"id\": \"case_reason\"
             },
             {
               \"id\": \"last_closed_datetime\"
             },
             {
               \"id\": \"created_datetime\"
             },
             {
               \"id\": \"last_updated_datetime\"
             },
             {
               \"id\": \"reference_number\"
             },
             {
               \"id\": \"summary\"
             }
           ]
      },
      \"relatedItemData\": {
      \"includeContent\": true
      }
    }
  }"
```

Run the create-event-integration CLI command, as shown in the following example command.

```
aws appintegrations create-event-integration --name amazon-connect-cases --description amazon-connect-cases --event-filter '{"Source":"aws.cases"}' --event-bridge-bus default
```

The output will look similar to the following sample:

```
{
    "EventIntegrationArn": "arn:aws:app-integrations:us-east-1:111222333444:event-integration/amazon-connect-cases"
}
```

Run the create-integration-association CLI command, as shown in the following example command.

NoteReplace InstanceId with your Amazon Connect instance ID and the IntegrationArn with the response you get from step 3.

```
aws connect create-integration-association --instance-id <InstanceId> --integration-type EVENT --integration-arn <IntegrationArn> --source-type CASES
```

The output will be similar to the following sample:

```
{
    "IntegrationAssociationId": "d49048cd-497d-4257-ab5c-8de797a123445",
    "IntegrationAssociationArn": "arn:aws:connect:us-east-1:111222333444:instance/bba5df5c-6a5f-421f-a81d-9c16402bxxxx/integration-association/d49048cd-497d-4257-ab5c-8de797a123445"
}
```

CongratulationsProceed to the next exercise to manually create a Customer Profile and a Case for testing.