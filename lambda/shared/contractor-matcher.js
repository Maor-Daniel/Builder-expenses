// lambda/shared/contractor-matcher.js
// Fuzzy contractor matching using Levenshtein distance
// Matches OCR vendor names to existing contractors in database

const { debugLog } = require('./company-utils');

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Edit distance
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create matrix
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  // Initialize first column and row
  for (let i = 0; i <= len1; i++) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity score between vendor name and contractor name
 * @param {string} vendor - Vendor name from OCR
 * @param {string} contractorName - Contractor name from database
 * @returns {number} - Similarity score 0-100
 */
function calculateSimilarity(vendor, contractorName) {
  if (!vendor || !contractorName) {
    return 0;
  }

  // Normalize: trim and lowercase
  const v = vendor.trim().toLowerCase();
  const c = contractorName.trim().toLowerCase();

  // Exact match
  if (v === c) {
    return 100;
  }

  // Substring match (one contains the other)
  if (v.includes(c) || c.includes(v)) {
    const shorterLength = Math.min(v.length, c.length);
    const longerLength = Math.max(v.length, c.length);
    return Math.round((shorterLength / longerLength) * 95);
  }

  // Levenshtein-based similarity
  const distance = levenshteinDistance(v, c);
  const maxLength = Math.max(v.length, c.length);

  if (maxLength === 0) {
    return 0;
  }

  const similarity = (1 - distance / maxLength) * 100;
  return Math.max(0, Math.round(similarity));
}

/**
 * Find best matching contractor for a vendor name
 * @param {string} vendorName - Vendor name from OCR
 * @param {Array<Object>} contractors - Array of contractor objects
 * @param {number} minConfidence - Minimum confidence threshold (default: 70)
 * @returns {Object|null} - Best match { contractorId, name, confidence } or null
 */
function findBestContractorMatch(vendorName, contractors, minConfidence = 70) {
  if (!vendorName || !contractors || contractors.length === 0) {
    debugLog('Contractor matching skipped', {
      reason: !vendorName ? 'No vendor name' : 'No contractors in database',
      contractorsCount: contractors?.length || 0
    });
    return null;
  }

  let bestMatch = null;
  let highestConfidence = 0;

  debugLog('Starting contractor matching', {
    vendorName,
    contractorsCount: contractors.length,
    minConfidence
  });

  for (const contractor of contractors) {
    if (!contractor.name) {
      continue;
    }

    const confidence = calculateSimilarity(vendorName, contractor.name);

    debugLog('Contractor similarity calculated', {
      vendorName,
      contractorName: contractor.name,
      confidence
    });

    if (confidence > highestConfidence) {
      highestConfidence = confidence;
      bestMatch = {
        contractorId: contractor.contractorId,
        name: contractor.name,
        confidence: confidence
      };
    }
  }

  // Only return match if it meets minimum confidence threshold
  if (bestMatch && bestMatch.confidence >= minConfidence) {
    debugLog('Contractor match found', {
      vendorName,
      matchedContractor: bestMatch.name,
      confidence: bestMatch.confidence
    });
    return bestMatch;
  }

  debugLog('No contractor match found', {
    vendorName,
    highestConfidence,
    minConfidence,
    reason: highestConfidence < minConfidence ? 'Below threshold' : 'No candidates'
  });

  return null;
}

/**
 * Get all alternative matches above a threshold
 * Useful for showing user multiple options
 * @param {string} vendorName - Vendor name from OCR
 * @param {Array<Object>} contractors - Array of contractor objects
 * @param {number} minConfidence - Minimum confidence threshold (default: 60)
 * @param {number} maxResults - Maximum number of results (default: 3)
 * @returns {Array<Object>} - Array of matches sorted by confidence
 */
function findAlternativeMatches(vendorName, contractors, minConfidence = 60, maxResults = 3) {
  if (!vendorName || !contractors || contractors.length === 0) {
    return [];
  }

  const matches = [];

  for (const contractor of contractors) {
    if (!contractor.name) {
      continue;
    }

    const confidence = calculateSimilarity(vendorName, contractor.name);

    if (confidence >= minConfidence) {
      matches.push({
        contractorId: contractor.contractorId,
        name: contractor.name,
        confidence: confidence
      });
    }
  }

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);

  // Return top N results
  return matches.slice(0, maxResults);
}

module.exports = {
  levenshteinDistance,
  calculateSimilarity,
  findBestContractorMatch,
  findAlternativeMatches
};
