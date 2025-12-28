/**
 * ReceiptUploadWithOCR Component
 *
 * A vanilla JavaScript component that handles receipt upload, OCR processing,
 * and passes extracted data to parent form. Implements v2.0 architecture where
 * receipts stay in browser memory until final submission.
 *
 * @author Construction Expense Tracking System
 * @version 2.0.0
 */

class ReceiptUploadWithOCR {
  /**
   * @typedef {Object} OcrResult
   * @property {Object} extractedFields - Extracted field values
   * @property {number|null} extractedFields.amount - Extracted amount
   * @property {string|null} extractedFields.date - Extracted date (YYYY-MM-DD)
   * @property {string|null} extractedFields.invoiceNum - Extracted invoice number
   * @property {string|null} extractedFields.vendor - Extracted vendor name
   * @property {string|null} extractedFields.description - Extracted description
   * @property {Object} extractedFields.confidence - Confidence scores (0-100)
   * @property {Object} ocrMetadata - OCR processing metadata
   * @property {number} ocrMetadata.processingTimeMs - Processing time in milliseconds
   * @property {string} ocrMetadata.documentType - Document type (RECEIPT/INVOICE)
   * @property {string} ocrMetadata.fileName - Original file name
   * @property {string[]} ocrMetadata.lowConfidenceFields - Fields with low confidence
   * @property {File} receiptFile - Original file for later upload
   * @property {string} receiptBase64 - Base64 encoded receipt for preview
   */

  /**
   * @typedef {Object} ComponentOptions
   * @property {Function} onOcrComplete - Called when OCR succeeds with OcrResult
   * @property {Function} onError - Called when OCR fails with Error
   * @property {string} companyId - Company ID from authentication context
   * @property {boolean} [disabled=false] - Disable during form submission
   * @property {string} [apiEndpoint] - OCR API endpoint URL
   */

  /**
   * Upload states
   * @enum {string}
   */
  static UploadState = {
    IDLE: 'idle',           // Waiting for file selection
    PROCESSING: 'processing', // OCR in progress
    SUCCESS: 'success',       // OCR complete
    ERROR: 'error'            // OCR failed
  };

