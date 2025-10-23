# 📋 Local Development Files Checklist

רשימה מלאה של קבצים נוספים לפיתוח מקומי ושינויים

---

## ✅ קבצים חדשים שיצרנו

### 📁 Root Directory

```
construction-expenses-aws/
├── .env                       ✅ משתני סביבה (יוצר ידנית)
├── .env.example              ✅ דוגמה למשתני סביבה
├── LOCAL-DEVELOPMENT.md      ✅ מדריך פיתוח מקומי
└── LOCAL-DEV-FILES.md        ✅ הקובץ הזה
```

### 📁 config/ - קבצי הגדרות

```
config/
└── local.json                ✅ הגדרות פיתוח מקומי
```

### 📁 scripts/ - סקריפטים נוספים

```
scripts/
├── deploy.js                 (כבר קיים)
├── local-server.js           ✅ שרת פיתוח מקומי
├── test-lambda-local.js      ✅ בדיקת Lambda מקומית
└── sync-config.js            ✅ סנכרון הגדרות מ-AWS
```

### 📁 package.json - Scripts מעודכן

```json
{
  "scripts": {
    "dev": "node scripts/local-server.js",
    "test:lambda": "node scripts/test-lambda-local.js",
    "sync:config": "node scripts/sync-config.js",
    "deploy:full": "npm run deploy && npm run sync:config && npm run deploy:frontend",
    "deploy:frontend": "aws s3 sync frontend/ s3://...",
    "deploy:lambda": "...",
    "logs": "aws logs tail ...",
    ...
  }
}
```

---

## 📊 סיכום הקבצים

| קובץ | נדרש | גודל | מטרה |
|------|------|------|------|
| **.env** | ✅ | 1KB | משתני סביבה מקומיים |
| **.env.example** | ✅ | 1KB | דוגמה למשתני סביבה |
| **config/local.json** | ✅ | 2KB | הגדרות JSON |
| **scripts/local-server.js** | ✅ | 2KB | שרת HTTP מקומי |
| **scripts/test-lambda-local.js** | ✅ | 4KB | בדיקות Lambda |
| **scripts/sync-config.js** | ✅ | 4KB | סנכרון מ-AWS |
| **LOCAL-DEVELOPMENT.md** | ✅ | 15KB | מדריך מפורט |
| **LOCAL-DEV-FILES.md** | ✅ | 3KB | רשימה זו |
| **package.json** (מעודכן) | ✅ | 2KB | Scripts נוספים |

---

## 🎯 מה כל קובץ עושה?

### 1. `.env` (יוצר ידנית)
משתני סביבה סודיים - **לא מעלים ל-git!**

```bash
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_XXXXXX
COGNITO_CLIENT_ID=xxxxxxxx
API_ENDPOINT=https://xxxxx.execute-api...
DYNAMODB_TABLE_NAME=construction-expenses-production
FRONTEND_S3_BUCKET=construction-expenses...
```

**איך ליצור:**
```bash
cp .env.example .env
npm run sync:config  # ימלא אוטומטית מ-AWS
```

---

### 2. `.env.example`
דוגמה בלבד, בטוח להעלות ל-git.

```bash
AWS_REGION=us-east-1
COGNITO_USER_POOL_ID=YOUR_USER_POOL_ID
COGNITO_CLIENT_ID=YOUR_CLIENT_ID
...
```

---

### 3. `config/local.json`
הגדרות בפורמט JSON לקריאה קלה בסקריפטים.

```json
{
  "aws": {
    "region": "us-east-1"
  },
  "cognito": {
    "userPoolId": "...",
    "userPoolClientId": "..."
  },
  ...
}
```

**איך להשתמש:**
```javascript
const config = require('../config/local.json');
const region = config.aws.region;
```

---

### 4. `scripts/local-server.js`
שרת HTTP פשוט לפיתוח Frontend.

**שימוש:**
```bash
npm run dev
# פותח http://localhost:3000
```

**תכונות:**
- ✅ Serves `frontend/index.html`
- ✅ SPA routing support
- ✅ Hot reload (רענן דפדפן)
- ✅ MIME types נכונים

---

### 5. `scripts/test-lambda-local.js`
מריץ Lambda functions **מקומית** ללא AWS.

**שימוש:**
```bash
# בדוק פונקציה ספציפית
npm run test:lambda getExpenses
npm run test:lambda addExpense

# או ישירות
node scripts/test-lambda-local.js getExpenses
```

**תכונות:**
- ✅ Mock events
- ✅ בדיקה מהירה
- ✅ Debug logs
- ✅ בלי לגעת ב-AWS

---

### 6. `scripts/sync-config.js`
מושך הגדרות מ-CloudFormation ומעדכן את כל הקבצים.

**שימוש:**
```bash
npm run sync:config
```

**מה זה עושה:**
1. ✅ מושך Outputs מ-CloudFormation
2. ✅ מעדכן `.env`
3. ✅ מעדכן `config/local.json`
4. ✅ מעדכן `frontend/index.html` (AWS_CONFIG)
5. ✅ מציג סיכום

---

### 7. `LOCAL-DEVELOPMENT.md`
מדריך מקיף לפיתוח מקומי.

**תוכן:**
- הקמת סביבת פיתוח
- פיתוח Frontend
- פיתוח Lambda
- בדיקות מקומיות
- Workflows
- Deployment
- טיפים ושיטות עבודה

---

### 8. `package.json` (מעודכן)

**Scripts חדשים:**

