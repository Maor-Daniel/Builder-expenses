// tests/ocr-parsing.test.js
// Comprehensive unit tests for OCR parsing utilities

const { parseDate } = require('../lambda/shared/date-parser');
const { parseAmount } = require('../lambda/shared/amount-parser');
const {
  parseExpenseDocument,
  extractSummaryFields,
  extractLineItems,
  extractConfidenceScores
} = require('../lambda/shared/textract-parser');

// ============================================
// DATE PARSER TESTS
// ============================================

describe('date-parser', () => {
  describe('US format (MM/DD/YYYY)', () => {
    test('parses valid US format', () => {
      expect(parseDate('12/15/2025')).toBe('2025-12-15');
      expect(parseDate('01/01/2024')).toBe('2024-01-01');
      expect(parseDate('06/30/2023')).toBe('2023-06-30');
    });

    test('parses single digit month/day', () => {
      expect(parseDate('1/5/2025')).toBe('2025-01-05');
      expect(parseDate('9/9/2024')).toBe('2024-09-09');
    });

    test('rejects invalid dates', () => {
      expect(parseDate('13/01/2025')).toBeNull(); // Invalid month
      expect(parseDate('02/30/2025')).toBeNull(); // Invalid day for February
      expect(parseDate('00/15/2025')).toBeNull(); // Month 0
    });
  });

  describe('European format (DD.MM.YYYY)', () => {
    test('parses valid European dot format', () => {
      expect(parseDate('15.12.2025')).toBe('2025-12-15');
      expect(parseDate('01.01.2024')).toBe('2024-01-01');
      expect(parseDate('30.06.2023')).toBe('2023-06-30');
    });

    test('parses European dash format', () => {
      expect(parseDate('15-12-2025')).toBe('2025-12-15');
      expect(parseDate('01-01-2024')).toBe('2024-01-01');
    });
  });

  describe('ISO format (YYYY-MM-DD)', () => {
    test('parses valid ISO format', () => {
      expect(parseDate('2025-12-15')).toBe('2025-12-15');
      expect(parseDate('2024-01-01')).toBe('2024-01-01');
      expect(parseDate('2023-06-30')).toBe('2023-06-30');
    });

    test('parses ISO with slashes', () => {
      expect(parseDate('2025/12/15')).toBe('2025-12-15');
    });
  });

  describe('Short format (M/D/YY)', () => {
    test('parses short format with 20xx century assumption', () => {
      expect(parseDate('12/15/25')).toBe('2025-12-15');
      expect(parseDate('1/5/24')).toBe('2024-01-05');
      expect(parseDate('06/30/23')).toBe('2023-06-30');
    });
  });

  describe('Text month format', () => {
    test('parses MMM DD, YYYY format', () => {
      expect(parseDate('Jan 15, 2025')).toBe('2025-01-15');
      expect(parseDate('Dec 31, 2024')).toBe('2024-12-31');
      expect(parseDate('Jun 30, 2023')).toBe('2023-06-30');
    });

    test('parses MMM DD YYYY format without comma', () => {
      expect(parseDate('Jan 15 2025')).toBe('2025-01-15');
      expect(parseDate('Feb 1 2024')).toBe('2024-02-01');
    });

    test('parses DD MMM YYYY format', () => {
      expect(parseDate('15 Jan 2025')).toBe('2025-01-15');
      expect(parseDate('31 Dec 2024')).toBe('2024-12-31');
      expect(parseDate('1 Jun 2023')).toBe('2023-06-01');
    });

    test('handles case insensitive month names', () => {
      expect(parseDate('JAN 15, 2025')).toBe('2025-01-15');
      expect(parseDate('jan 15, 2025')).toBe('2025-01-15');
      expect(parseDate('Jan 15, 2025')).toBe('2025-01-15');
    });

    test('rejects invalid month names', () => {
      expect(parseDate('Xyz 15, 2025')).toBeNull();
      expect(parseDate('15 Abc 2025')).toBeNull();
    });
  });

  describe('Leap year validation', () => {
    test('accepts Feb 29 on leap years', () => {
      expect(parseDate('02/29/2024')).toBe('2024-02-29'); // 2024 is leap year
      expect(parseDate('29.02.2020')).toBe('2020-02-29'); // 2020 is leap year
    });

    test('rejects Feb 29 on non-leap years', () => {
      expect(parseDate('02/29/2023')).toBeNull(); // 2023 is not leap year
      expect(parseDate('29.02.2025')).toBeNull(); // 2025 is not leap year
    });

    test('accepts Feb 28 on all years', () => {
      expect(parseDate('02/28/2023')).toBe('2023-02-28');
      expect(parseDate('02/28/2024')).toBe('2024-02-28');
    });
  });

  describe('Edge cases', () => {
    test('returns null for invalid input types', () => {
      expect(parseDate(null)).toBeNull();
      expect(parseDate(undefined)).toBeNull();
      expect(parseDate('')).toBeNull();
      expect(parseDate(123)).toBeNull();
    });

    test('returns null for malformed dates', () => {
      expect(parseDate('not a date')).toBeNull();
      expect(parseDate('12-34-5678')).toBeNull();
      expect(parseDate('abc/def/ghij')).toBeNull();
    });

    test('returns null for out of range dates', () => {
      expect(parseDate('12/15/1800')).toBeNull(); // Year too old
      expect(parseDate('12/15/2200')).toBeNull(); // Year too far in future
    });

    test('handles whitespace', () => {
      expect(parseDate('  12/15/2025  ')).toBe('2025-12-15');
      expect(parseDate(' 2025-12-15 ')).toBe('2025-12-15');
    });
  });
});

