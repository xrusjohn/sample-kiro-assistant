#!/bin/bash
set -euo pipefail

# ============================================================================
# Remote Kiro ECS — Infrastructure Setup
# CloudFront → ALB (restricted) → ECS Orchestrator → ECS Sub-Agents
# ============================================================================

AWS_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-kiro-remote}"
VPC_ID="${VPC_ID:?Set VPC_ID}"
PUBLIC_SUBNET_IDS="${PUBLIC_SUBNET_IDS:?Set PUBLIC_SUBNET_IDS (comma-separated, for ALB)}"
PRIVATE_SUBNET_IDS="${PRIVATE_SUBNET_IDS:?Set PRIVATE_SUBNET_IDS (comma-separated, for ECS tasks)}"
CERTIFICATE_ARN="${CERTIFICATE_ARN:?Set CERTIFICATE_ARN (ACM cert for CloudFront + ALB)}"
DOMAIN_NAME="${DOMAIN_NAME:-kiro.xrusjohn.people.aws.dev}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Generate a shared secret for CloudFront → ALB origin verification
ORIGIN_VERIFY_SECRET="${ORIGIN_VERIFY_SECRET:-$(openssl rand -hex 32)}"

ECR_REPO="${STACK_NAME}-ecr"
ECS_CLUSTER="${ECS_CLUSTER:-relay}"
ORCH_TASK_FAMILY="${STACK_NAME}-orchestrator"
SUBAGENT_TASK_FAMILY="${STACK_NAME}-subagent"
ORCH_SERVICE="${STACK_NAME}-orchestrator-svc"
LOG_GROUP_ORCH="/ecs/${STACK_NAME}/orchestrator"
LOG_GROUP_SUBAGENT="/ecs/${STACK_NAME}/subagent"

echo "=== Remote Kiro ECS Infrastructure Setup ==="
echo "Region:       $AWS_REGION"
echo "VPC:          $VPC_ID"
echo "Public subs:  $PUBLIC_SUBNET_IDS"
echo "Private subs: $PRIVATE_SUBNET_IDS"
echo "Domain:       $DOMAIN_NAME"
echo "Cert:         $CERTIFICATE_ARN"
echo ""

# --- 1. ECR Repository ---
echo "[1/10] ECR repository..."
aws ecr describe-repositories --repository-names "$ECR_REPO" --region "$AWS_REGION" 2>/dev/null || \
  aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION" --image-scanning-configuration scanOnPush=true
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"
echo "  $ECR_URI"

# --- 2. ECS Cluster ---
echo "[2/10] ECS cluster..."
aws ecs describe-clusters --clusters "$ECS_CLUSTER" --region "$AWS_REGION" --query 'clusters[0].status' --output text 2>/dev/null | grep -q ACTIVE || \
  aws ecs create-cluster --cluster-name "$ECS_CLUSTER" --region "$AWS_REGION" \
    --capacity-providers FARGATE --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1
echo "  $ECS_CLUSTER"

# --- 3. CloudWatch Log Groups ---
echo "[3/10] CloudWatch log groups..."
aws logs create-log-group --log-group-name "$LOG_GROUP_ORCH" --region "$AWS_REGION" 2>/dev/null || true
aws logs create-log-group --log-group-name "$LOG_GROUP_SUBAGENT" --region "$AWS_REGION" 2>/dev/null || true

# --- 4. Security Groups (ALB restricted to CloudFront only) ---
echo "[4/10] Security groups..."

# Get the AWS-managed CloudFront prefix list for this region
CF_PREFIX_LIST=$(aws ec2 describe-managed-prefix-lists --region "$AWS_REGION" \
  --filters "Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing" \
  --query 'PrefixLists[0].PrefixListId' --output text 2>/dev/null || echo "")

