// Basic Authentication Lambda@Edge function
// This function runs at CloudFront edge locations to protect the site

'use strict';

const USERNAME = process.env.BASIC_AUTH_USERNAME || ''; // Change this
const PASSWORD = process.env.BASIC_AUTH_PASSWORD || ''; // Change this to a strong password

exports.handler = (event, context, callback) => {
    // Get the request and its headers
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // Get the Authorization header
    const authHeader = headers.authorization;
    
    // Check if authorization header exists and is valid
    if (!authHeader || authHeader.length === 0) {
        return unauthorized(callback);
    }

    // Decode the Basic auth header
    const authValue = authHeader[0].value;
    const encodedCreds = authValue.split(' ')[1];
    
    if (!encodedCreds) {
        return unauthorized(callback);
    }

    // Decode base64 credentials
    const decodedCreds = Buffer.from(encodedCreds, 'base64').toString('utf-8');
    const [username, password] = decodedCreds.split(':');

    // Validate credentials
    if (username === USERNAME && password === PASSWORD) {
        // Authentication successful, continue with request
        callback(null, request);
    } else {
        // Authentication failed
        return unauthorized(callback);
    }
};

function unauthorized(callback) {
    const response = {
        status: '401',
        statusDescription: 'Unauthorized',
        headers: {
            'www-authenticate': [{
                key: 'WWW-Authenticate',
                value: 'Basic realm="Construction Expenses Tracker"'
            }],
            'content-type': [{
                key: 'Content-Type',
                value: 'text/html; charset=UTF-8'
            }]
        },
        body: `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authentication Required</title>
            <meta charset="UTF-8">
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 100px;">
            <h1>🔒 Authentication Required</h1>
            <p>Please enter your credentials to access the Construction Expenses Tracker.</p>
            <p><em>Contact the administrator if you don't have access.</em></p>
        </body>
        </html>
        `
    };
    
    callback(null, response);
}

// Environment-based configuration for production
const config = {
    // You can set these via environment variables in production
    username: process.env.BASIC_AUTH_USERNAME || USERNAME,
    password: process.env.BASIC_AUTH_PASSWORD || PASSWORD
};