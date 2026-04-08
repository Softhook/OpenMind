/**
 * Connection class - represents a directional arrow connection between two boxes.
 * 
 * Features:
 * - Directional arrows showing data flow from one box to another
 * - Visual feedback for selection state
 * - Mouse interaction for selection and reattachment
 * - Automatic edge-to-edge routing between boxes
 * 
 * Dependencies:
 * - Uses shared utilities from utils.js for validation, geometry, and rendering
 * - Requires p5.js for drawing operations
 */
class Connection {
  // ============================================================================
  // STATIC CONSTANTS
  // ============================================================================

  // Visual constants
  static ARROW_SIZE = 12;              // Size of arrow head in pixels
  static HIT_THRESHOLD = 7;            // Hit detection radius for line clicks
  static STROKE_WEIGHT_NORMAL = 2;     // Line thickness when not selected
  static STROKE_WEIGHT_SELECTED = 3;   // Line thickness when selected

  // Color constants - delegate directly to the centralized ColorPalette
  static COLORS = ColorPalette.CONNECTION;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  /**
   * Creates a new Connection between two boxes.
   * The connection is directional, flowing from fromBox to toBox.
   * @param {TextBox} fromBox - Source box (tail of arrow)
   * @param {TextBox} toBox - Target box (head of arrow)
   */
  constructor(fromBox, toBox) {
    // fromBox is always required; toBox may be null for subclasses (e.g. TimelineConnection)
    if (!fromBox) {
      Utils.Logger.error('[Connection] Constructor called with null fromBox:', { fromBox, toBox });
    }
    this.fromBox = fromBox;
    this.toBox = toBox;
    this.arrowSize = Connection.ARROW_SIZE;
    this.selected = false;

    // Cache for connection endpoints; invalidated whenever either box moves or resizes.
    // Stored as two Float64Arrays [x, y, width, height] – one per box – so that
    // staleness detection is a pure numeric comparison with zero allocations per frame.
    this._cachedEndpoints = null;
    this._cachedFromGeom = new Float64Array(4); // [x, y, width, height]
    this._cachedToGeom   = new Float64Array(4); // [x, y, width, height]
    this._cacheValid = false;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Gets the connection endpoints on the edges of the boxes.
   * Calculates where the connection line should start and end based on
   * the positions of the two boxes.
   * Uses caching to avoid recalculating when boxes haven't moved.
   * Cache staleness is checked via numeric field comparison (no allocations per frame).
   * @returns {Object|null} Object with {start, end} points, or null if invalid
   * @private
   */
  _getConnectionEndpoints() {
    if (!this.fromBox || !this.toBox) return null;

    // Return cached result if neither box has moved or resized (zero-allocation check)
    if (this._cacheValid &&
        this._cachedFromGeom[0] === this.fromBox.x &&
        this._cachedFromGeom[1] === this.fromBox.y &&
        this._cachedFromGeom[2] === this.fromBox.width &&
        this._cachedFromGeom[3] === this.fromBox.height &&
        this._cachedToGeom[0]   === this.toBox.x &&
        this._cachedToGeom[1]   === this.toBox.y &&
        this._cachedToGeom[2]   === this.toBox.width &&
        this._cachedToGeom[3]   === this.toBox.height) {
      return this._cachedEndpoints;
    }

    // Recalculate endpoints
    const start = this.fromBox.getConnectionPoint(this.toBox);
    const end = this.toBox.getConnectionPoint(this.fromBox);

    // Validate both connection points
    if (!start || !end ||
      !Utils.areValidCoordinates(start.x, start.y) ||
      !Utils.areValidCoordinates(end.x, end.y)) {
      return null;
    }

    // Update cache – snapshot current geometry into the pre-allocated typed arrays
    this._cachedEndpoints = { start, end };
    this._cachedFromGeom[0] = this.fromBox.x;
    this._cachedFromGeom[1] = this.fromBox.y;
    this._cachedFromGeom[2] = this.fromBox.width;
    this._cachedFromGeom[3] = this.fromBox.height;
    this._cachedToGeom[0]   = this.toBox.x;
    this._cachedToGeom[1]   = this.toBox.y;
    this._cachedToGeom[2]   = this.toBox.width;
    this._cachedToGeom[3]   = this.toBox.height;
    this._cacheValid = true;

    return this._cachedEndpoints;
  }

  /**
   * Calculates the shortened line endpoint that terminates inside the arrowhead.
   * Clamps the shortening distance to avoid overshooting when boxes are very close.
   * @returns {Object|null} Object with {start, shortenedEnd, angle} or null if invalid
   * @private
   */
  _getShortenedLineEndpoints() {
    const endpoints = this._getConnectionEndpoints();
    if (!endpoints) return null;

    const { start, end } = endpoints;

    // Calculate segment length to avoid overshooting
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    // Calculate angle (returned for reuse in draw())
    const angle = Math.atan2(dy, dx);
    if (!Utils.isValidNumber(angle)) return null;

    // If segment is too short, don't shorten (prevents line flipping)
    if (segmentLength <= this.arrowSize) {
      return { start, shortenedEnd: start, angle };
    }

    const shortenedEnd = {
      x: end.x - this.arrowSize * Math.cos(angle),
      y: end.y - this.arrowSize * Math.sin(angle)
    };

    return { start, shortenedEnd, angle };
  }

  /**
   * Gets the world-space position of the arrow head (end point at toBox edge).
   * This is where the visual arrow tip appears.
   * @returns {Object|null} Point with x and y coordinates, or null if invalid
   */
  getArrowHeadPosition() {
    if (this._boxesOverlap()) return null;
    const endpoints = this._getConnectionEndpoints();
    return endpoints ? endpoints.end : null;
  }

  /**
   * Gets the world-space position of the tail (start point at fromBox edge).
   * This is the non-arrow end of the connection line.
   * @returns {Object|null} Point with x and y coordinates, or null if invalid
   */
  getTailPosition() {
    if (this._boxesOverlap()) return null;
    const endpoints = this._getConnectionEndpoints();
    return endpoints ? endpoints.start : null;
  }

  /**
   * Returns true if the world-space mouse is within the zoom-scaled hit radius of
   * the given point.  Shared by isMouseOverArrowHead() and isMouseOverTail() so
   * that the hit-detection logic lives in exactly one place.
   * @param {{x:number, y:number}|null} point
   * @returns {boolean}
   * @private
   */
  _isMouseOverEndpoint(point) {
    if (!point) return false;
    const { x: mx, y: my } = Utils.getWorldMouseCoordinates();
    if (!Utils.areValidCoordinates(mx, my)) return false;
    // Scale hit radius with zoom: smaller at high zoom, larger at low zoom
    const safeZoom = Utils.clamp(Utils.getCurrentZoom(), 0.25, 4);
    const hitRadius = 10 / Math.sqrt(safeZoom);
    return Utils.distance(mx, my, point.x, point.y) <= hitRadius;
  }

  /**
   * Checks if mouse is over the arrow head (for reattachment).
   * @returns {boolean} true if mouse is over arrow head
   */
  isMouseOverArrowHead() {
    if (this._boxesOverlap()) return false;
    return this._isMouseOverEndpoint(this.getArrowHeadPosition());
  }

  /**
   * Checks if mouse is over the tail (fromBox end) of the connection.
   * Uses the same hit radius as isMouseOverArrowHead() so both ends feel
   * equally responsive to pick up.
   * @returns {boolean} true if mouse is over the tail
   */
  isMouseOverTail() {
    if (this._boxesOverlap()) return false;
    return this._isMouseOverEndpoint(this.getTailPosition());
  }

  /**
   * Applies styling colors based on selection state.
   * Consolidates the duplicate color logic from draw().
   * @param {boolean} isStroke - If true, apply stroke; if false, apply fill
   * @private
   */
  _applySelectionStyle(isStroke = true) {
    const color = this.selected ? Connection.COLORS.SELECTED : Connection.COLORS.NORMAL;
    const weight = this.selected ? Connection.STROKE_WEIGHT_SELECTED : Connection.STROKE_WEIGHT_NORMAL;

    if (isStroke) {
      Utils.applyStroke(color, weight);
    } else {
      Utils.applyFill(color);
    }
  }

  /**
   * Checks whether the two endpoint boxes overlap (axis-aligned bounds).
   * Used to suppress drawing/interaction when the connection should be hidden.
   * @returns {boolean}
   * @private
   */
  _boxesOverlap() {
    const a = this.fromBox;
    const b = this.toBox;
    if (!a || !b) return false;

    const valid = (box) => Utils.isValidNumber(box.x) && Utils.isValidNumber(box.y) &&
      Utils.isValidNumber(box.width) && Utils.isValidNumber(box.height);
    if (!valid(a) || !valid(b)) return false;

    // Add a small margin so near-overlaps also hide the connection/arrow
    const margin = 6;

    const aLeft = a.x - a.width / 2 - margin;
    const aRight = a.x + a.width / 2 + margin;
    const aTop = a.y - a.height / 2 - margin;
    const aBottom = a.y + a.height / 2 + margin;

    const bLeft = b.x - b.width / 2 - margin;
    const bRight = b.x + b.width / 2 + margin;
    const bTop = b.y - b.height / 2 - margin;
    const bBottom = b.y + b.height / 2 + margin;

    return !(aRight < bLeft || aLeft > bRight || aBottom < bTop || aTop > bBottom);
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  /**
   * Draws the connection with a line and arrow head.
   * The arrow points from fromBox to toBox.
   * Visual appearance differs based on selection state.
   */
  draw() {
    // Hide connection entirely when endpoints overlap
    if (this._boxesOverlap()) return;

    // Get validated connection endpoints
    const endpoints = this._getConnectionEndpoints();
    if (!endpoints) return;

    const { end } = endpoints;

    // Get shortened line endpoints with angle
    const shortened = this._getShortenedLineEndpoints();
    if (!shortened) return;

    const { start, shortenedEnd, angle } = shortened;

    push();

    // Draw the connection line to the shortened endpoint (inside arrowhead)
    this._applySelectionStyle(true); // true = stroke
    line(start.x, start.y, shortenedEnd.x, shortenedEnd.y);

    // Draw arrow head as a filled triangle
    this._applySelectionStyle(false); // false = fill
    noStroke();
    push();
    translate(end.x, end.y);  // Move to arrow tip position
    rotate(angle);            // Rotate to point in connection direction

    // Draw triangle pointing right (before rotation)
    // The rotation aligns it with the connection angle
    triangle(
      0, 0,                                    // Tip of arrow (at end point)
      -this.arrowSize, -this.arrowSize / 2,   // Top back corner
      -this.arrowSize, this.arrowSize / 2     // Bottom back corner
    );
    pop();

    pop();
  }

  // ============================================================================
  // INTERACTION
  // ============================================================================

  /**
   * Checks if mouse is over the connection line.
   * Uses point-to-segment distance for accurate hit detection.
   * Hit detection uses the shortened line segment (same as rendered).
   * @returns {boolean} true if mouse is over the line
   */
  isMouseOver() {
    if (this._boxesOverlap()) return false;
    // Get validated mouse coordinates in world space
    const { x: mx, y: my } = Utils.getWorldMouseCoordinates();
    if (!Utils.areValidCoordinates(mx, my)) {
      return false;
    }

    // Get shortened line endpoints (same as rendered line)
    const shortened = this._getShortenedLineEndpoints();
    if (!shortened) return false;

    const { start, shortenedEnd } = shortened;

    // Calculate distance from mouse to the shortened line segment
    const distance = Utils.distanceToSegment(mx, my, start.x, start.y, shortenedEnd.x, shortenedEnd.y);
    return distance < Connection.HIT_THRESHOLD;
  }

  // ============================================================================
  // MANIPULATION
  // ============================================================================

  /**
   * Reverses the connection direction.
   * After reversing, the arrow points in the opposite direction.
   */
  reverse() {
    // Swap from and to boxes using destructuring
    [this.fromBox, this.toBox] = [this.toBox, this.fromBox];
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Serializes the connection to JSON format.
   * 
   * Uses a dual-reference system:
   * - ID-based (fromId/toId): Stable references for collaboration and modern maps
   * - Index-based (from/to): Legacy support for older saved maps
   * 
   * @param {Array<TextBox>} boxes - Array of all boxes (for legacy indexing)
   * @returns {Object} JSON representation with from/to box IDs and indices
   */
  toJSON(boxes) {
    return {
      // Modern: ID-based references (required for Yjs collaboration)
      fromId: this.fromBox ? this.fromBox.id : null,
      toId: this.toBox ? this.toBox.id : null,

      // Legacy: index-based references (backward compatibility)
      from: boxes.indexOf(this.fromBox),
      to: boxes.indexOf(this.toBox)
    };
  }

  /**
   * Creates a Connection from JSON data.
   * 
   * Supports two formats for backward compatibility:
   * 1. ID-based (modern): Uses fromId/toId with a Map or Array lookup
   * 2. Index-based (legacy): Uses from/to numeric indices into an Array
   * 
   * The ID-based approach is preferred as it's stable across edits and
   * required for Yjs collaboration. Index-based is kept for loading old maps.
   * 
   * @param {Object} data - JSON data with fromId/toId or from/to indices
   * @param {Array<TextBox>|Map<string, TextBox>} boxesOrMap - Array of boxes (legacy) or Map of id->box (modern)
   * @returns {Connection|null} New Connection instance or null if boxes not found
   */
  static fromJSON(data, boxesOrMap) {
    // Validate inputs
    if (!data || !boxesOrMap) {
      Utils.Logger.error('[Connection] fromJSON: Invalid connection data or boxes');
      return null;
    }

    let fromBox = null;
    let toBox = null;

    const isMap = boxesOrMap instanceof Map;

    // Strategy 1: Try ID-based lookup (modern, preferred)
    if (data.fromId && data.toId) {
      if (isMap) {
        // Direct Map lookup (fastest)
        fromBox = boxesOrMap.get(data.fromId);
        toBox = boxesOrMap.get(data.toId);
      } else if (Array.isArray(boxesOrMap)) {
        // Array search by ID (slower but supports old code)
        fromBox = boxesOrMap.find(b => b && b.id === data.fromId);
        toBox = boxesOrMap.find(b => b && b.id === data.toId);
      }
    }

    // Strategy 2: Fallback to index-based lookup (legacy compatibility)
    if ((!fromBox || !toBox) && Array.isArray(boxesOrMap)) {
      const boxes = boxesOrMap;
      const isValidIndex = (idx) =>
        Utils.isValidNumber(idx) && idx >= 0 && idx < boxes.length;

      if (isValidIndex(data.from) && isValidIndex(data.to)) {
        // Only use index-based if ID-based didn't work
        fromBox = fromBox || boxes[data.from];
        toBox = toBox || boxes[data.to];
      }
    }

    // Final validation
    if (!fromBox || !toBox) {
      Utils.Logger.error('[Connection] fromJSON: Referenced boxes do not exist:',
        { fromId: data.fromId, toId: data.toId, from: data.from, to: data.to });
      return null;
    }

    return new Connection(fromBox, toBox);
  }
}

// Expose Connection globally for browser/test usage
if (typeof globalThis !== 'undefined') {
  globalThis.Connection = Connection;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Connection;
}
if (typeof window !== 'undefined') {
  window.Connection = Connection;
}
