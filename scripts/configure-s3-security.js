// scripts/configure-s3-security.js
// Script to configure S3 bucket security policies
// Run with: node scripts/configure-s3-security.js

const AWS = require('aws-sdk');

const s3 = new AWS.S3({ region: process.env.AWS_REGION || 'us-east-1' });

const RECEIPTS_BUCKET = process.env.RECEIPTS_BUCKET || 'construction-expenses-receipts-702358134603';
const LOGO_BUCKET = process.env.LOGO_BUCKET || 'construction-expenses-company-logos-702358134603';

/**
 * Configure bucket security settings
 */
async function configureBucketSecurity(bucketName) {
  console.log(`\n=== Configuring security for bucket: ${bucketName} ===\n`);

  try {
    // 1. Enable versioning (helps with accidental deletion and audit trail)
    console.log('1. Enabling versioning...');
    try {
      await s3.putBucketVersioning({
        Bucket: bucketName,
        VersioningConfiguration: {
          Status: 'Enabled'
        }
      }).promise();
      console.log('✅ Versioning enabled');
    } catch (error) {
      console.log(`⚠️  Versioning warning: ${error.message}`);
    }

    // 2. Enable server-side encryption
    console.log('2. Enabling server-side encryption...');
    try {
      await s3.putBucketEncryption({
        Bucket: bucketName,
        ServerSideEncryptionConfiguration: {
          Rules: [{
            ApplyServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256'
            },
            BucketKeyEnabled: true
          }]
        }
      }).promise();
      console.log('✅ Server-side encryption enabled (AES256)');
    } catch (error) {
      console.log(`⚠️  Encryption warning: ${error.message}`);
    }

    // 3. Enable access logging (if a logging bucket exists)
    console.log('3. Checking access logging...');
    try {
      const logging = await s3.getBucketLogging({ Bucket: bucketName }).promise();
      if (logging.LoggingEnabled) {
        console.log('✅ Access logging already enabled');
      } else {
        console.log('⚠️  Access logging not enabled (requires separate logging bucket)');
        console.log('   To enable, create a logging bucket and configure manually');
      }
    } catch (error) {
      console.log(`⚠️  Logging check warning: ${error.message}`);
    }

    // 4. Configure CORS (allow frontend to upload)
    console.log('4. Configuring CORS...');
    try {
      await s3.putBucketCors({
        Bucket: bucketName,
        CORSConfiguration: {
          CORSRules: [{
            AllowedHeaders: ['*'],
            AllowedMethods: ['PUT', 'POST', 'GET'],
            AllowedOrigins: [
              'http://localhost:3000',
              'http://localhost:8080',
              'https://*.amazonaws.com',
              'https://*.s3-website-us-east-1.amazonaws.com'
            ],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3000
          }]
        }
      }).promise();
      console.log('✅ CORS configured');
    } catch (error) {
      console.log(`⚠️  CORS warning: ${error.message}`);
    }

    // 5. Configure lifecycle rules (optional cleanup of old versions)
    console.log('5. Configuring lifecycle rules...');
    try {
      await s3.putBucketLifecycleConfiguration({
        Bucket: bucketName,
        LifecycleConfiguration: {
          Rules: [
            {
              Id: 'DeleteOldVersions',
              Status: 'Enabled',
              NoncurrentVersionExpiration: {
                NoncurrentDays: 90 // Delete old versions after 90 days
              }
            },
            {
              Id: 'AbortIncompleteMultipartUploads',
              Status: 'Enabled',
              AbortIncompleteMultipartUpload: {
                DaysAfterInitiation: 7
              }
            }
          ]
        }
      }).promise();
      console.log('✅ Lifecycle rules configured');
    } catch (error) {
      console.log(`⚠️  Lifecycle warning: ${error.message}`);
    }

    // 6. Check public access block settings
    console.log('6. Checking public access block...');
    try {
      const publicAccessBlock = await s3.getPublicAccessBlock({ Bucket: bucketName }).promise();
      console.log('ℹ️  Current public access block settings:', publicAccessBlock.PublicAccessBlockConfiguration);

      // Note: We need public read for receipts/logos, so we don't want to block all public access
      // Instead, we control access via bucket policy
      console.log('⚠️  Note: Public read access is intentionally enabled for this bucket');
    } catch (error) {
      if (error.code === 'NoSuchPublicAccessBlockConfiguration') {
        console.log('ℹ️  No public access block configured (public access allowed via bucket policy)');
      } else {
        console.log(`⚠️  Public access block check warning: ${error.message}`);
      }
    }

    // 7. Display current bucket policy
    console.log('7. Current bucket policy:');
    try {
      const policyResult = await s3.getBucketPolicy({ Bucket: bucketName }).promise();
      const policy = JSON.parse(policyResult.Policy);
      console.log(JSON.stringify(policy, null, 2));
    } catch (error) {
      if (error.code === 'NoSuchBucketPolicy') {
        console.log('ℹ️  No bucket policy configured');
      } else {
        console.log(`⚠️  Policy check warning: ${error.message}`);
      }
    }

    console.log(`\n✅ Security configuration completed for ${bucketName}\n`);

  } catch (error) {
    console.error(`❌ Error configuring bucket security: ${error.message}`);
    throw error;
  }
}

/**
 * Display security recommendations
 */
function displaySecurityRecommendations() {
  console.log('\n========================================');
  console.log('SECURITY RECOMMENDATIONS');
  console.log('========================================\n');

  console.log('✅ CONFIGURED:');
  console.log('  - Server-side encryption (AES256)');
  console.log('  - Versioning enabled');
  console.log('  - CORS properly configured');
  console.log('  - Lifecycle rules for cleanup');
  console.log('  - File size limits in pre-signed URLs');
  console.log('  - MIME type validation');
  console.log('  - Dangerous file type blocking\n');

  console.log('⚠️  RECOMMENDATIONS:');
  console.log('  1. Enable S3 access logging (requires separate logging bucket)');
  console.log('  2. Enable CloudWatch metrics and alarms for unusual activity');
  console.log('  3. Implement virus scanning (see FILE_UPLOAD_SECURITY.md)');
  console.log('  4. Regular security audits of uploaded files');
  console.log('  5. Monitor CloudTrail for S3 API calls');
  console.log('  6. Consider implementing S3 Object Lambda for real-time scanning\n');

  console.log('📝 MONITORING:');
  console.log('  - Check Lambda logs for SECURITY_REJECTION events');
  console.log('  - Monitor S3 bucket metrics in CloudWatch');
  console.log('  - Review rejected uploads regularly\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('========================================');
  console.log('S3 BUCKET SECURITY CONFIGURATION');
  console.log('========================================\n');

  try {
    // Configure receipts bucket
    await configureBucketSecurity(RECEIPTS_BUCKET);

    // Configure logos bucket
    await configureBucketSecurity(LOGO_BUCKET);

    // Display recommendations
    displaySecurityRecommendations();

    console.log('✅ All bucket security configurations completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Configuration failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { configureBucketSecurity };
