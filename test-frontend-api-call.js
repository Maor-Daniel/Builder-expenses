// Test what the frontend sends to backend
const testData = {
    company: {
        name: "Test Construction Company",
        industry: "Construction & Infrastructure", 
        description: "Leading construction company"
    },
    admin: {
        name: "Dan Cohen",
        email: "dan.test@example.com",
        password: "TestPassword123!",
        confirmPassword: "TestPassword123!",
        phone: "+972-50-1234567"
    }
};

console.log("=== FRONTEND API CALL TEST ===");
console.log("Endpoint: registerCompany");
console.log("Method: POST");
console.log("Headers: Content-Type: application/json");
console.log("Request Body:");
console.log(JSON.stringify(testData, null, 2));

console.log("\n=== WHAT LAMBDA RECEIVES ===");
const lambdaEvent = {
    httpMethod: "POST",
    headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
    },
    body: JSON.stringify(testData)
};

console.log("Event object:");
console.log(JSON.stringify(lambdaEvent, null, 2));

console.log("\n=== EXPECTED API URL ===");
console.log("Full URL: https://drn8tyjw93.execute-api.us-east-1.amazonaws.com/prod/registerCompany");

console.log("\n=== CURRENT LAMBDA PROCESSING ===");
console.log("✅ Request parsing: Working correctly");
console.log("✅ Data validation: Working correctly");  
console.log("❌ Cognito permissions: Missing AdminCreateUser permission");
console.log("❌ DynamoDB tables: Not yet created");

console.log("\n=== REQUIRED FIXES ===");
console.log("1. Add Cognito permissions to Lambda role");
console.log("2. Create company-scoped DynamoDB tables");
console.log("3. Add API Gateway endpoint for registerCompany");