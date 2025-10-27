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
    this.cursorPosition = text.length;
    this.selectionStart = -1;
    this.selectionEnd = -1;
    
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
    this.cursorPosition = this.text.length;
    this.selectionStart = -1;
    this.selectionEnd = -1;
  }
  
  stopEditing() {
    this.isEditing = false;
    this.updateDimensions();
  }
  
  addChar(char) {
    // If there's a selection, replace it
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      this.deleteSelection();
    }
    this.text = this.text.slice(0, this.cursorPosition) + char + this.text.slice(this.cursorPosition);
    this.cursorPosition += char.length;
    this.updateDimensions();
  }
  
  removeChar() {
    if (this.text.length > 0) {
      // If there's a selection, delete it
      if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
        this.deleteSelection();
      } else if (this.cursorPosition > 0) {
        // Delete character before cursor
        this.text = this.text.slice(0, this.cursorPosition - 1) + this.text.slice(this.cursorPosition);
        this.cursorPosition--;
      }
      this.updateDimensions();
    }
  }
  
  selectAll() {
    this.selectionStart = 0;
    this.selectionEnd = this.text.length;
  }
  
  getSelectedText() {
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      let start = min(this.selectionStart, this.selectionEnd);
      let end = max(this.selectionStart, this.selectionEnd);
      return this.text.slice(start, end);
    }
    return '';
  }
  
  deleteSelection() {
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      let start = min(this.selectionStart, this.selectionEnd);
      let end = max(this.selectionStart, this.selectionEnd);
      this.text = this.text.slice(0, start) + this.text.slice(end);
      this.cursorPosition = start;
      this.selectionStart = -1;
      this.selectionEnd = -1;
      this.updateDimensions();
    }
  }
  
  pasteText(pastedText) {
    // If there's a selection, replace it
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      let start = min(this.selectionStart, this.selectionEnd);
      let end = max(this.selectionStart, this.selectionEnd);
      this.text = this.text.slice(0, start) + pastedText + this.text.slice(end);
      this.cursorPosition = start + pastedText.length;
      this.selectionStart = -1;
      this.selectionEnd = -1;
    } else {
      // No selection, insert at cursor position
      this.text = this.text.slice(0, this.cursorPosition) + pastedText + this.text.slice(this.cursorPosition);
      this.cursorPosition += pastedText.length;
    }
    this.updateDimensions();
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
    
    // Avoid division by zero
    if (dx === 0 && dy === 0) {
      return { x: this.x, y: this.y };
    }
    
    let hw = this.width / 2;
    let hh = this.height / 2;
    
    // Calculate intersection with each edge and pick the correct one
    let px, py;
    
    // Calculate the ratio to reach each edge
    let t_right = (dx > 0) ? hw / dx : Infinity;
    let t_left = (dx < 0) ? -hw / dx : Infinity;
    let t_bottom = (dy > 0) ? hh / dy : Infinity;
    let t_top = (dy < 0) ? -hh / dy : Infinity;
    
    // Find the smallest positive ratio (closest edge intersection)
    let t = min(t_right, t_left, t_bottom, t_top);
    
    // Calculate the intersection point
    px = this.x + t * dx;
    py = this.y + t * dy;
    
    // Constrain to box bounds (for safety)
    px = constrain(px, this.x - hw, this.x + hw);
    py = constrain(py, this.y - hh, this.y + hh);
    
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