# ALB security group — ONLY allows CloudFront IPs
ALB_SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${STACK_NAME}-alb-sg" "Name=vpc-id,Values=${VPC_ID}" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$AWS_REGION" 2>/dev/null)
if [ "$ALB_SG" = "None" ] || [ -z "$ALB_SG" ]; then
  ALB_SG=$(aws ec2 create-security-group --group-name "${STACK_NAME}-alb-sg" --description "ALB - CloudFront only" \
    --vpc-id "$VPC_ID" --region "$AWS_REGION" --query GroupId --output text)
  if [ -n "$CF_PREFIX_LIST" ]; then
    # Restrict to CloudFront IPs via managed prefix list
    aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --region "$AWS_REGION" \
      --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=$CF_PREFIX_LIST}]" 2>/dev/null || true
    aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --region "$AWS_REGION" \
      --ip-permissions "IpProtocol=tcp,FromPort=80,ToPort=80,PrefixListIds=[{PrefixListId=$CF_PREFIX_LIST}]" 2>/dev/null || true
    echo "  ALB SG: $ALB_SG (CloudFront prefix list: $CF_PREFIX_LIST)"
  else
    # Fallback: open to internet (less secure, but CloudFront origin header still validates)
    aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --protocol tcp --port 443 --cidr 0.0.0.0/0 --region "$AWS_REGION" 2>/dev/null || true
    echo "  ALB SG: $ALB_SG (WARNING: open to internet, prefix list not found)"
  fi
else
  echo "  ALB SG: $ALB_SG (existing)"
fi

# Orchestrator SG — only from ALB
ORCH_SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${STACK_NAME}-orch-sg" "Name=vpc-id,Values=${VPC_ID}" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$AWS_REGION" 2>/dev/null)
if [ "$ORCH_SG" = "None" ] || [ -z "$ORCH_SG" ]; then
  ORCH_SG=$(aws ec2 create-security-group --group-name "${STACK_NAME}-orch-sg" --description "Orchestrator - ALB only" \
    --vpc-id "$VPC_ID" --region "$AWS_REGION" --query GroupId --output text)
  aws ec2 authorize-security-group-ingress --group-id "$ORCH_SG" --protocol tcp --port 3001 --source-group "$ALB_SG" --region "$AWS_REGION" 2>/dev/null || true
fi
echo "  Orch SG: $ORCH_SG"

# Sub-Agent SG — only from Orchestrator
SA_SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${STACK_NAME}-subagent-sg" "Name=vpc-id,Values=${VPC_ID}" \
  --query 'SecurityGroups[0].GroupId' --output text --region "$AWS_REGION" 2>/dev/null)
if [ "$SA_SG" = "None" ] || [ -z "$SA_SG" ]; then
  SA_SG=$(aws ec2 create-security-group --group-name "${STACK_NAME}-subagent-sg" --description "Sub-Agent - Orchestrator only" \
    --vpc-id "$VPC_ID" --region "$AWS_REGION" --query GroupId --output text)
  aws ec2 authorize-security-group-ingress --group-id "$SA_SG" --protocol tcp --port 8080 --source-group "$ORCH_SG" --region "$AWS_REGION" 2>/dev/null || true
fi
echo "  SA SG:   $SA_SG"

# --- 5. IAM Roles ---
echo "[5/10] IAM roles..."

ORCH_TASK_ROLE="${STACK_NAME}-orch-task-role"
ORCH_EXEC_ROLE="${STACK_NAME}-exec-role"
SA_TASK_ROLE="${STACK_NAME}-sa-task-role"

EXEC_TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam get-role --role-name "$ORCH_EXEC_ROLE" 2>/dev/null || \
  aws iam create-role --role-name "$ORCH_EXEC_ROLE" --assume-role-policy-document "$EXEC_TRUST"
aws iam attach-role-policy --role-name "$ORCH_EXEC_ROLE" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy 2>/dev/null || true

aws iam get-role --role-name "$ORCH_TASK_ROLE" 2>/dev/null || \
  aws iam create-role --role-name "$ORCH_TASK_ROLE" --assume-role-policy-document "$EXEC_TRUST"
