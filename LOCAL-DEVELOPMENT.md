# 💻 Local Development Guide

מדריך מפורט לפיתוח מקומי ושינויים בקוד

---

## 📋 תוכן עניינים

1. [הקמת סביבת פיתוח](#הקמת-סביבת-פיתוח)
2. [מבנה הפרויקט](#מבנה-הפרויקט)
3. [פיתוח Frontend](#פיתוח-frontend)
4. [פיתוח Lambda](#פיתוח-lambda)
5. [בדיקות מקומיות](#בדיקות-מקומיות)
6. [Deployment לאחר שינויים](#deployment-לאחר-שינויים)
7. [Workflows נפוצים](#workflows-נפוצים)
8. [טיפים ושיטות עבודה](#טיפים-ושיטות-עבודה)

---

## 🚀 הקמת סביבת פיתוח

### שלב 1: Clone/Setup הפרויקט

```bash
# אם יש repository
git clone YOUR_REPO_URL
cd construction-expenses-aws

# או אם התחלת חדש
mkdir construction-expenses-aws
cd construction-expenses-aws
```

### שלב 2: התקן Dependencies

```bash
# התקן כל הספריות הנדרשות
npm install

# התקן dotenv לניהול משתני סביבה
npm install dotenv --save
```

### שלב 3: הגדר Environment Variables

```bash
# העתק את קובץ הדוגמה
cp .env.example .env

# ערוך את .env עם הפרטים שלך
nano .env  # או עורך אחר
```

### שלב 4: סנכרן הגדרות מ-AWS (אם כבר פרוסת)

```bash
# מושך אוטומטית את כל ההגדרות מ-CloudFormation
npm run sync:config
```

זה יעדכן:
- ✅ `.env`
- ✅ `config/local.json`
- ✅ `frontend/index.html`

---

## 📁 מבנה הפרויקט

```
construction-expenses-aws/
├── 📁 lambda/                  # Lambda functions
│   ├── getExpenses.js
│   ├── addExpense.js
│   ├── updateExpense.js
│   ├── deleteExpense.js
│   └── shared/
│       └── utils.js           # פונקציות משותפות
│
├── 📁 infrastructure/          # CloudFormation
│   └── cloudformation-template.yaml
│
├── 📁 frontend/                # Frontend files
│   └── index.html
│
├── 📁 scripts/                 # כלי פיתוח
│   ├── deploy.js              # Deployment מלא
│   ├── local-server.js        # שרת פיתוח
│   ├── test-lambda-local.js   # בדיקות Lambda
│   └── sync-config.js         # סנכרון הגדרות
│
├── 📁 config/                  # קבצי הגדרות
│   └── local.json
│
├── 📁 dist/                    # Build output
│   └── *.zip
│
├── .env                        # משתני סביבה (לא ב-git!)
├── .env.example               # דוגמה למשתני סביבה
├── .gitignore
├── package.json
└── README.md
```

---

## 🎨 פיתוח Frontend

### הרצת שרת פיתוח מקומי

```bash
# הרץ שרת על http://localhost:3000
npm run dev
```

השרת יגיש את `frontend/index.html` ויתמוך ב-hot reload.

### עריכת Frontend

```bash
# פתח את הקובץ לעריכה
code frontend/index.html  # או עורך אחר
```

#### שינויים נפוצים:

**1. הוספת לוגיקה עסקית:**

```javascript
// בתוך lambda/addExpense.js
// הוסף validation מותאם אישית:

if (expense.amount > 1000000) {
  return createResponse(400, {
    error: 'Amount too large',
    message: 'סכום גבוה מדי - נדרש אישור מנהל'
  });
}
```

**2. שינוי פורמט תגובה:**

```javascript
// הוסף שדות נוספים לתגובה
return createResponse(200, {
  success: true,
  expense,
  metadata: {
    createdBy: userId,
    timestamp: getCurrentTimestamp()
  }
});
```

**3. הוספת פילטרים:**

```javascript
// ב-getExpenses.js, הוסף פילטר לפי תאריך
const startDate = queryParams.startDate;
const endDate = queryParams.endDate;

if (startDate && endDate) {
  params.FilterExpression = '#date BETWEEN :start AND :end';
  params.ExpressionAttributeNames = { '#date': 'date' };
  params.ExpressionAttributeValues = {
    ...params.ExpressionAttributeValues,
    ':start': startDate,
    ':end': endDate
  };
}
```

### בדיקת Lambda מקומית

```bash
# בדוק פונקציה ספציפית
npm run test:lambda getExpenses

# בדוק פונקציה אחרת
npm run test:lambda addExpense
```

זה ירוץ את Lambda **מקומית** עם mock data, בלי לגעת ב-AWS!

**דוגמת פלט:**

```
============================================================
Testing: getExpenses
============================================================

📥 Input Event:
{
  "httpMethod": "GET",
  "requestContext": {
    "authorizer": {
      "claims": {
        "sub": "test-user-123"
      }
    }
  }
}

⚙️  Executing Lambda...

📤 Output:
{
  "statusCode": 200,
  "body": {...}
}

⏱️  Duration: 234ms
✅ Status: 200
```

### Deployment לאחר שינויים

```bash
# אופציה 1: Deploy רק את ה-Lambda שהשתנה
cd lambda
zip -r ../dist/getExpenses.zip getExpenses.js shared/

aws lambda update-function-code \
  --function-name construction-expenses-production-get-expenses \
  --zip-file fileb://dist/getExpenses.zip

# אופציה 2: Deploy את כל ה-Lambdas
npm run deploy:lambda

# אופציה 3: Deployment מלא (כולל infrastructure)
npm run deploy
```

---

## 🧪 בדיקות מקומיות

### בדיקת Frontend

```bash
# 1. הרץ שרת מקומי
npm run dev

# 2. פתח בדפדפן
open http://localhost:3000

# 3. בדוק ב-Developer Console
# - Network tab: ראה API calls
# - Console: ראה שגיאות JavaScript
```

### בדיקת Lambda Functions

```bash
# בדוק פונקציה בודדת
npm run test:lambda getExpenses

# ערוך את mock data ב-scripts/test-lambda-local.js
# ואז הרץ שוב
```

### בדיקת API מ-Terminal

```bash
# קבל token (דרך Frontend או AWS Console)
TOKEN="your-jwt-token-here"

# בדוק GET
curl -H "Authorization: Bearer $TOKEN" \
  https://YOUR_API_ENDPOINT/expenses

# בדוק POST
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project":"Test","contractor":"Test","amount":1000}' \
  https://YOUR_API_ENDPOINT/expenses
```

### צפייה ב-Logs בזמן אמת

```bash
# Logs של Lambda ספציפי
npm run logs           # getExpenses
npm run logs:add       # addExpense
npm run logs:update    # updateExpense
npm run logs:delete    # deleteExpense

# או ידנית
aws logs tail /aws/lambda/FUNCTION_NAME --follow
```

---

## 🚢 Deployment לאחר שינויים

### תרחיש 1: שינוי רק ב-Frontend

```bash
# עדכן frontend בלבד
npm run deploy:frontend

# אם CloudFront - נקה cache
aws cloudfront create-invalidation \
  --distribution-id $(aws cloudformation describe-stacks --stack-name construction-expenses-production --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' --output text) \
  --paths "/*"
```

### תרחיש 2: שינוי ב-Lambda (לא infrastructure)

```bash
# Package וUpload Lambda ספציפי
cd lambda
zip -r ../dist/getExpenses.zip getExpenses.js shared/

aws lambda update-function-code \
  --function-name construction-expenses-production-get-expenses \
  --zip-file fileb://dist/getExpenses.zip

# או כל ה-Lambdas
npm run deploy:lambda
```

### תרחיש 3: שינוי ב-Infrastructure (CloudFormation)

```bash
# עדכן את CloudFormation template
nano infrastructure/cloudformation-template.yaml

# Deploy השינויים
npm run update-stack

# המתן להשלמה
aws cloudformation wait stack-update-complete \
  --stack-name construction-expenses-production

# סנכרן config
npm run sync:config
```

### תרחיש 4: Deployment מלא (הכל)

```bash
# Deploy הכל - Infrastructure + Lambda + Frontend
npm run deploy:full

# זה מריץ:
# 1. npm run deploy (CloudFormation + Lambda)
# 2. npm run sync:config (עדכון config files)
# 3. npm run deploy:frontend (העלאת Frontend)
```

---

## 🔄 Workflows נפוצים

### Workflow 1: הוספת Feature חדש

```bash
# 1. צור branch חדש
git checkout -b feature/new-filter

# 2. ערוך קבצים
code lambda/getExpenses.js
code frontend/index.html

# 3. בדוק מקומית
npm run test:lambda getExpenses
npm run dev

# 4. Commit
git add .
git commit -m "Add date filter feature"

# 5. Deploy לבדיקה
npm run deploy:lambda
npm run deploy:frontend

# 6. בדוק ב-production
# ...

# 7. Merge
git checkout main
git merge feature/new-filter
```

### Workflow 2: תיקון Bug

```bash
# 1. זהה את הבעיה
npm run logs  # צפה ב-logs

# 2. שחזר מקומית
npm run test:lambda getExpenses

# 3. תקן את הבעיה
code lambda/getExpenses.js

# 4. בדוק שהתיקון עובד
npm run test:lambda getExpenses

# 5. Deploy
npm run deploy:lambda

# 6. אמת שהבעיה נפתרה
npm run logs
```

### Workflow 3: עדכון עיצוב

```bash
# 1. הרץ שרת מקומי
npm run dev

# 2. פתח דפדפן + Developer Tools
open http://localhost:3000

# 3. ערוך CSS בזמן אמת בדפדפן
# (כדי לראות שינויים מיידיים)

# 4. העתק את השינויים ל-index.html
code frontend/index.html

# 5. שמור ובדוק
# רענן דפדפן

# 6. Deploy
npm run deploy:frontend
```

---

## 💡 טיפים ושיטות עבודה

### עבודה עם Environment Variables

```bash
# טען משתני סביבה בכל סקריפט
require('dotenv').config();

// גישה למשתנה
const tableName = process.env.DYNAMODB_TABLE_NAME;
```

### Debugging Lambda מקומית

הוסף console.log בשפע:

```javascript
exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  try {
    const userId = getUserIdFromEvent(event);
    console.log('User ID:', userId);
    
    const result = await dynamodb.query(params).promise();
    console.log('DynamoDB result:', result);
    
    return createResponse(200, { data: result });
  } catch (error) {
    console.error('Error:', error);
    return handleError(error);
  }
};
```

ואז צפה ב-logs:

```bash
npm run logs
```

### שמירת גרסאות

```bash
# תייג גרסאות production
git tag -a v1.0.0 -m "Version 1.0.0"
git push origin v1.0.0

# אפשר לחזור לגרסה קודמת
git checkout v1.0.0
npm run deploy
```

### גיבויים לפני שינויים גדולים

```bash
# גבה DynamoDB
aws dynamodb create-backup \
  --table-name construction-expenses-production \
  --backup-name backup-before-update-$(date +%Y%m%d)

# שמור snapshot של CloudFormation
aws cloudformation get-template \
  --stack-name construction-expenses-production \
  --query TemplateBody > backup-template-$(date +%Y%m%d).yaml
```

### בדיקת שינויים לפני Merge

```bash
# הרץ על branch ה-feature
npm run test:lambda getExpenses
npm run deploy:lambda

# בדוק ב-staging environment
# אם הכל עובד - merge
```

---

## 🐛 פתרון בעיות נפוצות

### "Module not found" ב-Lambda

```bash
# ודא ש-shared/utils.js נכלל ב-ZIP
cd lambda
zip -r ../dist/functionName.zip functionName.js shared/
```

### שינויים לא נראים אחרי deployment

```bash
# Frontend - נקה CloudFront cache
npm run deploy:frontend
aws cloudfront create-invalidation --distribution-id XXX --paths "/*"

# Lambda - ודא שהקוד עודכן
aws lambda get-function --function-name FUNCTION_NAME \
  --query 'Configuration.LastModified'
```

### Logs לא מופיעים

```bash
# ודא שיש הרשאות CloudWatch
aws logs describe-log-groups --log-group-name-prefix /aws/lambda

# הוסף console.log מפורשות
console.log('DEBUG: This should appear in logs');
```

### CORS errors

```bash
# עדכן את lambda/shared/utils.js
const createResponse = (statusCode, body) => {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',  // או הדומיין שלך
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
};

# Deploy מחדש
npm run deploy:lambda
```

---

## 📚 משאבים נוספים

### קבצי הגדרה חשובים

- `.env` - משתני סביבה (לא ב-git!)
- `config/local.json` - הגדרות פיתוח
- `package.json` - scripts ו-dependencies

### Scripts שימושיים

```bash
npm run dev              # שרת פיתוח מקומי
npm run test:lambda      # בדיקת Lambda מקומית
npm run sync:config      # סנכרון הגדרות מ-AWS
npm run deploy           # deployment מלא
npm run deploy:frontend  # רק frontend
npm run deploy:lambda    # רק Lambda
npm run logs             # צפייה ב-logs
npm run stack-outputs    # הצגת outputs
```

### AWS CLI Commands

```bash
# סטטוס stack
aws cloudformation describe-stacks --stack-name construction-expenses-production

# רשימת Lambda functions
aws lambda list-functions --query 'Functions[].FunctionName'

# קריאה מ-DynamoDB
aws dynamodb scan --table-name construction-expenses-production --max-items 5

# רשימת משתמשים ב-Cognito
aws cognito-idp list-users --user-pool-id YOUR_POOL_ID
```

---

## ✅ Checklist לפני Production

- [ ] כל הבדיקות עוברות
- [ ] Logs נקיים משגיאות
- [ ] Frontend נבדק בכל הדפדפנים
- [ ] Mobile responsive עובד
- [ ] CORS מוגדר נכון
- [ ] Environment variables מוגדרים
- [ ] Backup נוצר
- [ ] Documentation מעודכן
- [ ] Git commit + tag
- [ ] Monitoring פעיל

---

## 🚀 Quick Commands Reference

```bash
# Setup
npm install
npm run sync:config

# Development
npm run dev
npm run test:lambda getExpenses

# Deployment
npm run deploy:full
npm run deploy:frontend
npm run deploy:lambda

# Monitoring
npm run logs
npm run stack-outputs

# Maintenance
aws dynamodb create-backup --table-name XXX --backup-name backup-$(date +%Y%m%d)
```

---

**💡 זכור:** תמיד בדוק מקומית לפני deployment!

**🔒 אבטחה:** לעולם אל תשתף `.env` או credentials!

**📝 תיעוד:** עדכן README כשמוסיף features!:

**1. שינוי עיצוב/CSS:**

מצא את ה-`<style>` section ועדכן:

```css
/* דוגמה: שינוי צבע ראשי */
.btn-add {
    background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
}
```

**2. שינוי טקסטים:**

```html
<!-- עדכן כותרות, תוויות, וכו' -->
<h1>📊 מערכת מעקב הוצאות פרויקטי בניה</h1>
```

**3. הוספת שדות חדשים:**

```javascript
// בפונקציית addExpense(), הוסף שדה חדש:
const newField = document.getElementById('newField').value;

// עדכן גם את הטופס:
<input type="text" id="newField" placeholder="שדה חדש">
```

### בדיקה מקומית

```bash
# 1. שמור את השינויים
# 2. רענן דפדפן (Ctrl+R)
# 3. בדוק שהכל עובד
```

### Deployment לאחר שינויים

```bash
# העלה את Frontend המעודכן ל-S3
npm run deploy:frontend

# אם יש CloudFront, נקה את ה-cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

---

## ⚡ פיתוח Lambda Functions

### עריכת Lambda מקומית

```bash
# פתח Lambda לעריכה
code lambda/getExpenses.js
```

#### שינויים נפוצים