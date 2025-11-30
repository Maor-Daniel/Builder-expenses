#!/bin/bash

# TC-ADD-008: Concurrent Creation Test
# Test 10 simultaneous POST requests

API_ENDPOINT="https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses"
JWT_TOKEN="eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDExMUFBQSIsImtpZCI6Imluc18zNUlhaHVtYjl0R0FWTjlkbnlwVzNvYUZQYmsiLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwczovL2J1aWxkZXItZXhwZW5zZXMuY29tIiwiZXhwIjoxNzY0NTE0OTI5LCJmdmEiOlswLC0xXSwiaWF0IjoxNzY0NTE0ODY5LCJpc3MiOiJodHRwczovL21vdmVkLWh1c2t5LTk4LmNsZXJrLmFjY291bnRzLmRldiIsIm5iZiI6MTc2NDUxNDg1OSwicGxhIjoidTpmcmVlX3VzZXIiLCJzaWQiOiJzZXNzXzM2Q2U4MDl4bjMyaTQ0MDVKV010YzNmRkluZiIsInN0cyI6ImFjdGl2ZSIsInN1YiI6InVzZXJfMzVJdlNyZ0l3c2kzM2NMRlVMUG9pUUhBbms5IiwidiI6Mn0.UdxFSBKsQ_Qb_1XG0Efuj1tjlvLvuQiawjKHlPN6KO_6b7vyVLeLdgpgEwKGwXKmVDjHK1v7T8D4gnGxNlZKD9ycaTuvK-qNsw5725XreQwXYmt-pUJemthplZTW-jA7EohwPTsMI2c9Kf2EqEA4hB_9Lgx7EtM07aPxozgM_Z9UArCbeF_pf-idjsLlUeu1sRiiPlwGKggdMyijZpPeS4eHv_0E1mUFByhuKXpYOBzx_r7QBmb_uWYfrTW4BHOtvpXa_2FV7XbOltsQxd0CjLjt12qv3SF723WvF0Wbc-Uppz7tsoCtkcj00Ly-l0vyb62YJO75g3dRFD1BzheqSw"
PROJECT_ID="proj_1764514539895_zs3ufd0qs"
CONTRACTOR_ID="contr_1764514557856_yx8lrwct4"

echo "=== TC-ADD-008: Concurrent Creation Test ==="
echo "Start Time: $(date)"
echo "Sending 10 simultaneous requests..."

# Send 10 concurrent requests
for i in {1..10}; do
  (curl -X POST "$API_ENDPOINT" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"projectId\": \"$PROJECT_ID\", \"contractorId\": \"$CONTRACTOR_ID\", \"invoiceNum\": \"TC-CONCURRENT-$i\", \"amount\": $((1000 + i)), \"paymentMethod\": \"העברה בנקאית\", \"date\": \"2025-01-25\", \"description\": \"Concurrent test #$i\"}" \
    -w "\nRequest $i - HTTP Status: %{http_code} - Time: %{time_total}s\n" -s) &
done

# Wait for all background jobs to complete
wait

echo ""
echo "End Time: $(date)"
echo "=== TC-ADD-008 Completed ==="