  /**
   * Constants
   */
  static MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  static ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  static ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];

  /**
   * Create a new ReceiptUploadWithOCR component
   * @param {string} containerId - ID of the container element
   * @param {ComponentOptions} options - Component options
   */
  constructor(containerId, options) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);

    if (!this.container) {
      throw new Error(`Container element with ID '${containerId}' not found`);
    }

    // Validate required options
    if (!options.onOcrComplete || typeof options.onOcrComplete !== 'function') {
      throw new Error('onOcrComplete callback is required');
    }
    if (!options.onError || typeof options.onError !== 'function') {
      throw new Error('onError callback is required');
    }
    if (!options.companyId) {
      throw new Error('companyId is required');
    }

    this.options = {
      disabled: false,
      apiEndpoint: options.apiEndpoint || 'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses/ocr-process',
      ...options
    };

    // State
    this.state = ReceiptUploadWithOCR.UploadState.IDLE;
    this.currentFile = null;
    this.currentBase64 = null;
    this.ocrResult = null;
    this.errorMessage = null;
    this.progressPercent = 0;

    // Render initial UI
    this.render();

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Render the component UI
   */
  render() {
    this.container.innerHTML = `
      <div class="receipt-upload-ocr" data-state="${this.state}">
        ${this.renderUploadZone()}
        ${this.renderProgressBar()}
        ${this.renderPreview()}
        ${this.renderError()}
      </div>
    `;
  }

  /**
   * Render upload zone (drag-drop or click to select)
   */
  renderUploadZone() {
    if (this.state !== ReceiptUploadWithOCR.UploadState.IDLE) {
      return '';
    }

    return `
      <div class="ocr-upload-zone"
           id="${this.containerId}-drop-zone"
           role="button"
           tabindex="0"
           style="position: relative;"
           aria-label="העלה תמונת קבלה או גרור לכאן">
        <input type="file"
               id="${this.containerId}-file-input"
               accept="${ReceiptUploadWithOCR.ALLOWED_EXTENSIONS.join(',')}"
               style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; z-index: 10;"
               aria-label="בחר קובץ קבלה"
               ${this.options.disabled ? 'disabled' : ''}>

        <div class="upload-icon">
          <i class="fas fa-cloud-upload-alt"></i>
        </div>

        <div class="upload-text">
          <p class="primary-text">לחץ להעלאת קבלה או גרור לכאן</p>
          <p class="secondary-text">JPG, PNG, PDF עד 5MB</p>
          <p class="ocr-info-text">
            <i class="fas fa-magic"></i>
            זיהוי אוטומטי של סכום, תאריך, ספק ומספר חשבונית
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Render progress bar during OCR processing
   */
  renderProgressBar() {
    if (this.state !== ReceiptUploadWithOCR.UploadState.PROCESSING) {
      return '';
    }

    return `
      <div class="ocr-progress-container">
        <div class="ocr-progress-header">
          <span class="progress-icon">
            <i class="fas fa-cog fa-spin"></i>
          </span>
          <span class="progress-text">מעבד את הקבלה...</span>
        </div>

        <div class="progress-bar-wrapper">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${this.progressPercent}%"></div>
          </div>
          <div class="progress-percent">${this.progressPercent}%</div>
        </div>

        <p class="progress-subtext">
          ${this.getProgressMessage()}
        </p>
      </div>
    `;
  }

  /**
   * Render preview after successful OCR
   */
  renderPreview() {
    if (this.state !== ReceiptUploadWithOCR.UploadState.SUCCESS || !this.ocrResult) {
      return '';
    }

    const { extractedFields, ocrMetadata } = this.ocrResult;

    return `
      <div class="ocr-preview-container">
        <div class="preview-header">
          <div class="preview-success-icon">
            <i class="fas fa-check-circle"></i>
          </div>
          <h3>קבלה עובדה בהצלחה!</h3>
          <button class="clear-receipt-btn"
                  id="${this.containerId}-clear-btn"
                  aria-label="הסר קבלה">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="preview-thumbnail">
          <img src="${this.currentBase64}" alt="תצוגה מקדימה של קבלה">
          <div class="thumbnail-overlay">
            <span class="file-name">${ocrMetadata.fileName}</span>
          </div>
        </div>

        <div class="extracted-fields-summary">
          <h4>שדות שזוהו:</h4>
          <div class="fields-grid">
            ${this.renderFieldIndicator('סכום', extractedFields.amount, extractedFields.confidence?.amount)}
            ${this.renderFieldIndicator('תאריך', extractedFields.date, extractedFields.confidence?.date)}
            ${this.renderFieldIndicator('מספר חשבונית', extractedFields.invoiceNum, extractedFields.confidence?.invoiceNum)}
            ${this.renderFieldIndicator('ספק', extractedFields.vendor, extractedFields.confidence?.vendor)}
          </div>

          ${ocrMetadata.lowConfidenceFields.length > 0 ? `
            <div class="low-confidence-warning">
              <i class="fas fa-exclamation-triangle"></i>
              <span>יש לבדוק ידנית: ${ocrMetadata.lowConfidenceFields.join(', ')}</span>
            </div>
          ` : ''}
        </div>

        <div class="preview-actions">
          <button class="btn-change-receipt" id="${this.containerId}-change-btn">
            <i class="fas fa-exchange-alt"></i>
            החלף קבלה
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render individual field indicator
   */
  renderFieldIndicator(label, value, confidence) {
    const displayValue = value !== null && value !== undefined && value !== ''
      ? value
      : 'לא זוהה';

    let confidenceClass = 'low';
    let confidenceIcon = 'fa-exclamation-circle';

    if (confidence >= 90) {
      confidenceClass = 'high';
      confidenceIcon = 'fa-check-circle';
    } else if (confidence >= 80) {
      confidenceClass = 'medium';
      confidenceIcon = 'fa-exclamation-triangle';
    }

    return `
      <div class="field-indicator" data-confidence="${confidenceClass}">
        <div class="field-label">
          <span>${label}</span>
          <i class="fas ${confidenceIcon} confidence-icon"></i>
        </div>
        <div class="field-value">${displayValue}</div>
        ${confidence !== null && confidence !== undefined ? `
          <div class="field-confidence">${Math.round(confidence)}% ביטחון</div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render error state
   */
  renderError() {
    if (this.state !== ReceiptUploadWithOCR.UploadState.ERROR) {
      return '';
    }

    return `
      <div class="ocr-error-container">
        <div class="error-icon">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>שגיאה בעיבוד הקבלה</h3>
        <p class="error-message">${this.errorMessage || 'שגיאה לא ידועה'}</p>
        <div class="error-actions">
          <button class="btn-retry" id="${this.containerId}-retry-btn">
            <i class="fas fa-redo"></i>
            נסה שוב
          </button>
          <button class="btn-cancel" id="${this.containerId}-cancel-btn">
            <i class="fas fa-times"></i>
            ביטול
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Get progress message based on progress percent
   */
  getProgressMessage() {
    if (this.progressPercent < 30) {
      return 'מעלה את הקבלה...';
    } else if (this.progressPercent < 70) {
      return 'מזהה טקסט בקבלה...';
    } else {
      return 'מחלץ מידע...';
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // File input change
    this.container.addEventListener('change', (e) => {
      if (e.target.id === `${this.containerId}-file-input`) {
        this.handleFileSelect(e.target.files[0]);
      }
    });

    // Click handlers
    this.container.addEventListener('click', (e) => {
      // Skip if click is directly on file input (it handles itself)
      if (e.target.id === `${this.containerId}-file-input`) {
        return;
      }

      const dropZone = e.target.closest(`#${this.containerId}-drop-zone`);
      if (dropZone) {
        document.getElementById(`${this.containerId}-file-input`)?.click();
        return;
      }

      if (e.target.id === `${this.containerId}-clear-btn` ||
          e.target.closest(`#${this.containerId}-clear-btn`)) {
        this.clearReceipt();
        return;
      }

      if (e.target.id === `${this.containerId}-change-btn` ||
          e.target.closest(`#${this.containerId}-change-btn`)) {
        this.changeReceipt();
        return;
      }

      if (e.target.id === `${this.containerId}-retry-btn` ||
          e.target.closest(`#${this.containerId}-retry-btn`)) {
        this.retryUpload();
        return;
      }

      if (e.target.id === `${this.containerId}-cancel-btn` ||
          e.target.closest(`#${this.containerId}-cancel-btn`)) {
        this.reset();
        return;
      }
    });

    // Drag and drop
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dropZone = this.container.querySelector('.ocr-upload-zone');
      if (dropZone && this.state === ReceiptUploadWithOCR.UploadState.IDLE) {
        dropZone.classList.add('drag-over');
      }
    });

    this.container.addEventListener('dragleave', (e) => {
      const dropZone = this.container.querySelector('.ocr-upload-zone');
      if (dropZone) {
        dropZone.classList.remove('drag-over');
      }
    });

    this.container.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropZone = this.container.querySelector('.ocr-upload-zone');
      if (dropZone) {
        dropZone.classList.remove('drag-over');
      }

      if (this.state === ReceiptUploadWithOCR.UploadState.IDLE) {
        const file = e.dataTransfer?.files[0];
        if (file) {
          this.handleFileSelect(file);
        }
      }
    });

    // Keyboard accessibility
    this.container.addEventListener('keydown', (e) => {
      if (e.target.id === `${this.containerId}-drop-zone`) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          document.getElementById(`${this.containerId}-file-input`)?.click();
        }
      }
    });
  }

  /**
   * Handle file selection
   */
  async handleFileSelect(file) {
    if (!file) return;

    // Validate file type
    if (!ReceiptUploadWithOCR.ALLOWED_TYPES.includes(file.type)) {
      this.handleError(new Error(
        `סוג קובץ לא נתמך. אנא בחר קובץ מסוג: ${ReceiptUploadWithOCR.ALLOWED_EXTENSIONS.join(', ')}`
      ));
      return;
    }

    // Validate file size
    if (file.size > ReceiptUploadWithOCR.MAX_FILE_SIZE) {
      this.handleError(new Error(
        `הקובץ גדול מדי (${(file.size / 1024 / 1024).toFixed(1)}MB). גודל מקסימלי: 5MB`
      ));
      return;
    }

    this.currentFile = file;

    try {
      // Convert to base64
      this.updateState(ReceiptUploadWithOCR.UploadState.PROCESSING);
      this.updateProgress(20);

      const base64 = await this.fileToBase64(file);
      this.currentBase64 = base64;
      console.log('[ReceiptUploadWithOCR] Base64 set:', this.currentBase64 ? 'present (' + this.currentBase64.substring(0, 50) + '...)' : 'MISSING');

      this.updateProgress(40);

      // Call OCR API
      await this.processOCR(base64, file.name, file.size);

    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Convert file to base64
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result);
      };

      reader.onerror = () => {
        reject(new Error('שגיאה בקריאת הקובץ'));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Process OCR via API
   */
  async processOCR(base64, fileName, fileSize) {
    this.updateProgress(60);

    try {
      // Get authentication token using ClerkAuth wrapper
      let token = null;
      if (window.ClerkAuth && typeof window.ClerkAuth.getAuthToken === 'function') {
        token = await window.ClerkAuth.getAuthToken();
      }

      if (!token) {
        throw new Error('נדרשת אימות. אנא התחבר מחדש.');
      }

      const response = await fetch(this.options.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          receiptBase64: base64,
          fileName: fileName,
          fileSize: fileSize
        })
      });

      this.updateProgress(80);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `שגיאת שרת (${response.status})`);
      }

      const result = await response.json();

      this.updateProgress(100);

      // Construct OCR result
      console.log('[ReceiptUploadWithOCR] Constructing result with currentBase64:', this.currentBase64 ? 'present (' + this.currentBase64.substring(0, 50) + '...)' : 'MISSING');
      console.log('[ReceiptUploadWithOCR] currentFile:', this.currentFile?.name);
      this.ocrResult = {
        extractedFields: result.data.extractedFields,
        ocrMetadata: result.data.ocrMetadata,
        receiptFile: this.currentFile,
        receiptBase64: this.currentBase64
      };
      console.log('[ReceiptUploadWithOCR] ocrResult.receiptBase64:', this.ocrResult.receiptBase64 ? 'present' : 'MISSING');

      // Update to success state
      this.updateState(ReceiptUploadWithOCR.UploadState.SUCCESS);

      // Call success callback
      this.options.onOcrComplete(this.ocrResult);

    } catch (error) {
      throw new Error(`שגיאה בעיבוד OCR: ${error.message}`);
    }
  }

  /**
   * Update component state
   */
  updateState(newState) {
    this.state = newState;
    this.render();

    // Re-setup event listeners after re-render
    // Note: Event delegation is used, so we don't need to re-setup
  }

  /**
   * Update progress percent
   */
  updateProgress(percent) {
    this.progressPercent = Math.min(100, Math.max(0, percent));

    // Update progress bar if in processing state
    if (this.state === ReceiptUploadWithOCR.UploadState.PROCESSING) {
      const progressFill = this.container.querySelector('.progress-fill');
      const progressPercent = this.container.querySelector('.progress-percent');
      const progressSubtext = this.container.querySelector('.progress-subtext');

      if (progressFill) progressFill.style.width = `${this.progressPercent}%`;
      if (progressPercent) progressPercent.textContent = `${this.progressPercent}%`;
      if (progressSubtext) progressSubtext.textContent = this.getProgressMessage();
    }
  }

  /**
   * Handle error
   */
  handleError(error) {
    console.error('[ReceiptUploadWithOCR] Error:', error);
    this.errorMessage = error.message || 'שגיאה לא ידועה';
    this.updateState(ReceiptUploadWithOCR.UploadState.ERROR);
    this.options.onError(error);
  }

  /**
   * Clear current receipt
   */
  clearReceipt() {
    this.reset();
  }

  /**
   * Change receipt (same as clear, opens file selector)
   */
  changeReceipt() {
    this.reset();
  }

  /**
   * Retry upload after error
   */
  retryUpload() {
    if (this.currentFile) {
      this.handleFileSelect(this.currentFile);
    } else {
      this.reset();
    }
  }

  /**
   * Reset component to initial state
   */
  reset() {
    this.state = ReceiptUploadWithOCR.UploadState.IDLE;
    this.currentFile = null;
    this.currentBase64 = null;
    this.ocrResult = null;
    this.errorMessage = null;
    this.progressPercent = 0;
    this.render();
  }

  /**
   * Get current OCR result
   */
  getOcrResult() {
    return this.ocrResult;
  }

  /**
   * Enable/disable component
   */
  setDisabled(disabled) {
    this.options.disabled = disabled;
    const fileInput = document.getElementById(`${this.containerId}-file-input`);
    if (fileInput) {
      fileInput.disabled = disabled;
    }
  }

  /**
   * Destroy component and clean up
   */
  destroy() {
    this.container.innerHTML = '';
    this.currentFile = null;
    this.currentBase64 = null;
    this.ocrResult = null;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReceiptUploadWithOCR;
}

// Export to window for browser use
if (typeof window !== 'undefined') {
  window.ReceiptUploadWithOCR = ReceiptUploadWithOCR;
}
