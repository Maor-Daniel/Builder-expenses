#!/bin/bash

# Test script for recent commits
# Run this before pushing to production

echo "🧪 Testing Recent Commits"
echo "========================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: Verify all auth pages have theme manager
echo "1️⃣  Checking dark mode implementation..."
PAGES=("login.html" "signup.html" "forgot-password.html" "reset-password.html" "verify-email.html" "pricing.html")
THEME_MANAGER_COUNT=0

for page in "${PAGES[@]}"; do
    if grep -q "theme-manager.js" "frontend/$page"; then
        echo -e "  ${GREEN}✓${NC} $page has theme-manager.js"
        ((THEME_MANAGER_COUNT++))
    else
        echo -e "  ${RED}✗${NC} $page missing theme-manager.js"
    fi
done

if [ $THEME_MANAGER_COUNT -eq 6 ]; then
    echo -e "${GREEN}✓ All 6 auth pages have dark mode${NC}"
else
    echo -e "${RED}✗ Only $THEME_MANAGER_COUNT/6 pages have dark mode${NC}"
fi
echo ""

# Check 2: Verify CORS configuration
echo "2️⃣  Checking CORS configuration..."
if grep -q "ALLOW_ALL_ORIGINS = false" "lambda/shared/cors-config.js"; then
    echo -e "${GREEN}✓ ALLOW_ALL_ORIGINS is false (secure)${NC}"
else
    echo -e "${RED}✗ ALLOW_ALL_ORIGINS is not false (SECURITY RISK)${NC}"
fi

if grep -q "isOriginAllowed(origin)" "lambda/shared/cors-config.js"; then
    echo -e "${GREEN}✓ Origin validation function exists${NC}"
else
    echo -e "${RED}✗ Origin validation missing${NC}"
fi
echo ""

# Check 3: Verify Apple IAP files exist
echo "3️⃣  Checking Apple IAP lambda functions..."
APPLE_LAMBDAS=("appleWebhook.js" "verifyApplePurchase.js" "subscriptionDetails.js" "createCustomerPortalSession.js" "paymentHistory.js")
APPLE_COUNT=0

for lambda in "${APPLE_LAMBDAS[@]}"; do
    if [ -f "lambda/$lambda" ]; then
        echo -e "  ${GREEN}✓${NC} $lambda exists"
        ((APPLE_COUNT++))
    else
        echo -e "  ${RED}✗${NC} $lambda missing"
    fi
done

if [ $APPLE_COUNT -eq 5 ]; then
    echo -e "${GREEN}✓ All 5 Apple IAP lambdas exist${NC}"
else
    echo -e "${RED}✗ Only $APPLE_COUNT/5 Apple IAP lambdas found${NC}"
fi
echo ""

# Check 4: Verify tier config pricing
echo "4️⃣  Checking tier pricing..."
if grep -q "49.99.*App Store price" "lambda/shared/tier-config.js" && \
   grep -q "99.99.*App Store price" "lambda/shared/tier-config.js" && \
   grep -q "149.99.*App Store price" "lambda/shared/tier-config.js"; then
    echo -e "${GREEN}✓ Tier pricing matches App Store (49.99, 99.99, 149.99 ILS)${NC}"
else
    echo -e "${YELLOW}⚠ Tier pricing may not match App Store${NC}"
fi
echo ""

# Check 5: Verify product ID mappings
echo "5️⃣  Checking product ID mappings..."
if grep -q "APPLE_PRODUCT_IDS" "lambda/shared/tier-config.js" && \
   grep -q "PADDLE_PRICE_IDS" "lambda/shared/tier-config.js"; then
    echo -e "${GREEN}✓ Product ID mappings exist${NC}"
else
    echo -e "${RED}✗ Product ID mappings missing${NC}"
fi
echo ""

# Check 6: Verify inviterName field change
echo "6️⃣  Checking invitation field fix..."
if grep -q "inviterName" "lambda/checkPendingInvitations.js"; then
    echo -e "${GREEN}✓ Using inviterName field (correct)${NC}"
else
    echo -e "${RED}✗ Still using old field name${NC}"
fi
echo ""

# Check 7: Verify frontend-v2 removed
echo "7️⃣  Checking codebase cleanup..."
if [ ! -d "frontend-v2" ]; then
    echo -e "${GREEN}✓ frontend-v2 directory removed${NC}"
else
    echo -e "${YELLOW}⚠ frontend-v2 directory still exists${NC}"
fi
echo ""

# Summary
echo "========================="
echo "📊 Test Summary"
echo "========================="
echo ""
echo "Next steps:"
echo "1. ${YELLOW}Start local server:${NC} cd frontend && python3 -m http.server 8000"
echo "2. ${YELLOW}Test dark mode:${NC} Open http://localhost:8000/login.html"
echo "3. ${YELLOW}Test mobile app:${NC} Make API calls and verify no CORS errors"
echo "4. ${YELLOW}Check CloudWatch:${NC} Monitor for CORS_VIOLATION events"
echo "5. ${YELLOW}Test production:${NC} Verify CloudFront origin works"
echo ""
echo "When ready to push:"
echo "  git push origin main"
echo ""
