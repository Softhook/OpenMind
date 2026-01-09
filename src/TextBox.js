/**
 * TextBox class - represents a text node in the mind map.
 *
 * This is a core component providing rich text editing, visual styling, and
 * interactive features for mind map nodes.
 *
 * Key Features:
 * - Rich text editing with cursor positioning and text selection
 * - Automatic text wrapping with smart word/space preservation
 * - Resizable boxes with user-controlled or auto-sizing
 * - Image and PDF attachment support
 * - Hyperlink detection and click-to-open
 * - Text highlighting with color customization
 * - Drag-and-drop with edge/center region detection
 * - Connection points for arrows
 * - Color palette for node backgrounds
 *
 * Dependencies:
 * - Uses shared utilities from utils.js for validation and text processing
 * - Requires p5.js for all rendering operations
 * - Uses pdf.js (optional) for PDF preview rendering
 */
class TextBox {
  // ============================================================================
  // STATIC CONSTANTS
  // ============================================================================

  // Size and spacing constants
  static PADDING = 12;                      // Internal padding around text
  static MIN_WIDTH = 150;                   // Minimum box width
  static MIN_HEIGHT = 40;                   // Minimum box height
  static MAX_WIDTH = 280;                   // Maximum auto-width for boxes
  static FONT_SIZE = 14;                    // Default font size
  static CORNER_RADIUS = 6;                 // Rounded corner radius
  static LINE_HEIGHT_MULTIPLIER = 1.5;      // Line height as multiple of font size

  // Interaction constants
  static RESIZE_HANDLE_SIZE = 18;           // Size of resize handle in corner
  static CURSOR_BLINK_RATE = 530;           // Cursor blink interval in ms
  static DRAG_EDGE_THICKNESS = 18;          // Thickness of draggable edge regions
  static HORIZONTAL_EDGE_WIDTH = 12;        // Fixed thinner width for vertical grab areas
  static MIN_CENTER_EDIT_ZONE = 20;         // Min central area for text editing (not dragging)

  // Change detection threshold for drag/resize operations (in pixels)
  // Operations with changes smaller than this are considered "no change" for undo purposes
  static CHANGE_THRESHOLD = 0.001;

  // Connection point constants
  static CONNECTOR_RADIUS = 7;              // Radius of connection dots
  static CONNECTOR_RADIUS_ACTIVE = 7;       // Radius when actively connecting

  // Color constants for consistent styling
  static COLORS = {
    SELECTION_OUTLINE: { r: 60, g: 120, b: 255 },
    HOVER_STROKE: 100,
    EDITING_STROKE: 120,
    NORMAL_STROKE: 100,
    LINK_TEXT: { r: 0, g: 100, b: 220 },
    CURSOR: { r: 0, g: 0, b: 255 },
    SELECTION_HIGHLIGHT: { r: 255, g: 100, b: 100, a: 100 },
    DIM_OVERLAY: { r: 255, g: 255, b: 255, a: 150 },
    DEFAULT_HIGHLIGHT: { r: 255, g: 255, b: 0, a: 180 },
    SHADOW: { r: 0, g: 0, b: 0, a: 20 }  // Subtle shadow/dim effect
  };

  // Regex pattern to detect URLs (http, https, file://, and local paths)
  // Matches: https://..., http://..., file:///path/to/file, ./relative, ../parent, /absolute
  static URL_PATTERN = /(?:https?:\/\/|file:\/\/)[^\s<>"')\]]+|(?:\.{0,2}\/)[^\s<>"')\]]+/gi;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  /**
   * Creates a new TextBox.
   * Initializes all state including position, text content, dimensions,
   * editing state, and interaction flags.
   * @param {number} x - Center X coordinate in world space
   * @param {number} y - Center Y coordinate in world space
   * @param {string} text - Initial text content (will be sanitized)
   */
  constructor(x, y, text = "") {
    // Generate stable unique identifier for collaboration
    this.id = Utils.generateUUID();

    // Position and dimensions
    this.x = x;
    this.y = y;
    this.targetX = x;  // Interpolation target for smooth movement
    this.targetY = y;

    // Content
    this.text = Utils.sanitizeText(text);

    // Image attachment state
    this.imageUrl = null;
    this.img = null;
    this.imageLoaded = false;
    this.imageLoadError = false;

    // Layout configuration
    this.padding = TextBox.PADDING;
    this.minWidth = TextBox.MIN_WIDTH;
    this.minHeight = TextBox.MIN_HEIGHT;
    this.maxWidth = TextBox.MAX_WIDTH;
    this.fontSize = TextBox.FONT_SIZE;
    this.cornerRadius = TextBox.CORNER_RADIUS;

    // Editing state
    this.isEditing = false;
    this.cursorPosition = this.text.length;
    this.selectionStart = -1;
    this.selectionEnd = -1;
    this.isSelecting = false;
    this.selectionAnchor = -1;

    // Cursor blink animation
    this.cursorBlinkTime = 0;
    this.cursorVisible = true;
    this.cursorBlinkRate = TextBox.CURSOR_BLINK_RATE;

    // Drag state
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.dragEdgeThickness = TextBox.DRAG_EDGE_THICKNESS;

    // Resize state
    this.isResizing = false;
    this.resizeHandleSize = TextBox.RESIZE_HANDLE_SIZE;
    this.resizeStartX = 0;
    this.resizeStartY = 0;
    this.resizeStartWidth = 0;
    this.resizeStartHeight = 0;
    this.resizeStartLeft = 0;
    this.resizeStartTop = 0;
    this.userResized = false;  // Tracks if user manually resized (vs. auto-sizing)

    // Text wrapping cache
    this.cachedWrappedLines = null;
    this.cachedWidth = null;
    this.cachedLineCharMap = null;  // Maps wrapped line indices to original text positions
    this.cachedText = null;  // Cached text reference for quick validation

    // Click detection for double-click
    this.lastClickTime = 0;
    this.lastClickX = 0;
    this.lastClickY = 0;
    this.doubleClickThreshold = 300;

    // Visual state
    this.selected = false;
    this.backgroundColor = { r: 255, g: 255, b: 255 };
    this.colorPalette = TextBox.getColorPalette();

    // Text features
    this.highlights = [];       // Array of {start, end, color:{r,g,b,a?}}
    this.cachedLinks = null;    // Cached array of {start, end, url}

    // Calculate initial dimensions
    this.updateDimensions();
  }

  // ============================================================================
  // MEDIA ATTACHMENT (IMAGES AND PDFs)
  // ============================================================================

  /**
   * Load an image from a URL and attach it to this box.
   * Uses p5.loadImage (async). When loaded, sets width/height to image size (clamped).
   */
  setImageFromUrl(url) {
    try {
      if (!url) return;
      this.imageUrl = url;
      this.imageLoaded = false;
      this.imageLoadError = false;
      loadImage(url,
        (img) => {
          try {
            this.img = img;
            this.imageLoaded = true;
            this.imageLoadError = false;
            this.naturalImageWidth = img.width;
            this.naturalImageHeight = img.height;

            // Only set default dimensions if not already sized by user/save
            if (!this.userResized) {
              const maxW = 400;
              const maxH = 300;
              let w = img.width;
              let h = img.height;
              const scale = Math.min(1, maxW / w, maxH / h);
              if (scale < 1) { w = w * scale; h = h * scale; }
              this.width = max(this.minWidth, w);
              this.height = max(this.minHeight, h);
            }
          } catch (e) { console.warn('Image load handler error', e); }
        },
        (err) => {
          console.warn('Failed to load image:', url, err);
          this.imageLoaded = false;
          this.imageLoadError = true;
        }
      );
    } catch (e) {
      console.warn('setImageFromUrl failed', e);
      this.imageLoaded = false;
      this.imageLoadError = true;
    }
  }

  /**
   * Attach a PDF URL (blob or remote) to this box. Double-clicking the box opens the PDF.
   * @param {string} url - URL pointing to the PDF (blob: or https:)
   * @param {string} [filename] - Optional display name
   */
  setPdfFromUrl(url, filename) {
    try {
      if (!url) return;
      // Do not store the PDF URL — render a preview and treat as image-only
      this.imageUrl = null;
      this.imageLoaded = false;
      this.imageLoadError = false;
      this.width = Math.max(this.minWidth, 220);
      this.height = Math.max(this.minHeight, 90);

      const src = url;
      (async () => {
        try {
          if (typeof window === 'undefined' || typeof pdfjsLib === 'undefined') return;

          const fetchArrayBuffer = async (s) => {
            if (s instanceof ArrayBuffer) return s;
            if (s instanceof Blob) return await s.arrayBuffer();
            if (s instanceof File) return await s.arrayBuffer();
            if (typeof s === 'string') {
              const resp = await fetch(s);
              if (!resp.ok) throw new Error('Failed to fetch PDF');
              return await resp.arrayBuffer();
            }
            throw new Error('Unsupported PDF source');
          };

          const arrayBuffer = await fetchArrayBuffer(src);
          if (!arrayBuffer) return;

          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);

          const scale = 1.5;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext('2d');

          await page.render({ canvasContext: ctx, viewport }).promise;

          const dataUrl = canvas.toDataURL('image/png');
          if (dataUrl) {
            try { this.setImageFromUrl(dataUrl); } catch (e) { console.warn('Failed to set PDF preview image', e); }
          }
        } catch (e) {
          console.warn('PDF preview render failed', e);
        }
      })();
    } catch (e) {
      console.warn('setPdfFromUrl failed', e);
    }
  }

  // ============================================================================
  // COLOR PALETTE
  // ============================================================================

  /**
   * Gets the default color palette for boxes.
   * Provides a simple set of background colors users can choose from.
   * @returns {Array<Object>} Array of color palette entries with key and color
   */
  static getColorPalette() {
    return [
      { key: 'white', color: { r: 255, g: 255, b: 255 } },
      { key: 'orange', color: { r: 255, g: 200, b: 140 } },
      { key: 'red', color: { r: 255, g: 140, b: 140 } }
    ];
  }

  // ============================================================================
  // HYPERLINK DETECTION AND HANDLING
  // ============================================================================

