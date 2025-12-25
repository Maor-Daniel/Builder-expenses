/**
 * PDF Image Downloader Utility
 *
 * Downloads receipt images from S3 and prepares them for embedding in PDFs.
 * Features:
 * - Parallel downloads (max 5 concurrent)
 * - Progress tracking
 * - Automatic compression
 * - Graceful error handling
 * - Base64 conversion for PDF embedding
 */

/**
 * Convert Blob to Base64 string
 * @param {Blob} blob - Image blob
 * @returns {Promise<string>} Base64 data URL
 */
export const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      reject(error);
    };
    reader.readAsDataURL(blob);
  });
};

/**
 * Compress image to reduce PDF file size
 * @param {string} base64 - Base64 image data URL
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Maximum width (default: 800)
 * @param {number} options.maxHeight - Maximum height (default: 1200)
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.7)
 * @returns {Promise<string>} Compressed base64 data URL
 */
export const compressImage = (base64, options = {}) => {
  const {
    maxWidth = 800,
    maxHeight = 1200,
    quality = 0.7
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Calculate new dimensions while maintaining aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const widthRatio = maxWidth / width;
          const heightRatio = maxHeight / height;
          const ratio = Math.min(widthRatio, heightRatio);

          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');

        // Optional: Add white background (helps with transparent PNGs)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // Draw image
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG with compression
        const compressed = canvas.toDataURL('image/jpeg', quality);

        console.log(`Image compressed: ${Math.round(base64.length / 1024)}KB → ${Math.round(compressed.length / 1024)}KB`);

        resolve(compressed);
      } catch (error) {
        console.error('Image compression error:', error);
        // If compression fails, return original
        resolve(base64);
      }
    };

    img.onerror = (error) => {
      console.error('Image load error during compression:', error);
      reject(error);
    };

    img.src = base64;
  });
};

/**
 * Download a single receipt image
 * @param {Object} expense - Expense object with receiptUrl
 * @param {Object} options - Download options
 * @returns {Promise<Object>} Expense with receiptImageData added
 */
const downloadSingleReceipt = async (expense, options = {}) => {
  const { compress = true, compressionOptions = {} } = options;

  // Skip if no receipt URL
  if (!expense.receiptUrl) {
    return { ...expense, receiptImageData: null };
  }

  try {
    console.log(`Downloading receipt for expense ${expense.expenseId}...`);

    // Download image from S3 pre-signed URL
    const response = await fetch(expense.receiptUrl, {
      method: 'GET',
      headers: {
        'Accept': 'image/jpeg,image/png,image/gif,image/webp,application/pdf'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Get blob
    const blob = await response.blob();

    console.log(`Receipt downloaded: ${Math.round(blob.size / 1024)}KB (${blob.type})`);

    // Convert to base64
    let base64 = await blobToBase64(blob);

    // Compress if enabled and it's an image
    if (compress && blob.type.startsWith('image/')) {
      base64 = await compressImage(base64, compressionOptions);
    }

    return {
      ...expense,
      receiptImageData: base64,
      receiptImageSize: blob.size,
      receiptImageType: blob.type
    };

  } catch (error) {
    console.error(`Failed to download receipt for expense ${expense.expenseId}:`, error.message);

    return {
      ...expense,
      receiptImageData: null,
      receiptError: true,
      receiptErrorMessage: error.message
    };
  }
};

/**
 * Download receipts in parallel with concurrency limit
 * @param {Array} expenses - Array of expense objects
 * @param {Object} options - Download options
 * @param {number} options.concurrentLimit - Max concurrent downloads (default: 5)
 * @param {boolean} options.compress - Enable compression (default: true)
 * @param {Object} options.compressionOptions - Compression settings
 * @param {Function} options.onProgress - Progress callback (current, total)
 * @returns {Promise<Array>} Array of expenses with receiptImageData
 */
export const downloadReceiptsForPDF = async (expenses, options = {}) => {
  const {
    concurrentLimit = 5,
    compress = true,
    compressionOptions = {},
    onProgress = null
  } = options;

  console.log(`Starting parallel receipt downloads for ${expenses.length} expenses...`);
  console.log(`Settings: concurrentLimit=${concurrentLimit}, compress=${compress}`);

  const expensesWithReceipts = expenses.filter(e => e.receiptUrl);
  const expensesWithoutReceipts = expenses.filter(e => !e.receiptUrl);

  console.log(`- ${expensesWithReceipts.length} expenses with receipts`);
  console.log(`- ${expensesWithoutReceipts.length} expenses without receipts`);

  let completed = 0;
  const total = expensesWithReceipts.length;

  // Download in batches
  const results = [];

  for (let i = 0; i < expensesWithReceipts.length; i += concurrentLimit) {
    const batch = expensesWithReceipts.slice(i, i + concurrentLimit);

    console.log(`Processing batch ${Math.floor(i / concurrentLimit) + 1}: ${batch.length} receipts`);

    const batchResults = await Promise.all(
      batch.map(async (expense) => {
        const result = await downloadSingleReceipt(expense, {
          compress,
          compressionOptions
        });

        completed++;

        // Call progress callback
        if (onProgress) {
          onProgress(completed, total);
        }

        return result;
      })
    );

    results.push(...batchResults);
  }

  // Add expenses without receipts (no download needed)
  results.push(...expensesWithoutReceipts.map(expense => ({
    ...expense,
    receiptImageData: null
  })));

  // Sort back to original order (by expenseId or date)
  results.sort((a, b) => {
    if (a.date && b.date) {
      return new Date(b.date) - new Date(a.date);
    }
    return 0;
  });

  const successCount = results.filter(r => r.receiptImageData).length;
  const errorCount = results.filter(r => r.receiptError).length;

  console.log(`Download complete: ${successCount} success, ${errorCount} errors`);

  return results;
};

/**
 * Estimate PDF file size based on embedded images
 * @param {Array} expenses - Expenses with receiptImageData
 * @returns {Object} Size estimation
 */
export const estimatePDFSize = (expenses) => {
  const totalImageSize = expenses.reduce((sum, expense) => {
    if (expense.receiptImageData) {
      // Base64 is ~33% larger than binary
      return sum + (expense.receiptImageData.length * 0.75);
    }
    return sum;
  }, 0);

  const baseSize = 100 * 1024; // 100KB for PDF structure, fonts, text
  const estimatedSize = baseSize + totalImageSize;

  return {
    baseSize,
    imageSize: totalImageSize,
    totalSize: estimatedSize,
    totalSizeMB: (estimatedSize / (1024 * 1024)).toFixed(2),
    imageCount: expenses.filter(e => e.receiptImageData).length
  };
};