ORCH_POLICY="{\"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":[\"ecs:RunTask\",\"ecs:StopTask\",\"ecs:DescribeTasks\"],\"Resource\":\"*\"},
  {\"Effect\":\"Allow\",\"Action\":[\"iam:PassRole\"],\"Resource\":\"*\",\"Condition\":{\"StringLike\":{\"iam:PassedToService\":\"ecs-tasks.amazonaws.com\"}}},
  {\"Effect\":\"Allow\",\"Action\":[\"secretsmanager:GetSecretValue\"],\"Resource\":\"*\"},
  {\"Effect\":\"Allow\",\"Action\":[\"ecr:GetAuthorizationToken\",\"ecr:BatchGetImage\",\"ecr:GetDownloadUrlForLayer\"],\"Resource\":\"*\"}
]}"
aws iam put-role-policy --role-name "$ORCH_TASK_ROLE" --policy-name "${STACK_NAME}-orch-policy" --policy-document "$ORCH_POLICY"

aws iam get-role --role-name "$SA_TASK_ROLE" 2>/dev/null || \
  aws iam create-role --role-name "$SA_TASK_ROLE" --assume-role-policy-document "$EXEC_TRUST"
SA_POLICY="{\"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":[\"secretsmanager:GetSecretValue\"],\"Resource\":\"*\"},
  {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\"],\"Resource\":\"*\"}
]}"
aws iam put-role-policy --role-name "$SA_TASK_ROLE" --policy-name "${STACK_NAME}-sa-policy" --policy-document "$SA_POLICY"

ORCH_TASK_ROLE_ARN=$(aws iam get-role --role-name "$ORCH_TASK_ROLE" --query 'Role.Arn' --output text)
ORCH_EXEC_ROLE_ARN=$(aws iam get-role --role-name "$ORCH_EXEC_ROLE" --query 'Role.Arn' --output text)
SA_TASK_ROLE_ARN=$(aws iam get-role --role-name "$SA_TASK_ROLE" --query 'Role.Arn' --output text)

# --- 6. ECS Task Definitions ---
echo "[6/10] ECS task definitions..."

cat > /tmp/orch-taskdef.json <<TASKEOF
{
  "family": "$ORCH_TASK_FAMILY",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024", "memory": "2048",
  "executionRoleArn": "$ORCH_EXEC_ROLE_ARN",
  "taskRoleArn": "$ORCH_TASK_ROLE_ARN",
  "containerDefinitions": [{
    "name": "orchestrator",
    "image": "${ECR_URI}:latest",
    "essential": true,
    "portMappings": [{"containerPort": 3001, "protocol": "tcp"}],
    "entryPoint": ["node", "dist-server/server/index.js"],
    "environment": [
      {"name": "PORT", "value": "3001"},
      {"name": "ECS_RUNNER_ENABLED", "value": "true"},
      {"name": "ECS_CLUSTER", "value": "$ECS_CLUSTER"},
      {"name": "ECS_SUBAGENT_TASK_FAMILY", "value": "$SUBAGENT_TASK_FAMILY"},
      {"name": "ECS_SUBAGENT_SUBNETS", "value": "$PRIVATE_SUBNET_IDS"},
      {"name": "ECS_SUBAGENT_SECURITY_GROUP", "value": "$SA_SG"},
      {"name": "ORIGIN_VERIFY_HEADER", "value": "$ORIGIN_VERIFY_SECRET"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {"awslogs-group": "$LOG_GROUP_ORCH", "awslogs-region": "$AWS_REGION", "awslogs-stream-prefix": "orch"}
    }
  }]
}
TASKEOF
aws ecs register-task-definition --cli-input-json file:///tmp/orch-taskdef.json --region "$AWS_REGION" > /dev/null

cat > /tmp/sa-taskdef.json <<TASKEOF
{
  "family": "$SUBAGENT_TASK_FAMILY",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024", "memory": "4096",
  "executionRoleArn": "$ORCH_EXEC_ROLE_ARN",
  "taskRoleArn": "$SA_TASK_ROLE_ARN",
  "containerDefinitions": [{
    "name": "kiro-subagent",
    "image": "${ECR_URI}:latest",
    "essential": true,
    "portMappings": [{"containerPort": 8080, "protocol": "tcp"}],
    "environment": [],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {"awslogs-group": "$LOG_GROUP_SUBAGENT", "awslogs-region": "$AWS_REGION", "awslogs-stream-prefix": "sa"}
    }
  }]
}
TASKEOF
aws ecs register-task-definition --cli-input-json file:///tmp/sa-taskdef.json --region "$AWS_REGION" > /dev/null

# --- 7. ALB (public subnets, HTTPS) ---
echo "[7/10] ALB..."

IFS=',' read -ra PUB_SUBS <<< "$PUBLIC_SUBNET_IDS"

ALB_ARN=$(aws elbv2 describe-load-balancers --names "${STACK_NAME}-alb" --region "$AWS_REGION" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || echo "None")
if [ "$ALB_ARN" = "None" ] || [ -z "$ALB_ARN" ]; then
  ALB_ARN=$(aws elbv2 create-load-balancer --name "${STACK_NAME}-alb" --type application \
    --subnets ${PUB_SUBS[@]} --security-groups "$ALB_SG" --region "$AWS_REGION" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)
fi
ALB_DNS=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" --region "$AWS_REGION" \
  --query 'LoadBalancers[0].DNSName' --output text)
echo "  ALB: $ALB_DNS"

# Target group with WebSocket-friendly settings
TG_ARN=$(aws elbv2 describe-target-groups --names "${STACK_NAME}-tg" --region "$AWS_REGION" \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo "None")
if [ "$TG_ARN" = "None" ] || [ -z "$TG_ARN" ]; then
  TG_ARN=$(aws elbv2 create-target-group --name "${STACK_NAME}-tg" --protocol HTTP --port 3001 \
    --vpc-id "$VPC_ID" --target-type ip --region "$AWS_REGION" \
    --health-check-path "/healthz" --health-check-interval-seconds 30 \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
  aws elbv2 modify-target-group-attributes --target-group-arn "$TG_ARN" --region "$AWS_REGION" \
    --attributes Key=stickiness.enabled,Value=true Key=stickiness.type,Value=lb_cookie Key=stickiness.lb_cookie.duration_seconds,Value=86400
fi

# HTTPS listener with origin header validation
# ALB listener rule: only forward if X-Origin-Verify header matches our secret
aws elbv2 create-listener --load-balancer-arn "$ALB_ARN" --protocol HTTPS --port 443 \
  --certificates CertificateArn="$CERTIFICATE_ARN" \
  --default-actions Type=fixed-response,FixedResponseConfig="{StatusCode=403,ContentType=text/plain,MessageBody=Forbidden}" \
  --region "$AWS_REGION" 2>/dev/null || true

# Add rule: if X-Origin-Verify matches, forward to target group
LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --region "$AWS_REGION" \
  --query 'Listeners[?Port==`443`].ListenerArn' --output text)
if [ -n "$LISTENER_ARN" ]; then
  aws elbv2 create-rule --listener-arn "$LISTENER_ARN" --region "$AWS_REGION" \
    --conditions "Field=http-header,HttpHeaderConfig={HttpHeaderName=X-Origin-Verify,Values=[$ORIGIN_VERIFY_SECRET]}" \
    --priority 1 --actions Type=forward,TargetGroupArn="$TG_ARN" 2>/dev/null || true
  echo "  ALB listener: HTTPS:443 with origin header validation"
fi

# --- 8. ECS Service (private subnets) ---
echo "[8/10] ECS service..."

IFS=',' read -ra PRIV_SUBS <<< "$PRIVATE_SUBNET_IDS"

aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ORCH_SERVICE" --region "$AWS_REGION" \
  --query 'services[0].status' --output text 2>/dev/null | grep -q ACTIVE || \
  aws ecs create-service --cluster "$ECS_CLUSTER" --service-name "$ORCH_SERVICE" \
    --task-definition "$ORCH_TASK_FAMILY" --desired-count 1 --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[${PRIVATE_SUBNET_IDS}],securityGroups=[$ORCH_SG],assignPublicIp=DISABLED}" \
    --load-balancers "targetGroupArn=$TG_ARN,containerName=orchestrator,containerPort=3001" \
    --region "$AWS_REGION" > /dev/null
echo "  Service: $ORCH_SERVICE (private subnets, no public IP)"

# --- 9. CloudFront Distribution ---
echo "[9/10] CloudFront distribution..."

# Check if we already have a distribution for this domain
EXISTING_CF=$(aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items[0]=='${DOMAIN_NAME}'].Id" --output text 2>/dev/null || echo "")

if [ -z "$EXISTING_CF" ]; then
  cat > /tmp/cf-config.json <<CFEOF
{
  "CallerReference": "${STACK_NAME}-$(date +%s)",
  "Aliases": {"Quantity": 1, "Items": ["$DOMAIN_NAME"]},
  "DefaultRootObject": "",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "alb-origin",
      "DomainName": "$ALB_DNS",
      "CustomOriginConfig": {
        "HTTPPort": 80,
        "HTTPSPort": 443,
        "OriginProtocolPolicy": "https-only",
        "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]}
      },
      "CustomHeaders": {
        "Quantity": 1,
        "Items": [{
          "HeaderName": "X-Origin-Verify",
          "HeaderValue": "$ORIGIN_VERIFY_SECRET"
        }]
      }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "alb-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {"Quantity": 7, "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"], "CachedMethods": {"Quantity": 2, "Items": ["GET","HEAD"]}},
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    "OriginRequestPolicyId": "216adef6-5c7f-47e4-b989-5492eafa07d3",
    "Compress": true
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "$CERTIFICATE_ARN",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "Enabled": true,
  "Comment": "Kiro Remote ECS - $DOMAIN_NAME",
  "HttpVersion": "http2and3",
  "WebACLId": ""
}
CFEOF

  CF_RESULT=$(aws cloudfront create-distribution --distribution-config file:///tmp/cf-config.json --output json 2>&1)
  CF_ID=$(echo "$CF_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['Distribution']['Id'])" 2>/dev/null || echo "FAILED")
  CF_DOMAIN=$(echo "$CF_RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['Distribution']['DomainName'])" 2>/dev/null || echo "")

  if [ "$CF_ID" = "FAILED" ]; then
    echo "  WARNING: CloudFront creation failed. You may need to create it manually."
    echo "  Error: $CF_RESULT"
  else
    echo "  CloudFront: $CF_ID ($CF_DOMAIN)"
    echo "  CNAME $DOMAIN_NAME → $CF_DOMAIN"
  fi
else
  CF_DOMAIN=$(aws cloudfront get-distribution --id "$EXISTING_CF" --query 'Distribution.DomainName' --output text)
  echo "  CloudFront: $EXISTING_CF ($CF_DOMAIN) — already exists"
fi

# --- 10. Summary ---
echo ""
echo "============================================"
echo "  Remote Kiro ECS — Setup Complete"
echo "============================================"
echo ""
echo "Endpoint:     https://$DOMAIN_NAME"
echo "CloudFront:   ${CF_DOMAIN:-pending}"
echo "ALB:          $ALB_DNS (CloudFront-only access)"
echo "ECR:          $ECR_URI"
echo "ECS Cluster:  $ECS_CLUSTER"
echo ""
echo "Security:"
echo "  - ALB SG restricted to CloudFront prefix list"
echo "  - ALB validates X-Origin-Verify header from CloudFront"
echo "  - Orchestrator in private subnets, no public IP"
echo "  - Sub-agents only reachable from orchestrator on :8080"
echo ""
echo "DNS: Create a CNAME record:"
echo "  $DOMAIN_NAME → ${CF_DOMAIN:-<cloudfront-domain>}"
echo ""
echo "Origin verify secret (save this):"
echo "  $ORIGIN_VERIFY_SECRET"
echo ""
echo "Next steps:"
echo "  1. Build & push image:"
echo "     aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URI"
echo "     docker build -t $ECR_REPO -f Dockerfile.kiro-cli ."
echo "     docker tag $ECR_REPO:latest $ECR_URI:latest"
echo "     docker push $ECR_URI:latest"
echo ""
echo "  2. Create DNS CNAME: $DOMAIN_NAME → ${CF_DOMAIN:-<cloudfront-domain>}"
echo ""
echo "  3. Connect:"
echo "     npx tsx src/cli-client/kiro-remote.ts --server https://$DOMAIN_NAME"
echo "     # or open https://$DOMAIN_NAME in your browser"
