#!/bin/bash

# Comprehensive QA Test Script for ADD Expense Lambda
# Tests: TC-ADD-003 through TC-ADD-008

API_ENDPOINT="https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses"
JWT_TOKEN="eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDExMUFBQSIsImtpZCI6Imluc18zNUlhaHVtYjl0R0FWTjlkbnlwVzNvYUZQYmsiLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwczovL2J1aWxkZXItZXhwZW5zZXMuY29tIiwiZXhwIjoxNzY0NTE0OTI5LCJmdmEiOlswLC0xXSwiaWF0IjoxNzY0NTE0ODY5LCJpc3MiOiJodHRwczovL21vdmVkLWh1c2t5LTk4LmNsZXJrLmFjY291bnRzLmRldiIsIm5iZiI6MTc2NDUxNDg1OSwicGxhIjoidTpmcmVlX3VzZXIiLCJzaWQiOiJzZXNzXzM2Q2U4MDl4bjMyaTQ0MDVKV010YzNmRkluZiIsInN0cyI6ImFjdGl2ZSIsInN1YiI6InVzZXJfMzVJdlNyZ0l3c2kzM2NMRlVMUG9pUUhBbms5IiwidiI6Mn0.UdxFSBKsQ_Qb_1XG0Efuj1tjlvLvuQiawjKHlPN6KO_6b7vyVLeLdgpgEwKGwXKmVDjHK1v7T8D4gnGxNlZKD9ycaTuvK-qNsw5725XreQwXYmt-pUJemthplZTW-jA7EohwPTsMI2c9Kf2EqEA4hB_9Lgx7EtM07aPxozgM_Z9UArCbeF_pf-idjsLlUeu1sRiiPlwGKggdMyijZpPeS4eHv_0E1mUFByhuKXpYOBzx_r7QBmb_uWYfrTW4BHOtvpXa_2FV7XbOltsQxd0CjLjt12qv3SF723WvF0Wbc-Uppz7tsoCtkcj00Ly-l0vyb62YJO75g3dRFD1BzheqSw"
PROJECT_ID="proj_1764514539895_zs3ufd0qs"
CONTRACTOR_ID="contr_1764514557856_yx8lrwct4"

RESULTS_FILE="/Users/maordaniel/Ofek/test_results.json"
echo "[" > $RESULTS_FILE

echo "=== QA Comprehensive Testing ==="
echo "Start Time: $(date)"
echo ""

# ====================
# TC-ADD-003: Data Type Validation
# ====================
echo "=== TC-ADD-003: Data Type Validation ==="

# TC-ADD-003a: Amount as string
echo "TC-ADD-003a: Amount as invalid string"
RESPONSE=$(curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-003a\", \"amount\": \"abc\", \"paymentMethod\": \"מזומן\", \"date\": \"2025-01-15\"}" \
  -w "\n%{http_code}" -s)
echo "$RESPONSE"
echo ""
sleep 1

# TC-ADD-003b: Negative amount
echo "TC-ADD-003b: Negative amount"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-003b\", \"amount\": -1000, \"paymentMethod\": \"מזומן\", \"date\": \"2025-01-15\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

# TC-ADD-003c: Zero amount
echo "TC-ADD-003c: Zero amount"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-003c\", \"amount\": 0, \"paymentMethod\": \"מזומן\", \"date\": \"2025-01-15\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

# TC-ADD-003d: Invalid date format
echo "TC-ADD-003d: Invalid date format"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-003d\", \"amount\": 1000, \"paymentMethod\": \"מזומן\", \"date\": \"15/01/2025\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

# TC-ADD-003e: Invalid projectId (doesn't exist)
echo "TC-ADD-003e: Invalid projectId (non-existent)"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"proj_INVALID_999\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-003e\", \"amount\": 1000, \"paymentMethod\": \"מזומן\", \"date\": \"2025-01-15\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

# ====================
# TC-ADD-004: Duplicate Invoice Prevention
# ====================
echo "=== TC-ADD-004: Duplicate Invoice Prevention ==="

# TC-ADD-004a: Create first expense with unique invoice
echo "TC-ADD-004a: Create expense with invoice TC-DUP-001"
RESPONSE=$(curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-DUP-001\", \"amount\": 5000, \"paymentMethod\": \"העברה בנקאית\", \"date\": \"2025-01-20\", \"description\": \"Duplicate test - first\"}" \
  -w "\n%{http_code}" -s)
echo "$RESPONSE"
echo ""
sleep 1

# TC-ADD-004b: Try to create duplicate
echo "TC-ADD-004b: Try creating duplicate invoice TC-DUP-001"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-DUP-001\", \"amount\": 3000, \"paymentMethod\": \"מזומן\", \"date\": \"2025-01-21\", \"description\": \"Duplicate test - second (should fail)\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

# ====================
# TC-ADD-005: Hebrew Character Support
# ====================
echo "=== TC-ADD-005: Hebrew Character Support ==="

echo "TC-ADD-005: Create expense with Hebrew text"
HEBREW_RESPONSE=$(curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-HEB-001\", \"amount\": 8500, \"paymentMethod\": \"העברה בנקאית\", \"date\": \"2025-01-22\", \"description\": \"תשלום עבור עבודות שלד - קומה ראשונה\"}" \
  -w "\n%{http_code}" -s)
echo "$HEBREW_RESPONSE"
echo ""
sleep 1

# ====================
# TC-ADD-006: Payment Method Validation
# ====================
echo "=== TC-ADD-006: Payment Method Validation ==="

# Note: Based on code review, there's NO payment method validation
# The field just needs to be non-empty
echo "TC-ADD-006a: Valid payment method - העברה בנקאית"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-PAY-001\", \"amount\": 1000, \"paymentMethod\": \"העברה בנקאית\", \"date\": \"2025-01-23\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

echo "TC-ADD-006b: Valid payment method - צ'ק"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-PAY-002\", \"amount\": 1000, \"paymentMethod\": \"צ'ק\", \"date\": \"2025-01-23\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

echo "TC-ADD-006c: Invalid (custom) payment method"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-PAY-003\", \"amount\": 1000, \"paymentMethod\": \"CUSTOM_METHOD_TEST\", \"date\": \"2025-01-23\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

# ====================
# TC-ADD-007: Large Amount Handling
# ====================
echo "=== TC-ADD-007: Large Amount Handling ==="

echo "TC-ADD-007a: Large valid amount (9,999,999)"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-LARGE-001\", \"amount\": 9999999, \"paymentMethod\": \"העברה בנקאית\", \"date\": \"2025-01-24\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

echo "TC-ADD-007b: Maximum allowed amount (100,000,000)"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-MAX-001\", \"amount\": 100000000, \"paymentMethod\": \"העברה בנקאית\", \"date\": \"2025-01-24\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

echo "TC-ADD-007c: Over maximum amount (100,000,001)"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-OVER-001\", \"amount\": 100000001, \"paymentMethod\": \"העברה בנקאית\", \"date\": \"2025-01-24\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

echo "TC-ADD-007d: Small amount (0.01)"
curl -X POST "$API_ENDPOINT" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-SMALL-001\", \"amount\": 0.01, \"paymentMethod\": \"מזומן\", \"date\": \"2025-01-24\"}" \
  -w "\nHTTP Status: %{http_code}\n\n" -s
sleep 1

echo "=== All Tests Completed ==="
echo "End Time: $(date)"
