/**
 * ExportManager.js
 * 
 * Manages all export functionality for the mind map application.
 * This module handles:
 * - PNG image export with proper scaling and rendering
 * - PDF export with embedded images and fonts
 * - Text export with hierarchy based on connections
 * 
 * @requires p5.js for graphics rendering
 * @requires jsPDF for PDF generation
 * @requires Utils for helper functions
 * @requires ColorPalette for consistent colors
 */

class ExportManager {
  constructor() {
    this.p5Instance = null;
    this.mindMap = null;
    this.config = null;
    this._initialized = false;
  }

  /**
   * Initialize the ExportManager with dependencies
   * @param {Object} p5Instance - p5.js instance
   * @param {Object} mindMap - MindMap instance
   * @param {Object} config - Configuration object
   */
  initialize(p5Instance, mindMap, config) {
    this.p5Instance = p5Instance;
    this.mindMap = mindMap;
    this.config = config || {};
    this._initialized = true;
  }

  // ==========================================================================
  // PNG EXPORT
  // ==========================================================================

  /**
   * Exports the mind map as a PNG image
   * Creates an offscreen graphics buffer, renders all content, and downloads as PNG
   */
  exportPNG() {
    // Check initialization
    if (!this._initialized) {
      console.error('ExportManager not initialized');
      alert('Export system not ready. Please refresh the page.');
      return;
    }

    // Validate ColorPalette dependency
    if (typeof ColorPalette === 'undefined') {
      console.error('ColorPalette not available');
      alert('Export failed: Color system not initialized');
      return;
    }

    if (!this.mindMap) {
      console.error('MindMap not initialized');
      return;
    }

    const bounds = this.getContentBounds();
    if (!bounds) {
      console.warn('No content to export (no boxes)');
      return;
    }

    const padding = this.config.EXPORT?.PADDING || 50;
    const width = Math.max(1, Math.ceil(bounds.maxX - bounds.minX + 2 * padding));
    const height = Math.max(1, Math.ceil(bounds.maxY - bounds.minY + 2 * padding));

    // Validate dimensions are finite
    if (!isFinite(width) || !isFinite(height)) {
      console.error('Invalid canvas dimensions for PNG export');
      alert('Failed to export PNG: Invalid content dimensions');
      return;
    }

    // Create offscreen graphics buffer
    const pg = this.p5Instance.createGraphics(width, height);

    // Set up blob timeout
    let blobTimeout;

    try {
      // Set background
      pg.background(ColorPalette.UI.BACKGROUND);

      // Translate to account for padding and content offset
      pg.push();

      try {
        pg.translate(padding - bounds.minX, padding - bounds.minY);

        // Draw connections first (behind boxes)
        if (this.mindMap.connections) {
          this.mindMap.connections.forEach(conn => {
            if (!conn || !conn.fromBox || !conn.toBox) return;

            const from = conn.fromBox;
            const to = conn.toBox;

            // Get proper connection points from box edges
            const start = (typeof from.getConnectionPoint === 'function')
              ? from.getConnectionPoint(to)
              : { x: from.x, y: from.y };
            const end = (typeof to.getConnectionPoint === 'function')
              ? to.getConnectionPoint(from)
              : { x: to.x, y: to.y };

            // Connection line
            pg.stroke(ColorPalette.CONNECTION.NORMAL);
            pg.strokeWeight(2);
            pg.line(start.x, start.y, end.x, end.y);

            // Arrow at target
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            const arrowSize = 10;
            const arrowX = end.x - Math.cos(angle) * 5;
            const arrowY = end.y - Math.sin(angle) * 5;

            pg.push();
            pg.translate(arrowX, arrowY);
            pg.rotate(angle);
            pg.fill(ColorPalette.CONNECTION.NORMAL);
            pg.noStroke();
            pg.triangle(0, 0, -arrowSize, -arrowSize / 2, -arrowSize, arrowSize / 2);
            pg.pop();
          });
        }

        // Draw boxes
        if (this.mindMap.boxes) {
          this.mindMap.boxes.forEach(box => {
            if (!box) return;

            // Box background - use backgroundColor property
            const bgColor = box.backgroundColor || { r: 255, g: 255, b: 255 };
            pg.fill(bgColor.r, bgColor.g, bgColor.b);
            pg.stroke(100);
            pg.strokeWeight(1);
            pg.rect(box.x - box.width / 2, box.y - box.height / 2, box.width, box.height);

            // Draw image if present (using imageUrl/img properties)
            if (box.imageUrl && box.img) {
              try {
                const imgW = box.width - 20;
                const imgH = box.height - 20;
                const imgX = box.x - imgW / 2;
                const imgY = box.y - box.height / 2 + 10;

                // Draw the loaded image
                if (box.img.width && box.img.height) {
                  pg.image(box.img, imgX, imgY, imgW, imgH);
                } else {
                  // Fallback: draw placeholder
                  pg.fill(200);
                  pg.noStroke();
                  pg.rect(imgX, imgY, imgW, imgH);
                }
              } catch (e) {
                console.warn('Error drawing image in PNG export:', e);
              }
            }

            // Draw text with wrapping and highlights (skip if image box)
            if (!box.imageUrl) {
              const lines = this.getWrappedLines(pg, box.text || '', box.width - 20, 16);
              const lineHeight = 18;
              const textStartY = box.y - (lines.length * lineHeight) / 2;

              lines.forEach((line, idx) => {
                const yPos = textStartY + idx * lineHeight;

                // Draw highlights if present
                if (box.highlights && box.highlights.length > 0) {
                  let charX = 0;
                  const chars = line.split('');

                  chars.forEach((char, charIdx) => {
                    const globalCharIdx = this.getGlobalCharIndex(box.text, lines, idx, charIdx);
                    const isHighlighted = this.isCharHighlighted(box.highlights, globalCharIdx);

                    if (isHighlighted) {
                      pg.fill(ColorPalette.TEXTBOX.DEFAULT_HIGHLIGHT.r,
                        ColorPalette.TEXTBOX.DEFAULT_HIGHLIGHT.g,
                        ColorPalette.TEXTBOX.DEFAULT_HIGHLIGHT.b,
                        ColorPalette.TEXTBOX.DEFAULT_HIGHLIGHT.a || 180);
                      pg.noStroke();
                      const charWidth = pg.textWidth(char);
                      pg.rect(box.x - box.width / 2 + 10 + charX, yPos - 14, charWidth, lineHeight);
                    }

                    charX += pg.textWidth(char);
                  });
                }

                // Draw text
                pg.fill(0);
                pg.noStroke();
                pg.textAlign(pg.LEFT, pg.TOP);
                pg.textSize(16);
                pg.text(line, box.x - box.width / 2 + 10, yPos);
              });
            }
          });
        }

      } finally {
        // Always restore graphics state
        pg.pop();
      }

      // Convert to data URL and download
      pg.canvas.toBlob(blob => {
        clearTimeout(blobTimeout);
        if (!blob) {
          console.error('Failed to create PNG blob');
          alert('Failed to export PNG. Please try again.');
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mindmap.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });

      // Add timeout fallback
      blobTimeout = setTimeout(() => {
        console.error('PNG blob creation timeout');
        alert('Export timeout. The image may be too large.');
      }, 30000); // 30 second timeout
    } catch (e) {
      clearTimeout(blobTimeout);
      console.error('PNG export failed:', e);
      alert('Failed to export PNG: ' + e.message);
    } finally {
      // Clean up graphics buffer
      pg.remove();
    }
  }

  /**
   * Get wrapped lines of text for rendering
   * @param {Object} pg - p5.Graphics instance
   * @param {string} text - Text to wrap
   * @param {number} maxWidth - Maximum width in pixels
   * @param {number} fontSize - Font size
   * @returns {Array<string>} Array of wrapped lines
   */
  getWrappedLines(pg, text, maxWidth, fontSize) {
    if (!text) return [];

    pg.textSize(fontSize);
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const testWidth = pg.textWidth(testLine);

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Get global character index in text from line and character position
   * @param {string} text - Full text
   * @param {Array<string>} lines - Wrapped lines
   * @param {number} lineIdx - Line index
   * @param {number} charIdx - Character index in line
   * @returns {number} Global character index
   */
  getGlobalCharIndex(text, lines, lineIdx, charIdx) {
    let globalIdx = 0;
    for (let i = 0; i < lineIdx; i++) {
      globalIdx += lines[i].length + 1; // +1 for space
    }
    return globalIdx + charIdx;
  }

  /**
   * Check if a character is highlighted
   * @param {Array} highlights - Array of highlight ranges
   * @param {number} charIdx - Character index
   * @returns {boolean} True if highlighted
   */
  isCharHighlighted(highlights, charIdx) {
    if (!highlights || !Array.isArray(highlights)) return false;

    return highlights.some(h => {
      if (!h || typeof h.start !== 'number' || typeof h.end !== 'number') return false;
      return charIdx >= h.start && charIdx < h.end;
    });
  }

  // ==========================================================================
  // PDF EXPORT
  // ==========================================================================

  /**
   * Exports the mind map as a PDF document
   * Uses jsPDF library for PDF generation
   */
  async exportPDF() {
    // Check if jsPDF is available
    if (typeof window === 'undefined' || typeof window.jspdf === 'undefined') {
      console.error('jsPDF library not loaded');
      alert('PDF export requires the jsPDF library. Please reload the page.');
      return;
    }

    if (!this.mindMap) {
      console.error('MindMap not initialized');
      return;
    }

    const bounds = this.getContentBounds();
    if (!bounds) {
      console.warn('No content to export (no boxes)');
      return;
    }

    const { jsPDF } = window.jspdf;
    const padding = this.config.EXPORT?.PADDING || 50;
    const margin = this.config.EXPORT?.MARGIN || 20;

    // Determine page orientation based on content aspect ratio
    const contentWidth = bounds.maxX - bounds.minX + 2 * padding;
    const contentHeight = bounds.maxY - bounds.minY + 2 * padding;
    const aspectRatio = contentWidth / contentHeight;
    const orientation = aspectRatio > 1.3 ? 'landscape' : 'portrait';

    const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth() - 2 * margin;
    const pageHeight = pdf.internal.pageSize.getHeight() - 2 * margin;

    // Calculate scale to fit content
    const scaleX = pageWidth / contentWidth;
    const scaleY = pageHeight / contentHeight;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = margin - bounds.minX * scale + padding * scale;
    const offsetY = margin - bounds.minY * scale + padding * scale;

    // Preload images for PDF (use imageUrl property)
    const imageCache = new Map();
    if (this.mindMap.boxes) {
      for (const box of this.mindMap.boxes) {
        if (box && box.imageUrl && box.img) {
          try {
            // Validate image dimensions
            const imgWidth = Math.max(1, Math.min(4096, box.img.width || 100));
            const imgHeight = Math.max(1, Math.min(4096, box.img.height || 100));

            if (!isFinite(imgWidth) || !isFinite(imgHeight)) {
              console.warn('Invalid image dimensions for box:', box.id);
              continue;
            }

            // Convert image to data URL for PDF
            const canvas = document.createElement('canvas');
            canvas.width = imgWidth;
            canvas.height = imgHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              console.warn('Failed to get 2D context for image export');
              continue;
            }

            ctx.drawImage(box.img, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            imageCache.set(box.id, dataUrl);
          } catch (e) {
            console.warn('Error preloading image for PDF:', e);
          }
        }
      }
    }

    // Create a single graphics buffer for text measurement (reused)
    const measureGraphics = this.p5Instance.createGraphics(100, 100);

    try {
      // Draw connections
      if (this.mindMap.connections) {
        this.mindMap.connections.forEach(conn => {
          if (!conn || !conn.fromBox || !conn.toBox) return;

          const from = conn.fromBox;
          const to = conn.toBox;

          // Get proper connection points
          const start = (typeof from.getConnectionPoint === 'function')
            ? from.getConnectionPoint(to)
            : { x: from.x, y: from.y };
          const end = (typeof to.getConnectionPoint === 'function')
            ? to.getConnectionPoint(from)
            : { x: to.x, y: to.y };

          const x1 = start.x * scale + offsetX;
          const y1 = start.y * scale + offsetY;
          const x2 = end.x * scale + offsetX;
          const y2 = end.y * scale + offsetY;

          pdf.setDrawColor(80);
          pdf.setLineWidth(1.5 * scale);
          pdf.line(x1, y1, x2, y2);

          // Arrow
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const arrowSize = 10 * scale;
          const arrowX = x2 - Math.cos(angle) * 5;
          const arrowY = y2 - Math.sin(angle) * 5;

          pdf.setFillColor(80);
          const arrowPoints = [
            [arrowX, arrowY],
            [arrowX - Math.cos(angle) * arrowSize + Math.sin(angle) * arrowSize / 2,
            arrowY - Math.sin(angle) * arrowSize - Math.cos(angle) * arrowSize / 2],
            [arrowX - Math.cos(angle) * arrowSize - Math.sin(angle) * arrowSize / 2,
            arrowY - Math.sin(angle) * arrowSize + Math.cos(angle) * arrowSize / 2]
          ];
          pdf.triangle(...arrowPoints[0], ...arrowPoints[1], ...arrowPoints[2], 'F');
        });
      }

      // Draw boxes
      if (this.mindMap.boxes) {
        for (const box of this.mindMap.boxes) {
          if (!box) continue;

          const bx = (box.x - box.width / 2) * scale + offsetX;
          const by = (box.y - box.height / 2) * scale + offsetY;
          const bw = box.width * scale;
          const bh = box.height * scale;

          // Box background - use backgroundColor property
          const bgColor = box.backgroundColor || { r: 255, g: 255, b: 255 };
          pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
          pdf.setDrawColor(100);
          pdf.setLineWidth(0.5);
          pdf.rect(bx, by, bw, bh, 'FD');

          // Image (using imageUrl property)
          if (box.imageUrl && imageCache.has(box.id)) {
            try {
              const dataUrl = imageCache.get(box.id);
              const imgW = (box.width - 20) * scale;
              const imgH = (box.height - 20) * scale;
              const imgX = (box.x - (box.width - 20) / 2) * scale + offsetX;
              const imgY = (box.y - box.height / 2 + 10) * scale + offsetY;

              pdf.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH);
            } catch (e) {
              console.warn('Error adding image to PDF:', e);
            }
          }

          // Text (skip if image box)
          if (!box.imageUrl) {
            const fontSize = 12 * scale;
            pdf.setFontSize(fontSize);
            pdf.setTextColor(0);

            const lines = this.getWrappedLines(measureGraphics,
              box.text || '', box.width - 20, 16);
            const lineHeight = 14 * scale;
            const textX = bx + 8 * scale;
            let textY = by + (bh - lines.length * lineHeight) / 2 + lineHeight;

            lines.forEach(line => {
              pdf.text(line, textX, textY);
              textY += lineHeight;
            });
          }
        }
      }

    } finally {
      // Always clean up the measurement graphics buffer
      measureGraphics.remove();
    }

    // Save PDF
    pdf.save('mindmap.pdf');
  }

  // ==========================================================================
  // TEXT EXPORT
  // ==========================================================================

  /**
   * Exports the mind map as a plain text file with hierarchical structure
   */
  exportText() {
    if (!this.mindMap) {
      console.error('MindMap not initialized');
      return;
    }

    // Build hierarchy from connections
    const hierarchy = this.buildTextHierarchy();

    // Create text content
    const textContent = hierarchy;

    // Create blob and download with proper cleanup
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mindmap.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      // Always revoke URL to prevent memory leak
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Builds text hierarchy from mind map connections
   * @returns {string} Hierarchical text representation
   */
  buildTextHierarchy() {
    if (!this.mindMap || !this.mindMap.boxes || this.mindMap.boxes.length === 0) {
      return 'Empty mind map';
    }

    // Build adjacency list from connections
    const children = new Map();
    const parents = new Set();

    if (this.mindMap.connections) {
      this.mindMap.connections.forEach(conn => {
        if (!conn || !conn.fromBox || !conn.toBox) return;

        const fromId = conn.fromBox.id;
        const toId = conn.toBox.id;

        // Validate IDs exist
        if (fromId === undefined || fromId === null ||
          toId === undefined || toId === null) {
          console.warn('Connection with missing ID:', conn);
          return;
        }

        if (!children.has(fromId)) {
          children.set(fromId, []);
        }
        children.get(fromId).push(toId);
        parents.add(toId);
      });
    }

    // Find root nodes (boxes with no incoming connections)
    const roots = [];
    this.mindMap.boxes.forEach(box => {
      if (box && box.id && !parents.has(box.id)) {
        roots.push(box.id);
      }
    });

    // Build text using DFS
    const visited = new Set();
    let result = '';

    const dfs = (boxId, depth) => {
      // Add depth limit protection
      if (depth > 1000) {
        console.warn('Max hierarchy depth reached:', depth);
        result += '  '.repeat(Math.min(depth, 100)) + '- [Max depth reached]\n';
        return;
      }

      if (visited.has(boxId)) return;
      visited.add(boxId);

      const box = this.mindMap.boxes.find(b => b && b.id === boxId);
      if (!box) return;

      const indent = '  '.repeat(Math.min(depth, 100)); // Cap indent rendering
      const text = (box.text || '').replace(/\n/g, ' ').trim();
      result += indent + '- ' + text + '\n';

      const childIds = children.get(boxId) || [];
      childIds.forEach(childId => dfs(childId, depth + 1));
    };

    // Process all roots
    if (roots.length > 0) {
      roots.forEach(rootId => dfs(rootId, 0));
    } else {
      // No connections - just list all boxes
      result = 'Boxes (no connections):\n';
      this.mindMap.boxes.forEach(box => {
        if (box && box.text) {
          const text = box.text.replace(/\n/g, ' ').trim();
          result += '- ' + text + '\n';
        }
      });
    }

    // Add disconnected boxes (collect first, then emit as single section)
    const disconnectedLines = [];
    this.mindMap.boxes.forEach(box => {
      if (box && box.id && !visited.has(box.id)) {
        const text = (box.text || '').replace(/\n/g, ' ').trim();
        if (text) {
          disconnectedLines.push('- ' + text);
        }
      }
    });

    if (disconnectedLines.length > 0) {
      result += '\nDisconnected:\n' + disconnectedLines.join('\n') + '\n';
    }

    return result;
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Get bounding box of all content in the mind map
   * @returns {Object|null} Bounds object with minX, maxX, minY, maxY, or null if no content
   */
  getContentBounds() {
    if (!this.mindMap || !this.mindMap.boxes || this.mindMap.boxes.length === 0) {
      return null;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    this.mindMap.boxes.forEach(box => {
      if (!box) return;

      // Validate all required properties exist and are finite numbers
      if (typeof box.x !== 'number' || !isFinite(box.x)) return;
      if (typeof box.width !== 'number' || !isFinite(box.width)) return;
      if (typeof box.height !== 'number' || !isFinite(box.height)) return;
      if (typeof box.y !== 'number' || !isFinite(box.y)) return;

      const left = box.x - box.width / 2;
      const right = box.x + box.width / 2;
      const top = box.y - box.height / 2;
      const bottom = box.y + box.height / 2;

      minX = Math.min(minX, left);
      maxX = Math.max(maxX, right);
      minY = Math.min(minY, top);
      maxY = Math.max(maxY, bottom);
    });

    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
      return null;
    }

    return { minX, maxX, minY, maxY };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExportManager;
}

// Expose globally for browser usage
if (typeof window !== 'undefined') {
  window.ExportManager = ExportManager;
}
