class Connection {
  // Constants
  static ARROW_SIZE = 10;
  static HIT_THRESHOLD = 5; // pixels for click detection
  static STROKE_WEIGHT_NORMAL = 2;
  static STROKE_WEIGHT_SELECTED = 3;
  
  constructor(fromBox, toBox) {
    if (!fromBox || !toBox) {
      console.error('Connection requires valid boxes');
    }
    this.fromBox = fromBox;
    this.toBox = toBox;
    this.arrowSize = Connection.ARROW_SIZE;
    this.selected = false;
  }
  
  // Get the world-space point of the arrow head (end point at toBox edge)
  getArrowHeadPosition() {
    if (!this.fromBox || !this.toBox) return null;
    const end = this.toBox.getConnectionPoint(this.fromBox);
    if (!end || !isFinite(end.x) || !isFinite(end.y)) return null;
    return end;
  }

  // Hit-test for the arrow head (small circular radius around the end)
  isMouseOverArrowHead() {
    const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
    const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
    if (!isFinite(mx) || !isFinite(my)) return false;
    const end = this.getArrowHeadPosition();
    if (!end) return false;
    // Scale hit radius slightly with zoom so it's usable at different scales
    const currentZoom = typeof zoom !== 'undefined' ? zoom : 1;
    const hitR = 10 / Math.sqrt(Math.max(0.25, Math.min(4, currentZoom)));
    return dist(mx, my, end.x, end.y) <= hitR;
  }

  draw() {
    // Validate boxes exist
    if (!this.fromBox || !this.toBox) {
      return;
    }
    
    push();
    
    // Get connection points on the edges of the boxes
    let start = this.fromBox.getConnectionPoint(this.toBox);
    let end = this.toBox.getConnectionPoint(this.fromBox);
    
    // Validate connection points
    if (!start || !end || start.x == null || start.y == null || 
        end.x == null || end.y == null || 
        isNaN(start.x) || isNaN(start.y) || isNaN(end.x) || isNaN(end.y)) {
      pop();
      return;
    }
    
    // Draw line
    if (this.selected) {
      stroke(100, 150, 255);
      strokeWeight(Connection.STROKE_WEIGHT_SELECTED);
    } else {
      stroke(80);
      strokeWeight(Connection.STROKE_WEIGHT_NORMAL);
    }
    line(start.x, start.y, end.x, end.y);
    
    // Draw arrow head
    let angle = atan2(end.y - start.y, end.x - start.x);
    
    // Validate angle
    if (isNaN(angle)) {
      pop();
      return;
    }
    
    if (this.selected) {
      fill(100, 150, 255);
    } else {
      fill(80);
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
  
  isMouseOver() {
    // Validate boxes and mouse coordinates
    const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
    const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
    if (!this.fromBox || !this.toBox || 
        mx == null || my == null || 
        isNaN(mx) || isNaN(my)) {
      return false;
    }
    
    // Check if mouse is near the line
    let start = this.fromBox.getConnectionPoint(this.toBox);
    let end = this.toBox.getConnectionPoint(this.fromBox);
    
    // Validate connection points
    if (!start || !end || start.x == null || start.y == null || 
        end.x == null || end.y == null || 
        isNaN(start.x) || isNaN(start.y) || isNaN(end.x) || isNaN(end.y)) {
      return false;
    }
    
    // Distance from point to line segment
    let d = this.distanceToSegment(mx, my, start.x, start.y, end.x, end.y);
    return d < Connection.HIT_THRESHOLD;
  }
  
  distanceToSegment(px, py, x1, y1, x2, y2) {
    // Validate all inputs
    if (px == null || py == null || x1 == null || y1 == null || x2 == null || y2 == null ||
        isNaN(px) || isNaN(py) || isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
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
    if (isNaN(t) || !isFinite(t)) {
      return Infinity;
    }
    
    t = constrain(t, 0, 1);
    
    // Find closest point on segment
    let closestX = x1 + t * dx;
    let closestY = y1 + t * dy;
    
    // Validate closest point
    if (isNaN(closestX) || isNaN(closestY)) {
      return Infinity;
    }
    
    return dist(px, py, closestX, closestY);
  }
  
  reverse() {
    // Swap from and to boxes
    let temp = this.fromBox;
    this.fromBox = this.toBox;
    this.toBox = temp;
  }
  
  toJSON(boxes) {
    return {
      from: boxes.indexOf(this.fromBox),
      to: boxes.indexOf(this.toBox)
    };
  }
  
  static fromJSON(data, boxes) {
    // Validate inputs
    if (!data || !boxes || !Array.isArray(boxes)) {
      console.warn('Invalid connection data or boxes array');
      return null;
    }
    
    // Validate indices
    if (data.from == null || data.to == null || 
        isNaN(data.from) || isNaN(data.to) ||
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
