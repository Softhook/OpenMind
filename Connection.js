class Connection {
  constructor(fromBox, toBox) {
    this.fromBox = fromBox;
    this.toBox = toBox;
    this.arrowSize = 10;
    this.selected = false;
  }
  
  draw() {
    push();
    
    // Get connection points on the edges of the boxes
    let start = this.fromBox.getConnectionPoint(this.toBox);
    let end = this.toBox.getConnectionPoint(this.fromBox);
    
    // Draw line
    if (this.selected) {
      stroke(100, 150, 255);
      strokeWeight(3);
    } else {
      stroke(80);
      strokeWeight(2);
    }
    line(start.x, start.y, end.x, end.y);
    
    // Draw arrow head
    let angle = atan2(end.y - start.y, end.x - start.x);
    
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
    // Check if mouse is near the line
    let start = this.fromBox.getConnectionPoint(this.toBox);
    let end = this.toBox.getConnectionPoint(this.fromBox);
    
    // Distance from point to line segment
    let d = this.distanceToSegment(mouseX, mouseY, start.x, start.y, end.x, end.y);
    return d < 5; // 5 pixel threshold
  }
  
  distanceToSegment(px, py, x1, y1, x2, y2) {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let lengthSquared = dx * dx + dy * dy;
    
    if (lengthSquared === 0) {
      // Line segment is a point
      return dist(px, py, x1, y1);
    }
    
    // Calculate projection parameter t
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = constrain(t, 0, 1);
    
    // Find closest point on segment
    let closestX = x1 + t * dx;
    let closestY = y1 + t * dy;
    
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
    return new Connection(boxes[data.from], boxes[data.to]);
  }
}
