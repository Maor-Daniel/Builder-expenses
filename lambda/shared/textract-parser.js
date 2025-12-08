// lambda/shared/textract-parser.js
// Parse AWS Textract AnalyzeExpense responses into structured expense data

const { parseDate } = require('./date-parser');
const { parseAmount } = require('./amount-parser');

/**
 * Parse Textract AnalyzeExpense response into structured expense data
 * @param {Object} textractResponse - Full Textract API response
 * @returns {Object} { fields, confidence, lineItems }
 */
function parseExpenseDocument(textractResponse) {
  const expenseDocuments = textractResponse.ExpenseDocuments || [];

  if (expenseDocuments.length === 0) {
    return {
      fields: {},
      confidence: {},
      lineItems: []
    };
  }

  // Use first document (most receipts are single page)
  const expenseDoc = expenseDocuments[0];

  // Extract all components
  const fields = extractSummaryFields(expenseDoc);
  const confidence = extractConfidenceScores(expenseDoc);
  const lineItems = extractLineItems(expenseDoc);

  return { fields, confidence, lineItems };
}

/**
 * Extract summary fields from Textract expense document
 * @param {Object} expenseDoc - Single ExpenseDocument from Textract response
 * @returns {Object} Extracted fields (amount, date, vendor, invoiceNum, etc.)
 */
function extractSummaryFields(expenseDoc) {
  const fields = {};
  const summaryFields = expenseDoc.SummaryFields || [];

  for (const field of summaryFields) {
    const type = field.Type?.Text;
    const value = field.ValueDetection?.Text;

    if (!type || !value) continue;

    // Map Textract field types to our expense fields
    switch (type) {
      case 'TOTAL':
      case 'AMOUNT_PAID':
      case 'AMOUNT':
        if (!fields.amount) { // Use first match only
          const parsed = parseAmount(value);
          if (parsed !== null) {
            fields.amount = parsed;
          }
        }
        break;

      case 'INVOICE_RECEIPT_DATE':
      case 'DATE':
        if (!fields.date) {
          const parsed = parseDate(value);
          if (parsed !== null) {
            fields.date = parsed;
          }
        }
        break;

      case 'INVOICE_RECEIPT_ID':
      case 'INVOICE_ID':
      case 'RECEIPT_ID':
        if (!fields.invoiceNum) {
          fields.invoiceNum = value.trim();
        }
        break;

      case 'VENDOR_NAME':
      case 'VENDOR':
      case 'MERCHANT_NAME':
        if (!fields.vendor) {
          fields.vendor = value.trim();
        }
        break;

      case 'SUBTOTAL':
        if (!fields.subtotal) {
          const parsed = parseAmount(value);
          if (parsed !== null) {
            fields.subtotal = parsed;
          }
        }
        break;

      case 'TAX':
        if (!fields.tax) {
          const parsed = parseAmount(value);
          if (parsed !== null) {
            fields.tax = parsed;
          }
        }
        break;

      case 'PAYMENT_TERMS':
        if (!fields.paymentTerms) {
          fields.paymentTerms = value.trim();
        }
        break;

      case 'DUE_DATE':
        if (!fields.dueDate) {
          const parsed = parseDate(value);
          if (parsed !== null) {
            fields.dueDate = parsed;
          }
        }
        break;
    }
  }

  return fields;
}

/**
 * Extract line items from Textract expense document
 * @param {Object} expenseDoc - Single ExpenseDocument from Textract response
 * @returns {Array<Object>} Array of line items with description, price, quantity
 */
function extractLineItems(expenseDoc) {
  const lineItems = [];
  const lineItemGroups = expenseDoc.LineItemGroups || [];

  for (const group of lineItemGroups) {
    const items = group.LineItems || [];

    for (const item of items) {
      const fields = item.LineItemExpenseFields || [];
      const lineItem = {};

      // Extract fields from this line item
      for (const field of fields) {
        const type = field.Type?.Text;
        const value = field.ValueDetection?.Text;

        if (!type || !value) continue;

        switch (type) {
          case 'ITEM':
          case 'DESCRIPTION':
          case 'PRODUCT_CODE':
            if (!lineItem.description) {
              lineItem.description = value.trim();
            }
            break;

          case 'PRICE':
          case 'UNIT_PRICE':
            if (!lineItem.price) {
              const parsed = parseAmount(value);
              if (parsed !== null) {
                lineItem.price = parsed;
              }
            }
            break;

          case 'QUANTITY':
          case 'QTY':
            if (!lineItem.quantity) {
              const qty = parseFloat(value.replace(/[^0-9.]/g, ''));
              if (!isNaN(qty) && qty > 0) {
                lineItem.quantity = qty;
              }
            }
            break;

          case 'EXPENSE_ROW':
            // Total for this line item
            if (!lineItem.total) {
              const parsed = parseAmount(value);
              if (parsed !== null) {
                lineItem.total = parsed;
              }
            }
            break;
        }
      }

      // Only add line items that have at least a description or price
      if (lineItem.description || lineItem.price) {
        lineItems.push(lineItem);
      }
    }
  }

  return lineItems;
}

/**
 * Extract confidence scores for each field
 * @param {Object} expenseDoc - Single ExpenseDocument from Textract response
 * @returns {Object} Confidence scores by field name (amount, date, vendor, etc.)
 */
function extractConfidenceScores(expenseDoc) {
  const confidence = {};
  const summaryFields = expenseDoc.SummaryFields || [];

  for (const field of summaryFields) {
    const type = field.Type?.Text;
    const score = field.ValueDetection?.Confidence || 0;

    if (!type) continue;

    // Map field types to confidence keys
    switch (type) {
      case 'TOTAL':
      case 'AMOUNT_PAID':
      case 'AMOUNT':
        if (!confidence.amount) {
          confidence.amount = Math.round(score);
        }
        break;

      case 'INVOICE_RECEIPT_DATE':
      case 'DATE':
        if (!confidence.date) {
          confidence.date = Math.round(score);
        }
        break;

      case 'INVOICE_RECEIPT_ID':
      case 'INVOICE_ID':
      case 'RECEIPT_ID':
        if (!confidence.invoiceNum) {
          confidence.invoiceNum = Math.round(score);
        }
        break;

      case 'VENDOR_NAME':
      case 'VENDOR':
      case 'MERCHANT_NAME':
        if (!confidence.vendor) {
          confidence.vendor = Math.round(score);
        }
        break;

      case 'SUBTOTAL':
        if (!confidence.subtotal) {
          confidence.subtotal = Math.round(score);
        }
        break;

      case 'TAX':
        if (!confidence.tax) {
          confidence.tax = Math.round(score);
        }
        break;
    }
  }

  return confidence;
}

module.exports = {
  parseExpenseDocument,
  extractSummaryFields,
  extractLineItems,
  extractConfidenceScores
};
