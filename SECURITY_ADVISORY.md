# 🚨 SECURITY ADVISORY - Hardcoded Credentials Removed

**Date:** 2026-02-01
**Severity:** HIGH
**Status:** ✅ FIXED (commit 00fc515)

## Issue Summary

Hardcoded username and password were found in commit `9d39421` in the CloudFormation template:

**File:** `infrastructure/cloudformation-hybrid.yaml`
**Lines:** 225-226
**Credentials:**
```javascript
const USERNAME = process.env.BASIC_AUTH_USERNAME || '';
const PASSWORD = process.env.BASIC_AUTH_PASSWORD || '';
```

These credentials were used in a Lambda@Edge basic authentication function.

## Fix Applied ✅

**Commit:** `00fc515` - "fix(security): Remove hardcoded credentials from CloudFormation template"

**Changes:**
1. Added CloudFormation parameters `BasicAuthUsername` and `BasicAuthPassword` (with `NoEcho: true`)
2. Updated Lambda function to use `!Sub` to inject parameters at deployment time
3. Credentials are now provided at stack deployment, not stored in source code

## Immediate Actions Required

### 1. Change Production Password (if deployed)

If the credentials `Levi/Levi2000` are currently used in production:

```bash
# Update CloudFormation stack with new credentials
aws cloudformation update-stack \
  --stack-name construction-expenses-production \
  --template-body file://infrastructure/cloudformation-hybrid.yaml \
  --parameters \
    ParameterKey=BasicAuthUsername,ParameterValue=NEW_USERNAME \
    ParameterKey=BasicAuthPassword,ParameterValue=NEW_SECURE_PASSWORD \
  --capabilities CAPABILITY_NAMED_IAM
```

### 2. Future Deployments

All future CloudFormation deployments **must** provide credentials as parameters:

```bash
aws cloudformation deploy \
  --template-file infrastructure/cloudformation-hybrid.yaml \
  --stack-name construction-expenses-production \
  --parameter-overrides \
    BasicAuthUsername=YOUR_USERNAME \
    BasicAuthPassword=YOUR_SECURE_PASSWORD \
  --capabilities CAPABILITY_NAMED_IAM
```

### 3. Verify No Other Secrets

Run a secret scan on the repository:

```bash
# Install gitleaks if not already installed
brew install gitleaks

# Scan entire repository
gitleaks detect --source . --verbose

# Scan Git history
gitleaks detect --source . --log-opts="--all" --verbose
```

## Optional: Remove from Git History

The credentials are still in Git history (commit `9d39421`). To remove them completely:

### Option 1: Using BFG Repo Cleaner (Recommended)

```bash
# Install BFG
brew install bfg

# Clone a fresh copy
git clone --mirror https://github.com/Maor-Daniel/Builder-expenses.git

# Remove the credentials
cd Builder-expenses.git
bfg --replace-text ../passwords.txt

# passwords.txt content:
# Levi2000==>***REMOVED***

# Force push (WARNING: This rewrites history)
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

### Option 2: Using git-filter-repo

```bash
# Install git-filter-repo
brew install git-filter-repo

# Clone a fresh copy
git clone https://github.com/Maor-Daniel/Builder-expenses.git
cd Builder-expenses

# Create filter file
cat > filter.txt <<EOF
literal:Levi2000==>***REMOVED***
literal:const USERNAME = process.env.BASIC_AUTH_USERNAME || '';==>// Username removed for security
literal:const PASSWORD = process.env.BASIC_AUTH_PASSWORD || '';==>// Password removed for security
EOF

# Run filter
git filter-repo --replace-text filter.txt

# Force push (WARNING: This rewrites history)
git push --force --all
```

**⚠️ WARNING:** Rewriting Git history will:
- Require all team members to re-clone the repository
- Break existing pull requests
- Change all commit hashes after the affected commit
- May break CI/CD pipelines temporarily

Only do this if the credentials are sensitive and actively used.

## Security Best Practices Going Forward

1. **Never commit secrets** - Use environment variables, parameter stores, or secrets managers
2. **Use pre-commit hooks** - Already enabled in this repo (Husky + gitleaks)
3. **Regular security scans** - Run `gitleaks` periodically
4. **Rotate credentials** - Change passwords every 90 days
5. **Use AWS Secrets Manager** - For sensitive values in production

## Related Files

- `infrastructure/cloudformation-hybrid.yaml` - Fixed in commit 00fc515
- `.husky/pre-commit` - Secret scanning enabled

## Questions?

Contact the security team or review AWS Secrets Manager documentation:
https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html
