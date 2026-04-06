import json, os, boto3, logging
from uuid import uuid4

logger = logging.getLogger()
logger.setLevel(logging.INFO)

RUNTIME_ARN = os.environ.get("AGENT_RUNTIME_ARN",
    "arn:aws:bedrock-agentcore:us-east-1:441262788356:runtime/kiro_assistant-X4sQS16Zjz")
REGION = os.environ.get("AWS_REGION", "us-east-1")

client = boto3.client("bedrock-agentcore", region_name=REGION)

def lambda_handler(event, context):
    prompt = event.get("prompt", "")
    if not prompt:
        prompt = event.get("arguments", {}).get("prompt", json.dumps(event))

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

    try:
        response = client.invoke_agent_runtime(
            agentRuntimeArn=RUNTIME_ARN,
            runtimeSessionId=session_id,
            contentType="application/json",
            accept="application/json",
            payload=a2a_payload.encode("utf-8")
        )

        resp_body = response.get("response")
        if hasattr(resp_body, "read"):
            body = resp_body.read().decode()
        else:
            body = str(resp_body) if resp_body else ""

        logger.info(f"Body: {body[:500]}")

        if not body:
            return {"result": f"Empty response. Keys: {list(response.keys())}"}

        try:
            rpc = json.loads(body)
            parts = rpc.get("result", {}).get("artifacts", [{}])[0].get("parts", [])
            text = "\n".join(p["text"] for p in parts if p.get("kind") == "text")
            return {"result": text or body}
        except:
            return {"result": body}
    except Exception as e:
        logger.error(f"Error: {e}")
        return {"result": f"Error: {str(e)}"}
