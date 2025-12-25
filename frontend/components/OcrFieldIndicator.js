/**
 * OcrFieldIndicator Component
 *
 * Display individual extracted fields with confidence indicators.
 * Shows visual feedback for high/medium/low confidence scores.
 *
 * @author Construction Expense Tracking System
 * @version 1.0.0
 */

class OcrFieldIndicator {
  /**
   * @typedef {Object} FieldIndicatorOptions
   * @property {string} label - Field label (e.g., "סכום", "תאריך")
   * @property {string|number|null} value - Field value
   * @property {number} confidence - Confidence score (0-100)
   * @property {boolean} [lowConfidence=false] - Whether field is flagged as low confidence
   */

  /**
   * Confidence thresholds
   */
  static CONFIDENCE_HIGH = 90;
  static CONFIDENCE_MEDIUM = 80;

  /**
   * Get confidence class based on score
   * @param {number} confidence - Confidence score (0-100)
   * @returns {string} - 'high', 'medium', or 'low'
   */
  static getConfidenceClass(confidence) {
    if (confidence >= OcrFieldIndicator.CONFIDENCE_HIGH) {
      return 'high';
    } else if (confidence >= OcrFieldIndicator.CONFIDENCE_MEDIUM) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Get confidence icon based on score
   * @param {number} confidence - Confidence score (0-100)
   * @returns {string} - FontAwesome icon class
   */
  static getConfidenceIcon(confidence) {
    if (confidence >= OcrFieldIndicator.CONFIDENCE_HIGH) {
      return 'fa-check-circle'; // Green checkmark
    } else if (confidence >= OcrFieldIndicator.CONFIDENCE_MEDIUM) {
      return 'fa-exclamation-triangle'; // Yellow warning
    } else {
      return 'fa-exclamation-circle'; // Red exclamation
    }
  }

  /**
   * Get confidence color based on score
   * @param {number} confidence - Confidence score (0-100)
   * @returns {string} - CSS color value
   */
  static getConfidenceColor(confidence) {
    if (confidence >= OcrFieldIndicator.CONFIDENCE_HIGH) {
      return '#10b981'; // Green
    } else if (confidence >= OcrFieldIndicator.CONFIDENCE_MEDIUM) {
      return '#f59e0b'; // Yellow/Orange
    } else {
      return '#ef4444'; // Red
    }
  }

  /**
   * Get confidence description
   * @param {number} confidence - Confidence score (0-100)
   * @returns {string} - Hebrew description
   */
  static getConfidenceDescription(confidence) {
    if (confidence >= OcrFieldIndicator.CONFIDENCE_HIGH) {
      return 'ביטחון גבוה';
    } else if (confidence >= OcrFieldIndicator.CONFIDENCE_MEDIUM) {
      return 'ביטחון בינוני - מומלץ לבדוק';
    } else {
      return 'ביטחון נמוך - יש לבדוק ידנית';
    }
  }

  /**
   * Render a field indicator
   * @param {FieldIndicatorOptions} options - Field options
   * @returns {string} - HTML string
   */
  static render({ label, value, confidence, lowConfidence = false }) {
    const displayValue = value !== null && value !== undefined && value !== ''
      ? value
      : 'לא זוהה';

    const confidenceClass = OcrFieldIndicator.getConfidenceClass(confidence);
    const confidenceIcon = OcrFieldIndicator.getConfidenceIcon(confidence);
    const confidenceColor = OcrFieldIndicator.getConfidenceColor(confidence);
    const confidenceDesc = OcrFieldIndicator.getConfidenceDescription(confidence);

    return `
      <div class="ocr-field-indicator"
           data-confidence="${confidenceClass}"
           ${lowConfidence ? 'data-low-confidence="true"' : ''}
           role="status"
           aria-label="${label}: ${displayValue}, ${confidenceDesc}">

        <div class="field-indicator-header">
          <span class="field-label">${label}</span>
          <span class="confidence-badge"
                style="color: ${confidenceColor};"
                aria-label="${Math.round(confidence)}% ביטחון">
            <i class="fas ${confidenceIcon}"></i>
          </span>
        </div>

        <div class="field-value" ${value === null || value === undefined || value === '' ? 'data-empty="true"' : ''}>
          ${displayValue}
        </div>

        <div class="field-confidence-bar">
          <div class="confidence-fill"
               style="width: ${confidence}%; background-color: ${confidenceColor};"
               aria-hidden="true">
          </div>
        </div>

        <div class="field-confidence-text">
          <span class="confidence-score">${Math.round(confidence)}%</span>
          <span class="confidence-description">${confidenceDesc}</span>
        </div>

        ${lowConfidence ? `
          <div class="field-warning">
            <i class="fas fa-exclamation-triangle"></i>
            <span>יש לבדוק שדה זה ידנית</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render multiple field indicators in a grid
   * @param {FieldIndicatorOptions[]} fields - Array of field options
   * @returns {string} - HTML string
   */
  static renderGrid(fields) {
    return `
      <div class="ocr-fields-grid" role="list">
        ${fields.map(field => `
          <div role="listitem">
            ${OcrFieldIndicator.render(field)}
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render a compact field indicator (single line)
   * @param {FieldIndicatorOptions} options - Field options
   * @returns {string} - HTML string
   */
  static renderCompact({ label, value, confidence }) {
    const displayValue = value !== null && value !== undefined && value !== ''
      ? value
      : 'לא זוהה';

    const confidenceIcon = OcrFieldIndicator.getConfidenceIcon(confidence);
    const confidenceColor = OcrFieldIndicator.getConfidenceColor(confidence);

    return `
      <div class="ocr-field-indicator-compact">
        <span class="field-label">${label}:</span>
        <span class="field-value">${displayValue}</span>
        <span class="confidence-icon" style="color: ${confidenceColor};">
          <i class="fas ${confidenceIcon}"></i>
        </span>
      </div>
    `;
  }

  /**
   * Render confidence legend (explains colors/icons)
   * @returns {string} - HTML string
   */
  static renderLegend() {
    return `
      <div class="ocr-confidence-legend">
        <h4>מקרא סימני אמון:</h4>
        <div class="legend-items">
          <div class="legend-item">
            <i class="fas fa-check-circle" style="color: #10b981;"></i>
            <span>ביטחון גבוה (90%+)</span>
          </div>
          <div class="legend-item">
            <i class="fas fa-exclamation-triangle" style="color: #f59e0b;"></i>
            <span>ביטחון בינוני (80-89%) - מומלץ לבדוק</span>
          </div>
          <div class="legend-item">
            <i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>
            <span>ביטחון נמוך (&lt;80%) - יש לבדוק ידנית</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get all low confidence fields from OCR result
   * @param {Object} ocrResult - OCR result object
   * @returns {string[]} - Array of field names with low confidence
   */
  static getLowConfidenceFields(ocrResult) {
    if (!ocrResult || !ocrResult.extractedFields || !ocrResult.extractedFields.confidence) {
      return [];
    }

    const confidence = ocrResult.extractedFields.confidence;
    return Object.entries(confidence)
      .filter(([field, score]) => score < OcrFieldIndicator.CONFIDENCE_MEDIUM)
      .map(([field]) => field);
  }

  /**
   * Format field name for display
   * @param {string} fieldName - Field name (e.g., 'amount', 'date')
   * @returns {string} - Hebrew display name
   */
  static formatFieldName(fieldName) {
    const fieldNames = {
      'amount': 'סכום',
      'date': 'תאריך',
      'invoiceNum': 'מספר חשבונית',
      'vendor': 'ספק',
      'description': 'תיאור'
    };

    return fieldNames[fieldName] || fieldName;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OcrFieldIndicator;
}

// Export to window for browser use
if (typeof window !== 'undefined') {
  window.OcrFieldIndicator = OcrFieldIndicator;
}
