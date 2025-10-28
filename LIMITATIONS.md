# Project Limitations & Validations

This document outlines all validation rules, limitations, and constraints in the Construction Expenses Management System.

## 📋 Required Fields Validation

### **Expenses**
- ✅ **Required**: `projectId`, `contractorId`, `invoiceNum`, `amount`, `paymentMethod`, `date`
- ❌ **Error**: "Missing required fields: [field names]" if any are missing

### **Projects**
- ✅ **Required**: `name`, `startDate`
- ❌ **Error**: "Missing required fields: [field names]" if any are missing

### **Contractors**
- ✅ **Required**: `name` only
- ❌ **Error**: "Missing required fields: name" if missing

### **Works**
- ✅ **Required**: `projectId`, `contractorId`, `WorkName`, `TotalWorkCost`
- ❌ **Error**: "Missing required fields: [field names]" if any are missing

---

## 💰 Amount & Number Validations

### **Expenses**
- ✅ Amount must be **> 0** (positive number)
- ✅ Amount must be **≤ 100,000,000** (100 million limit)
- ❌ **Error**: "Amount must be a positive number" if ≤ 0
- ❌ **Error**: "Amount exceeds maximum limit (100,000,000)" if > 100M

### **Projects**
- ✅ SpentAmount must be **≥ 0** (if provided)
- ❌ **Error**: "SpentAmount must be a non-negative number" if < 0

### **Works**
- ✅ TotalWorkCost must be **> 0** (positive number)
- ❌ **Error**: "TotalWorkCost must be a positive number" if ≤ 0

---

## 📅 Date Format Validation

### **All Date Fields**
- ✅ Must be in **YYYY-MM-DD** format (e.g., "2025-10-28")
- ❌ **Error**: "Date must be in YYYY-MM-DD format" or "Start date must be in YYYY-MM-DD format"

---

## 🚫 Business Logic Constraints

### **Expense Deletion Rules**
- ❌ **Cannot delete** expenses with status `'paid'` or `'processed'`
- ✅ **Only `'pending'` expenses** can be deleted
- ❌ **Error**: "Cannot delete expense with status: [status]. Only pending expenses can be deleted."

### **Project Deletion Rules**
- ❌ **Cannot delete** projects that have associated expenses
- ✅ Must use **`?cascade=true`** to delete project and all its expenses
- ❌ **Error**: "Cannot delete project '[name]'. It has X associated expenses. Add ?cascade=true to delete project and all its expenses."

### **Contractor Deletion Rules**
- ❌ **Cannot delete** contractors that have associated expenses
- ✅ Must **delete or reassign expenses first**
- ❌ **Error**: "Cannot delete contractor '[name]'. It has X associated expenses. Delete or reassign the expenses first."

### **Work Deletion Rules**
- ❌ **Cannot delete** works that have associated expenses
- ✅ Must use **`?cascade=true`** to delete work and remove associations
- ❌ **Error**: "Cannot delete work '[name]'. It has X associated expenses. Add ?cascade=true to delete work and remove work association from expenses."

---

## 🔄 Duplicate Prevention

### **Projects**
- ❌ **Cannot create** projects with duplicate names for the same user
- ❌ **Error**: "Project with name '[name]' already exists"

### **Contractors**
- ❌ **Cannot create** contractors with duplicate names for the same user
- ❌ **Error**: Similar duplicate validation exists

---

## 🌐 Frontend HTML Constraints

### **Form Input Limits**
- ✅ **Expense amount**: `min="0"` `step="0.01"`
- ✅ **Work cost**: `min="0"` `step="0.01"`  
- ✅ **Project budget**: `min="0"` `step="1000"`
- ✅ **All mandatory fields** have `required` attributes

---

## ⚠️ Current System Limitations

### **File Uploads**
- 📝 **No size limits** enforced on receipt images or contractor signatures
- 📝 **No file type validation** beyond basic browser checks

### **Text Fields**
- 📝 **No maximum length validation** on descriptions, names, or text fields
- 📝 **No character restrictions** (special characters allowed)

### **Date Logic**
- 📝 **No validation** for future dates vs past dates
- 📝 **No business date rules** (e.g., start date vs end date logic)

### **Referential Integrity**
- ✅ **Foreign key validation** ensures projectId/contractorId exist before creating expenses/works
- ✅ **Cascade deletion** available via query parameters

---

## 🏗️ AWS Service Limits

### **Lambda Functions**
- ⏱️ **Timeout**: 30 seconds
- 💾 **Memory**: 128 MB
- 📦 **Package size**: Current packages ~13MB

### **DynamoDB**
- 📊 **No explicit query limits** set in application
- 🔍 **Scan operations** used for duplicate checking (could be optimized for large datasets)

---

## ✅ Summary

The system has robust validation for:
- **Required business fields**
- **Positive amounts with high limits** (100M for construction projects)
- **Proper date formats**
- **Data integrity protection** through business rules

The 100 million amount limit should accommodate even the largest construction projects while preventing unrealistic values.

---

*Last updated: 2025-10-28*
*System supports amounts up to ₪100,000,000 per expense*