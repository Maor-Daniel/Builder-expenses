# 🏗️ Construction Expenses Tracker

A complete serverless construction expense management system built for AWS, featuring Hebrew language support, file attachments, digital signatures, and single-user password protection.

## 🎯 Features

### 💰 Expense Management
- Create, edit, and delete construction expenses
- Track projects, contractors, and payment details
- Upload receipt images
- Digital contractor signatures via HTML5 Canvas
- Hebrew language interface with RTL support

### 📊 Project & Contractor Management  
- Organize expenses by construction projects
- Manage contractor/supplier information
- Track project costs and timelines
- Contractor contact details and signatures

### 🔒 Security & Access
- Single-user password protection via CloudFront
- HTTP Basic Authentication at the edge
- HTTPS-only secure access
- Easy password management

### 🚀 Modern Architecture
- **100% Serverless** - AWS Lambda, DynamoDB, S3, CloudFront
- **Cost-Effective** - Pay only for what you use (~$0.05-0.15/month for single user)
- **Scalable** - Auto-scales from 1 to millions of requests
- **Global** - CloudFront edge locations worldwide

## 🛠 Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (Hebrew RTL)
- **Backend**: AWS Lambda (Node.js 18)  
- **Database**: Amazon DynamoDB
- **Storage**: Amazon S3
- **CDN**: Amazon CloudFront + Lambda@Edge
- **Authentication**: HTTP Basic Auth
- **Infrastructure**: AWS CloudFormation
- **Deployment**: Automated scripts

## 🚀 Quick Start

### Prerequisites
```bash
# Install AWS CLI and configure credentials
aws configure

# Install Node.js dependencies  
npm install
```

### Deploy to AWS
```bash
# 1. Deploy infrastructure
npm run deploy

# 2. Package and upload Lambda functions
npm run package
npm run deploy:lambda

# 3. Upload frontend
npm run deploy:frontend

# 4. Change default password (IMPORTANT!)
npm run update-password

# 5. Get your secure CloudFront URL
npm run stack-outputs
```

### Access Your Application
1. Use the **CloudFront URL** from stack outputs (NOT S3 URL)
2. Enter credentials when prompted:
   - **Default**: Username: `Levi`, Password: `Levi2000`
   - **Or your updated credentials from step 4 above**

## 📁 Project Structure

```
├── frontend/                 # HTML5 frontend application
│   └── index.html           # Complete single-page application
├── lambda/                  # AWS Lambda functions
│   ├── getExpenses.js       # Retrieve expenses
│   ├── addExpense.js        # Create expenses with files
│   ├── updateExpense.js     # Update expenses  
│   ├── deleteExpense.js     # Delete expenses
│   ├── getProjects.js       # Project management
│   ├── addProject.js        # Create projects
│   ├── getContractors.js    # Contractor management
│   ├── addContractor.js     # Create contractors
│   └── shared/              # Shared utilities
│       ├── utils.js         # Common functions
│       └── mock-db.js       # Local development database
├── scripts/                 # Deployment and management
│   ├── deploy.js            # CloudFormation deployment
│   ├── package-lambdas.js   # Lambda packaging
│   ├── upload-lambdas.js    # Lambda code uploads
│   ├── update-password.js   # Change auth password
│   └── test-lambda-local.js # Local testing
├── infrastructure/          # AWS Infrastructure as Code
│   ├── cloudformation-template.yaml  # Complete AWS stack
│   └── basic-auth-lambda.js          # Authentication function
└── docs/                    # Documentation
    ├── DEPLOYMENT-CHECKLIST.md      # Deployment guide
    └── SINGLE-USER-AUTH.md          # Authentication setup
```

## 🔧 Management Commands

### Development
```bash
npm run dev                  # Start local development server
npm run test:lambda          # Test Lambda functions locally
```

### Deployment  
```bash
npm run deploy              # Deploy CloudFormation stack
npm run package             # Package Lambda functions
npm run deploy:lambda       # Upload Lambda code
npm run deploy:frontend     # Upload frontend to S3
npm run deploy:full         # Complete deployment
```

### Security
```bash
npm run update-password     # Change authentication password
npm run stack-outputs       # Get CloudFront URL and credentials
```

### Monitoring
```bash
npm run logs               # View Lambda logs
npm run stack-status       # Check deployment status
```

## 📋 Key Files

| File | Purpose |
|------|---------|
| `frontend/index.html` | Complete single-page application |
| `lambda/*/` | 8 Lambda functions for all operations |
| `infrastructure/cloudformation-template.yaml` | AWS infrastructure definition |
| `scripts/deploy.js` | One-command deployment |
| `DEPLOYMENT-CHECKLIST.md` | Step-by-step deployment guide |
| `SINGLE-USER-AUTH.md` | Authentication documentation |

## 🔒 Security Features

- ✅ **Password Protection** - HTTP Basic Auth via Lambda@Edge
- ✅ **HTTPS Only** - All traffic encrypted via CloudFront  
- ✅ **Input Validation** - All Lambda functions validate data
- ✅ **Error Handling** - Comprehensive error management
- ✅ **CORS Protection** - Proper cross-origin headers
- ✅ **No Exposed APIs** - Authentication required for all access

## 💡 Usage Examples

### Adding an Expense
1. Navigate to "הוספת הוצאה" (Add Expense)
2. Select or create project and contractor
3. Fill expense details in Hebrew
4. Upload receipt image (optional)
5. Get contractor digital signature (optional)
6. Save expense

### Managing Projects  
1. Go to "פרויקטים" (Projects) tab
2. Click "יצירת פרויקט חדש" (Create New Project)
3. Enter project name and start date
4. View project expenses and totals

### Contractor Management
1. Visit "קבלנים/ספקים" (Contractors/Suppliers)
2. Add contractor with name and phone
3. View contractor payment history
4. Track contractor signatures

## 🌍 Localization

- **Hebrew Interface** - Complete Hebrew language support
- **RTL Layout** - Right-to-left text direction
- **Israeli Payment Methods** - Bank transfer, check, cash, credit
- **Local Date Formats** - DD/MM/YYYY format
- **Currency** - Israeli Shekel (₪) formatting

## 🆘 Support & Troubleshooting

### Common Issues
1. **Can't access site**: Use CloudFront URL, not S3 URL
2. **Password not working**: Wait 15-30 min for Lambda@Edge propagation  
3. **API errors**: Check Lambda function logs with `npm run logs`

### Getting Help
- Review `DEPLOYMENT-CHECKLIST.md` for deployment issues
- Check `SINGLE-USER-AUTH.md` for authentication problems
- Run `npm run stack-outputs` to verify deployment

## 📊 Cost Estimation

**Monthly costs for single user (minimal traffic):**
- CloudFront: ~$0.05
- Lambda: ~$0.02  
- DynamoDB: ~$0.01
- S3: ~$0.01
- **Total: ~$0.10/month** 💰

## 🎉 Ready for Production!

This system is production-ready with:
- ✅ Complete AWS serverless infrastructure
- ✅ Secure single-user authentication  
- ✅ Hebrew construction industry features
- ✅ File uploads and digital signatures
- ✅ Automated deployment scripts
- ✅ Comprehensive documentation

**Start building: `npm run deploy`** 🚀