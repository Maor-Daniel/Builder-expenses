// lambda/shared/amount-parser.js
// Parse currency amount strings from various formats

/**
 * Parse amount string from various currency formats
 * @param {string} amountString - Amount text from OCR
 * @returns {number|null} Parsed amount or null if invalid
 */
function parseAmount(amountString) {
  if (!amountString || typeof amountString !== 'string') {
    return null;
  }

  // Remove whitespace
  let cleaned = amountString.trim();

  // Remove currency symbols (common ones)
  // $, €, £, ₪ (shekel), ¥ (yen), ₹ (rupee), CHF, kr, etc.
  cleaned = cleaned.replace(/[$€£₪¥₹]/g, '');
  cleaned = cleaned.replace(/CHF|USD|EUR|GBP|ILS|JPY|INR/gi, '');
  cleaned = cleaned.replace(/\s+/g, ''); // Remove all whitespace

  // Handle negative amounts (expenses should be positive)
  if (cleaned.startsWith('-') || cleaned.startsWith('(')) {
    return null;
  }

  // Detect format: European (1.234,56) vs US (1,234.56)
  // Strategy: Check the last separator character and position
  const lastComma = cleaned.lastIndexOf(',');
  const lastPeriod = cleaned.lastIndexOf('.');

  let normalizedAmount;

  if (lastComma > lastPeriod) {
    // European format: 1.234,56 or 1234,56
    // But check if comma is in decimal position (last 3 chars)
    const commaPosition = cleaned.length - lastComma;
    if (commaPosition <= 3) {
      // Comma is decimal separator: 1.234,56 or 1234,56
      normalizedAmount = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Comma is thousands separator: 1,234 (no decimal)
      normalizedAmount = cleaned.replace(/,/g, '');
    }
  } else if (lastPeriod > lastComma) {
    // US format: 1,234.56 or 1234.56
    // Remove commas (thousands separator)
    normalizedAmount = cleaned.replace(/,/g, '');
  } else if (lastComma === -1 && lastPeriod === -1) {
    // No separators: just digits
    normalizedAmount = cleaned;
  } else if (lastComma === lastPeriod) {
    // Both are -1, already handled above
    normalizedAmount = cleaned;
  } else {
    // Ambiguous, try to parse as-is
    normalizedAmount = cleaned.replace(/[^0-9.]/g, '');
  }

  // Remove any remaining non-numeric characters except period
  normalizedAmount = normalizedAmount.replace(/[^0-9.]/g, '');

  // Parse to float
  const amount = parseFloat(normalizedAmount);

  // Validate result
  if (isNaN(amount)) {
    return null;
  }

  // Validate reasonable range for expense amounts
  // Minimum: 0.01 (1 cent)
  // Maximum: 100,000,000 (100 million)
  if (amount < 0.01 || amount > 100000000) {
    return null;
  }

  // Round to 2 decimal places (standard for currency)
  return Math.round(amount * 100) / 100;
}

module.exports = {
  parseAmount
};
