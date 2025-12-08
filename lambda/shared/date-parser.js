// lambda/shared/date-parser.js
// Parse date strings from various formats to ISO format (YYYY-MM-DD)

/**
 * Parse date string from various formats to ISO format (YYYY-MM-DD)
 * @param {string} dateString - Date text from OCR
 * @returns {string|null} ISO formatted date or null if invalid
 */
function parseDate(dateString) {
  if (!dateString || typeof dateString !== 'string') {
    return null;
  }

  const trimmed = dateString.trim();

  // Define date format patterns and their conversion functions
  const formats = [
    // YYYY-MM-DD (ISO format - already correct)
    {
      regex: /^(\d{4})-(\d{2})-(\d{2})$/,
      convert: (match) => {
        const year = parseInt(match[1]);
        const month = parseInt(match[2]);
        const day = parseInt(match[3]);
        return validateAndFormat(year, month, day);
      }
    },

    // MM/DD/YYYY (US format)
    {
      regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      convert: (match) => {
        const month = parseInt(match[1]);
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        return validateAndFormat(year, month, day);
      }
    },

    // DD-MM-YYYY (European with dashes)
    {
      regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
      convert: (match) => {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = parseInt(match[3]);
        return validateAndFormat(year, month, day);
      }
    },

    // DD.MM.YYYY (European with dots)
    {
      regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
      convert: (match) => {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = parseInt(match[3]);
        return validateAndFormat(year, month, day);
      }
    },

    // M/D/YY or MM/DD/YY (short format, assume 20xx)
    {
      regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
      convert: (match) => {
        const month = parseInt(match[1]);
        const day = parseInt(match[2]);
        const year = 2000 + parseInt(match[3]);
        return validateAndFormat(year, month, day);
      }
    },

    // YYYY/MM/DD (ISO with slashes)
    {
      regex: /^(\d{4})\/(\d{2})\/(\d{2})$/,
      convert: (match) => {
        const year = parseInt(match[1]);
        const month = parseInt(match[2]);
        const day = parseInt(match[3]);
        return validateAndFormat(year, month, day);
      }
    },

    // MMM DD, YYYY (e.g., "Jan 15, 2025")
    {
      regex: /^([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/,
      convert: (match) => {
        const monthName = match[1];
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        const month = parseMonthName(monthName);
        if (month === null) return null;
        return validateAndFormat(year, month, day);
      }
    },

    // DD MMM YYYY (e.g., "15 Jan 2025")
    {
      regex: /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/,
      convert: (match) => {
        const day = parseInt(match[1]);
        const monthName = match[2];
        const year = parseInt(match[3]);
        const month = parseMonthName(monthName);
        if (month === null) return null;
        return validateAndFormat(year, month, day);
      }
    }
  ];

  // Try each format pattern
  for (const { regex, convert } of formats) {
    const match = trimmed.match(regex);
    if (match) {
      try {
        const result = convert(match);
        if (result) {
          return result;
        }
      } catch (e) {
        // Continue to next format if this one fails
        continue;
      }
    }
  }

  return null;
}

/**
 * Parse month name (short form) to month number
 * @param {string} monthName - Month abbreviation (Jan, Feb, etc.)
 * @returns {number|null} Month number (1-12) or null if invalid
 */
function parseMonthName(monthName) {
  const months = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'sept': 9, 'september': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
  };

  const normalized = monthName.toLowerCase();
  return months[normalized] || null;
}

/**
 * Validate date components and format to ISO (YYYY-MM-DD)
 * @param {number} year - Year (1900-2100)
 * @param {number} month - Month (1-12)
 * @param {number} day - Day (1-31)
 * @returns {string|null} ISO formatted date or null if invalid
 */
function validateAndFormat(year, month, day) {
  // Validate ranges
  if (year < 1900 || year > 2100) {
    return null;
  }

  if (month < 1 || month > 12) {
    return null;
  }

  if (day < 1 || day > 31) {
    return null;
  }

  // Validate day is valid for the month
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Check for leap year
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  if (isLeapYear && month === 2) {
    daysInMonth[1] = 29;
  }

  if (day > daysInMonth[month - 1]) {
    return null;
  }

  // Format to ISO: YYYY-MM-DD
  const yearStr = year.toString();
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');

  return `${yearStr}-${monthStr}-${dayStr}`;
}

module.exports = {
  parseDate
};
