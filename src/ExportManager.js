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
      const bgUI = ColorPalette.UI.BACKGROUND;
      pg.background(bgUI.r, bgUI.g, bgUI.b);

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
            const connColor = ColorPalette.CONNECTION.NORMAL;
            pg.stroke(connColor.r, connColor.g, connColor.b);
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
            const arrowColor = ColorPalette.CONNECTION.NORMAL;
            pg.fill(arrowColor.r, arrowColor.g, arrowColor.b);
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

            // Draw text with wrapping, highlights, bold/italic (skip if image box)
            if (!box.imageUrl) {
              const defaultFontSize = (typeof TextBox !== 'undefined' && TextBox.FONT_SIZE) || 14;
              const defaultPadding = (typeof TextBox !== 'undefined' && TextBox.PADDING) || 12;
              const lineHeightMult = (typeof TextBox !== 'undefined' && TextBox.LINE_HEIGHT_MULTIPLIER) || 1.5;
              const italicShear = (typeof TextBox !== 'undefined' && TextBox.ITALIC_SHEAR_RADIANS) || -0.24;
              const boldWeight = (typeof TextBox !== 'undefined' && TextBox.BOLD_STROKE_WEIGHT) || 0.8;
              const fontSize = box.fontSize || defaultFontSize;
              const padding = box.padding || defaultPadding;
              const lineHeight = fontSize * lineHeightMult;
              const maxTextWidth = box.width - padding * 2;
              const { lines, charMap } = this.wrapTextForExport(pg, box.text || '', maxTextWidth, fontSize);

              // Match TextBox.draw(): textAlign LEFT,CENTER; y is vertical center of each line
              const startY = (box.y - box.height / 2) + padding + lineHeight / 2;
              const textX = box.x - box.width / 2 + padding;

              pg.textSize(fontSize);
              pg.textAlign(pg.LEFT, pg.CENTER);

              // Draw highlights behind text (mirrors TextBox.drawHighlights)
              if (box.highlights && box.highlights.length > 0) {
                this.drawPNGHighlights(pg, box.text || '', box.highlights,
                  lines, charMap, textX, startY, lineHeight, fontSize);
              }

              // Draw text character-by-character to support bold/italic
              pg.noStroke();
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const lineStartPos = charMap[i] || 0;
                const yPos = startY + i * lineHeight;
                let xPos = textX;

                for (let ci = 0; ci < line.length; ci++) {
                  const char = line[ci];
                  const absPos = lineStartPos + ci;
                  const isBold = this.isIndexInRanges(box.boldRanges, absPos);
                  const isItalic = this.isIndexInRanges(box.italicRanges, absPos);

                  pg.fill(0);
                  if (char === ' ') {
                    xPos += pg.textWidth(' ');
                  } else {
                    if (isBold) {
                      pg.stroke(0);
                      pg.strokeWeight(boldWeight);
                    } else {
                      pg.noStroke();
                    }
                    if (isItalic) {
                      pg.push();
                      pg.translate(xPos, yPos);
                      pg.shearX(italicShear);
                      pg.text(char, 0, 0);
                      pg.pop();
                    } else {
                      pg.text(char, xPos, yPos);
                    }
                    pg.noStroke();
                    xPos += pg.textWidth(char);
                  }
                }
              }
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
   * Wraps text for export, handling explicit newlines and word wrapping.
   * Returns both the wrapped lines and a character-position map so highlights
   * can be mapped back to the original text — mirrors TextBox.wrapText().
   *
   * @param {Object} pg - p5.Graphics instance for text measurement
   * @param {string} text - Text to wrap
   * @param {number} maxTextWidth - Maximum text width in pixels
   * @param {number} fontSize - Font size in pixels
   * @returns {{ lines: string[], charMap: number[] }}
   */
  wrapTextForExport(pg, text, maxTextWidth, fontSize) {
    pg.textSize(fontSize);
    if (!text) return { lines: [''], charMap: [0] };

    const logicalLines = text.split('\n');
    const lines = [];
    const charMap = [];
    let charPos = 0;

    for (let li = 0; li < logicalLines.length; li++) {
      const logical = logicalLines[li];
      const lineStartPos = charPos;

      if (logical === '') {
        lines.push('');
        charMap.push(charPos);
        charPos += (li < logicalLines.length - 1 ? 1 : 0);
        continue;
      }

      if (pg.textWidth(logical) <= maxTextWidth) {
        lines.push(logical);
        charMap.push(charPos);
      } else {
        // Word-wrap this logical line, preserving all whitespace and character positions
        const tokens = [];
        const tokenRegex = /(\s+|\S+)/g;
        let tokenMatch;
        while ((tokenMatch = tokenRegex.exec(logical)) !== null) {
          tokens.push({ text: tokenMatch[0], start: tokenMatch.index });
        }

        let currentLine = '';
        let currentLineStart = 0; // offset within `logical`

        for (let ti = 0; ti < tokens.length; ti++) {
          const token = tokens[ti];
          const testLine = currentLine ? currentLine + token.text : token.text;

          if (pg.textWidth(testLine) <= maxTextWidth) {
            if (!currentLine) currentLineStart = token.start;
            currentLine = testLine;
          } else {
            if (currentLine) {
              // Flush the current visual line; start a new one with this token
              lines.push(currentLine);
              charMap.push(lineStartPos + currentLineStart);
              currentLine = token.text;
              currentLineStart = token.start;
            } else {
              // Single token too wide — break by character while preserving indices
              let charLine = '';
              let charLineStart = token.start;
              for (let ci = 0; ci < token.text.length; ci++) {
                const c = token.text[ci];
                if (pg.textWidth(charLine + c) <= maxTextWidth) {
                  charLine += c;
                } else {
                  if (charLine) {
                    lines.push(charLine);
                    charMap.push(lineStartPos + charLineStart);
                    charLineStart += charLine.length;
                  }
                  charLine = c;
                }
              }
              currentLine = charLine;
              currentLineStart = charLineStart;
            }
          }
        }

        if (currentLine) {
          lines.push(currentLine);
          charMap.push(lineStartPos + currentLineStart);
        }
      }

      charPos += logical.length + (li < logicalLines.length - 1 ? 1 : 0);
    }

    if (lines.length === 0) {
      lines.push('');
      charMap.push(0);
    }

    return { lines, charMap };
  }

  /**
   * Returns the line index and position within the line for a given character
   * position in the original text — mirrors TextBox.getLineAndPositionFromChar().
   *
   * @param {number} charPos - Character position in original text
   * @param {string[]} lines - Wrapped lines
   * @param {number[]} charMap - Start char index of each line
   * @param {number} textLength - Total text length
   * @returns {{ lineIndex: number, posInLine: number }}
   */
  getLineAndPosFromChar(charPos, lines, charMap, textLength) {
    let lineIndex = 0;
    for (let i = 0; i < charMap.length; i++) {
      const lineStart = charMap[i];
      const lineEnd = (i < charMap.length - 1) ? charMap[i + 1] : textLength;
      const isLast = (i === charMap.length - 1);
      if ((charPos >= lineStart && charPos < lineEnd) ||
        (isLast && charPos >= lineStart && charPos <= lineEnd)) {
        lineIndex = i;
        break;
      }
      if (isLast) lineIndex = i;
    }
    const lineStartPos = charMap[lineIndex] || 0;
    let posInLine = charPos - lineStartPos;
    if (lines[lineIndex]) {
      posInLine = Math.min(posInLine, lines[lineIndex].length);
    }
    return { lineIndex, posInLine };
  }

  /**
   * Check whether a character index falls inside any of the given ranges.
   * Mirrors TextBox._isIndexInRanges().
   *
   * @param {Array} ranges - Array of {start, end} range objects
   * @param {number} idx - Character index
   * @returns {boolean}
   */
  isIndexInRanges(ranges, idx) {
    if (!Array.isArray(ranges) || !Number.isFinite(idx)) return false;
    for (const r of ranges) {
      if (!r || typeof r.start !== 'number' || typeof r.end !== 'number') continue;
      if (idx >= r.start && idx < r.end) return true;
    }
    return false;
  }

  /**
   * Draw text highlights onto a p5.Graphics buffer, mirroring TextBox.drawHighlights().
   *
   * @param {Object} pg - p5.Graphics instance
   * @param {string} text - Original full text
   * @param {Array} highlights - Highlight range objects from box.highlights
   * @param {string[]} lines - Wrapped lines
   * @param {number[]} charMap - Start char index of each line
   * @param {number} textX - X start of text
   * @param {number} startY - Y center of first line
   * @param {number} lineHeight - Line height in pixels
   * @param {number} fontSize - Font size in pixels
   */
  drawPNGHighlights(pg, text, highlights, lines, charMap, textX, startY, lineHeight, fontSize) {
    pg.textSize(fontSize);
    pg.noStroke();
    for (const hl of highlights) {
      if (!hl || hl.start == null || hl.end == null) continue;
      const start = Math.max(0, Math.min(text.length, hl.start));
      const end = Math.max(0, Math.min(text.length, hl.end));
      if (start >= end) continue;

      const c = (hl.color && typeof hl.color === 'object')
        ? hl.color : ColorPalette.TEXTBOX.DEFAULT_HIGHLIGHT;
      pg.fill(c.r, c.g, c.b, c.a !== undefined ? c.a : 180);

      const startInfo = this.getLineAndPosFromChar(start, lines, charMap, text.length);
      const endInfo = this.getLineAndPosFromChar(end, lines, charMap, text.length);

      if (startInfo.lineIndex === endInfo.lineIndex) {
        const lineText = lines[startInfo.lineIndex] || '';
        const x1 = textX + pg.textWidth(lineText.slice(0, startInfo.posInLine));
        const x2 = textX + pg.textWidth(lineText.slice(0, endInfo.posInLine));
        const y = startY + startInfo.lineIndex * lineHeight;
        pg.rect(x1, y - lineHeight / 3, x2 - x1, lineHeight * 0.67);
      } else {
        for (let i = startInfo.lineIndex; i <= endInfo.lineIndex; i++) {
          if (i < 0 || i >= lines.length) continue;
          const lineText = lines[i] || '';
          const y = startY + i * lineHeight;
          let x1, x2;
          if (i === startInfo.lineIndex) {
            x1 = textX + pg.textWidth(lineText.slice(0, startInfo.posInLine));
            x2 = textX + pg.textWidth(lineText);
          } else if (i === endInfo.lineIndex) {
            x1 = textX;
            x2 = textX + pg.textWidth(lineText.slice(0, endInfo.posInLine));
          } else {
            x1 = textX;
            x2 = textX + pg.textWidth(lineText);
          }
          pg.rect(x1, y - lineHeight / 3, x2 - x1, lineHeight * 0.67);
        }
      }
    }
  }

  /**
   * Draw text highlights into a PDF, using p5 text-width measurements scaled to
   * PDF points to approximate highlight rectangle positions.
   *
   * @param {Object} pdf - jsPDF instance
   * @param {string} text - Original full text
   * @param {Array} highlights - Highlight range objects from box.highlights
   * @param {string[]} lines - Wrapped lines
   * @param {number[]} charMap - Start char index of each line
   * @param {number} textX - X start of text in PDF points
   * @param {number} startY - Y center of first line in PDF points
   * @param {number} lineHeight - Line height in PDF points
   * @param {Object} pg - p5.Graphics used for text-width measurement
   * @param {number} fontSize - p5.js font size (pixels)
   * @param {number} pdfFontSize - PDF font size (points)
   */
  drawPDFHighlights(pdf, text, highlights, lines, charMap, textX, startY,
    lineHeight, pg, fontSize, pdfFontSize) {
    const ptPerPx = pdfFontSize / fontSize;
    pg.textSize(fontSize);

    for (const hl of highlights) {
      if (!hl || hl.start == null || hl.end == null) continue;
      const start = Math.max(0, Math.min(text.length, hl.start));
      const end = Math.max(0, Math.min(text.length, hl.end));
      if (start >= end) continue;

      const c = (hl.color && typeof hl.color === 'object')
        ? hl.color : ColorPalette.TEXTBOX.DEFAULT_HIGHLIGHT;
      // PDF doesn't support true alpha; blend toward white to approximate transparency.
      // Default ~180/255 ≈ 70% opacity matches the in-app semi-transparent highlight look.
      const DEFAULT_HIGHLIGHT_ALPHA = 180;
      const rawAlpha = (c && typeof c.a === 'number') ? c.a : DEFAULT_HIGHLIGHT_ALPHA;
      const alpha = Math.max(0, Math.min(1, rawAlpha > 1 ? rawAlpha / 255 : rawAlpha));
      const blendToWhite = ch => Math.round(255 * (1 - alpha) + ch * alpha);
      pdf.setFillColor(blendToWhite(c.r), blendToWhite(c.g), blendToWhite(c.b));

      const startInfo = this.getLineAndPosFromChar(start, lines, charMap, text.length);
      const endInfo = this.getLineAndPosFromChar(end, lines, charMap, text.length);

      if (startInfo.lineIndex === endInfo.lineIndex) {
        const lineText = lines[startInfo.lineIndex] || '';
        const x1 = textX + pg.textWidth(lineText.slice(0, startInfo.posInLine)) * ptPerPx;
        const x2 = textX + pg.textWidth(lineText.slice(0, endInfo.posInLine)) * ptPerPx;
        const y = startY + startInfo.lineIndex * lineHeight;
        pdf.rect(x1, y - lineHeight / 3, x2 - x1, lineHeight * 0.67, 'F');
      } else {
        for (let i = startInfo.lineIndex; i <= endInfo.lineIndex; i++) {
          if (i < 0 || i >= lines.length) continue;
          const lineText = lines[i] || '';
          const y = startY + i * lineHeight;
          let x1, x2;
          if (i === startInfo.lineIndex) {
            x1 = textX + pg.textWidth(lineText.slice(0, startInfo.posInLine)) * ptPerPx;
            x2 = textX + pg.textWidth(lineText) * ptPerPx;
          } else if (i === endInfo.lineIndex) {
            x1 = textX;
            x2 = textX + pg.textWidth(lineText.slice(0, endInfo.posInLine)) * ptPerPx;
          } else {
            x1 = textX;
            x2 = textX + pg.textWidth(lineText) * ptPerPx;
          }
          pdf.rect(x1, y - lineHeight / 3, x2 - x1, lineHeight * 0.67, 'F');
        }
      }
    }
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

    // Draw connections and boxes — measureGraphics provides p5 text metrics for line-wrapping
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
            const defaultFontSize = (typeof TextBox !== 'undefined' && TextBox.FONT_SIZE) || 14;
            const defaultPadding = (typeof TextBox !== 'undefined' && TextBox.PADDING) || 12;
            const lineHeightMult = (typeof TextBox !== 'undefined' && TextBox.LINE_HEIGHT_MULTIPLIER) || 1.5;
            const fontSize = box.fontSize || defaultFontSize;
            const padding = box.padding || defaultPadding;
            // Wrap using p5.js metrics so lines match the box's actual dimensions
            const maxTextWidth = box.width - padding * 2;
            const { lines, charMap } = this.wrapTextForExport(
              measureGraphics, box.text || '', maxTextWidth, fontSize);

            const pdfFontSize = fontSize * scale;
            const pdfLineHeight = fontSize * lineHeightMult * scale;
            const textX = bx + padding * scale;
            // y is the vertical center of each line (matches p5 textAlign CENTER)
            const startY = by + padding * scale + pdfLineHeight / 2;

            // Compute how many spaces to substitute for each tab character so that
            // jsPDF (which renders \t as zero-width) matches the p5.js visual width.
            // Fall back to 4 spaces if the space glyph reports zero width (font not loaded yet).
            measureGraphics.textSize(fontSize);
            const tabPx = measureGraphics.textWidth('\t');
            const spacePx = measureGraphics.textWidth(' ');
            const spacesPerTab = (spacePx > 0)
              ? Math.max(1, Math.round(tabPx / spacePx))
              : 4; // safe default when font metrics are unavailable
            const tabReplacement = ' '.repeat(spacesPerTab);

            pdf.setFontSize(pdfFontSize);
            pdf.setTextColor(0);

            // Draw highlights before text
            if (box.highlights && box.highlights.length > 0) {
              this.drawPDFHighlights(pdf, box.text || '', box.highlights,
                lines, charMap, textX, startY, pdfLineHeight,
                measureGraphics, fontSize, pdfFontSize);
              // Restore text color after highlights changed fill
              pdf.setTextColor(0);
            }

            // Render each line as segments so bold/italic formatting is applied.
            // Each segment is a run of consecutive characters with the same style.
            const fontName = 'helvetica';
            lines.forEach((line, i) => {
              const lineStartPos = charMap[i] || 0;
              const y = startY + i * pdfLineHeight;
              let x = textX;

              // Collect segments: {text, bold, italic}
              const segments = [];
              let segText = '';
              let segBold = false;
              let segItalic = false;

              for (let ci = 0; ci < line.length; ci++) {
                const absPos = lineStartPos + ci;
                const isBold = this.isIndexInRanges(box.boldRanges, absPos);
                const isItalic = this.isIndexInRanges(box.italicRanges, absPos);

                if (ci === 0) {
                  segBold = isBold;
                  segItalic = isItalic;
                }

                if (isBold !== segBold || isItalic !== segItalic) {
                  // Style changed — flush current segment
                  if (segText) segments.push({ text: segText, bold: segBold, italic: segItalic });
                  segText = line[ci];
                  segBold = isBold;
                  segItalic = isItalic;
                } else {
                  segText += line[ci];
                }
              }
              if (segText) segments.push({ text: segText, bold: segBold, italic: segItalic });

              if (segments.length === 0) return;

              for (const seg of segments) {
                // Normalize tab characters (jsPDF renders \t as zero-width)
                const normalizedText = seg.text.replace(/\t/g, tabReplacement);

                const style = seg.bold && seg.italic ? 'bolditalic'
                  : seg.bold ? 'bold'
                    : seg.italic ? 'italic'
                      : 'normal';
                pdf.setFont(fontName, style);
                pdf.text(normalizedText, x, y, { baseline: 'middle' });
                x += pdf.getTextWidth(normalizedText);
              }

              // Reset to normal font for next line
              pdf.setFont(fontName, 'normal');
            });
          }
        }
      }

    } finally {
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