  /**
   * Detects all hyperlinks in the text
   * @returns {Array<Object>} Array of {start, end, url} objects
   */
  detectLinks() {
    if (this.cachedLinks !== null) {
      return this.cachedLinks;
    }

    const links = [];
    if (!this.text || this.text.length === 0) {
      this.cachedLinks = links;
      return links;
    }

    // Reset regex lastIndex for global pattern
    TextBox.URL_PATTERN.lastIndex = 0;

    let match;
    while ((match = TextBox.URL_PATTERN.exec(this.text)) !== null) {
      let url = match[0];
      // Clean up trailing punctuation that's likely not part of URL
      while (url.length > 0 && /[.,;:!?)}\]'"]$/.test(url)) {
        url = url.slice(0, -1);
      }
      if (url.length > 0) {
        links.push({
          start: match.index,
          end: match.index + url.length,
          url: url
        });
      }
    }

    this.cachedLinks = links;
    return links;
  }

  /**
   * Checks if a character position is within a link
   * @param {number} charPos - Character position in text
   * @returns {Object|null} Link object {start, end, url} or null
   */
  getLinkAtPosition(charPos) {
    const links = this.detectLinks();
    for (const link of links) {
      if (charPos >= link.start && charPos < link.end) {
        return link;
      }
    }
    return null;
  }

  /**
   * Gets the link under the mouse cursor
   * @param {number} mx - Mouse X in world coordinates
   * @param {number} my - Mouse Y in world coordinates
   * @returns {Object|null} Link object {start, end, url} or null
   */
  getLinkAtMouse(mx, my) {
    if (this.imageUrl) return null; // No text links in image boxes

    const charPos = this.getCursorPositionFromMouse(mx, my);
    return this.getLinkAtPosition(charPos);
  }

  /**
   * Opens a URL in a new browser window/tab
   * For file:// URLs, attempts to open in the default application
   * @param {string} url - URL to open
   */
  static openLink(url) {
    if (!url) return;

    let targetUrl = url;

    // Handle file:// URLs and local paths
    if (url.startsWith('file://')) {
      // Already a file:// URL, use as-is
      targetUrl = url;
    } else if (url.startsWith('/')) {
      // Absolute local path (Unix/macOS) - convert to file:// URL
      targetUrl = 'file://' + encodeURI(url).replace(/#/g, '%23');
    } else if (url.match(/^[A-Za-z]:\\/)) {
      // Windows absolute path - convert to file:// URL
      targetUrl = 'file:///' + encodeURI(url.replace(/\\/g, '/')).replace(/#/g, '%23');
    } else if (url.match(/^\.{0,2}\//)) {
      // Relative path (starts with ./ or ../ or /)
      try {
        targetUrl = new URL(url, window.location.href).href;
      } catch (e) {
        targetUrl = url;
      }
    }
    // else: http/https URLs - use as-is

    // Open in new tab/window
    try {
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.warn('Failed to open link:', url, e);
    }
  }

  /**
   * Checks if the mouse is currently over a clickable link in this box.
   * @returns {boolean} true if mouse is over a link
   */
  isMouseOverLink() {
    if (this.imageUrl) return false;
    if (!this.isMouseOver()) return false;

    const { x: mx, y: my } = Utils.getWorldMouseCoordinates();
    return this.getLinkAtMouse(mx, my) !== null;
  }

  // ============================================================================
  // TEXT UTILITIES
  // ============================================================================

  /**
   * Sanitizes text to normalize line endings and remove problematic invisible characters
   * @param {string} text - Text to sanitize
   * @returns {string} Sanitized text
   */
  static sanitizeText(text) {
    return Utils.sanitizeText(text);
  }

  /**
   * Gets the maximum width of logical lines (split by \n) without wrapping
   * @returns {number} Maximum line width in pixels
   */
  getNaturalMaxLineWidth() {
    textSize(this.fontSize);
    let lines = this.text.split('\n');
    let maxWidth = 0;
    for (let line of lines) {
      let w = textWidth(line);
      if (w > maxWidth) maxWidth = w;
    }
    return maxWidth;
  }

  /**
   * Recalculates box dimensions based on text content.
   * 
   * Dimension calculation strategy:
   * - For image boxes: preserve user-set dimensions
   * - For text boxes:
   *   - Width: auto-size to content (up to MAX_WIDTH) unless user-resized
   *   - Height: always reflow to fit wrapped lines at current width
   * 
   * This ensures boxes grow/shrink naturally with content while respecting
   * user customization.
   */
  updateDimensions() {
    if (this.text == null) this.text = '';

    // Invalidate all caches when dimensions change
    this.cachedWrappedLines = null;
    this.cachedWidth = null;
    this.cachedLineCharMap = null;
    this.cachedText = null;  // Invalidate text reference cache
    this.cachedLinks = null; // Invalidate links cache when text changes
    // If this box is an image, keep current width/height (do not reflow based on text)
    if (this.imageUrl) {
      // Ensure sensible defaults
      if (!(this.width != null && isFinite(this.width))) this.width = this.minWidth;
      if (!(this.height != null && isFinite(this.height))) this.height = this.minHeight;
      // No wrapped text
      this.cachedWrappedLines = [''];
      this.cachedWidth = this.width;
      this.cachedLineCharMap = [0];
      return;
    }

    textSize(this.fontSize);

    // Compute natural width of logical lines (no wrapping)
    const naturalWidth = this.getNaturalMaxLineWidth() + this.padding * 2;
    const isSingleLogicalLine = this.text.indexOf('\n') === -1;

    // Width behavior:
    // - If the user hasn't manually resized: auto-size to natural width, but cap with maxWidth.
    // - If the user HAS manually resized: preserve the user's width (do not auto-shrink),
    //   unless the width is not yet defined.
    if (!this.userResized) {
      this.width = max(this.minWidth, min(this.maxWidth, naturalWidth));
    } else {
      if (!(this.width != null && isFinite(this.width))) {
        // Ensure we have a valid width if userResized was set but width is undefined
        this.width = max(this.minWidth, naturalWidth);
      }
    }

    let wrappedLines = this.wrapText(this.text);

    // Height: always reflow to fit wrapped lines for the current width
    const lineHeight = this.fontSize * TextBox.LINE_HEIGHT_MULTIPLIER;
    this.height = max(this.minHeight, wrappedLines.length * lineHeight + this.padding * 2);
  }

  /**
   * Wraps text to fit within the box width.
   * 
   * This is a complex algorithm that:
   * - Preserves all whitespace (leading, trailing, inter-word spaces)
   * - Breaks lines word by word when possible
   * - Breaks long words character-by-character when needed
   * - Maintains accurate mapping from wrapped lines back to original text (for cursor positioning)
   * - Caches results to avoid redundant wrapping on every frame
   * 
   * The line-to-char mapping (cachedLineCharMap) is critical for cursor and selection
   * positioning in the visual display.
   * 
   * @param {string} text - Text to wrap
   * @returns {Array<string>} Array of wrapped text lines
   */
  wrapText(text) {
    if (text == null) text = '';
    text = String(text);

    // Use cache if width and text haven't changed
    // Text reference check works because:
    // 1. JavaScript string concatenation creates new string objects
    // 2. All text mutation methods (addChar, removeChar, etc.) use concatenation
    // 3. updateDimensions() invalidates cache when called directly
    // 4. Direct assignment (box.text = ...) should be followed by updateDimensions()
    const currentWidth = (this.width != null && isFinite(this.width)) ? this.width : this.minWidth;
    if (this.cachedWrappedLines && 
        this.cachedWidth === currentWidth && 
        this.cachedText === this.text) {
      return this.cachedWrappedLines;
    }

    let lines = text.split('\n');
    let wrappedLines = [];
    let lineCharMap = []; // Maps each wrapped line index to its start position in original text
    let maxTextWidth = max(10, currentWidth - this.padding * 2);
    let charPos = 0; // Current position in original text

    textSize(this.fontSize);

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      let line = lines[lineIdx];
      let lineStartPos = charPos; // Remember where this logical line starts

      // Handle empty lines (from explicit newlines)
      if (line === '') {
        wrappedLines.push('');
        lineCharMap.push(charPos);
        // Advance only if this empty line is not the last logical line (i.e., there is a newline here)
        if (lineIdx < lines.length - 1) {
          charPos++;
        }
        continue;
      }

      if (textWidth(line) <= maxTextWidth) {
        wrappedLines.push(line);
        lineCharMap.push(charPos);
        // Advance by the line length; only add +1 for the newline if this isn't the last logical line
        if (lineIdx < lines.length - 1) {
          charPos += line.length + 1; // include newline between logical lines
        } else {
          charPos += line.length; // last line may have no trailing newline
        }
      } else {
        // Break line into words while preserving spaces
        // We need to track both words and the spaces between them
        let wordPositions = [];
        let regex = /\S+/g; // Match sequences of non-whitespace
        let match;
        let prevEnd = 0;

        while ((match = regex.exec(line)) !== null) {
          // Calculate how many spaces before this word
          let spacesBefore = match.index - prevEnd;
          wordPositions.push({
            word: match[0],
            start: match.index,
            spacesBefore: spacesBefore
          });
          prevEnd = match.index + match[0].length;
        }

        // If line ends with spaces, we still need to handle it
        let hasTrailingSpace = line.length > 0 && line[line.length - 1] === ' ';

        let currentLine = '';
        let currentLineStartPos = 0;

        for (let i = 0; i < wordPositions.length; i++) {
          let wp = wordPositions[i];
          // Build the test line with the correct number of spaces
          // Rules:
          // - At the start of a visual line:
          //   * If it's the first word of the logical line (i === 0), include all leading spaces
          //   * Else (wrapped line), drop exactly one separator space but preserve any extra spaces
          // - In the middle of a visual line: include all inter-word spaces
          const isStartOfVisualLine = !currentLine;
          const isFirstWordOfLogicalLine = (i === 0);
          const spacerCount = isStartOfVisualLine
            ? (isFirstWordOfLogicalLine ? wp.spacesBefore : Math.max(0, wp.spacesBefore - 1))
            : wp.spacesBefore;
          const spacer = ' '.repeat(spacerCount);
          let testLine = currentLine + spacer + wp.word;

          if (textWidth(testLine) <= maxTextWidth) {
            if (!currentLine) {
              // First content on this visual line maps to the start of the rendered spaces
              currentLineStartPos = wp.start - spacerCount;
            }
            currentLine = testLine;
          } else {
            // Current line is full, push it
            if (currentLine) {
              wrappedLines.push(currentLine);
              lineCharMap.push(lineStartPos + currentLineStartPos);
              // Start a new visual line for this word applying wrapped-line leading-space rule
              const newSpacerCount = Math.max(0, wp.spacesBefore - 1);
              currentLine = ' '.repeat(newSpacerCount) + wp.word;
              currentLineStartPos = wp.start - newSpacerCount;
            } else {
              // Single word is too long, break it by characters
              let charLine = '';
              // At start of visual line: include appropriate leading spaces (apply wrapped rule)
              const leadCount = isFirstWordOfLogicalLine ? wp.spacesBefore : Math.max(0, wp.spacesBefore - 1);
              let charStartPos = wp.start - leadCount;
              for (let s = 0; s < leadCount; s++) {
                if (textWidth(charLine + ' ') <= maxTextWidth) {
                  charLine += ' ';
                } else {
                  break;
                }
              }
              for (let charIdx = 0; charIdx < wp.word.length; charIdx++) {
                let char = wp.word[charIdx];
                if (textWidth(charLine + char) <= maxTextWidth) {
                  charLine += char;
                } else {
                  if (charLine) {
                    wrappedLines.push(charLine);
                    lineCharMap.push(lineStartPos + charStartPos);
                    charStartPos += charLine.length;
                  }
                  charLine = char;
                }
              }
              currentLine = charLine;
              currentLineStartPos = charStartPos;
            }
          }
        }

        // Handle trailing spaces after the last word, or a line with only spaces
        if (wordPositions.length > 0) {
          // There are words - check for trailing spaces after the last word
          if (currentLine) {
            let lastWord = wordPositions[wordPositions.length - 1];
            let lastWordEnd = lastWord.start + lastWord.word.length;
            if (lastWordEnd < line.length) {
              // There are trailing spaces - add them one by one, checking if we overflow
              let trailingSpaces = line.substring(lastWordEnd);
              for (let i = 0; i < trailingSpaces.length; i++) {
                let testLine = currentLine + ' ';
                if (textWidth(testLine) <= maxTextWidth) {
                  currentLine = testLine;
                } else {
                  // Line is full, push it and start a new line with remaining spaces
                  wrappedLines.push(currentLine);
                  lineCharMap.push(lineStartPos + currentLineStartPos);
                  currentLine = trailingSpaces.substring(i);
                  currentLineStartPos = lastWordEnd + i;
                }
              }
            }
          }
        } else if (line.length > 0) {
          // Line contains only spaces (no words found by regex)
          // Add spaces one by one, wrapping as needed
          for (let i = 0; i < line.length; i++) {
            let testLine = currentLine + ' ';
            if (textWidth(testLine) <= maxTextWidth) {
              if (!currentLine) {
                currentLineStartPos = i;
              }
              currentLine = testLine;
            } else {
              // Line is full, push it and start a new line
              if (currentLine) {
                wrappedLines.push(currentLine);
                lineCharMap.push(lineStartPos + currentLineStartPos);
              }
              currentLine = ' ';
              currentLineStartPos = i;
            }
          }
        }

        // Push the last line of this paragraph
        if (currentLine) {
          wrappedLines.push(currentLine);
          lineCharMap.push(lineStartPos + currentLineStartPos);
        }

        // Move to next logical line (past newline if not last logical line)
        if (lineIdx < lines.length - 1) {
          charPos += line.length + 1;
        } else {
          charPos += line.length;
        }
      }
    }

    const result = wrappedLines.length > 0 ? wrappedLines : [''];
    if (result.length === 1 && result[0] === '') {
      lineCharMap = [0];
    }

    // Cache the results including text reference for quick cache validation
    this.cachedWrappedLines = result;
    this.cachedWidth = currentWidth;
    this.cachedLineCharMap = lineCharMap;
    this.cachedText = this.text;
    return result;
  }

  // ============================================================================
  // DRAWING AND RENDERING
  // ============================================================================

  /**
   * Draws the text box with its content, selection, cursor, and UI elements
   * @param {boolean} shouldDim - Whether to dim this box (for navigation focus)
   */
  draw(shouldDim = false) {
    push();

    // Get zoom factor for UI scaling
    const zoomFactor = Utils.getClampedZoomFactor();

    // INTERPOLATION: Smoothly move towards target if not being dragged
    if (!this.isDragging && !this.isResizing) {
      // Simple lerp
      if (typeof this.targetX === 'number' && Math.abs(this.targetX - this.x) > 0.5) {
        this.x = this.x + (this.targetX - this.x) * 0.2;
      } else if (typeof this.targetX === 'number') {
        this.x = this.targetX;
      }

      if (typeof this.targetY === 'number' && Math.abs(this.targetY - this.y) > 0.5) {
        this.y = this.y + (this.targetY - this.y) * 0.2;
      } else if (typeof this.targetY === 'number') {
        this.y = this.targetY;
      }
    } else {
      // If dragging, snap target to current to avoid rubber-banding when released
      this.targetX = this.x;
      this.targetY = this.y;
    }

    // Draw box
    if (this.isEditing) {
      // When editing text, keep a neutral outline (not blue)
      fill(this.backgroundColor.r, this.backgroundColor.g, this.backgroundColor.b);
      stroke(TextBox.COLORS.EDITING_STROKE);
      strokeWeight(2 / zoomFactor);
    } else if (this.selected && !(typeof mindMap !== 'undefined' && mindMap.isArrowKeyNavigating)) {
      // Highlight selected boxes with a blue outline (skip when navigating via arrow keys)
      const selColor = TextBox.COLORS.SELECTION_OUTLINE;
      fill(this.backgroundColor.r, this.backgroundColor.g, this.backgroundColor.b);
      stroke(selColor.r, selColor.g, selColor.b);
      strokeWeight(2.5 / zoomFactor);
    } else if (this.isMouseOver() && !(typeof mindMap !== 'undefined' && mindMap.isArrowKeyNavigating)) {
      // Hover state uses the box background color
      // Disabled while navigating between boxes with arrow keys (presentation mode)
      fill(this.backgroundColor.r, this.backgroundColor.g, this.backgroundColor.b);
      stroke(TextBox.COLORS.HOVER_STROKE);
      strokeWeight(2 / zoomFactor);
    } else {
      fill(this.backgroundColor.r, this.backgroundColor.g, this.backgroundColor.b);
      stroke(TextBox.COLORS.NORMAL_STROKE);
      strokeWeight(1 / zoomFactor);
    }

    rect(this.x - this.width / 2, this.y - this.height / 2,
      this.width, this.height, (this.imageUrl ? 0 : this.cornerRadius));
    // If this box holds an image, draw the image inside the box instead of text
    if (this.imageUrl) {
      if (this.imageLoaded && this.img) {
        // Draw the image centered while preserving its aspect ratio.
        try {
          imageMode(CENTER);
          const iw = (this.naturalImageWidth && this.naturalImageWidth > 0) ? this.naturalImageWidth : this.img.width;
          const ih = (this.naturalImageHeight && this.naturalImageHeight > 0) ? this.naturalImageHeight : this.img.height;
          // Fit the image inside the box while preserving aspect ratio (do not distort)
          const scale = Math.min(this.width / iw, this.height / ih);
          const drawW = iw * scale;
          const drawH = ih * scale;
          image(this.img, this.x, this.y, drawW, drawH);
        } catch (e) {
          // fallback: draw placeholder
          fill(220);
          noStroke();
          rect(this.x - this.width / 2 + 4, this.y - this.height / 2 + 4, this.width - 8, this.height - 8, 0);
          fill(80);
          textAlign(CENTER, CENTER);
          textSize(12);
          text('Image', this.x, this.y);
        }
      } else if (this.imageLoadError) {
        fill(240);
        noStroke();
        rect(this.x - this.width / 2 + 4, this.y - this.height / 2 + 4, this.width - 8, this.height - 8, 0);
        fill(120);
        textAlign(CENTER, CENTER);
        textSize(12);
        text('Failed to load image', this.x, this.y);
      } else {
        // Loading placeholder
        fill(240);
        noStroke();
        rect(this.x - this.width / 2 + 4, this.y - this.height / 2 + 4, this.width - 8, this.height - 8, 0);
        fill(100);
        textAlign(CENTER, CENTER);
        textSize(12);
        text('Loading image...', this.x, this.y);
      }
      // Continue so dimming overlay and handles are applied to image boxes as well
    } else {
      // Draw text with wrapping
      fill(0);
      noStroke();
      textAlign(LEFT, CENTER);
      textSize(this.fontSize);

      let wrappedLines = this.wrapText(this.text);
      let lineHeight = this.fontSize * TextBox.LINE_HEIGHT_MULTIPLIER;
      // Top-anchored text: start at top padding of the box
      let startY = (this.y - this.height / 2) + this.padding + lineHeight / 2;
      let textX = this.x - this.width / 2 + this.padding;

      // If connector dots are visible (hover OR active connection from this box),
      // slightly dim the draggable frame area so the grab-edge is visually prominent.
      const connectorsVisible = ((!(typeof mindMap !== 'undefined' && mindMap.isArrowKeyNavigating) && this.isMouseOver()) ||
        (typeof mindMap !== 'undefined' && mindMap.connectingFrom && mindMap.connectingFrom.box === this));
      if (connectorsVisible && !this.isEditing) {
        // Compute edge thresholds matching isMouseOnEdge logic
        const minCenterWidth = 20;
        const minCenterHeight = 20;
        const maxEdgeX = max(4, this.width / 2 - minCenterWidth / 2);
        const maxEdgeY = max(4, this.height / 2 - minCenterHeight / 2);
        const edgeThresholdX = min(this.dragEdgeThickness, maxEdgeX);
        const edgeThresholdY = min(this.dragEdgeThickness, maxEdgeY);

        push();
        noStroke();
        const shadow = TextBox.COLORS.SHADOW;
        fill(shadow.r, shadow.g, shadow.b, shadow.a); // subtle dark dim for draggable frame

        // For image boxes, the whole interior is draggable — dim the interior
        if (this.imageUrl) {
          rect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height, (this.imageUrl ? 0 : this.cornerRadius));
        } else {
          // Left and right thin frames (use a uniform, smaller vertical grab width)
          const verticalEdgeWidth = min(edgeThresholdX, TextBox.HORIZONTAL_EDGE_WIDTH);
          // Left frame
          rect(this.x - this.width / 2, this.y - this.height / 2, verticalEdgeWidth, this.height);
          // Right frame
          rect(this.x + this.width / 2 - verticalEdgeWidth, this.y - this.height / 2, verticalEdgeWidth, this.height);
          // Top and bottom frames span between the vertical frames
          const topX = this.x - this.width / 2 + verticalEdgeWidth;
          const topW = this.width - verticalEdgeWidth * 2;
          if (topW > 0) {
            rect(topX, this.y - this.height / 2, topW, edgeThresholdY);
            // Bottom frame
            rect(topX, this.y + this.height / 2 - edgeThresholdY, topW, edgeThresholdY);
          }
        }
        pop();
      }

      // Draw selection highlight if there's a selection
      if (this.isEditing && this.selectionStart !== -1 && this.selectionEnd !== -1) {
        this.drawSelection(wrappedLines, textX, startY, lineHeight);
      }

      // Draw persistent highlights (behind text)
      if (this.highlights && this.highlights.length > 0) {
        this.drawHighlights(wrappedLines, textX, startY, lineHeight);
      }

      for (let i = 0; i < wrappedLines.length; i++) {
        let lineText = wrappedLines[i];

        // Get absolute character position for this line
        let lineStartPos = (this.cachedLineCharMap && this.cachedLineCharMap[i] !== undefined)
          ? this.cachedLineCharMap[i] : 0;

        // Detect links for coloring
        const links = this.detectLinks();

        // Always render character by character for precise spacing control
        // This ensures multiple spaces are visible
        let xPos = textX;
        for (let charIdx = 0; charIdx < lineText.length; charIdx++) {
          let char = lineText[charIdx];
          let absCharPos = lineStartPos + charIdx;

          // Check if this character is part of a link
          let isInLink = false;
          for (const link of links) {
            if (absCharPos >= link.start && absCharPos < link.end) {
              isInLink = true;
              break;
            }
          }

          // Set color based on whether character is in a link
          if (isInLink) {
            const linkColor = TextBox.COLORS.LINK_TEXT;
            fill(linkColor.r, linkColor.g, linkColor.b); // Blue for links
          } else {
            fill(0); // Black for regular text
          }

          // For spaces, use measured width to ensure they take up space
          if (char === ' ') {
            // Draw a space by moving position (p5 text(' ') might collapse)
            xPos += textWidth(' ');
          } else {
            text(char, xPos, startY + i * lineHeight);
            xPos += textWidth(char);
          }
        }
      }
      // Draw cursor when editing (cursor needs wrappedLines/textX/startY in scope)
      if (this.isEditing) {
        this.drawCursor(wrappedLines, textX, startY, lineHeight);
      }
    }

    // Apply dimming effect AFTER drawing box and text if not the focused box during arrow navigation
    if (shouldDim) {
      const dimColor = TextBox.COLORS.DIM_OVERLAY;
      fill(dimColor.r, dimColor.g, dimColor.b, dimColor.a);
      noStroke();
      rect(this.x - this.width / 2, this.y - this.height / 2,
        this.width, this.height, (this.imageUrl ? 0 : this.cornerRadius));
    }

    // (cursor drawn inside text branch where variables are defined)

    // Draw resize handle in bottom-right corner (only when not editing)
    // Hide hover-triggered resize handle during arrow-key navigation
    if (!this.isEditing && ((this.isMouseOver() && !(typeof mindMap !== 'undefined' && mindMap.isArrowKeyNavigating)) || this.isResizing)) {
      // Use helper for zoom factor
      const currentZoom = Utils.getCurrentZoom();
      const zoomFactor = Utils.getClampedZoomFactor();
      const scaledHandleSize = this.resizeHandleSize / zoomFactor;

      let handleX = this.x + this.width / 2 - scaledHandleSize;
      let handleY = this.y + this.height / 2 - scaledHandleSize;
      let cx = handleX + scaledHandleSize / 2;
      let cy = handleY + scaledHandleSize / 2;

      // Draw shadow for depth
      const shadow = TextBox.COLORS.SHADOW;
      fill(shadow.r, shadow.g, shadow.b, shadow.a);
      noStroke();
      circle(cx + 0.5 / currentZoom, cy + 1 / currentZoom, scaledHandleSize * 1.2);

      // Draw circular handle background with hover state
      fill(this.isMouseOverResizeHandle() ? color(100, 150, 255) : color(140, 140, 140));
      stroke(this.isMouseOverResizeHandle() ? color(70, 120, 230) : color(100, 100, 100));
      strokeWeight(1.5 / zoomFactor);
      circle(cx, cy, scaledHandleSize);

      // Draw modern resize arrows (diagonal double-headed arrow)
      stroke(255);
      strokeWeight(1.8 / zoomFactor);
      strokeCap(ROUND);

      // Main diagonal line
      let arrowSize = scaledHandleSize * 0.35;
      let angle = PI / 4 + PI; // 45 degrees rotated 180 degrees = 225 degrees (pointing from top-right to bottom-left)
      let dx = cos(angle) * arrowSize;
      let dy = sin(angle) * arrowSize;

      // Arrow pointing from top-right to bottom-left
      line(cx - dx, cy - dy, cx + dx, cy + dy);

      // Arrow heads
      let headSize = scaledHandleSize * 0.2;
      // Top-right arrow head
      line(cx - dx, cy - dy, cx - dx + headSize * cos(angle + PI / 4), cy - dy + headSize * sin(angle + PI / 4));
      line(cx - dx, cy - dy, cx - dx + headSize * cos(angle - PI / 4), cy - dy + headSize * sin(angle - PI / 4));
      // Bottom-left arrow head
      line(cx + dx, cy + dy, cx + dx - headSize * cos(angle + PI / 4), cy + dy - headSize * sin(angle + PI / 4));
      line(cx + dx, cy + dy, cx + dx - headSize * cos(angle - PI / 4), cy + dy - headSize * sin(angle - PI / 4));

      strokeCap(SQUARE); // Reset to default
    }

    // Color palette circles are no longer drawn - color is changed via keyboard shortcuts (1, 2, 3)

    pop();
  }



  /**
   * Applies a background color by key from the palette
   * @param {string} key - Color key ('white', 'orange', 'red')
   */
  setBackgroundByKey(key) {
    const entry = this.colorPalette.find(p => p.key === key);
    if (entry) {
      this.backgroundColor = { ...entry.color };
    }
  }

  /**
   * Gets connector points at the center of each edge
   * @returns {Object} Object with left, right, top, bottom points
   */
  getConnectorPoints() {
    const hw = this.width / 2;
    const hh = this.height / 2;
    return {
      left: { x: this.x - hw, y: this.y },
      right: { x: this.x + hw, y: this.y },
      top: { x: this.x, y: this.y - hh },
      bottom: { x: this.x, y: this.y + hh }
    };
  }

  /**
   * Gets the center point of a specific connector
   * @param {string} side - Side of the box ('left', 'right', 'top', 'bottom')
   * @returns {Object|null} Point with x and y, or null if invalid side
   */
  getConnectorCenter(side) {
    const pts = this.getConnectorPoints();
    return pts[side] || null;
  }

  /**
   * Gets which connector is under the mouse cursor
   * @param {number} hitRadius - Hit detection radius in pixels
   * @returns {string|null} Side name or null if not over any connector
   */
  getConnectorUnderMouse(hitRadius = 10) {
    const zoomFactor = Utils.getClampedZoomFactor();
    const scaledHitRadius = hitRadius / Math.sqrt(zoomFactor);
    const pts = this.getConnectorPoints();
    const sides = ['left', 'right', 'top', 'bottom'];
    for (let side of sides) {
      const p = pts[side];
      if (!p) continue;
      const { x: mx, y: my } = Utils.getWorldMouseCoordinates();
      if (dist(mx, my, p.x, p.y) <= scaledHitRadius) {
        return side;
      }
    }
    return null;
  }

  /**
   * Draws connector dots at each edge of the box
   * @param {boolean} active - Whether connectors should be highlighted
   */
  drawConnectors(active = false) {
    const zoomFactor = Utils.getClampedZoomFactor();
    const pts = this.getConnectorPoints();
    push();
    noStroke();
    const r = (active ? TextBox.CONNECTOR_RADIUS_ACTIVE : TextBox.CONNECTOR_RADIUS) / Math.sqrt(zoomFactor);
    const c = active ? color(100, 150, 255) : color(120);
    fill(c);
    circle(pts.left.x, pts.left.y, r * 2);
    circle(pts.right.x, pts.right.y, r * 2);
    circle(pts.top.x, pts.top.y, r * 2);
    circle(pts.bottom.x, pts.bottom.y, r * 2);
    pop();
  }

  // ============================================================================
  // MOUSE INTERACTION & HIT TESTING
  // ============================================================================

  /**
   * Checks if the mouse is currently over this box.
   * Uses world coordinates for accurate hit detection.
   * @returns {boolean} true if mouse is over the box rectangle
   */
  isMouseOver() {
    const { x: mx, y: my } = Utils.getWorldMouseCoordinates();
    return Utils.isPointInRect(mx, my, this.x, this.y, this.width, this.height);
  }

  // ============================================================================
  // RESIZE HANDLE INTERACTION
  // ============================================================================

  /**
   * Checks if mouse is over the resize handle (bottom-right corner).
   * The handle is only visible and interactive when the box is selected.
   * @returns {boolean} true if mouse is over resize handle
   */
  isMouseOverResizeHandle() {
    if (!this.selected) return false;
    const zoomFactor = Utils.getClampedZoomFactor();
    const scaledHandleSize = this.resizeHandleSize / zoomFactor;
    let handleX = this.x + this.width / 2 - scaledHandleSize;
    let handleY = this.y + this.height / 2 - scaledHandleSize;
    let cx = handleX + scaledHandleSize / 2;
    let cy = handleY + scaledHandleSize / 2;
    const { x: mx, y: my } = Utils.getWorldMouseCoordinates();
    // Use circular hit detection for the circular handle
    let distance = dist(mx, my, cx, cy);
    return distance < scaledHandleSize / 2;
  }

  isMouseOnEdge() {
    // Don't trigger edge connection if over resize handle
    if (this.isMouseOverResizeHandle()) {
      return false;
    }

    // Make the draggable edge zone a bit larger, while keeping a minimum editable center
    const minCenterWidth = TextBox.MIN_CENTER_EDIT_ZONE;  // ensure at least 20px center horizontal edit zone
    const minCenterHeight = TextBox.MIN_CENTER_EDIT_ZONE; // ensure at least 20px center vertical edit zone
    const maxEdgeX = max(4, this.width / 2 - minCenterWidth / 2);
    const maxEdgeY = max(4, this.height / 2 - minCenterHeight / 2);
    const edgeThresholdX = min(this.dragEdgeThickness, maxEdgeX);
    const verticalEdgeWidth = min(edgeThresholdX, TextBox.HORIZONTAL_EDGE_WIDTH);
    const edgeThresholdY = min(this.dragEdgeThickness, maxEdgeY);

    const { x: mx, y: my } = Utils.getWorldMouseCoordinates();

    // For image boxes, the entire interior should behave like the edge-draggable area
    if (this.imageUrl) {
      return mx > this.x - this.width / 2 && mx < this.x + this.width / 2 &&
        my > this.y - this.height / 2 && my < this.y + this.height / 2;
    }
    let distFromLeft = abs(mx - (this.x - this.width / 2));
    let distFromRight = abs(mx - (this.x + this.width / 2));
    let distFromTop = abs(my - (this.y - this.height / 2));
    let distFromBottom = abs(my - (this.y + this.height / 2));

    let onVerticalEdge = (distFromLeft < verticalEdgeWidth || distFromRight < verticalEdgeWidth) &&
      my > this.y - this.height / 2 &&
      my < this.y + this.height / 2;

    let onHorizontalEdge = (distFromTop < edgeThresholdY || distFromBottom < edgeThresholdY) &&
      mx > this.x - this.width / 2 &&
      mx < this.x + this.width / 2;

    return onVerticalEdge || onHorizontalEdge;
  }

  getCursorPositionFromMouse(mx, my) {
    // Validate mouse coordinates
    if (mx == null || my == null || isNaN(mx) || isNaN(my)) {
      return this.text ? this.text.length : 0;
    }

    textSize(this.fontSize);
    let wrappedLines = this.wrapText(this.text);

    // Handle empty wrapped lines
    if (!wrappedLines || wrappedLines.length === 0) {
      return 0;
    }

    let lineHeight = this.fontSize * TextBox.LINE_HEIGHT_MULTIPLIER;
    // Top-anchored text positioning
    let startY = (this.y - this.height / 2) + this.padding + lineHeight / 2;
    let textX = this.x - this.width / 2 + this.padding;

    // Find which visual line was clicked using a stable rounding strategy
    // This avoids off-by-one cases near the midline between rows
    let relativeY = (my - startY) / lineHeight;
    let clickedLine = Math.round(relativeY);
    if (!Number.isFinite(clickedLine)) clickedLine = 0;
    clickedLine = constrain(clickedLine, 0, wrappedLines.length - 1);

    // Find position within the line
    let lineText = wrappedLines[clickedLine];
    let closestPos = lineText.length;
    let minDist = Infinity;

    for (let i = 0; i <= lineText.length; i++) {
      let textBefore = lineText.slice(0, i);
      let xPos = textX + textWidth(textBefore);
      let dist = abs(mx - xPos);

      if (dist < minDist) {
        minDist = dist;
        closestPos = i;
      }
    }

    // Use character map to convert wrapped line position to absolute text position
    if (!this.cachedLineCharMap || clickedLine >= this.cachedLineCharMap.length) {
      // Fallback if map is not available
      return min(this.text.length, closestPos);
    }

    let lineStartPos = this.cachedLineCharMap[clickedLine];
    return min(this.text.length, lineStartPos + closestPos);
  }

  // ============================================================================
  // TEXT EDITING AND MANIPULATION
  // ============================================================================

  /**
   * Helper: Checks if a character is whitespace
   * @param {string} ch - Character to check
   * @returns {boolean} true if whitespace
   * @private
   */
  static isWhitespace(ch) {
    return Utils.isWhitespace(ch);
  }

  /**
   * Starts editing mode at the given mouse position
   * @param {number} mx - Mouse X in world coordinates (optional)
   * @param {number} my - Mouse Y in world coordinates (optional)
   */
  startEditing(mx = null, my = null) {
    // Do not enter text-edit mode for image boxes
    if (this.imageUrl) {
      this.isEditing = false;
      return;
    }

    this.isEditing = true;

    // Ensure text is defined
    if (this.text == null) {
      this.text = '';
    }

    // If mouse coordinates provided, position cursor at click location
    if (mx !== null && my !== null && !isNaN(mx) && !isNaN(my)) {
      this.cursorPosition = this.getCursorPositionFromMouse(mx, my);
    } else {
      this.cursorPosition = this.text.length;
    }

    // Clamp cursor position to valid range
    this.cursorPosition = constrain(this.cursorPosition, 0, this.text.length);

    this.selectionStart = -1;
    this.selectionEnd = -1;
    this.cursorBlinkTime = millis();
    this.cursorVisible = true;

  }

  stopEditing() {
    this.isEditing = false;
    this.isSelecting = false;
    this.updateDimensions();

    // Notify collaboration system of text/dimension changes
    TextBox._notifyChange(this);
  }

  /**
   * Notifies collaboration system of changes to this box
   * @param {TextBox} box 
   * @param {boolean} skipTransactionWrapper - If true, sync without transaction wrapper (for continuous operations)
   * @private
   */
  static _notifyChange(box, skipTransactionWrapper = false) {
    if (typeof MindMap !== 'undefined' && MindMap.onBoxChange && box) {
      MindMap.onBoxChange(box, skipTransactionWrapper);
    }
  }

  // Determine if the given point is within the inner text area (excludes padding)
  isPointInTextArea(mx, my) {
    // Image boxes are not editable — clicking them should select the node instead.
    if (this.imageUrl) return false;
    // If no text yet, allow clicking inside the padded inner box to start editing
    if (!this.text || this.text.length === 0) {
      const left = this.x - this.width / 2 + this.padding;
      const right = this.x + this.width / 2 - this.padding;
      const top = this.y - this.height / 2 + this.padding;
      const bottom = this.y + this.height / 2 - this.padding;
      const margin = 6; // make it a bit forgiving
      return mx >= left - margin && mx <= right + margin && my >= top - margin && my <= bottom + margin;
    }

    textSize(this.fontSize);
    const wrappedLines = this.wrapText(this.text);
    const lineHeight = this.fontSize * TextBox.LINE_HEIGHT_MULTIPLIER;
    // Top-anchored: first line center at top+padding+lineHeight/2
    const startY = (this.y - this.height / 2) + this.padding + lineHeight / 2;
    const textX = this.x - this.width / 2 + this.padding;

    // Find the nearest line index based on Y
    let lineIndex = Math.round((my - startY) / lineHeight);
    if (lineIndex < 0 || lineIndex >= wrappedLines.length) return false;

    const lineCenterY = startY + lineIndex * lineHeight;
    const lineTop = lineCenterY - lineHeight / 2;
    const lineBottom = lineCenterY + lineHeight / 2;

    // Margins to make selecting easier, and dragging more reliable
    const marginX = 6;
    const marginY = 4;
    if (my < lineTop - marginY || my > lineBottom + marginY) return false;

    const lineText = wrappedLines[lineIndex] || '';
    let lineWidth = textWidth(lineText);

    // For empty visual lines, allow clicks anywhere within the inner padded area
    const innerLeft = this.x - this.width / 2 + this.padding;
    const innerRight = this.x + this.width / 2 - this.padding;
    if (lineWidth <= 0) {
      return mx >= innerLeft - marginX && mx <= innerRight + marginX;
    }

    const lineLeft = textX;
    const lineRight = textX + lineWidth;

    // Only consider the actual text width on this line (with small margins)
    return mx >= lineLeft - marginX && mx <= lineRight + marginX;
  }

  // Compute the bounds of the actual drawn text (not the whole box)
  getTextBounds() {
    // Prepare wrapping using current text and font
    textSize(this.fontSize);
    const wrappedLines = this.wrapText(this.text);
    const lineHeight = this.fontSize * TextBox.LINE_HEIGHT_MULTIPLIER;
    const totalHeight = wrappedLines.length * lineHeight;
    const textX = this.x - this.width / 2 + this.padding;
    // Compute max actual line width
    let maxLineWidth = 0;
    for (let i = 0; i < wrappedLines.length; i++) {
      const w = textWidth(wrappedLines[i] || '');
      if (w > maxLineWidth) maxLineWidth = w;
    }
    const top = (this.y - this.height / 2) + this.padding;
    const bottom = top + totalHeight;
    const left = textX;
    const right = textX + maxLineWidth;
    return { left, right, top, bottom };
  }

  // Start selecting text at mouse position
  startSelecting(mx, my) {
    this.isEditing = true;
    this.isSelecting = true;
    this.selectionAnchor = this.getCursorPositionFromMouse(mx, my);
    this.selectionStart = this.selectionAnchor;
    this.selectionEnd = this.selectionAnchor;
    this.cursorPosition = this.selectionEnd;
    this.resetCursorBlink();
  }

  // Update selection based on current mouse position
  updateSelection(mx, my) {
    if (!this.isSelecting) return;
    let pos = this.getCursorPositionFromMouse(mx, my);
    this.selectionEnd = pos;
    this.cursorPosition = pos;
    this.resetCursorBlink();
  }

  // Stop selecting
  stopSelecting() {
    this.isSelecting = false;
    // Keep selection if start != end; caret only if equal
  }

  // Handle mouse down inside the box; supports single and double-click
  handleMouseDown(mx, my) {
    // If this is an image box, clicking anywhere should select it and allow dragging (like edge area)
    if (this.imageUrl) {
      this.selected = true;
      this.isEditing = false;
      this.isSelecting = false;
      this.selectionStart = -1;
      this.selectionEnd = -1;
      this.resetCursorBlink();
      // Start dragging when user clicks inside the image (but don't start drag if over resize handle)
      if (!this.isMouseOverResizeHandle()) {
        this.startDrag(mx, my);
      }
      return;
    }

    // (PDF handling removed) — PDFs are treated as images (preview) or normal text boxes.

    let pos = this.getCursorPositionFromMouse(mx, my);

    // Check if clicking on a link (only when not already editing or when Cmd/Ctrl is held)
    const isCmd = typeof keyIsDown === 'function' && (keyIsDown(91) || keyIsDown(93) || keyIsDown(17));
    if (!this.isEditing || isCmd) {
      const link = this.getLinkAtPosition(pos);
      if (link && isCmd) {
        // Cmd/Ctrl+click opens the link
        TextBox.openLink(link.url);
        return;
      }
    }

    // If Shift is held and there's already a selection, extend it
    if (keyIsDown(16)) { // Shift key
      if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
        this.selectionEnd = pos;
        this.cursorPosition = pos;
        this.resetCursorBlink();
        return;
      }
    }

    const now = millis();
    const isDouble = (now - this.lastClickTime) <= this.doubleClickThreshold &&
      dist(mx, my, this.lastClickX, this.lastClickY) < 6;
    this.lastClickTime = now;
    this.lastClickX = mx;
    this.lastClickY = my;

    if (isDouble) {
      // Double-click: select word under cursor
      this.isEditing = true;
      this.selectWordAt(pos);
      this.cursorPosition = this.selectionEnd;
      this.resetCursorBlink();
    } else {
      // Single click: position caret and prepare for drag-selection
      this.startEditing(mx, my);
      this.startSelecting(mx, my);
    }
  }

  // Select word boundaries around a position
  selectWordAt(pos) {
    if (this.text == null) this.text = '';
    pos = constrain(pos, 0, this.text.length);
    if (this.text.length === 0) {
      this.selectionStart = 0;
      this.selectionEnd = 0;
      return;
    }
    // If on whitespace, expand to contiguous whitespace; else expand to word chars
    const isWs = (ch) => ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
    let start = pos;
    let end = pos;
    if (pos > 0 && isWs(this.text[pos - 1]) && (pos >= this.text.length || isWs(this.text[pos]))) {
      // Select whitespace block
      while (start > 0 && isWs(this.text[start - 1])) start--;
      while (end < this.text.length && isWs(this.text[end])) end++;
    } else {
      // Select non-whitespace word block
      while (start > 0 && !isWs(this.text[start - 1])) start--;
      while (end < this.text.length && !isWs(this.text[end])) end++;
    }
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  /**
   * Adds a character at the cursor position
   * @param {string} char - Character to add
   */
  addChar(char) {
    // Ensure text is defined
    if (this.text === null || this.text === undefined) {
      this.text = '';
    }

    // Validate char
    if (char === null || char === undefined) {
      return;
    }

    // Sanitize the character being added (necessary for Enter key which can produce \r on some platforms)
    char = Utils.sanitizeText(char);

    // If there's a selection, replace it
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      this.deleteSelection();
    }

    // Ensure cursor position is valid
    this.cursorPosition = constrain(this.cursorPosition, 0, this.text.length);
    // Prepare insertion
    const insertPos = this.cursorPosition;
    // Shift highlights to account for this insertion
    this.applyEditDelta(insertPos, 0, char.length);
    this.text = this.text.slice(0, insertPos) + char + this.text.slice(insertPos);
    this.cursorPosition = insertPos + char.length;
    this.updateDimensions();
    this.resetCursorBlink();
  }

  /**
   * Removes the character before the cursor (Backspace)
   */
  removeChar() {
    if (this.text === null || this.text === undefined) this.text = '';
    if (this.text.length > 0) {
      // Only treat as a selection delete when the selection is non-empty.
      // A zero-length selection (caret) should not be deleted as a selection
      // because that would swallow the first Backspace after clicking to place
      // the caret. Clear zero-length selection and fall through to remove
      // the character before the caret.
      if (this.selectionStart !== -1 && this.selectionEnd !== -1 && this.selectionStart !== this.selectionEnd) {
        this.deleteSelection();
      } else {
        // Clear any zero-length selection markers
        if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
          this.selectionStart = -1;
          this.selectionEnd = -1;
        }
        if (this.cursorPosition > 0) {
          const delPos = this.cursorPosition - 1;
          this.applyEditDelta(delPos, 1, 0);
          this.text = this.text.slice(0, delPos) + this.text.slice(this.cursorPosition);
          this.cursorPosition--;
        }
      }
      // highlights adjusted above via applyEditDelta
      this.updateDimensions();
    }
    this.resetCursorBlink();
  }

  /**
   * Forward delete - removes the character after the cursor (Delete key)
   */
  removeForwardChar() {
    if (!this.text || this.text.length === 0) {
      this.resetCursorBlink();
      return;
    }
    // If there's a selection, delete it
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      this.deleteSelection();
    } else if (this.cursorPosition < this.text.length) {
      // Delete character after cursor
      this.applyEditDelta(this.cursorPosition, 1, 0);
      this.text = this.text.slice(0, this.cursorPosition) + this.text.slice(this.cursorPosition + 1);
      // cursorPosition stays the same
      this.updateDimensions();
    }
    this.resetCursorBlink();
  }

  /**
   * Deletes the previous word (Alt/Ctrl+Backspace)
   */
  deleteWordLeft() {
    if (!this.text) {
      this.text = '';
    }
    // If there's a selection, delete it
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      this.deleteSelection();
      this.resetCursorBlink();
      return;
    }
    let pos = constrain(this.cursorPosition, 0, this.text.length);
    if (pos === 0) {
      this.resetCursorBlink();
      return;
    }
    let i = pos;
    // Skip whitespace directly left of cursor
    while (i > 0 && TextBox.isWhitespace(this.text[i - 1])) i--;
    // Then skip non-whitespace (the word)
    while (i > 0 && !TextBox.isWhitespace(this.text[i - 1])) i--;
    if (i < pos) {
      const removedLen = pos - i;
      this.applyEditDelta(i, removedLen, 0);
      this.text = this.text.slice(0, i) + this.text.slice(pos);
      this.cursorPosition = i;
      this.updateDimensions();
    }
    this.resetCursorBlink();
  }

  /**
   * Deletes the next word (Alt/Ctrl+Delete)
   */
  deleteWordRight() {
    if (!this.text) {
      this.text = '';
    }
    // If there's a selection, delete it
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      this.deleteSelection();
      this.resetCursorBlink();
      return;
    }
    let pos = constrain(this.cursorPosition, 0, this.text.length);
    if (pos === this.text.length) {
      this.resetCursorBlink();
      return;
    }
    let i = pos;
    // Skip whitespace directly right of cursor
    while (i < this.text.length && TextBox.isWhitespace(this.text[i])) i++;
    // Then skip non-whitespace (the word)
    while (i < this.text.length && !TextBox.isWhitespace(this.text[i])) i++;
    if (i > pos) {
      const removedLen = i - pos;
      this.applyEditDelta(pos, removedLen, 0);
      this.text = this.text.slice(0, pos) + this.text.slice(i);
      // cursorPosition unchanged
      this.updateDimensions();
    }
    this.resetCursorBlink();
  }

  /**
   * Deletes from cursor to start of current line (Cmd+Backspace)
   */
  deleteToLineStart() {
    if (!this.text) this.text = '';
    // If there's a selection, delete it
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      this.deleteSelection();
      this.resetCursorBlink();
      return;
    }
    let pos = constrain(this.cursorPosition, 0, this.text.length);
    let nl = this.text.lastIndexOf('\n', max(0, pos - 1));
    let start = nl === -1 ? 0 : nl + 1;
    if (start < pos) {
      const removedLen = pos - start;
      this.applyEditDelta(start, removedLen, 0);
      this.text = this.text.slice(0, start) + this.text.slice(pos);
      this.cursorPosition = start;
      this.updateDimensions();
    }
    this.resetCursorBlink();
  }

  /**
   * Deletes from cursor to end of current line (Cmd+Delete)
   */
  deleteToLineEnd() {
    if (!this.text) this.text = '';
    // If there's a selection, delete it
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      this.deleteSelection();
      this.resetCursorBlink();
      return;
    }
    let pos = constrain(this.cursorPosition, 0, this.text.length);
    let nl = this.text.indexOf('\n', pos);
    let end = nl === -1 ? this.text.length : nl;
    if (end > pos) {
      const removedLen = end - pos;
      this.applyEditDelta(pos, removedLen, 0);
      this.text = this.text.slice(0, pos) + this.text.slice(end);
      // cursor stays at pos
      this.updateDimensions();
    }
    this.resetCursorBlink();
  }

  /**
   * Selects all text in the box
   */
  selectAll() {
    this.selectionStart = 0;
    this.selectionEnd = this.text.length;
  }

  /**
   * Gets the currently selected text
   * @returns {string} Selected text or empty string
   */
  getSelectedText() {
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      let start = min(this.selectionStart, this.selectionEnd);
      let end = max(this.selectionStart, this.selectionEnd);
      return this.text.slice(start, end);
    }
    return '';
  }

  /**
   * Deletes the currently selected text
   */
  deleteSelection() {
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      let start = min(this.selectionStart, this.selectionEnd);
      let end = max(this.selectionStart, this.selectionEnd);
      const removedLen = end - start;
      this.applyEditDelta(start, removedLen, 0);
      this.text = this.text.slice(0, start) + this.text.slice(end);
      this.cursorPosition = start;
      this.selectionStart = -1;
      this.selectionEnd = -1;
      this.updateDimensions();
    }
  }

  /**
   * Pastes text at the cursor position
   * @param {string} pastedText - Text to paste
   */
  pasteText(pastedText) {
    // Validate pasted text
    if (pastedText === null || pastedText === undefined) {
      return;
    }

    // Ensure text is defined
    if (this.text === null || this.text === undefined) {
      this.text = '';
    }

    // Sanitize pasted text to normalize line endings and remove invisible characters
    pastedText = Utils.sanitizeText(pastedText);

    // Ensure cursor position is valid
    this.cursorPosition = constrain(this.cursorPosition, 0, this.text.length);

    // If there's a selection, replace it
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      let start = min(this.selectionStart, this.selectionEnd);
      let end = max(this.selectionStart, this.selectionEnd);
      const removedLen = end - start;
      const addedLen = pastedText.length;
      this.applyEditDelta(start, removedLen, addedLen);
      this.text = this.text.slice(0, start) + pastedText + this.text.slice(end);
      this.cursorPosition = start + pastedText.length;
      this.selectionStart = -1;
      this.selectionEnd = -1;
    } else {
      // No selection, insert at cursor position
      const insertPos = this.cursorPosition;
      const addedLen = pastedText.length;
      this.applyEditDelta(insertPos, 0, addedLen);
      this.text = this.text.slice(0, insertPos) + pastedText + this.text.slice(insertPos);
      this.cursorPosition += pastedText.length;
    }
    this.updateDimensions();
  }

  // ==========================================================================
  // HIGHLIGHTING
  // ==========================================================================

  /**
   * Remove any highlights that overlap the given range [start,end)
   */
  removeHighlightsInRange(start, end) {
    if (!this.highlights || this.highlights.length === 0) return;
    this.highlights = this.highlights.filter(h => {
      if (!h) return false;
      const a = Math.max(0, Math.min(this.text.length, h.start));
      const b = Math.max(0, Math.min(this.text.length, h.end));
      // keep highlight if it does not overlap [start,end)
      return (b <= start) || (a >= end);
    });
  }

  /**
   * Add highlight for the current selection. Adds highlights only for the unhighlighted parts of the selection.
   */
  toggleHighlightOnSelection(color = { r: 255, g: 255, b: 0, a: 180 }) {
    if (this.selectionStart == null || this.selectionEnd == null) return;
    let start = Math.min(this.selectionStart, this.selectionEnd);
    let end = Math.max(this.selectionStart, this.selectionEnd);
    if (start === end) return; // nothing selected

    if (!this.highlights) this.highlights = [];

    // Determine whether the entire selection is already covered by existing highlights
    const textLen = (this.text != null) ? this.text.length : 0;
    const selStart = Math.max(0, Math.min(textLen, start));
    const selEnd = Math.max(0, Math.min(textLen, end));

    // Collect intersections of existing highlights with the selection
    let pieces = [];
    for (const h of this.highlights) {
      if (!h) continue;
      const a = Math.max(selStart, Math.max(0, Math.min(textLen, h.start)));
      const b = Math.min(selEnd, Math.max(0, Math.min(textLen, h.end)));
      if (a < b) pieces.push({ start: a, end: b });
    }

    // Merge pieces to detect gaps
    pieces.sort((A, B) => A.start - B.start);
    let merged = [];
    for (const p of pieces) {
      if (merged.length === 0 || merged[merged.length - 1].end < p.start) {
        merged.push({ ...p });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, p.end);
      }
    }

    // Check for full coverage (no gaps between selStart and selEnd)
    let cur = selStart;
    let fullyCovered = merged.length > 0;
    for (const m of merged) {
      if (m.start > cur) { fullyCovered = false; break; }
      cur = Math.max(cur, m.end);
    }
    if (cur < selEnd) fullyCovered = false;

    if (fullyCovered) {
      // Remove selection range from highlights (trim/split as needed)
      const newH = [];
      for (const h of this.highlights) {
        if (!h) continue;
        const hStart = Math.max(0, Math.min(textLen, h.start));
        const hEnd = Math.max(0, Math.min(textLen, h.end));
        if (hEnd <= selStart || hStart >= selEnd) {
          // no overlap
          newH.push(h);
        } else {
          // overlap exists - keep left part if any
          if (hStart < selStart) {
            newH.push({ start: hStart, end: selStart, color: h.color });
          }
          // keep right part if any
          if (hEnd > selEnd) {
            newH.push({ start: selEnd, end: hEnd, color: h.color });
          }
          // middle part inside selection is removed
        }
      }
      this.highlights = newH;
    } else {
      // Not fully covered: add a highlight for the entire selection
      this.highlights.push({ start: selStart, end: selEnd, color });
    }
  }

  /**
   * Apply an edit delta to all highlights so they remain valid after text edits.
   * editStart: index where edit begins (in pre-edit coordinates)
   * removedLen: number of characters removed at editStart
   * addedLen: number of characters inserted at editStart
   */
  applyEditDelta(editStart, removedLen, addedLen) {
    if (!this.highlights || this.highlights.length === 0) return;
    const textLen = (this.text != null) ? this.text.length : 0;
    const removed = Math.max(0, Number.isFinite(removedLen) ? removedLen : 0);
    const added = Math.max(0, Number.isFinite(addedLen) ? addedLen : 0);
    const net = added - removed;

    const mapPos = (pos) => {
      if (!Number.isFinite(pos)) return pos;
      if (pos < editStart) return pos;
      if (pos >= editStart + removed) return pos + net;
      // pos is inside removed region -> map to editStart
      return editStart;
    };

    const newHighlights = [];
    for (const h of this.highlights) {
      if (!h || typeof h.start !== 'number' || typeof h.end !== 'number') continue;
      const s = Math.max(0, Math.min(textLen, Math.floor(h.start)));
      const e = Math.max(0, Math.min(textLen, Math.floor(h.end)));
      if (e <= s) continue;
      const ns = mapPos(s);
      const ne = mapPos(e);
      if (ne > ns) {
        newHighlights.push({ start: ns, end: ne, color: h.color });
      }
      // else drop empty/invalid highlight
    }
    this.highlights = newHighlights;
  }

  // ============================================================================
  // DRAGGING AND RESIZING
  // ============================================================================

  /**
   * Starts dragging the box
   * @param {number} mx - Mouse X in world coordinates
   * @param {number} my - Mouse Y in world coordinates
   */
  startDrag(mx, my) {
    this.isDragging = true;
    this.dragOffsetX = this.x - mx;
    this.dragOffsetY = this.y - my;
    // Store initial position to detect if drag actually moved the box
    this._dragStartX = this.x;
    this._dragStartY = this.y;
  }

  /**
   * Updates box position while dragging
   * @param {number} mx - Mouse X in world coordinates
   * @param {number} my - Mouse Y in world coordinates
   */
  drag(mx, my) {
    if (this.isDragging) {
      // Validate mouse coordinates
      if (mx == null || my == null || isNaN(mx) || isNaN(my)) {
        return;
      }

      // Move in world space - no constraints (allow infinite canvas)
      this.x = mx + this.dragOffsetX;
      this.y = my + this.dragOffsetY;

      // DON'T sync during drag - only sync final state at stopDrag()
      // This prevents creating undo items without proper origin tracking
      // and avoids network overhead during continuous operation
    }
  }

  /**
   * Stops dragging the box
   * @param {boolean} skipSync - If true, don't sync changes (caller will handle batch sync)
   * @returns {boolean} true if position changed during drag
   */
  stopDrag(skipSync = false) {
    const wasDragging = this.isDragging;
    this.isDragging = false;

    let positionChanged = false;
    if (wasDragging) {
      // Check if position actually changed during drag
      positionChanged =
        (this._dragStartX !== undefined && this._dragStartY !== undefined) &&
        (Math.abs(this.x - this._dragStartX) > TextBox.CHANGE_THRESHOLD ||
          Math.abs(this.y - this._dragStartY) > TextBox.CHANGE_THRESHOLD);

      if (!skipSync) {
        if (positionChanged) {
          // Sync final position WITH transaction wrapper for clean undo
          // This creates a single undo item for the drag operation
          TextBox._notifyChange(this);
        } else {
          // Position didn't change, just sync to ensure consistency
          TextBox._notifyChange(this);
        }
      }
    }

    // Clean up tracking variables
    this._dragStartX = undefined;
    this._dragStartY = undefined;

    return positionChanged;
  }

  /**
   * Starts resizing the box
   * @param {number} mx - Mouse X in world coordinates
   * @param {number} my - Mouse Y in world coordinates
   */
  startResize(mx, my) {
    this.isResizing = true;
    this.userResized = true; // mark that the user has manually resized the box
    this.resizeStartX = mx;
    this.resizeStartY = my;
    this.resizeStartWidth = this.width;
    this.resizeStartHeight = this.height;
    // Remember fixed top-left so only bottom-right corner moves
    this.resizeStartLeft = this.x - this.width / 2;
    this.resizeStartTop = this.y - this.height / 2;
  }

  /**
   * Updates box size while resizing
   * @param {number} mx - Mouse X in world coordinates
   * @param {number} my - Mouse Y in world coordinates
   */
  resize(mx, my) {
    if (this.isResizing) {
      // Validate mouse coordinates
      if (mx == null || my == null || isNaN(mx) || isNaN(my)) {
        return;
      }

      let deltaX = mx - this.resizeStartX;
      let deltaY = my - this.resizeStartY;

      // Prevent NaN
      if (isNaN(deltaX) || isNaN(deltaY)) {
        return;
      }

      // New width/height when dragging bottom-right while keeping left/top fixed
      let rawWidth = this.resizeStartWidth + deltaX;   // right edge shifts by deltaX
      let rawHeight = this.resizeStartHeight + deltaY; // bottom edge shifts by deltaY

      // If this box contains an image, preserve its aspect ratio during resize
      if (this.imageUrl) {
        // Determine aspect ratio (width/height). Prefer natural image size if available
        let aspect = null;
        if (this.naturalImageWidth && this.naturalImageHeight) {
          aspect = this.naturalImageWidth / this.naturalImageHeight;
        } else if (this.img && this.img.width && this.img.height) {
          aspect = this.img.width / this.img.height;
        } else if (this.resizeStartWidth && this.resizeStartHeight) {
          aspect = this.resizeStartWidth / this.resizeStartHeight;
        }
        if (aspect && isFinite(aspect) && aspect > 0) {
          // Base new width on horizontal drag (rawWidth), clamp min size
          let newWidth = max(this.minWidth, rawWidth);
          let newHeight = max(this.minHeight, newWidth / aspect);
          this.width = newWidth;
          this.height = newHeight;
          // Recompute center so left/top remain fixed while bottom-right moves
          this.x = this.resizeStartLeft + this.width / 2;
          this.y = this.resizeStartTop + this.height / 2;
          // DON'T sync during resize - only sync at stopResize()
          return;
        }
      }

      // Minimum width to fit the longest word (so words don't overflow)
      let minRequiredWidth = this.minWidth;
      textSize(this.fontSize);
      if (this.text) {
        let words = this.text.split(/[\s\n]+/);
        for (let word of words) {
          if (word) {
            let wordWidth = textWidth(word) + this.padding * 2;
            if (wordWidth > minRequiredWidth) minRequiredWidth = wordWidth;
          }
        }
      }

      // Clamp width first, then compute required height based on wrapped lines for this width
      let newWidth = max(minRequiredWidth, rawWidth);
      let wrappedLines = this.wrapTextForWidth(newWidth);
      let minRequiredHeight = max(this.minHeight, wrappedLines.length * this.fontSize * TextBox.LINE_HEIGHT_MULTIPLIER + this.padding * 2);
      let newHeight = max(minRequiredHeight, rawHeight);

      // Apply new size
      this.width = newWidth;
      this.height = newHeight;

      // Recompute center so left/top remain fixed while bottom-right moves
      this.x = this.resizeStartLeft + this.width / 2;
      this.y = this.resizeStartTop + this.height / 2;

      // DON'T sync during resize - only sync final state at stopResize()
    }
  }

  wrapTextForWidth(targetWidth) {
    let lines = this.text.split('\n');
    let wrappedLines = [];
    // Guard width for invalid targetWidth
    let baseWidth = (targetWidth != null && isFinite(targetWidth)) ? targetWidth : ((this.width != null && isFinite(this.width)) ? this.width : this.minWidth);
    let maxTextWidth = max(10, baseWidth - this.padding * 2);

    textSize(this.fontSize);

    for (let line of lines) {
      if (textWidth(line) <= maxTextWidth) {
        wrappedLines.push(line);
      } else {
        // Break line into words
        let words = line.split(' ');
        let currentLine = '';

        for (let i = 0; i < words.length; i++) {
          let testLine = currentLine + (currentLine ? ' ' : '') + words[i];

          if (textWidth(testLine) <= maxTextWidth) {
            currentLine = testLine;
          } else {
            // If current line is not empty, push it
            if (currentLine) {
              wrappedLines.push(currentLine);
              currentLine = words[i];
            } else {
              // Single word is too long, break it by characters
              let word = words[i];
              let charLine = '';
              for (let char of word) {
                if (textWidth(charLine + char) <= maxTextWidth) {
                  charLine += char;
                } else {
                  if (charLine) wrappedLines.push(charLine);
                  charLine = char;
                }
              }
              currentLine = charLine;
            }
          }
        }

        // Push the last line
        if (currentLine) {
          wrappedLines.push(currentLine);
        }
      }
    }

    return wrappedLines.length > 0 ? wrappedLines : [''];
  }

  /**
   * Stops resizing the box
   * @param {boolean} skipSync - If true, don't sync changes (caller will handle batch sync)
   * @returns {boolean} true if size changed during resize
   */
  stopResize(skipSync = false) {
    const wasResizing = this.isResizing;
    this.isResizing = false;

    let sizeChanged = false;
    if (wasResizing) {
      // Check if size actually changed during resize
      sizeChanged =
        (this.resizeStartWidth !== undefined && this.resizeStartHeight !== undefined) &&
        (Math.abs(this.width - this.resizeStartWidth) > TextBox.CHANGE_THRESHOLD ||
          Math.abs(this.height - this.resizeStartHeight) > TextBox.CHANGE_THRESHOLD);

      // Always reflow and update position
      const prevTop = this.y - this.height / 2;
      this.updateDimensions();
      this.y = prevTop + this.height / 2;

      if (!skipSync) {
        if (sizeChanged) {
          // Sync final size WITH transaction wrapper for clean undo
          // This creates a single undo item for the resize operation
          TextBox._notifyChange(this);
        } else {
          // Size didn't change, just sync to ensure consistency
          TextBox._notifyChange(this);
        }
      }
    }

    return sizeChanged;
  }

  // ============================================================================
  // CONNECTIONS AND GEOMETRY
  // ============================================================================

  /**
   * Gets the connection point on the edge of the box nearest to another box
   * @param {TextBox} otherBox - The target box
   * @returns {Object} Point with x and y coordinates
   */
  getConnectionPoint(otherBox) {
    // Validate other box
    if (!otherBox || otherBox.x == null || otherBox.y == null) {
      return { x: this.x, y: this.y };
    }

    let dx = otherBox.x - this.x;
    let dy = otherBox.y - this.y;

    // Avoid division by zero and handle same position
    if (dx === 0 && dy === 0) {
      return { x: this.x + this.width / 2, y: this.y };
    }

    let hw = this.width / 2;
    let hh = this.height / 2;

    // Calculate intersection with each edge and pick the correct one
    let px, py;

    // Calculate the ratio to reach each edge (handle division by zero)
    let t_right = (dx > 0) ? hw / dx : Infinity;
    let t_left = (dx < 0) ? -hw / dx : Infinity;
    let t_bottom = (dy > 0) ? hh / dy : Infinity;
    let t_top = (dy < 0) ? -hh / dy : Infinity;

    // Find the smallest positive ratio (closest edge intersection)
    let t = min(t_right, t_left, t_bottom, t_top);

    // Validate t
    if (!isFinite(t) || isNaN(t)) {
      return { x: this.x, y: this.y };
    }

    // Calculate the intersection point
    px = this.x + t * dx;
    py = this.y + t * dy;

    // Validate results
    if (isNaN(px) || isNaN(py) || !isFinite(px) || !isFinite(py)) {
      return { x: this.x, y: this.y };
    }

    // Constrain to box bounds (for safety)
    px = constrain(px, this.x - hw, this.x + hw);
    py = constrain(py, this.y - hh, this.y + hh);

    return { x: px, y: py };
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Serializes the text box to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      text: this.text,
      imageUrl: this.imageUrl || null,
      width: this.width,
      height: this.height,
      backgroundColor: this.backgroundColor,
      highlights: Array.isArray(this.highlights) && this.highlights.length > 0 ? this.highlights.map(h => ({ start: h.start, end: h.end, color: h.color })) : undefined
    };
  }

  /**
   * Creates a TextBox from JSON data
   * Uses shared utilities for validation when available
   * @param {Object} data - JSON data to load from
   * @returns {TextBox|null} New TextBox instance or null if invalid
   */
  static fromJSON(data) {
    // Validate input data
    if (!data || typeof data !== 'object') {
      Utils.Logger.error('[TextBox] fromJSON: Invalid box data');
      return null;
    }

    // Use shared utility for number validation if available
    const isValid = Utils.isValidNumber;

    // Validate required fields with defaults
    let x = isValid(data.x) ? data.x : 100;
    let y = isValid(data.y) ? data.y : 100;
    let text = data.text != null ? Utils.sanitizeText(String(data.text)) : 'New Node';

    let box = new TextBox(x, y, text);

    // Preserve existing ID if present (for loading saved maps), otherwise keep generated one
    if (data.id && typeof data.id === 'string') {
      box.id = data.id;
    }

    // Set optional dimensions if valid
    if (isValid(data.width) && data.width > 0) {
      box.width = data.width;
      // Preserve loaded width as a manual setting so updates don't auto-shrink
      box.userResized = true;
    }
    if (isValid(data.height) && data.height > 0) {
      box.height = data.height;
    }

    // Load background color if present - use shared utility for color validation
    if (data.backgroundColor && typeof data.backgroundColor === 'object') {
      const c = data.backgroundColor;
      if (typeof Utils !== 'undefined' && Utils.validateColor) {
        box.backgroundColor = Utils.validateColor(c);
      } else {
        // Fallback with proper clamping to valid ranges (0-255)
        const clampColor = (val, def) => {
          if (!Number.isFinite(val)) return def;
          return Math.max(0, Math.min(255, val));
        };
        const r = clampColor(c.r, 255);
        const g = clampColor(c.g, 255);
        const b = clampColor(c.b, 255);
        box.backgroundColor = { r, g, b };
      }
    }
    // Load image URL if present
    if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.trim() !== '') {
      try {
        box.setImageFromUrl(data.imageUrl);
      } catch (e) {
        console.warn('Failed to set image from JSON', e);
      }
    }
    // Load highlights if present
    if (Array.isArray(data.highlights)) {
      box.highlights = [];
      const textLen = String(box.text || '').length;
      for (const h of data.highlights) {
        if (!h || typeof h.start !== 'number' || typeof h.end !== 'number') continue;
        const start = Math.max(0, Math.min(textLen, Math.floor(h.start)));
        const end = Math.max(0, Math.min(textLen, Math.floor(h.end)));
        if (start >= end) continue;

        // Validate highlight color with proper clamping
        let color;
        if (typeof Utils !== 'undefined' && Utils.validateColor) {
          color = Utils.validateColor(h.color, { r: 255, g: 255, b: 0, a: 180 });
        } else if (h.color && typeof h.color === 'object') {
          const clampColor = (val, def) => {
            if (!Number.isFinite(val)) return def;
            return Math.max(0, Math.min(255, val));
          };
          color = {
            r: clampColor(h.color.r, 255),
            g: clampColor(h.color.g, 255),
            b: clampColor(h.color.b, 0),
            a: h.color.a !== undefined ? clampColor(h.color.a, 180) : 180
          };
        } else {
          color = { r: 255, g: 255, b: 0, a: 180 };
        }
        box.highlights.push({ start, end, color });
      }
    }
    // PDF embedding removed: we no longer load or store PDF URLs. If a map
    // contains a PDF URL, it will be ignored to avoid embedding binary data.

    return box;
  }

  // ============================================================================
  // CURSOR HELPERS
  // ============================================================================

  /**
   * Resets cursor blink state (makes cursor visible)
   */
  resetCursorBlink() {
    this.cursorBlinkTime = millis();
    this.cursorVisible = true;
  }

  moveCursorLeft() {
    if (this.text == null) {
      this.text = '';
    }
    if (this.cursorPosition > 0) {
      this.cursorPosition--;
      this.selectionStart = -1;
      this.selectionEnd = -1;
      this.resetCursorBlink();
    }
  }

  moveCursorRight() {
    if (this.text == null) {
      this.text = '';
    }
    if (this.cursorPosition < this.text.length) {
      this.cursorPosition++;
      this.selectionStart = -1;
      this.selectionEnd = -1;
      this.resetCursorBlink();
    }
  }

  moveCursorUp() {
    let wrappedLines = this.wrapText(this.text);
    let { lineIndex, posInLine } = this.getCursorLineAndPosition(wrappedLines);

    if (lineIndex > 0 && this.cachedLineCharMap) {
      // Move to previous line, same position or end of line
      let prevLineLength = wrappedLines[lineIndex - 1].length;
      let newPosInLine = min(posInLine, prevLineLength);

      // Use character map to get the absolute position
      let prevLineStart = this.cachedLineCharMap[lineIndex - 1];
      this.cursorPosition = prevLineStart + newPosInLine;
      this.selectionStart = -1;
      this.selectionEnd = -1;
      this.resetCursorBlink();
    }
  }

  moveCursorDown() {
    let wrappedLines = this.wrapText(this.text);
    let { lineIndex, posInLine } = this.getCursorLineAndPosition(wrappedLines);

    if (lineIndex < wrappedLines.length - 1 && this.cachedLineCharMap) {
      // Move to next line, same position or end of line
      let nextLineLength = wrappedLines[lineIndex + 1].length;
      let newPosInLine = min(posInLine, nextLineLength);

      // Use character map to get the absolute position
      let nextLineStart = this.cachedLineCharMap[lineIndex + 1];
      this.cursorPosition = nextLineStart + newPosInLine;
      this.selectionStart = -1;
      this.selectionEnd = -1;
      this.resetCursorBlink();
    }
  }

  getCursorLineAndPosition(wrappedLines) {
    // Validate inputs
    if (!wrappedLines || wrappedLines.length === 0) {
      return { lineIndex: 0, posInLine: 0 };
    }

    if (this.text == null) {
      this.text = '';
    }

    // Ensure cursor position is valid
    this.cursorPosition = constrain(this.cursorPosition, 0, this.text.length);

    // Use character map for precise mapping
    if (!this.cachedLineCharMap || this.cachedLineCharMap.length === 0) {
      return { lineIndex: 0, posInLine: 0 };
    }

    // Find which wrapped line contains the cursor position
    let lineIndex = 0;
    for (let i = 0; i < this.cachedLineCharMap.length; i++) {
      let lineStart = this.cachedLineCharMap[i];
      let lineEnd = (i < this.cachedLineCharMap.length - 1)
        ? this.cachedLineCharMap[i + 1]
        : this.text.length;
      const isLast = (i === this.cachedLineCharMap.length - 1);

      // Use half-open intervals [start, end) except on the last line where end is inclusive
      if ((this.cursorPosition >= lineStart && this.cursorPosition < lineEnd) ||
        (isLast && this.cursorPosition >= lineStart && this.cursorPosition <= lineEnd)) {
        lineIndex = i;
        break;
      }

      // If cursor is past all mapped positions, it's on the last line
      if (isLast) {
        lineIndex = i;
      }
    }

    // Calculate position within the wrapped line
    let lineStartPos = this.cachedLineCharMap[lineIndex];
    let posInLine = this.cursorPosition - lineStartPos;

    // Ensure posInLine doesn't exceed the wrapped line length
    if (wrappedLines[lineIndex]) {
      posInLine = min(posInLine, wrappedLines[lineIndex].length);
    }

    return { lineIndex, posInLine };
  }

  drawCursor(wrappedLines, textX, startY, lineHeight) {
    // Validate inputs
    if (!wrappedLines || wrappedLines.length === 0 ||
      textX == null || startY == null || lineHeight == null ||
      isNaN(textX) || isNaN(startY) || isNaN(lineHeight)) {
      return;
    }

    // Update cursor blink state
    let currentTime = millis();
    if (currentTime - this.cursorBlinkTime > this.cursorBlinkRate) {
      this.cursorVisible = !this.cursorVisible;
      this.cursorBlinkTime = currentTime;
    }

    if (!this.cursorVisible) {
      return;
    }

    // Find cursor position in wrapped text
    let { lineIndex, posInLine } = this.getCursorLineAndPosition(wrappedLines);

    // Validate line index
    if (lineIndex < 0 || lineIndex >= wrappedLines.length) {
      return;
    }

    // Calculate cursor screen position
    textSize(this.fontSize);
    let lineText = wrappedLines[lineIndex] || '';
    let textBeforeCursor = lineText.slice(0, max(0, posInLine));
    let cursorX = textX + textWidth(textBeforeCursor);
    let cursorY = startY + lineIndex * lineHeight;

    // Validate cursor position
    if (isNaN(cursorX) || isNaN(cursorY)) {
      return;
    }

    // Draw cursor line and scale stroke with global zoom for visibility
    push();
    const zoomFactor = Utils.getClampedZoomFactor();
    const cursorColor = TextBox.COLORS.CURSOR;
    stroke(cursorColor.r, cursorColor.g, cursorColor.b);
    strokeWeight(2 / zoomFactor);
    line(cursorX, cursorY - lineHeight / 3, cursorX, cursorY + lineHeight / 3);
    pop();
  }

  drawSelection(wrappedLines, textX, startY, lineHeight) {
    // Validate inputs
    if (!wrappedLines || wrappedLines.length === 0 ||
      textX == null || startY == null || lineHeight == null ||
      isNaN(textX) || isNaN(startY) || isNaN(lineHeight)) {
      return;
    }

    let start = min(this.selectionStart, this.selectionEnd);
    let end = max(this.selectionStart, this.selectionEnd);

    if (start === end || start < 0 || end < 0) return;

    textSize(this.fontSize);

    // Convert absolute positions to line positions
    let startInfo = this.getLineAndPositionFromChar(start, wrappedLines);
    let endInfo = this.getLineAndPositionFromChar(end, wrappedLines);

    // Validate line indices
    if (startInfo.lineIndex < 0 || startInfo.lineIndex >= wrappedLines.length ||
      endInfo.lineIndex < 0 || endInfo.lineIndex >= wrappedLines.length) {
      return;
    }

    push();
    const selColor = TextBox.COLORS.SELECTION_HIGHLIGHT;
    fill(selColor.r, selColor.g, selColor.b, selColor.a);
    noStroke();

    if (startInfo.lineIndex === endInfo.lineIndex) {
      // Selection within single line
      let lineText = wrappedLines[startInfo.lineIndex] || '';
      let x1 = textX + textWidth(lineText.slice(0, max(0, startInfo.posInLine)));
      let x2 = textX + textWidth(lineText.slice(0, max(0, endInfo.posInLine)));
      let y = startY + startInfo.lineIndex * lineHeight;

      if (!isNaN(x1) && !isNaN(x2) && !isNaN(y)) {
        rect(x1, y - lineHeight / 3, x2 - x1, lineHeight * 0.67);
      }
    } else {
      // Multi-line selection
      for (let i = startInfo.lineIndex; i <= endInfo.lineIndex; i++) {
        if (i < 0 || i >= wrappedLines.length) continue;

        let lineText = wrappedLines[i] || '';
        let y = startY + i * lineHeight;
        let x1, x2;

        if (i === startInfo.lineIndex) {
          // First line: from start position to end of line
          x1 = textX + textWidth(lineText.slice(0, max(0, startInfo.posInLine)));
          x2 = textX + textWidth(lineText);
        } else if (i === endInfo.lineIndex) {
          // Last line: from beginning to end position
          x1 = textX;
          x2 = textX + textWidth(lineText.slice(0, max(0, endInfo.posInLine)));
        } else {
          // Middle lines: entire line
          x1 = textX;
          x2 = textX + textWidth(lineText);
        }

        if (!isNaN(x1) && !isNaN(x2) && !isNaN(y)) {
          rect(x1, y - lineHeight / 3, x2 - x1, lineHeight * 0.67);
        }
      }
    }

    pop();
  }

  /**
   * Draw persistent highlights stored in `this.highlights`.
   */
  drawHighlights(wrappedLines, textX, startY, lineHeight) {
    if (!this.highlights || this.highlights.length === 0) return;
    if (!wrappedLines || wrappedLines.length === 0) return;
    textSize(this.fontSize);
    push();
    noStroke();
    for (const hl of this.highlights) {
      if (!hl || hl.start == null || hl.end == null) continue;
      let start = Math.max(0, Math.min(this.text.length, hl.start));
      let end = Math.max(0, Math.min(this.text.length, hl.end));
      if (start >= end) continue;
      let startInfo = this.getLineAndPositionFromChar(start, wrappedLines);
      let endInfo = this.getLineAndPositionFromChar(end, wrappedLines);
      // Use hl.color if present, else default yellow
      const c = hl.color && typeof hl.color === 'object' ? hl.color : { r: 255, g: 255, b: 0, a: 180 };
      const alpha = (c.a != null) ? c.a : 180;
      fill(c.r, c.g, c.b, alpha);

      if (startInfo.lineIndex === endInfo.lineIndex) {
        const lineText = wrappedLines[startInfo.lineIndex] || '';
        const x1 = textX + textWidth(lineText.slice(0, Math.max(0, startInfo.posInLine)));
        const x2 = textX + textWidth(lineText.slice(0, Math.max(0, endInfo.posInLine)));
        const y = startY + startInfo.lineIndex * lineHeight;
        if (!isNaN(x1) && !isNaN(x2) && !isNaN(y)) {
          rect(x1, y - lineHeight / 3, x2 - x1, lineHeight * 0.67);
        }
      } else {
        for (let i = startInfo.lineIndex; i <= endInfo.lineIndex; i++) {
          if (i < 0 || i >= wrappedLines.length) continue;
          const lineText = wrappedLines[i] || '';
          const y = startY + i * lineHeight;
          let x1, x2;
          if (i === startInfo.lineIndex) {
            x1 = textX + textWidth(lineText.slice(0, Math.max(0, startInfo.posInLine)));
            x2 = textX + textWidth(lineText);
          } else if (i === endInfo.lineIndex) {
            x1 = textX;
            x2 = textX + textWidth(lineText.slice(0, Math.max(0, endInfo.posInLine)));
          } else {
            x1 = textX;
            x2 = textX + textWidth(lineText);
          }
          if (!isNaN(x1) && !isNaN(x2) && !isNaN(y)) {
            rect(x1, y - lineHeight / 3, x2 - x1, lineHeight * 0.67);
          }
        }
      }
    }
    pop();
  }

  getLineAndPositionFromChar(charPos, wrappedLines) {
    // Use character map for precise mapping
    if (!this.cachedLineCharMap || this.cachedLineCharMap.length === 0) {
      return { lineIndex: 0, posInLine: 0 };
    }

    // Find which wrapped line contains the character position
    let lineIndex = 0;
    for (let i = 0; i < this.cachedLineCharMap.length; i++) {
      let lineStart = this.cachedLineCharMap[i];
      let lineEnd = (i < this.cachedLineCharMap.length - 1)
        ? this.cachedLineCharMap[i + 1]
        : this.text.length;
      const isLast = (i === this.cachedLineCharMap.length - 1);

      // Use half-open intervals [start, end) except on the last line where end is inclusive
      if ((charPos >= lineStart && charPos < lineEnd) ||
        (isLast && charPos >= lineStart && charPos <= lineEnd)) {
        lineIndex = i;
        break;
      }

      // If charPos is past all mapped positions, it's on the last line
      if (isLast) {
        lineIndex = i;
      }
    }

    // Calculate position within the wrapped line
    let lineStartPos = this.cachedLineCharMap[lineIndex];
    let posInLine = charPos - lineStartPos;

    // Ensure posInLine doesn't exceed the wrapped line length
    if (wrappedLines[lineIndex]) {
      posInLine = min(posInLine, wrappedLines[lineIndex].length);
    }

    return { lineIndex, posInLine };
  }
}
