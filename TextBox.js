class TextBox {
  constructor(x, y, text = "New Node") {
    this.x = x;
    this.y = y;
    this.text = text;
    this.padding = 15;
    this.minWidth = 80;
    this.minHeight = 40;
    this.fontSize = 16;
    this.isEditing = false;
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.cornerRadius = 10;
    
    // Calculate initial dimensions
    this.updateDimensions();
  }
  
  updateDimensions() {
    textSize(this.fontSize);
    
    // Calculate text dimensions
    let lines = this.text.split('\n');
    let maxLineWidth = 0;
    for (let line of lines) {
      let lineWidth = textWidth(line);
      if (lineWidth > maxLineWidth) {
        maxLineWidth = lineWidth;
      }
    }
    
    this.width = max(this.minWidth, maxLineWidth + this.padding * 2);
    this.height = max(this.minHeight, lines.length * this.fontSize * 1.5 + this.padding * 2);
  }
  
  draw() {
    push();
    
    // Draw box
    if (this.isEditing) {
      fill(255, 255, 200);
      stroke(100, 100, 255);
      strokeWeight(2);
    } else if (this.isMouseOver()) {
      fill(240);
      stroke(100);
      strokeWeight(2);
    } else {
      fill(255);
      stroke(100);
      strokeWeight(1);
    }
    
    rect(this.x - this.width/2, this.y - this.height/2, 
         this.width, this.height, this.cornerRadius);
    
    // Draw text
    fill(0);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(this.fontSize);
    text(this.text, this.x, this.y);
    
    pop();
  }
  
  isMouseOver() {
    return mouseX > this.x - this.width/2 &&
           mouseX < this.x + this.width/2 &&
           mouseY > this.y - this.height/2 &&
           mouseY < this.y + this.height/2;
  }
  
  isMouseOnEdge() {
    let edgeThreshold = 10;
    let distFromLeft = abs(mouseX - (this.x - this.width/2));
    let distFromRight = abs(mouseX - (this.x + this.width/2));
    let distFromTop = abs(mouseY - (this.y - this.height/2));
    let distFromBottom = abs(mouseY - (this.y + this.height/2));
    
    let onVerticalEdge = (distFromLeft < edgeThreshold || distFromRight < edgeThreshold) &&
                         mouseY > this.y - this.height/2 &&
                         mouseY < this.y + this.height/2;
    
    let onHorizontalEdge = (distFromTop < edgeThreshold || distFromBottom < edgeThreshold) &&
                           mouseX > this.x - this.width/2 &&
                           mouseX < this.x + this.width/2;
    
    return onVerticalEdge || onHorizontalEdge;
  }
  
  startEditing() {
    this.isEditing = true;
  }
  
  stopEditing() {
    this.isEditing = false;
    this.updateDimensions();
  }
  
  addChar(char) {
    this.text += char;
    this.updateDimensions();
  }
  
  removeChar() {
    if (this.text.length > 0) {
      this.text = this.text.slice(0, -1);
      this.updateDimensions();
    }
  }
  
  startDrag(mx, my) {
    this.isDragging = true;
    this.dragOffsetX = this.x - mx;
    this.dragOffsetY = this.y - my;
  }
  
  drag(mx, my) {
    if (this.isDragging) {
      this.x = mx + this.dragOffsetX;
      this.y = my + this.dragOffsetY;
    }
  }
  
  stopDrag() {
    this.isDragging = false;
  }
  
  // Get connection point on the edge of the box
  getConnectionPoint(otherBox) {
    let dx = otherBox.x - this.x;
    let dy = otherBox.y - this.y;
    let angle = atan2(dy, dx);
    
    // Find intersection with rectangle edge
    let hw = this.width / 2;
    let hh = this.height / 2;
    
    let px, py;
    
    // Check which edge the angle intersects
    let slope = tan(angle);
    
    if (abs(dx) > abs(dy)) {
      // More horizontal
      if (dx > 0) {
        px = this.x + hw;
        py = this.y + slope * hw;
      } else {
        px = this.x - hw;
        py = this.y - slope * hw;
      }
    } else {
      // More vertical
      if (dy > 0) {
        py = this.y + hh;
        px = this.x + hh / slope;
      } else {
        py = this.y - hh;
        px = this.x - hh / slope;
      }
    }
    
    return { x: px, y: py };
  }
  
  toJSON() {
    return {
      x: this.x,
      y: this.y,
      text: this.text
    };
  }
  
  static fromJSON(data) {
    return new TextBox(data.x, data.y, data.text);
  }
}
