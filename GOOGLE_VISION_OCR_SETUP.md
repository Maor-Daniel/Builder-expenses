# Google Cloud Vision API Setup for OCR

## Why Google Vision API?

Google Cloud Vision API provides **significantly better accuracy** for:
- ✅ Hebrew text recognition
- ✅ Non-standard receipt layouts
- ✅ Handwritten text
- ✅ Mixed language documents
- ✅ Low-quality images

**Cost:** ~$1.50 per 1,000 images (much cheaper than poor accuracy!)

## Setup Steps

### 1. Create Google Cloud Project & Enable API

```bash
# Go to: https://console.cloud.google.com/
# 1. Create new project: "construction-expenses-ocr"
# 2. Enable Cloud Vision API:
#    https://console.cloud.google.com/apis/library/vision.googleapis.com
# 3. Create API Key:
#    https://console.cloud.google.com/apis/credentials
#    - Click "Create Credentials" → "API Key"
#    - Copy the API key (looks like: AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX)
```

### 2. Store API Key in AWS Secrets Manager

```bash
# Store the API key securely
aws secretsmanager create-secret \
  --name construction-expenses/google-vision-api-key \
  --description "Google Cloud Vision API key for OCR" \
  --secret-string "YOUR_GOOGLE_API_KEY_HERE" \
  --region us-east-1
```

### 3. Update Lambda IAM Role

The Lambda role needs permission to read from Secrets Manager:

```bash
aws iam put-role-policy \
  --role-name construction-expenses-multi-table-lambda-role \
  --policy-name SecretsManagerGoogleVisionAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "secretsmanager:GetSecretValue"
        ],
        "Resource": "arn:aws:secretsmanager:us-east-1:702358134603:secret:construction-expenses/google-vision-api-key-*"
      }
    ]
  }'
```

### 4. Install Dependencies

```bash
cd /Users/maordaniel/Ofek
npm install @google-cloud/vision axios --save
```

### 5. Deploy Updated Lambda

```bash
# Package and deploy
npm run package:lambda
./scripts/deploy-all-lambdas.sh
```

## API Comparison

| Feature | AWS Textract | Google Vision API |
|---------|--------------|-------------------|
| Hebrew Support | Limited | **Excellent** |
| Receipt Accuracy | Moderate | **High** |
| Handwriting | Poor | **Good** |
| Cost (per 1K) | Free tier, then $1.50 | $1.50 |
| Response Time | ~2-3s | ~1-2s |
| Setup | None (AWS native) | API key required |

## Environment Variables

Add to `.env.production`:

```bash
# OCR Configuration
OCR_PROVIDER=google-vision  # Options: google-vision, textract
GOOGLE_VISION_API_KEY_SECRET=construction-expenses/google-vision-api-key
OCR_CONFIDENCE_THRESHOLD=80
```

## Testing

Once deployed, test with a Hebrew receipt:

```bash
# The OCR endpoint will automatically use Google Vision API
# No frontend changes needed!
```

## Fallback Strategy

The implementation includes automatic fallback:
1. **Try Google Vision API first** (if API key is configured)
2. **Fall back to AWS Textract** (if Vision API fails or unavailable)

This ensures OCR always works even if there are API issues.

## Next Steps

1. ✅ Get Google Cloud API key
2. ✅ Store in AWS Secrets Manager
3. ✅ Update Lambda code (automated)
4. ✅ Deploy and test

---

**Once you provide the Google Cloud API key, I'll complete the setup automatically!**
