/**
 * ImageUtils - Image compression and conversion utilities
 *
 * This module provides browser-compatible image processing functions for
 * compressing, resizing, and converting images to optimized formats.
 *
 * Key Features:
 * - Image compression with configurable quality
 * - Automatic resizing with aspect ratio preservation
 * - WebP conversion with JPEG fallback for unsupported browsers
 * - Memory-efficient bitmap handling with proper cleanup
 *
 * Dependencies:
 * - Browser APIs: createImageBitmap, canvas, fetch
 * - No external dependencies
 *
 * Usage:
 * - Called when images are dropped onto the canvas
 * - Used for pasting images from clipboard
 * - Optimizes storage for embedded images in TextBox nodes
 */

// ============================================================================
// IMAGE COMPRESSION UTILITIES
// ============================================================================

/**
 * Compress and downscale an image File to a DataURL.
 * Uses createImageBitmap + canvas drawing for efficient processing.
 *
 * @param {File|Blob} file - Image file to compress
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Maximum output width in pixels (default: 1600)
 * @param {number} options.maxHeight - Maximum output height in pixels (default: 1600)
 * @param {number} options.quality - Compression quality 0-1 (default: 0.75)
 * @param {string} options.mimeType - Output format (default: 'image/webp')
 * @returns {Promise<string>} Data URL of compressed image
 * @throws {Error} If no file provided
 */
async function compressImageFile(file, {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.75,
    mimeType = 'image/webp'
} = {}) {
    if (!file) throw new Error('No file');

    // Check WebP support, fallback to JPEG if unsupported
    mimeType = _ensureWebPSupport(mimeType);

    // Use createImageBitmap for memory-efficient decoding
    const bitmap = await createImageBitmap(file);
    try {
        return _resizeAndEncode(bitmap, maxWidth, maxHeight, quality, mimeType);
    } finally {
        _closeBitmap(bitmap);
    }
}

/**
 * Convert a data: URL (PNG/JPEG/etc) to a downscaled WebP data URL.
 *
 * @param {string} dataUrl - Source data URL to convert
 * @param {Object} options - Conversion options
 * @param {number} options.maxWidth - Maximum output width in pixels (default: 1600)
 * @param {number} options.maxHeight - Maximum output height in pixels (default: 1600)
 * @param {number} options.quality - Compression quality 0-1 (default: 0.75)
 * @param {string} options.mimeType - Output format (default: 'image/webp')
 * @returns {Promise<string>} Converted data URL
 * @throws {Error} If invalid dataUrl provided
 */
async function convertDataUrlToWebP(dataUrl, {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.75,
    mimeType = 'image/webp'
} = {}) {
    if (!dataUrl || typeof dataUrl !== 'string') throw new Error('Invalid dataUrl');

    // Even if already WebP, may need to downscale
    try {
        const resp = await fetch(dataUrl);
        const blob = await resp.blob();
        return await _bitmapToDataUrl(blob, maxWidth, maxHeight, quality, mimeType);
    } catch (e) {
        // If conversion fails, return original
        return dataUrl;
    }
}

// ============================================================================
// PRIVATE HELPER FUNCTIONS
// ============================================================================

/**
 * Convert a blob to a resized data URL using ImageBitmap.
 * @private
 */
async function _bitmapToDataUrl(blob, maxWidth, maxHeight, quality, mimeType) {
    const bitmap = await createImageBitmap(blob);
    try {
        mimeType = _ensureWebPSupport(mimeType);
        return _resizeAndEncode(bitmap, maxWidth, maxHeight, quality, mimeType);
    } finally {
        _closeBitmap(bitmap);
    }
}

/**
 * Resize a bitmap and encode to data URL.
 * @private
 */
function _resizeAndEncode(bitmap, maxWidth, maxHeight, quality, mimeType) {
    const w = bitmap.width;
    const h = bitmap.height;

    // Calculate scale ratio preserving aspect ratio
    const ratio = Math.min(1, maxWidth / w, maxHeight / h);
    const targetW = Math.max(1, Math.round(w * ratio));
    const targetH = Math.max(1, Math.round(h * ratio));

    // Create canvas and draw scaled image
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    return canvas.toDataURL(mimeType, quality);
}

/**
 * Check WebP support and fallback to JPEG if needed.
 * @private
 */
function _ensureWebPSupport(mimeType) {
    if (mimeType !== 'image/webp') return mimeType;

    try {
        const testCanvas = document.createElement('canvas');
        const webpSupported = testCanvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
        return webpSupported ? mimeType : 'image/jpeg';
    } catch (_) {
        return 'image/jpeg';
    }
}

/**
 * Safely close an ImageBitmap to free memory.
 * @private
 */
function _closeBitmap(bitmap) {
    if (bitmap && typeof bitmap.close === 'function') {
        bitmap.close();
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export to global scope for use by sketch.js
if (typeof window !== 'undefined') {
    window.ImageUtils = {
        compressImageFile,
        convertDataUrlToWebP
    };
}
