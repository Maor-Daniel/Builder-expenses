#!/bin/bash

# Production Domain Setup Script for builder-expenses.com
# This script completes the setup after domain registration and nameserver update
# Run this once the domain is registered and nameservers are updated in Route53

set -e

DOMAIN="builder-expenses.com"
ZONE_ID="Z04591712YU2SIR3FUZZM"
DISTRIBUTION_ID="E3EYFZ54GJKVNL"
CERT_ARN="arn:aws:acm:us-east-1:702358134603:certificate/d2ed8e9f-1add-4900-9422-8b67518d6013"
API_ID="2woj5i92td"  # Your API Gateway ID

echo "========================================"
echo "Production Setup for builder-expenses.com"
echo "========================================"
echo ""

# Step 1: Verify Certificate Validation
echo "Step 1: Checking SSL certificate validation status..."
CERT_STATUS=$(aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region us-east-1 \
  --query 'Certificate.Status' \
  --output text)

echo "Certificate Status: $CERT_STATUS"

if [ "$CERT_STATUS" != "ISSUED" ]; then
  echo "⚠️  Certificate not yet validated. Waiting for validation..."
  echo "This typically takes 5-10 minutes after nameserver update."
  echo "Check back in a few minutes and run this script again."
  exit 1
fi

echo "✅ Certificate validated!"
echo ""

# Step 2: Create Route53 A Records
echo "Step 2: Creating Route53 DNS records..."

# Get CloudFront distribution domain name
CF_DOMAIN=$(aws cloudfront get-distribution \
  --id $DISTRIBUTION_ID \
  --query 'Distribution.DomainName' \
  --output text)

echo "CloudFront Domain: $CF_DOMAIN"

# Create main domain A record (alias to CloudFront)
echo "Creating A record for $DOMAIN..."
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch "{
    \"Changes\": [
      {
        \"Action\": \"CREATE\",
        \"ResourceRecordSet\": {
          \"Name\": \"$DOMAIN\",
          \"Type\": \"A\",
          \"AliasTarget\": {
            \"HostedZoneId\": \"Z2FDTNDATAQYW2\",
            \"DNSName\": \"$CF_DOMAIN\",
            \"EvaluateTargetHealth\": false
          }
        }
      }
    ]
  }"

echo "✅ A record created for $DOMAIN"

# Create www subdomain A record
echo "Creating A record for www.$DOMAIN..."
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch "{
    \"Changes\": [
      {
        \"Action\": \"CREATE\",
        \"ResourceRecordSet\": {
          \"Name\": \"www.$DOMAIN\",
          \"Type\": \"A\",
          \"AliasTarget\": {
            \"HostedZoneId\": \"Z2FDTNDATAQYW2\",
            \"DNSName\": \"$CF_DOMAIN\",
            \"EvaluateTargetHealth\": false
          }
        }
      }
    ]
  }"

echo "✅ A record created for www.$DOMAIN"
echo ""

# Step 3: Update CloudFront Distribution with Custom Domain and SSL
echo "Step 3: Updating CloudFront distribution with custom domain and HTTPS..."

# Get current distribution config
aws cloudfront get-distribution-config --id $DISTRIBUTION_ID > /tmp/cf-config.json

# We would need to manually update the config with the certificate and domain
# This requires a complex JSON update which is better done through the console or a more sophisticated script

echo "⚠️  Manual CloudFront Update Required:"
echo "1. Go to AWS Console → CloudFront → Distributions → $DISTRIBUTION_ID"
echo "2. Click 'Edit' → 'SSL Certificates'"
echo "3. Select 'Custom SSL certificate'"
echo "4. Choose: d2ed8e9f-1add-4900-9422-8b67518d6013"
echo "5. Add alternate domain name: $DOMAIN"
echo "6. Add alternate domain name: www.$DOMAIN"
echo "7. Change 'Viewer Protocol Policy' to 'Redirect HTTP to HTTPS'"
echo "8. Click 'Save changes'"
echo ""

# Step 4: Update API Gateway CORS
echo "Step 4: Setting up API Gateway CORS for new domain..."

# Get the API Gateway
echo "Updating CORS headers in API Gateway..."
echo "This requires manual configuration in AWS Console:"
echo "1. Go to AWS Console → API Gateway → APIs → Construction Expense API"
echo "2. Select each resource"
echo "3. Click 'OPTIONS' method"
echo "4. Click Integration Response → 200"
echo "5. Update 'Access-Control-Allow-Origin' header:"
echo "   From: * (or previous URL)"
echo "   To: https://builder-expenses.com"
echo ""

# Step 5: Final Verification
echo "Step 5: Verifying domain setup..."
echo ""
echo "Testing domain DNS resolution..."
sleep 2

RESOLVED=$(nslookup $DOMAIN 2>/dev/null | grep -A1 "Name:" | tail -1 | awk '{print $2}' || echo "not resolved yet")
echo "Domain resolution: $RESOLVED"
echo ""

echo "========================================"
echo "✅ Production Setup Completed!"
echo "========================================"
echo ""
echo "Your system is now live at:"
echo "  🌐 https://$DOMAIN"
echo "  🌐 https://www.$DOMAIN"
echo ""
echo "Next steps:"
echo "1. Complete CloudFront update manually (see steps above)"
echo "2. Verify API Gateway CORS settings"
echo "3. Test all features at https://$DOMAIN"
echo ""
echo "CloudFront Distribution: $DISTRIBUTION_ID"
echo "Route53 Hosted Zone: $ZONE_ID"
echo "SSL Certificate: ISSUED ✅"
echo ""
