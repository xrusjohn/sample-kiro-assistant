"""
relay-agent-gateway-lambda.py — Gateway Lambda target that invokes the kiro A2A runtime.

Receives MCP tool calls from AgentCore Gateway, translates to A2A message/send,
invokes the AgentCore Runtime, and returns the result as MCP tool output.
"""
import json
import os
import base64
import boto3
from uuid import uuid4

RUNTIME_ARN = os.environ.get("AGENT_RUNTIME_ARN",
    "arn:aws:bedrock-agentcore:us-east-1:441262788356:runtime/kiro_assistant-X4sQS16Zjz")
REGION = os.environ.get("AWS_REGION", "us-east-1")

client = boto3.client("bedrock-agentcore", region_name=REGION)

def handler(event, context):
    """Handle MCP tool call from Gateway."""
    # Gateway sends the tool call params
    prompt = ""
    if isinstance(event, dict):
        # Direct tool call: {"prompt": "..."}
        prompt = event.get("prompt", "")
        if not prompt:
            # Nested: {"arguments": {"prompt": "..."}}
            prompt = event.get("arguments", {}).get("prompt", "")
        if not prompt:
            prompt = json.dumps(event)

    # Build A2A message/send payload
    a2a_payload = json.dumps({
        "jsonrpc": "2.0",
        "method": "message/send",
        "id": f"gw-{uuid4()}",
        "params": {
            "message": {
                "role": "user",
                "parts": [{"kind": "text", "text": prompt}]
            }
        }
    })

    session_id = f"gw-{uuid4()}"

    response = client.invoke_agent_runtime(
        agentRuntimeArn=RUNTIME_ARN,
        runtimeSessionId=session_id,
        payload=base64.b64encode(a2a_payload.encode()).decode()
    )

    # Read the response body
    body = response["payload"].read().decode() if hasattr(response.get("payload", ""), "read") else response.get("payload", "")

    try:
        rpc = json.loads(body)
        parts = rpc.get("result", {}).get("artifacts", [{}])[0].get("parts", [])
        text = "\n".join(p["text"] for p in parts if p.get("kind") == "text")
        return {"result": text}
    except:
        return {"result": body}
