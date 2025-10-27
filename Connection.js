class Connection {
  constructor(fromBox, toBox) {
    this.fromBox = fromBox;
    this.toBox = toBox;
    this.arrowSize = 10;
  }
  
  draw() {
    push();
    
    // Get connection points on the edges of the boxes
    let start = this.fromBox.getConnectionPoint(this.toBox);
    let end = this.toBox.getConnectionPoint(this.fromBox);
    
    // Draw line
    stroke(80);
    strokeWeight(2);
    line(start.x, start.y, end.x, end.y);
    
    // Draw arrow head
    let angle = atan2(end.y - start.y, end.x - start.x);
    
    fill(80);
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
