# Setup Task Queue Flow

Setup Task Queue FlowCopy the flow in this section, paste it to notepad, and save it as Task_QueueFlow.txt
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
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
97
98
99
100
101
102
103
104
105
106
107
108
109
110
111
112
113
114
115
116
117
118
119
120
121
122
123
124
125
126
127
128
129
130
131
132
133
134
135
136
137
138
139
140
141
142
143
144
145
146
147
148
149
150
151
152
153
154
155
156
157
158
159
160
161
162
163
164
165
166
{
  "Version": "2019-10-30",
  "StartAction": "646452c8-483e-4a9f-86ee-962fd06fcfcc",
  "Metadata": {
    "entryPointPosition": {
      "x": 20,
      "y": 20
    },
    "ActionMetadata": {
      "646452c8-483e-4a9f-86ee-962fd06fcfcc": {
        "position": {
          "x": 40,
          "y": 208.8
        }
      },
      "b36dfa3d-e42e-4fcb-b2d0-fb84cab0cef1": {
        "position": {
          "x": 978.4,
          "y": 88
        }
      },
      "1a3c54b5-31e7-4d23-8a85-a1f6770817d9": {
        "position": {
          "x": 257.6,
          "y": 8.8
        },
        "parameters": {
          "TimeLimitSeconds": {
            "unit": 1
          }
        },
        "timeoutUnit": {
          "display": "Seconds",
          "value": "second"
        }
      },
      "6aa614d2-cfa1-4389-be30-5d26b17f2663": {
        "position": {
          "x": 736,
          "y": 12
        }
      },
      "696c76a6-6717-4933-bcba-df04f60ba341": {
        "position": {
          "x": 645.6,
          "y": 309.6
        }
      },
      "11af20cb-4588-46a5-8dfb-328cb749be97": {
        "position": {
          "x": 498.4,
          "y": 12.8
        },
        "parameters": {
          "QueueId": {
            "displayName": "SupervisorQueue"
          }
        },
        "queue": {
          "text": "SupervisorQueue"
        }
      }
    },
    "Annotations": [],
    "name": "Tasks_QueueFlow",
    "description": "",
    "type": "contactFlow",
    "status": "PUBLISHED",
    "hash": {}
  },
  "Actions": [
    {
      "Parameters": {
        "FlowLoggingBehavior": "Enabled"
      },
      "Identifier": "646452c8-483e-4a9f-86ee-962fd06fcfcc",
      "Type": "UpdateFlowLoggingBehavior",
      "Transitions": {
        "NextAction": "1a3c54b5-31e7-4d23-8a85-a1f6770817d9"
      }
    },
    {
      "Parameters": {},
      "Identifier": "b36dfa3d-e42e-4fcb-b2d0-fb84cab0cef1",
      "Type": "DisconnectParticipant",
      "Transitions": {}
    },
    {
      "Parameters": {
        "TimeLimitSeconds": "30"
      },
      "Identifier": "1a3c54b5-31e7-4d23-8a85-a1f6770817d9",
      "Type": "Wait",
      "Transitions": {
        "NextAction": "696c76a6-6717-4933-bcba-df04f60ba341",
        "Conditions": [
          {
            "NextAction": "11af20cb-4588-46a5-8dfb-328cb749be97",
            "Condition": {
              "Operator": "Equals",
              "Operands": [
                "WaitCompleted"
              ]
            }
          }
        ],
        "Errors": [
          {
            "NextAction": "696c76a6-6717-4933-bcba-df04f60ba341",
            "ErrorType": "NoMatchingError"
          }
        ]
      }
    },
    {
      "Parameters": {},
      "Identifier": "6aa614d2-cfa1-4389-be30-5d26b17f2663",
      "Type": "TransferContactToQueue",
      "Transitions": {
        "NextAction": "696c76a6-6717-4933-bcba-df04f60ba341",
        "Errors": [
          {
            "NextAction": "b36dfa3d-e42e-4fcb-b2d0-fb84cab0cef1",
            "ErrorType": "QueueAtCapacity"
          },
          {
            "NextAction": "696c76a6-6717-4933-bcba-df04f60ba341",
            "ErrorType": "NoMatchingError"
          }
        ]
      }
    },
    {
      "Parameters": {
        "Text": "Sorry we are facing technical difficulties"
      },
      "Identifier": "696c76a6-6717-4933-bcba-df04f60ba341",
      "Type": "MessageParticipant",
      "Transitions": {
        "NextAction": "b36dfa3d-e42e-4fcb-b2d0-fb84cab0cef1",
        "Errors": [
          {
            "NextAction": "b36dfa3d-e42e-4fcb-b2d0-fb84cab0cef1",
            "ErrorType": "NoMatchingError"
          }
        ]
      }
    },
    {
      "Parameters": {
        "QueueId": "arn:aws:connect:ap-southeast-1:201089190273:instance/a94f30b6-e502-4bca-978b-762a01e1452b/queue/770e80bf-13fa-4f93-9f65-97bac5423751"
      },
      "Identifier": "11af20cb-4588-46a5-8dfb-328cb749be97",
      "Type": "UpdateContactTargetQueue",
      "Transitions": {
        "NextAction": "6aa614d2-cfa1-4389-be30-5d26b17f2663",
        "Errors": [
          {
            "NextAction": "696c76a6-6717-4933-bcba-df04f60ba341",
            "ErrorType": "NoMatchingError"
          }
        ]
      }
    }
  ]
}
```

Attachment download
Download this flow file Download Task_QueueFlow.txt

Navigate to the Amazon Connect console, select Flows from the Routing menu.

Select the Create flow button.

Select the drop down next to the Save button, in the top right of the screen, and select Import flow (beta).

On the Import flow window, select Choose File and navigate to where you have saved the Tasks_QueueFlow.txt file, select it and select Open.

Select the Import option.

Open the Set working queue block.

Select the SupervisorQueue and Save the block.

Save the flow in the top right corner.

If prompt, select Save  in the popup confirmation.

Publish the flow in the top right corner.

Select Publish in the popup confirmation.

Confirm that the flow has been Published.