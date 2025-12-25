/**
 * Test suite for PDF Image Downloader
 *
 * To run: npm test -- pdfImageDownloader.test.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  blobToBase64,
  compressImage,
  downloadReceiptsForPDF,
  estimatePDFSize
} from '../pdfImageDownloader';

// Mock fetch globally
global.fetch = vi.fn();

// Mock FileReader
class MockFileReader {
  readAsDataURL(blob) {
    // Simulate base64 conversion
    this.result = 'data:image/jpeg;base64,/9j/4AAQSkZJRg...'; // Mock base64
    setTimeout(() => this.onloadend(), 10);
  }
}

global.FileReader = MockFileReader;

// Mock Image
class MockImage {
  constructor() {
    this.width = 800;
    this.height = 600;
  }

  set src(value) {
    setTimeout(() => this.onload(), 10);
  }
}

global.Image = MockImage;

// Mock Canvas
global.document = {
  createElement: vi.fn((tag) => {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          fillStyle: '',
          fillRect: vi.fn(),
          drawImage: vi.fn()
        })),
        toDataURL: vi.fn(() => 'data:image/jpeg;base64,compressed...')
      };
    }
  })
};

describe('pdfImageDownloader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('blobToBase64', () => {
    it('should convert blob to base64', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/jpeg' });
      const result = await blobToBase64(mockBlob);

      expect(result).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg...');
    });
  });

  describe('compressImage', () => {
    it('should compress image to smaller dimensions', async () => {
      const mockBase64 = 'data:image/jpeg;base64,original...';
      const result = await compressImage(mockBase64, {
        maxWidth: 400,
        quality: 0.7
      });

      expect(result).toBe('data:image/jpeg;base64,compressed...');
    });
  });

  describe('downloadReceiptsForPDF', () => {
    it('should download receipts in parallel', async () => {
      const mockExpenses = [
        { expenseId: '1', receiptUrl: 'https://s3.../receipt1.jpg' },
        { expenseId: '2', receiptUrl: 'https://s3.../receipt2.jpg' },
        { expenseId: '3', receiptUrl: null } // No receipt
      ];

      // Mock successful fetch
      global.fetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['image'], { type: 'image/jpeg' }))
      });

      const progressMock = vi.fn();

      const result = await downloadReceiptsForPDF(mockExpenses, {
        concurrentLimit: 2,
        compress: false,
        onProgress: progressMock
      });

      expect(result).toHaveLength(3);
      expect(result[0].receiptImageData).toBeTruthy();
      expect(result[1].receiptImageData).toBeTruthy();
      expect(result[2].receiptImageData).toBeNull();

      expect(progressMock).toHaveBeenCalledWith(1, 2);
      expect(progressMock).toHaveBeenCalledWith(2, 2);
    });

    it('should handle download errors gracefully', async () => {
      const mockExpenses = [
        { expenseId: '1', receiptUrl: 'https://s3.../receipt1.jpg' }
      ];

      // Mock failed fetch
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await downloadReceiptsForPDF(mockExpenses, {
        compress: false
      });

      expect(result).toHaveLength(1);
      expect(result[0].receiptImageData).toBeNull();
      expect(result[0].receiptError).toBe(true);
      expect(result[0].receiptErrorMessage).toContain('404');
    });
  });

  describe('estimatePDFSize', () => {
    it('should estimate PDF size correctly', () => {
      const mockExpenses = [
        {
          expenseId: '1',
          receiptImageData: 'data:image/jpeg;base64,' + 'A'.repeat(1000) // ~1KB
        },
        {
          expenseId: '2',
          receiptImageData: 'data:image/jpeg;base64,' + 'A'.repeat(2000) // ~2KB
        },
        {
          expenseId: '3',
          receiptImageData: null // No image
        }
      ];

      const estimate = estimatePDFSize(mockExpenses);

      expect(estimate.imageCount).toBe(2);
      expect(estimate.totalSize).toBeGreaterThan(0);
      expect(estimate.totalSizeMB).toBeDefined();
    });
  });
});