// ============================================
// AMOUNT PARSER TESTS
// ============================================

describe('amount-parser', () => {
  describe('US currency format', () => {
    test('parses US format with dollar sign', () => {
      expect(parseAmount('$1,234.56')).toBe(1234.56);
      expect(parseAmount('$100.00')).toBe(100.00);
      expect(parseAmount('$0.99')).toBe(0.99);
    });

    test('parses without currency symbol', () => {
      expect(parseAmount('1234.56')).toBe(1234.56);
      expect(parseAmount('100.50')).toBe(100.50);
      expect(parseAmount('0.01')).toBe(0.01);
    });

    test('parses with thousands separators', () => {
      expect(parseAmount('1,234,567.89')).toBe(1234567.89);
      expect(parseAmount('10,000.00')).toBe(10000.00);
    });

    test('parses without decimal places', () => {
      expect(parseAmount('$1,234')).toBe(1234);
      expect(parseAmount('100')).toBe(100);
    });
  });

  describe('European currency format', () => {
    test('parses European format with euro sign', () => {
      expect(parseAmount('€1.234,56')).toBe(1234.56);
      expect(parseAmount('€100,00')).toBe(100.00);
      expect(parseAmount('€0,99')).toBe(0.99);
    });

    test('parses European format without currency', () => {
      expect(parseAmount('1.234,56')).toBe(1234.56);
      expect(parseAmount('100,50')).toBe(100.50);
    });

    test('handles thousands separator correctly', () => {
      expect(parseAmount('1.234.567,89')).toBe(1234567.89);
    });
  });

  describe('Other currency symbols', () => {
    test('removes various currency symbols', () => {
      expect(parseAmount('£1,234.56')).toBe(1234.56); // Pound
      expect(parseAmount('₪1,234.56')).toBe(1234.56); // Shekel
      expect(parseAmount('¥1,234')).toBe(1234); // Yen
      expect(parseAmount('₹1,234.56')).toBe(1234.56); // Rupee
    });

    test('removes currency codes', () => {
      expect(parseAmount('USD 1,234.56')).toBe(1234.56);
      expect(parseAmount('EUR 1.234,56')).toBe(1234.56);
      expect(parseAmount('GBP 1,234.56')).toBe(1234.56);
      expect(parseAmount('ILS 1,234.56')).toBe(1234.56);
    });
  });

  describe('Validation', () => {
    test('rejects negative amounts', () => {
      expect(parseAmount('-50.00')).toBeNull();
      expect(parseAmount('($100.00)')).toBeNull();
    });

    test('rejects very large amounts', () => {
      expect(parseAmount('200,000,000.00')).toBeNull(); // > 100M
      expect(parseAmount('999,999,999.99')).toBeNull();
    });

    test('rejects very small amounts', () => {
      expect(parseAmount('0.005')).toBeNull(); // < 0.01
      expect(parseAmount('0.00')).toBeNull();
    });

    test('accepts amounts in valid range', () => {
      expect(parseAmount('0.01')).toBe(0.01); // Minimum
      expect(parseAmount('100,000,000')).toBe(100000000); // Maximum
      expect(parseAmount('50,000.00')).toBe(50000.00); // Typical
    });
  });

  describe('Rounding', () => {
    test('rounds to 2 decimal places', () => {
      expect(parseAmount('100.123')).toBe(100.12);
      expect(parseAmount('100.129')).toBe(100.13);
      expect(parseAmount('100.125')).toBe(100.13); // Banker's rounding
    });
  });

  describe('Edge cases', () => {
    test('returns null for invalid input types', () => {
      expect(parseAmount(null)).toBeNull();
      expect(parseAmount(undefined)).toBeNull();
      expect(parseAmount('')).toBeNull();
      expect(parseAmount(123)).toBeNull();
    });

    test('returns null for non-numeric strings', () => {
      expect(parseAmount('abc')).toBeNull();
      expect(parseAmount('not a number')).toBeNull();
      expect(parseAmount('$$$')).toBeNull();
    });

    test('handles whitespace', () => {
      expect(parseAmount('  $1,234.56  ')).toBe(1234.56);
      expect(parseAmount(' 100.50 ')).toBe(100.50);
    });

    test('handles strings with internal whitespace', () => {
      expect(parseAmount('$ 1,234.56')).toBe(1234.56);
      expect(parseAmount('USD 1 234.56')).toBe(1234.56);
    });
  });
});

