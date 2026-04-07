#!/usr/bin/env bash
# setup-customer-profiles.sh — Create mock TrueRx patient profiles for demo
# Usage: bash setup-customer-profiles.sh

set -euo pipefail

AWSPROFILE=connect-workshop
REGION=us-east-1
DOMAIN=connect-profiles-1d871488

echo "=== TrueRx Demo: Customer Profiles Setup ==="
echo "Domain: $DOMAIN"
echo ""

create_profile() {
  local pat_id=$1 first=$2 last=$3 phone=$4 email=$5 plan=$6

  echo -n "Creating profile $pat_id ($first $last)... "

  RESULT=$(aws customer-profiles create-profile \
    --domain-name "$DOMAIN" \
    --profile "$AWSPROFILE" \
    --region "$REGION" \
    --account-number "$pat_id" \
    --first-name "$first" \
    --last-name "$last" \
    --phone-number "$phone" \
    --email-address "$email" \
    --party-type INDIVIDUAL \
    --attributes "{\"PatientId\":\"$pat_id\",\"PlanName\":\"$plan\",\"PlanType\":\"Gold\",\"MemberSince\":\"2023-01-15\",\"Copay_Generic\":\"5\",\"Copay_PreferredBrand\":\"25\",\"Copay_NonPreferred\":\"50\",\"Deductible\":\"500\",\"OOP_Max\":\"3000\"}" \
    --output json 2>&1) || true

  if echo "$RESULT" | grep -q "ProfileId"; then
    PID=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['ProfileId'])")
    echo "✓ $PID"
  else
    echo "failed: $RESULT"
  fi
}

create_profile "PAT-001" "Maria" "Santos" "+18125550101" "maria.santos@example.com" "TrueRx Gold"
create_profile "PAT-002" "James" "Wilson" "+18125550102" "james.wilson@example.com" "TrueRx Gold"
create_profile "PAT-003" "Sarah" "Chen" "+18125550103" "sarah.chen@example.com" "TrueRx Silver"

echo ""
echo "=== Verifying ==="
for PAT in PAT-001 PAT-002 PAT-003; do
  aws customer-profiles search-profiles \
    --domain-name "$DOMAIN" \
    --profile "$AWSPROFILE" \
    --region "$REGION" \
    --key-name "_account" \
    --values "$PAT" \
    --query 'Items[0].{Account:AccountNumber,Name:FirstName,Plan:Attributes.PlanName}' \
    --output text 2>&1 | sed "s/^/  /"
done

echo ""
echo "Done. View in Agent Workspace → Customer Profile Explorer."
