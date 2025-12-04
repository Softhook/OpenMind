/**
 * Connection class - represents a directional arrow connection between two boxes
 * Uses shared utilities from utils.js when available for validation and geometry
 */
class Connection {
  // Constants
  static ARROW_SIZE = 12;
  static HIT_THRESHOLD = 7; // pixels for click detection
  static STROKE_WEIGHT_NORMAL = 2;
  static STROKE_WEIGHT_SELECTED = 3;
  
  // Color constants for consistent styling
  static COLORS = {
    NORMAL: 80,
    SELECTED: { r: 100, g: 150, b: 255 }
  };
  
  /**
   * Creates a new Connection between two boxes
   * @param {TextBox} fromBox - Source box
   * @param {TextBox} toBox - Target box
   */
  constructor(fromBox, toBox) {
    if (!fromBox || !toBox) {
      console.error('Connection requires valid boxes');
    }
    this.fromBox = fromBox;
    this.toBox = toBox;
    this.arrowSize = Connection.ARROW_SIZE;
    this.selected = false;
  }
  
  /**
   * Helper to check if a number is valid (uses Utils if available)
   * @private
   */
  static _isValidNumber(value) {
    if (typeof Utils !== 'undefined' && Utils.isValidNumber) {
      return Utils.isValidNumber(value);
    }
    return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value);
  }
  
  /**
   * Helper to check if coordinates are valid
   * @private
   */
  static _areValidCoordinates(x, y) {
    return Connection._isValidNumber(x) && Connection._isValidNumber(y);
  }
  
  /**
   * Gets the world-space position of the arrow head (end point at toBox edge)
   * @returns {Object|null} Point with x and y coordinates, or null if invalid
   */
  getArrowHeadPosition() {
    if (!this.fromBox || !this.toBox) return null;
    const end = this.toBox.getConnectionPoint(this.fromBox);
    if (!end || !Connection._areValidCoordinates(end.x, end.y)) return null;
    return end;
  }

  /**
   * Checks if mouse is over the arrow head (for reattachment)
   * @returns {boolean} true if mouse is over arrow head
   */
  isMouseOverArrowHead() {
    const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
    const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
    if (!Connection._areValidCoordinates(mx, my)) return false;
    const end = this.getArrowHeadPosition();
    if (!end) return false;
    // Scale hit radius slightly with zoom so it's usable at different scales
    const currentZoom = typeof zoom !== 'undefined' ? zoom : 1;
    const safeZoom = Math.max(0.25, Math.min(4, currentZoom));
    const hitR = 10 / Math.sqrt(safeZoom);
    const d = typeof Utils !== 'undefined' && Utils.distance 
      ? Utils.distance(mx, my, end.x, end.y)
      : dist(mx, my, end.x, end.y);
    return d <= hitR;
  }

  /**
   * Draws the connection (line and arrow head)
   */
  draw() {
    // Validate boxes exist
    if (!this.fromBox || !this.toBox) {
      return;
    }
    
    push();
    
    // Get connection points on the edges of the boxes
    let start = this.fromBox.getConnectionPoint(this.toBox);
    let end = this.toBox.getConnectionPoint(this.fromBox);
    
    // Validate connection points using shared utility
    if (!start || !end || 
        !Connection._areValidCoordinates(start.x, start.y) ||
        !Connection._areValidCoordinates(end.x, end.y)) {
      pop();
      return;
    }
    
    // Draw line
    if (this.selected) {
      const c = Connection.COLORS.SELECTED;
      stroke(c.r, c.g, c.b);
      strokeWeight(Connection.STROKE_WEIGHT_SELECTED);
    } else {
      stroke(Connection.COLORS.NORMAL);
      strokeWeight(Connection.STROKE_WEIGHT_NORMAL);
    }
    line(start.x, start.y, end.x, end.y);
    
    // Draw arrow head
    let angle = atan2(end.y - start.y, end.x - start.x);
    
    // Validate angle
    if (!Connection._isValidNumber(angle)) {
      pop();
      return;
    }
    
    if (this.selected) {
      const c = Connection.COLORS.SELECTED;
      fill(c.r, c.g, c.b);
    } else {
      fill(Connection.COLORS.NORMAL);
    }
    noStroke();
    push();
    translate(end.x, end.y);
    rotate(angle);
    triangle(0, 0, 
             -this.arrowSize, -this.arrowSize/2, 
             -this.arrowSize, this.arrowSize/2);
    pop();
    
    pop();
  }
  
  /**
   * Checks if mouse is over the connection line
   * @returns {boolean} true if mouse is over the line
   */
  isMouseOver() {
    // Validate boxes and mouse coordinates
    const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
    const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
    if (!this.fromBox || !this.toBox || !Connection._areValidCoordinates(mx, my)) {
      return false;
    }
    
    // Check if mouse is near the line
    let start = this.fromBox.getConnectionPoint(this.toBox);
    let end = this.toBox.getConnectionPoint(this.fromBox);
    
    // Validate connection points
    if (!start || !end || 
        !Connection._areValidCoordinates(start.x, start.y) ||
        !Connection._areValidCoordinates(end.x, end.y)) {
      return false;
    }
    
    // Distance from point to line segment
    let d = this.distanceToSegment(mx, my, start.x, start.y, end.x, end.y);
    return d < Connection.HIT_THRESHOLD;
  }
  
  /**
   * Calculates distance from a point to a line segment
   * Uses shared utility if available, otherwise falls back to inline implementation
   * @param {number} px - Point X
   * @param {number} py - Point Y
   * @param {number} x1 - Segment start X
   * @param {number} y1 - Segment start Y
   * @param {number} x2 - Segment end X
   * @param {number} y2 - Segment end Y
   * @returns {number} Distance in pixels
   */
  distanceToSegment(px, py, x1, y1, x2, y2) {
    // Use shared utility if available
    if (typeof Utils !== 'undefined' && Utils.distanceToSegment) {
      return Utils.distanceToSegment(px, py, x1, y1, x2, y2);
    }
    
    // Validate all inputs
    if (!Connection._areValidCoordinates(px, py) || 
        !Connection._areValidCoordinates(x1, y1) || 
        !Connection._areValidCoordinates(x2, y2)) {
      return Infinity;
    }
    
    let dx = x2 - x1;
    let dy = y2 - y1;
    let lengthSquared = dx * dx + dy * dy;
    
    if (lengthSquared === 0 || !isFinite(lengthSquared)) {
      // Line segment is a point or invalid
      return dist(px, py, x1, y1);
    }
    
    // Calculate projection parameter t
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    
    // Validate t
    if (!Connection._isValidNumber(t)) {
      return Infinity;
    }
    
    t = constrain(t, 0, 1);
    
    // Find closest point on segment
    let closestX = x1 + t * dx;
    let closestY = y1 + t * dy;
    
    // Validate closest point
    if (!Connection._areValidCoordinates(closestX, closestY)) {
      return Infinity;
    }
    
    return dist(px, py, closestX, closestY);
  }
  
  /**
   * Reverses the connection direction (swaps from and to boxes)
   */
  reverse() {
    // Swap from and to boxes
    let temp = this.fromBox;
    this.fromBox = this.toBox;
    this.toBox = temp;
  }
  
  /**
   * Serializes the connection to JSON
   * @param {Array<TextBox>} boxes - Array of all boxes (for indexing)
   * @returns {Object} JSON representation with from/to box indices
   */
  toJSON(boxes) {
    return {
      from: boxes.indexOf(this.fromBox),
      to: boxes.indexOf(this.toBox)
    };
  }
  
  /**
   * Creates a Connection from JSON data
   * Uses shared utilities for validation when available
   * @param {Object} data - JSON data with from/to indices
   * @param {Array<TextBox>} boxes - Array of all boxes
   * @returns {Connection|null} New Connection instance or null if invalid
   */
  static fromJSON(data, boxes) {
    // Validate inputs
    if (!data || !boxes || !Array.isArray(boxes)) {
      console.warn('Invalid connection data or boxes array');
      return null;
    }
    
    // Use shared validation if available
    const isValidNum = Connection._isValidNumber;
    
    // Validate indices
    if (!isValidNum(data.from) || !isValidNum(data.to) ||
        data.from < 0 || data.to < 0 ||
        data.from >= boxes.length || data.to >= boxes.length) {
      console.warn('Invalid connection indices');
      return null;
    }
    
    let fromBox = boxes[data.from];
    let toBox = boxes[data.to];
    
    // Validate boxes exist
    if (!fromBox || !toBox) {
      console.warn('Referenced boxes do not exist');
      return null;
    }
    
    return new Connection(fromBox, toBox);
  }
}