// ============================================
// TEXTRACT PARSER TESTS
// ============================================

describe('textract-parser', () => {
  describe('extractSummaryFields', () => {
    test('extracts all standard fields', () => {
      const expenseDoc = {
        SummaryFields: [
          {
            Type: { Text: 'TOTAL' },
            ValueDetection: { Text: '$1,250.50', Confidence: 99 }
          },
          {
            Type: { Text: 'INVOICE_RECEIPT_DATE' },
            ValueDetection: { Text: '12/15/2025', Confidence: 95 }
          },
          {
            Type: { Text: 'VENDOR_NAME' },
            ValueDetection: { Text: 'Home Depot', Confidence: 92 }
          },
          {
            Type: { Text: 'INVOICE_RECEIPT_ID' },
            ValueDetection: { Text: 'INV-12345', Confidence: 88 }
          }
        ]
      };

      const fields = extractSummaryFields(expenseDoc);

      expect(fields.amount).toBe(1250.50);
      expect(fields.date).toBe('2025-12-15');
      expect(fields.vendor).toBe('Home Depot');
      expect(fields.invoiceNum).toBe('INV-12345');
    });

    test('handles alternative field names', () => {
      const expenseDoc = {
        SummaryFields: [
          {
            Type: { Text: 'AMOUNT' },
            ValueDetection: { Text: '$100.50', Confidence: 99 }
          },
          {
            Type: { Text: 'DATE' },
            ValueDetection: { Text: '01/01/2024', Confidence: 95 }
          },
          {
            Type: { Text: 'MERCHANT_NAME' },
            ValueDetection: { Text: 'Starbucks', Confidence: 92 }
          }
        ]
      };

      const fields = extractSummaryFields(expenseDoc);

      expect(fields.amount).toBe(100.50);
      expect(fields.date).toBe('2024-01-01');
      expect(fields.vendor).toBe('Starbucks');
    });

    test('extracts additional fields (tax, subtotal)', () => {
      const expenseDoc = {
        SummaryFields: [
          {
            Type: { Text: 'SUBTOTAL' },
            ValueDetection: { Text: '$1000.00', Confidence: 98 }
          },
          {
            Type: { Text: 'TAX' },
            ValueDetection: { Text: '$80.00', Confidence: 97 }
          }
        ]
      };

      const fields = extractSummaryFields(expenseDoc);

      expect(fields.subtotal).toBe(1000.00);
      expect(fields.tax).toBe(80.00);
    });

    test('returns empty object for missing fields', () => {
      const expenseDoc = { SummaryFields: [] };
      const fields = extractSummaryFields(expenseDoc);
      expect(fields).toEqual({});
    });

    test('skips invalid values', () => {
      const expenseDoc = {
        SummaryFields: [
          {
            Type: { Text: 'TOTAL' },
            ValueDetection: { Text: 'invalid', Confidence: 99 }
          },
          {
            Type: { Text: 'DATE' },
            ValueDetection: { Text: 'not a date', Confidence: 95 }
          }
        ]
      };

      const fields = extractSummaryFields(expenseDoc);

      expect(fields.amount).toBeUndefined();
      expect(fields.date).toBeUndefined();
    });

    test('uses first match when multiple field types exist', () => {
      const expenseDoc = {
        SummaryFields: [
          {
            Type: { Text: 'TOTAL' },
            ValueDetection: { Text: '$100.00', Confidence: 99 }
          },
          {
            Type: { Text: 'AMOUNT_PAID' },
            ValueDetection: { Text: '$200.00', Confidence: 98 }
          }
        ]
      };

      const fields = extractSummaryFields(expenseDoc);

      // Should use first match
      expect(fields.amount).toBe(100.00);
    });
  });

  describe('extractLineItems', () => {
    test('extracts line items with descriptions', () => {
      const expenseDoc = {
        LineItemGroups: [{
          LineItems: [
            {
              LineItemExpenseFields: [
                {
                  Type: { Text: 'ITEM' },
                  ValueDetection: { Text: 'Lumber 2x4', Confidence: 95 }
                },
                {
                  Type: { Text: 'PRICE' },
                  ValueDetection: { Text: '$45.00', Confidence: 98 }
                }
              ]
            },
            {
              LineItemExpenseFields: [
                {
                  Type: { Text: 'ITEM' },
                  ValueDetection: { Text: 'Nails Box', Confidence: 93 }
                },
                {
                  Type: { Text: 'PRICE' },
                  ValueDetection: { Text: '$12.50', Confidence: 97 }
                }
              ]
            }
          ]
        }]
      };

      const lineItems = extractLineItems(expenseDoc);

      expect(lineItems).toHaveLength(2);
      expect(lineItems[0].description).toBe('Lumber 2x4');
      expect(lineItems[0].price).toBe(45.00);
      expect(lineItems[1].description).toBe('Nails Box');
      expect(lineItems[1].price).toBe(12.50);
    });

    test('extracts line items with quantity', () => {
      const expenseDoc = {
        LineItemGroups: [{
          LineItems: [{
            LineItemExpenseFields: [
              {
                Type: { Text: 'ITEM' },
                ValueDetection: { Text: 'Screws', Confidence: 95 }
              },
              {
                Type: { Text: 'QUANTITY' },
                ValueDetection: { Text: '5', Confidence: 98 }
              },
              {
                Type: { Text: 'PRICE' },
                ValueDetection: { Text: '$3.50', Confidence: 97 }
              }
            ]
          }]
        }]
      };

      const lineItems = extractLineItems(expenseDoc);

      expect(lineItems[0].description).toBe('Screws');
      expect(lineItems[0].quantity).toBe(5);
      expect(lineItems[0].price).toBe(3.50);
    });

    test('returns empty array for no line items', () => {
      const expenseDoc = { LineItemGroups: [] };
      const lineItems = extractLineItems(expenseDoc);
      expect(lineItems).toEqual([]);
    });

    test('handles multiple line item groups', () => {
      const expenseDoc = {
        LineItemGroups: [
          {
            LineItems: [{
              LineItemExpenseFields: [{
                Type: { Text: 'ITEM' },
                ValueDetection: { Text: 'Item 1', Confidence: 95 }
              }]
            }]
          },
          {
            LineItems: [{
              LineItemExpenseFields: [{
                Type: { Text: 'ITEM' },
                ValueDetection: { Text: 'Item 2', Confidence: 95 }
              }]
            }]
          }
        ]
      };

      const lineItems = extractLineItems(expenseDoc);
      expect(lineItems).toHaveLength(2);
    });

    test('skips line items without description or price', () => {
      const expenseDoc = {
        LineItemGroups: [{
          LineItems: [
            {
              LineItemExpenseFields: [{
                Type: { Text: 'ITEM' },
                ValueDetection: { Text: 'Valid Item', Confidence: 95 }
              }]
            },
            {
              LineItemExpenseFields: [{
                Type: { Text: 'UNKNOWN_FIELD' },
                ValueDetection: { Text: 'Something', Confidence: 95 }
              }]
            }
          ]
        }]
      };

      const lineItems = extractLineItems(expenseDoc);
      expect(lineItems).toHaveLength(1);
      expect(lineItems[0].description).toBe('Valid Item');
    });
  });

  describe('extractConfidenceScores', () => {
    test('extracts confidence scores for all fields', () => {
      const expenseDoc = {
        SummaryFields: [
          {
            Type: { Text: 'TOTAL' },
            ValueDetection: { Text: '$100.50', Confidence: 99 }
          },
          {
            Type: { Text: 'INVOICE_RECEIPT_DATE' },
            ValueDetection: { Text: '12/15/2025', Confidence: 95 }
          },
          {
            Type: { Text: 'VENDOR_NAME' },
            ValueDetection: { Text: 'Home Depot', Confidence: 92 }
          },
          {
            Type: { Text: 'INVOICE_RECEIPT_ID' },
            ValueDetection: { Text: 'INV-123', Confidence: 88 }
          }
        ]
      };

      const confidence = extractConfidenceScores(expenseDoc);

      expect(confidence.amount).toBe(99);
      expect(confidence.date).toBe(95);
      expect(confidence.vendor).toBe(92);
      expect(confidence.invoiceNum).toBe(88);
    });

    test('rounds confidence scores', () => {
      const expenseDoc = {
        SummaryFields: [{
          Type: { Text: 'TOTAL' },
          ValueDetection: { Text: '$100.50', Confidence: 98.7 }
        }]
      };

      const confidence = extractConfidenceScores(expenseDoc);
      expect(confidence.amount).toBe(99);
    });

    test('returns empty object for no fields', () => {
      const expenseDoc = { SummaryFields: [] };
      const confidence = extractConfidenceScores(expenseDoc);
      expect(confidence).toEqual({});
    });
  });

  describe('parseExpenseDocument', () => {
    test('parses complete Textract response', () => {
      const textractResponse = {
        ExpenseDocuments: [{
          SummaryFields: [
            {
              Type: { Text: 'TOTAL' },
              ValueDetection: { Text: '$1,250.50', Confidence: 99 }
            },
            {
              Type: { Text: 'INVOICE_RECEIPT_DATE' },
              ValueDetection: { Text: '12/15/2025', Confidence: 95 }
            },
            {
              Type: { Text: 'VENDOR_NAME' },
              ValueDetection: { Text: 'Home Depot', Confidence: 92 }
            }
          ],
          LineItemGroups: [{
            LineItems: [{
              LineItemExpenseFields: [{
                Type: { Text: 'ITEM' },
                ValueDetection: { Text: 'Lumber 2x4', Confidence: 95 }
              }]
            }]
          }]
        }]
      };

      const result = parseExpenseDocument(textractResponse);

      expect(result.fields.amount).toBe(1250.50);
      expect(result.fields.date).toBe('2025-12-15');
      expect(result.fields.vendor).toBe('Home Depot');
      expect(result.confidence.amount).toBe(99);
      expect(result.lineItems).toHaveLength(1);
      expect(result.lineItems[0].description).toBe('Lumber 2x4');
    });

    test('handles empty ExpenseDocuments array', () => {
      const textractResponse = { ExpenseDocuments: [] };
      const result = parseExpenseDocument(textractResponse);

      expect(result.fields).toEqual({});
      expect(result.confidence).toEqual({});
      expect(result.lineItems).toEqual([]);
    });

    test('handles missing ExpenseDocuments', () => {
      const textractResponse = {};
      const result = parseExpenseDocument(textractResponse);

      expect(result.fields).toEqual({});
      expect(result.confidence).toEqual({});
      expect(result.lineItems).toEqual([]);
    });

    test('uses first document when multiple exist', () => {
      const textractResponse = {
        ExpenseDocuments: [
          {
            SummaryFields: [{
              Type: { Text: 'TOTAL' },
              ValueDetection: { Text: '$100.00', Confidence: 99 }
            }]
          },
          {
            SummaryFields: [{
              Type: { Text: 'TOTAL' },
              ValueDetection: { Text: '$200.00', Confidence: 99 }
            }]
          }
        ]
      };

      const result = parseExpenseDocument(textractResponse);
      // Should use first document
      expect(result.fields.amount).toBe(100.00);
    });
  });
});