```json
{
  "dev": "שרת פיתוח מקומי",
  "test:lambda": "בדיקת Lambda מקומית",
  "sync:config": "סנכרון הגדרות",
  "deploy:full": "deployment מלא",
  "deploy:frontend": "רק frontend",
  "deploy:lambda": "רק Lambda",
  "logs": "צפייה ב-logs",
  "logs:add": "logs של addExpense",
  "stack-outputs": "הצגת outputs"
}
```

**Dependency חדש:**
```json
{
  "dependencies": {
    "dotenv": "^16.3.1"  // לטעינת .env
  }
}
```

---

## 🚀 סדר יצירה והתקנה

### שלב 1: צור קבצי הגדרות

```bash
# 1. צור תיקיית config
mkdir config

# 2. העתק את קבצי ההגדרות
# - .env.example
# - config/local.json
```

### שלב 2: העתק סקריפטים

```bash
# העתק לתיקיית scripts:
# - local-server.js
# - test-lambda-local.js
# - sync-config.js
```

### שלב 3: עדכן package.json

```bash
# 1. פתח package.json
# 2. העתק את ה-scripts החדשים
# 3. הוסף dotenv ל-dependencies
```

### שלב 4: התקן dependencies

```bash
npm install
```

### שלב 5: צור .env

```bash
# אופציה 1: ידנית
cp .env.example .env
nano .env  # ומלא את הערכים

# אופציה 2: אוטומטית
npm run sync:config
```

### שלב 6: בדוק שהכל עובד

```bash
# בדוק שרת מקומי
npm run dev

# בדוק Lambda testing
npm run test:lambda getExpenses

# בדוק sync
npm run sync:config
```

---

## 📝 מבנה סופי

```
construction-expenses-aws/
│
├── 📄 .env                    ✅ חדש! (לא ב-git)
├── 📄 .env.example           ✅ חדש!
├── 📄 .gitignore             (מעודכן)
├── 📄 package.json           ✅ מעודכן!
├── 📄 README.md
├── 📄 DEPLOYMENT-GUIDE.md
├── 📄 QUICK-START.md
├── 📄 LOCAL-DEVELOPMENT.md   ✅ חדש!
├── 📄 LOCAL-DEV-FILES.md     ✅ חדש!
│
├── 📁 config/                 ✅ חדש!
│   └── local.json            ✅ חדש!
│
├── 📁 lambda/
│   ├── getExpenses.js
│   ├── addExpense.js
│   ├── updateExpense.js
│   ├── deleteExpense.js
│   └── shared/
│       └── utils.js
│
├── 📁 infrastructure/
│   └── cloudformation-template.yaml
│
├── 📁 frontend/
│   └── index.html
│
├── 📁 scripts/
│   ├── deploy.js
│   ├── local-server.js        ✅ חדש!
│   ├── test-lambda-local.js   ✅ חדש!
│   └── sync-config.js         ✅ חדש!
│
├── 📁 dist/
└── 📁 node_modules/
```

---

## ✅ Checklist - ודא שיש לך הכל

### קבצי הגדרות
- [ ] `.env.example` קיים
- [ ] `.env` נוצר ומולא
- [ ] `config/local.json` קיים

### סקריפטים
- [ ] `scripts/local-server.js` קיים
- [ ] `scripts/test-lambda-local.js` קיים
- [ ] `scripts/sync-config.js` קיים

### package.json
- [ ] Scripts מעודכנים
- [ ] `dotenv` ב-dependencies
- [ ] `npm install` הורץ

### תיעוד
- [ ] `LOCAL-DEVELOPMENT.md` קיים
- [ ] `LOCAL-DEV-FILES.md` קיים (זה!)

### בדיקות
- [ ] `npm run dev` עובד
- [ ] `npm run test:lambda` עובד
- [ ] `npm run sync:config` עובד

---

## 🎯 Commands Quick Reference

```bash
# Setup
cp .env.example .env
npm install
npm run sync:config

# Development
npm run dev                    # שרת מקומי
npm run test:lambda getExpenses  # בדיקת Lambda

# Deployment
npm run deploy:full            # הכל
npm run deploy:frontend        # רק frontend
npm run deploy:lambda          # רק Lambda

# Monitoring
npm run logs                   # logs בזמן אמת
npm run stack-outputs          # הצגת outputs

# Configuration
npm run sync:config            # סנכרון מ-AWS
```

---

## 💡 טיפים

### טיפ 1: אחרי Deployment
```bash
# תמיד הרץ sync אחרי deployment
npm run deploy
npm run sync:config
```

### טיפ 2: לפני שינויים
```bash
# בדוק מקומית תמיד
npm run test:lambda functionName
npm run dev
```

### טיפ 3: Debugging
```bash
# הוסף console.log בשפע
# ואז צפה ב-logs
npm run logs
```

### טיפ 4: Git
```bash
# ודא ש-.env לא ב-git
git status  # לא אמור להופיע .env

# אם .env מופיע בטעות:
git rm --cached .env
echo ".env" >> .gitignore
```

---

## 🔗 קישורים למדריכים

- [LOCAL-DEVELOPMENT.md](LOCAL-DEVELOPMENT.md) - מדריך מקיף
- [DEPLOYMENT-GUIDE.md](DEPLOYMENT-GUIDE.md) - deployment מפורט
- [QUICK-START.md](QUICK-START.md) - התחלה מהירה
- [README.md](README.md) - תיעוד כללי

---

**✨ עכשיו אתה מוכן לפיתוח מקומי!**

**💡 זכור:** בדוק מקומית → Commit → Deploy → Test!