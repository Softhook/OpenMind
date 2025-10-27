class TextBox {
  constructor(x, y, text = "New Node") {
    this.x = x;
    this.y = y;
    this.text = text;
    this.padding = 15;
    this.minWidth = 80;
    this.minHeight = 40;
    this.maxWidth = 300; // Maximum width before wrapping
    this.fontSize = 14;
    this.isEditing = false;
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.cornerRadius = 10;
    this.cursorPosition = text.length;
    this.selectionStart = -1;
    this.selectionEnd = -1;
    this.deleteIconSize = 20;
    
    // Calculate initial dimensions
    this.updateDimensions();
  }
  
  updateDimensions() {
    textSize(this.fontSize);
    
    // Get wrapped lines for dimension calculation
    let wrappedLines = this.wrapText(this.text);
    
    // Calculate text dimensions
    let maxLineWidth = 0;
    for (let line of wrappedLines) {
      let lineWidth = textWidth(line);
      if (lineWidth > maxLineWidth) {
        maxLineWidth = lineWidth;
      }
    }
    
    this.width = max(this.minWidth, min(this.maxWidth, maxLineWidth + this.padding * 2));
    this.height = max(this.minHeight, wrappedLines.length * this.fontSize * 1.5 + this.padding * 2);
  }
  
  wrapText(text) {
    let lines = text.split('\n');
    let wrappedLines = [];
    let maxTextWidth = this.maxWidth - this.padding * 2;
    
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
    
    // Draw text with wrapping
    fill(0);
    noStroke();
    textAlign(LEFT, CENTER);
    textSize(this.fontSize);
    
    let wrappedLines = this.wrapText(this.text);
    let lineHeight = this.fontSize * 1.5;
    let totalHeight = wrappedLines.length * lineHeight;
    let startY = this.y - totalHeight / 2 + lineHeight / 2;
    let textX = this.x - this.width / 2 + this.padding;
    
    for (let i = 0; i < wrappedLines.length; i++) {
      text(wrappedLines[i], textX, startY + i * lineHeight);
    }
    
    // Draw delete icon if mouse is near top-left corner
    if (this.isMouseNearDeleteIcon()) {
      let iconX = this.x - this.width/2;
      let iconY = this.y - this.height/2;
      
      // Draw red circle background
      fill(220, 50, 50);
      noStroke();
      circle(iconX + this.deleteIconSize/2, iconY + this.deleteIconSize/2, this.deleteIconSize);
      
      // Draw white X
      stroke(255);
      strokeWeight(2);
      let offset = this.deleteIconSize * 0.3;
      let cx = iconX + this.deleteIconSize/2;
      let cy = iconY + this.deleteIconSize/2;
      line(cx - offset, cy - offset, cx + offset, cy + offset);
      line(cx - offset, cy + offset, cx + offset, cy - offset);
    }
    
    pop();
  }
  
  isMouseOver() {
    return mouseX > this.x - this.width/2 &&
           mouseX < this.x + this.width/2 &&
           mouseY > this.y - this.height/2 &&
           mouseY < this.y + this.height/2;
  }
  
  isMouseNearDeleteIcon() {
    // Show delete icon when mouse is in the top-left area
    let iconX = this.x - this.width/2;
    let iconY = this.y - this.height/2;
    let hoverRadius = this.deleteIconSize * 2; // Larger hover area
    
    return mouseX > iconX - 10 && 
           mouseX < iconX + hoverRadius &&
           mouseY > iconY - 10 && 
           mouseY < iconY + hoverRadius;
  }
  
  isMouseOverDeleteIcon() {
    // Check if mouse is directly over the delete icon
    let iconX = this.x - this.width/2 + this.deleteIconSize/2;
    let iconY = this.y - this.height/2 + this.deleteIconSize/2;
    let distance = dist(mouseX, mouseY, iconX, iconY);
    
    return distance < this.deleteIconSize/2;
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
