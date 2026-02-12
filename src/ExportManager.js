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
  }

  // ==========================================================================
  // PNG EXPORT
  // ==========================================================================

  /**
   * Exports the mind map as a PNG image
   * Creates an offscreen graphics buffer, renders all content, and downloads as PNG
   */
  exportPNG() {
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
    const width = bounds.maxX - bounds.minX + 2 * padding;
    const height = bounds.maxY - bounds.minY + 2 * padding;

    // Create offscreen graphics buffer
    const pg = this.p5Instance.createGraphics(width, height);

    // Set background
    pg.background(ColorPalette.UI.BACKGROUND);

    // Translate to account for padding and content offset
    pg.push();
    pg.translate(padding - bounds.minX, padding - bounds.minY);

    // Draw connections first (behind boxes)
    if (this.mindMap.connections) {
      this.mindMap.connections.forEach(conn => {
        if (!conn || !conn.fromBox || !conn.toBox) return;

        const from = conn.fromBox;
        const to = conn.toBox;

        // Connection line
        pg.stroke(ColorPalette.CONNECTION.NORMAL);
        pg.strokeWeight(2);
        pg.line(from.x, from.y, to.x, to.y);

        // Arrow at target
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const arrowSize = 10;
        const arrowX = to.x - Math.cos(angle) * (to.w / 2 + 5);
        const arrowY = to.y - Math.sin(angle) * (to.h / 2 + 5);

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

        // Box background
        const bgColor = box.bgColor || ColorPalette.TEXTBOX.DEFAULT_BACKGROUND || { r: 255, g: 255, b: 255 };
        pg.fill(bgColor.r, bgColor.g, bgColor.b);
        pg.stroke(100);
        pg.strokeWeight(1);
        pg.rect(box.x - box.w / 2, box.y - box.h / 2, box.w, box.h);

        // Draw embedded image if present
        if (box.embeddedImage && box.embeddedImage.image) {
          try {
            const imgData = box.embeddedImage;
            const imgW = imgData.width || box.w - 20;
            const imgH = imgData.height || 100;
            const imgX = box.x - imgW / 2;
            const imgY = box.y - box.h / 2 + 10;

            // Draw image placeholder or actual image
            if (imgData.image.width && imgData.image.height) {
              pg.image(imgData.image, imgX, imgY, imgW, imgH);
            } else {
              // Fallback: draw placeholder
              pg.fill(200);
              pg.noStroke();
              pg.rect(imgX, imgY, imgW, imgH);
            }
          } catch (e) {
            console.warn('Error drawing embedded image:', e);
          }
        }

        // Draw text with wrapping and highlights
        const lines = this.getWrappedLines(pg, box.text, box.w - 20, 16);
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
                pg.rect(box.x - box.w / 2 + 10 + charX, yPos - 14, charWidth, lineHeight);
              }

              charX += pg.textWidth(char);
            });
          }

          // Draw text
          pg.fill(0);
          pg.noStroke();
          pg.textAlign(pg.LEFT, pg.TOP);
          pg.textSize(16);
          pg.text(line, box.x - box.w / 2 + 10, yPos);
        });
      });
    }

    pg.pop();

    // Convert to data URL and download
    pg.canvas.toBlob(blob => {
      if (!blob) {
        console.error('Failed to create PNG blob');
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

    // Clean up graphics buffer
    pg.remove();
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

    // Preload images for PDF
    const imageCache = new Map();
    if (this.mindMap.boxes) {
      for (const box of this.mindMap.boxes) {
        if (box && box.embeddedImage && box.embeddedImage.dataUrl) {
          try {
            const dataUrl = box.embeddedImage.dataUrl;
            imageCache.set(box.id, dataUrl);
          } catch (e) {
            console.warn('Error preloading image for PDF:', e);
          }
        }
      }
    }

    // Draw connections
    if (this.mindMap.connections) {
      this.mindMap.connections.forEach(conn => {
        if (!conn || !conn.fromBox || !conn.toBox) return;

        const from = conn.fromBox;
        const to = conn.toBox;

        const x1 = from.x * scale + offsetX;
        const y1 = from.y * scale + offsetY;
        const x2 = to.x * scale + offsetX;
        const y2 = to.y * scale + offsetY;

        pdf.setDrawColor(80);
        pdf.setLineWidth(1.5 * scale);
        pdf.line(x1, y1, x2, y2);

        // Arrow
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const arrowSize = 10 * scale;
        const arrowX = x2 - Math.cos(angle) * (to.w / 2 * scale + 5);
        const arrowY = y2 - Math.sin(angle) * (to.h / 2 * scale + 5);

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

        const bx = (box.x - box.w / 2) * scale + offsetX;
        const by = (box.y - box.h / 2) * scale + offsetY;
        const bw = box.w * scale;
        const bh = box.h * scale;

        // Box background
        const bgColor = box.bgColor || { r: 255, g: 255, b: 255 };
        pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
        pdf.setDrawColor(100);
        pdf.setLineWidth(0.5);
        pdf.rect(bx, by, bw, bh, 'FD');

        // Embedded image
        if (box.embeddedImage && imageCache.has(box.id)) {
          try {
            const dataUrl = imageCache.get(box.id);
            const imgW = (box.embeddedImage.width || box.w - 20) * scale;
            const imgH = (box.embeddedImage.height || 100) * scale;
            const imgX = (box.x - (box.embeddedImage.width || box.w - 20) / 2) * scale + offsetX;
            const imgY = (box.y - box.h / 2 + 10) * scale + offsetY;

            pdf.addImage(dataUrl, 'JPEG', imgX, imgY, imgW, imgH);
          } catch (e) {
            console.warn('Error adding image to PDF:', e);
          }
        }

        // Text
        const fontSize = 12 * scale;
        pdf.setFontSize(fontSize);
        pdf.setTextColor(0);

        const lines = this.getWrappedLines(this.p5Instance.createGraphics(100, 100), 
                                          box.text, box.w - 20, 16);
        const lineHeight = 14 * scale;
        const textX = bx + 8 * scale;
        let textY = by + (bh - lines.length * lineHeight) / 2 + lineHeight;

        lines.forEach(line => {
          pdf.text(line, textX, textY);
          textY += lineHeight;
        });
      }
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

    // Create blob and download
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
      if (visited.has(boxId)) return;
      visited.add(boxId);

      const box = this.mindMap.boxes.find(b => b && b.id === boxId);
      if (!box) return;

      const indent = '  '.repeat(depth);
      const text = box.text.replace(/\n/g, ' ').trim();
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

    // Add disconnected boxes
    this.mindMap.boxes.forEach(box => {
      if (box && box.id && !visited.has(box.id)) {
        const text = box.text.replace(/\n/g, ' ').trim();
        result += '\nDisconnected:\n- ' + text + '\n';
      }
    });

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

      const left = box.x - box.w / 2;
      const right = box.x + box.w / 2;
      const top = box.y - box.h / 2;
      const bottom = box.y + box.h / 2;

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
