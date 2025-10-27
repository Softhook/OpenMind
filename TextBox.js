class TextBox {
  constructor(x, y, text = "") {
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
    this.resizeHandleSize = 12;
    this.isResizing = false;
    this.resizeStartX = 0;
    this.resizeStartY = 0;
    this.resizeStartWidth = 0;
    this.resizeStartHeight = 0;
    this.resizeStartLeft = 0;   // left edge at resize start
    this.resizeStartTop = 0;    // top edge at resize start
    this.userResized = false; // tracks if user manually resized width/height
    
    // Text selection state
    this.isSelecting = false;
    this.selectionAnchor = -1; // anchor index where drag started
    this.lastClickTime = 0;
    this.lastClickX = 0;
    this.lastClickY = 0;
    this.doubleClickThreshold = 300; // ms
    
    // Cursor blinking
    this.cursorBlinkTime = 0;
    this.cursorVisible = true;
    this.cursorBlinkRate = 530; // milliseconds (slow blink)
    
    // Interaction thickness for edge-drag zone (px inward from edges)
    this.dragEdgeThickness = 16;
    
    // Selection (node-level, not text selection)
    this.selected = false;
    
    // Calculate initial dimensions
    this.updateDimensions();
  }
  
  updateDimensions() {
    // Ensure text is defined
    if (this.text == null) {
      this.text = '';
    }
    
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
    
    // Width: only auto-size when the user hasn't manually resized.
    // This prevents snapping the width after a manual resize.
    if (!this.userResized) {
      this.width = max(this.minWidth, min(this.maxWidth, maxLineWidth + this.padding * 2));
    }

    // Height: always reflow to fit wrapped lines for the current width
    this.height = max(this.minHeight, wrappedLines.length * this.fontSize * 1.5 + this.padding * 2);
  }
  
  wrapText(text) {
    // Handle null or undefined text
    if (text == null) {
      text = '';
    }
    
    // Ensure text is a string
    text = String(text);
    
    let lines = text.split('\n');
    let wrappedLines = [];
    // Guard width before initial sizing
    let baseWidth = (this.width != null && isFinite(this.width)) ? this.width : this.minWidth;
    let maxTextWidth = max(10, baseWidth - this.padding * 2); // Ensure minimum width
    
    textSize(this.fontSize);
    
    for (let line of lines) {
      // Handle empty lines
      if (line === '') {
        wrappedLines.push('');
        continue;
      }
      
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
    } else if (this.selected) {
      // Highlight selected boxes with a blue outline
      fill(255);
      stroke(60, 120, 255);
      strokeWeight(2.5);
    } else if (this.isMouseOver()) {
      // Keep background white on hover (no grey fill)
      fill(255);
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
    // Top-anchored text: start at top padding of the box
    let startY = (this.y - this.height / 2) + this.padding + lineHeight / 2;
    let textX = this.x - this.width / 2 + this.padding;
    
    // Draw selection highlight if there's a selection
    if (this.isEditing && this.selectionStart !== -1 && this.selectionEnd !== -1) {
      this.drawSelection(wrappedLines, textX, startY, lineHeight);
    }
    
    for (let i = 0; i < wrappedLines.length; i++) {
      text(wrappedLines[i], textX, startY + i * lineHeight);
    }
    
    // Draw cursor when editing
    if (this.isEditing) {
      this.drawCursor(wrappedLines, textX, startY, lineHeight);
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
    
    // Draw resize handle in bottom-right corner
    if (this.isMouseOver() || this.isResizing) {
      let handleX = this.x + this.width/2 - this.resizeHandleSize;
      let handleY = this.y + this.height/2 - this.resizeHandleSize;
      
      // Draw handle background
      fill(this.isMouseOverResizeHandle() ? 150 : 180);
      noStroke();
      rect(handleX, handleY, this.resizeHandleSize, this.resizeHandleSize);
      
      // Draw handle grip lines
      stroke(100);
      strokeWeight(1);
      for (let i = 0; i < 3; i++) {
        let offset = i * 3 + 2;
        line(handleX + offset, handleY + this.resizeHandleSize - 2,
             handleX + this.resizeHandleSize - 2, handleY + offset);
      }
    }
    
    pop();
  }

  // Connector utilities (center points at each edge)
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

  getConnectorCenter(side) {
    const pts = this.getConnectorPoints();
    return pts[side] || null;
  }

  getConnectorUnderMouse(hitRadius = 8) {
    const pts = this.getConnectorPoints();
    const sides = ['left', 'right', 'top', 'bottom'];
    for (let side of sides) {
      const p = pts[side];
      if (!p) continue;
      const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
      const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
      if (dist(mx, my, p.x, p.y) <= hitRadius) {
        return side;
      }
    }
    return null;
  }

  drawConnectors(active = false) {
    const pts = this.getConnectorPoints();
    push();
    noStroke();
    const r = active ? 6 : 5;
    const c = active ? color(100, 150, 255) : color(120);
    fill(c);
    circle(pts.left.x, pts.left.y, r * 2);
    circle(pts.right.x, pts.right.y, r * 2);
    circle(pts.top.x, pts.top.y, r * 2);
    circle(pts.bottom.x, pts.bottom.y, r * 2);
    pop();
  }
  
  isMouseOver() {
      const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
      const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
      return mx > this.x - this.width/2 &&
        mx < this.x + this.width/2 &&
        my > this.y - this.height/2 &&
        my < this.y + this.height/2;
  }
  
  isMouseNearDeleteIcon() {
    // Show delete icon when mouse is in the top-left area
    let iconX = this.x - this.width/2;
    let iconY = this.y - this.height/2;
    let hoverRadius = this.deleteIconSize * 2; // Larger hover area
      const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
      const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
      return mx > iconX - 10 && 
        mx < iconX + hoverRadius &&
        my > iconY - 10 && 
        my < iconY + hoverRadius;
  }
  
  isMouseOverDeleteIcon() {
    // Check if mouse is directly over the delete icon
    let iconX = this.x - this.width/2 + this.deleteIconSize/2;
    let iconY = this.y - this.height/2 + this.deleteIconSize/2;
    const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
    const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
    let distance = dist(mx, my, iconX, iconY);
    
    return distance < this.deleteIconSize/2;
  }
  
  isMouseOverResizeHandle() {
    let handleX = this.x + this.width/2 - this.resizeHandleSize;
    let handleY = this.y + this.height/2 - this.resizeHandleSize;
      const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
      const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
      return mx > handleX &&
        mx < handleX + this.resizeHandleSize &&
        my > handleY &&
        my < handleY + this.resizeHandleSize;
  }
  
  isMouseOnEdge() {
    // Don't trigger edge connection if over resize handle
    if (this.isMouseOverResizeHandle()) {
      return false;
    }
    
    // Make the draggable edge zone a bit larger, while keeping a minimum editable center
    const minCenterWidth = 20;  // ensure at least 20px center horizontal edit zone
    const minCenterHeight = 20; // ensure at least 20px center vertical edit zone
    const maxEdgeX = max(4, this.width / 2 - minCenterWidth / 2);
    const maxEdgeY = max(4, this.height / 2 - minCenterHeight / 2);
    const edgeThresholdX = min(this.dragEdgeThickness, maxEdgeX);
    const edgeThresholdY = min(this.dragEdgeThickness, maxEdgeY);

    const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
    const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
    let distFromLeft = abs(mx - (this.x - this.width/2));
    let distFromRight = abs(mx - (this.x + this.width/2));
    let distFromTop = abs(my - (this.y - this.height/2));
    let distFromBottom = abs(my - (this.y + this.height/2));
    
    let onVerticalEdge = (distFromLeft < edgeThresholdX || distFromRight < edgeThresholdX) &&
               my > this.y - this.height/2 &&
               my < this.y + this.height/2;
    
    let onHorizontalEdge = (distFromTop < edgeThresholdY || distFromBottom < edgeThresholdY) &&
                           mx > this.x - this.width/2 &&
                           mx < this.x + this.width/2;
    
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
    
    let lineHeight = this.fontSize * 1.5;
    // Top-anchored text positioning
    let startY = (this.y - this.height / 2) + this.padding + lineHeight / 2;
    let textX = this.x - this.width / 2 + this.padding;
    
    // Find which line was clicked
    let clickedLine = 0;
    for (let i = 0; i < wrappedLines.length; i++) {
      let lineY = startY + i * lineHeight;
      if (i === wrappedLines.length - 1 || my < lineY + lineHeight / 2) {
        clickedLine = i;
        break;
      }
    }
    
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
    
    // Convert line position to absolute text position
    let charCount = 0;
    for (let i = 0; i < clickedLine; i++) {
      charCount += wrappedLines[i].length;
      // Account for spaces/newlines between wrapped lines
      if (charCount < this.text.length) {
        if (this.text[charCount] === '\n') {
          charCount++;
        } else if (this.text[charCount] === ' ') {
          charCount++;
        }
      }
    }
    
    return charCount + closestPos;
  }
  
  startEditing(mx = null, my = null) {
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
  }

  // Determine if the given point is within the inner text area (excludes padding)
  isPointInTextArea(mx, my) {
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
    const lineHeight = this.fontSize * 1.5;
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
    const lineWidth = textWidth(lineText);
    if (lineWidth <= 0) return false;
    
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
    const lineHeight = this.fontSize * 1.5;
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
    const now = millis();
    const isDouble = (now - this.lastClickTime) <= this.doubleClickThreshold &&
                     dist(mx, my, this.lastClickX, this.lastClickY) < 6;
    this.lastClickTime = now;
    this.lastClickX = mx;
    this.lastClickY = my;
    
    if (isDouble) {
      // Double-click: select word under cursor
      this.isEditing = true;
      let pos = this.getCursorPositionFromMouse(mx, my);
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
  
  addChar(char) {
    // Ensure text is defined
    if (this.text == null) {
      this.text = '';
    }
    
    // Validate char
    if (char == null) {
      return;
    }
    
    // If there's a selection, replace it
    if (this.selectionStart !== -1 && this.selectionEnd !== -1) {
      this.deleteSelection();
    }
    
    // Ensure cursor position is valid
    this.cursorPosition = constrain(this.cursorPosition, 0, this.text.length);
    
    this.text = this.text.slice(0, this.cursorPosition) + char + this.text.slice(this.cursorPosition);
    this.cursorPosition += char.length;
    this.updateDimensions();
    this.resetCursorBlink();
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
    this.resetCursorBlink();
  }

  // Forward delete (Fn+Backspace on macOS / Delete key)
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
      this.text = this.text.slice(0, this.cursorPosition) + this.text.slice(this.cursorPosition + 1);
      // cursorPosition stays the same
      this.updateDimensions();
    }
    this.resetCursorBlink();
  }

  // Delete the previous word (Alt/Option+Backspace or Ctrl+Backspace)
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
    const isWs = (ch) => ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
    let i = pos;
    // Skip whitespace directly left of cursor
    while (i > 0 && isWs(this.text[i - 1])) i--;
    // Then skip non-whitespace (the word)
    while (i > 0 && !isWs(this.text[i - 1])) i--;
    if (i < pos) {
      this.text = this.text.slice(0, i) + this.text.slice(pos);
      this.cursorPosition = i;
      this.updateDimensions();
    }
    this.resetCursorBlink();
  }

  // Delete the next word (Alt/Option+Delete or Ctrl+Delete)
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
    const isWs = (ch) => ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
    let i = pos;
    // Skip whitespace directly right of cursor
    while (i < this.text.length && isWs(this.text[i])) i++;
    // Then skip non-whitespace (the word)
    while (i < this.text.length && !isWs(this.text[i])) i++;
    if (i > pos) {
      this.text = this.text.slice(0, pos) + this.text.slice(i);
      // cursorPosition unchanged
      this.updateDimensions();
    }
    this.resetCursorBlink();
  }

  // Delete to start of logical line (up to previous \n)
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
      this.text = this.text.slice(0, start) + this.text.slice(pos);
      this.cursorPosition = start;
      this.updateDimensions();
    }
    this.resetCursorBlink();
  }

  // Delete to end of logical line (to next \n or end)
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
      this.text = this.text.slice(0, pos) + this.text.slice(end);
      // cursor stays at pos
      this.updateDimensions();
    }
    this.resetCursorBlink();
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
    // Validate pasted text
    if (pastedText == null) {
      return;
    }
    
    // Ensure text is defined
    if (this.text == null) {
      this.text = '';
    }
    
    pastedText = String(pastedText);
    
    // Ensure cursor position is valid
    this.cursorPosition = constrain(this.cursorPosition, 0, this.text.length);
    
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
      // Validate mouse coordinates
      if (mx == null || my == null || isNaN(mx) || isNaN(my)) {
        return;
      }
      
      // Move in world space - no constraints (allow infinite canvas)
      this.x = mx + this.dragOffsetX;
      this.y = my + this.dragOffsetY;
    }
  }
  
  stopDrag() {
    this.isDragging = false;
  }
  
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
      let minRequiredHeight = max(this.minHeight, wrappedLines.length * this.fontSize * 1.5 + this.padding * 2);
      let newHeight = max(minRequiredHeight, rawHeight);

      // Apply new size
      this.width = newWidth;
      this.height = newHeight;

      // Recompute center so left/top remain fixed while bottom-right moves
      this.x = this.resizeStartLeft + this.width / 2;
      this.y = this.resizeStartTop + this.height / 2;
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
  
  stopResize() {
    this.isResizing = false;
    // Preserve the top edge when reflowing dimensions after resize
    const prevTop = this.y - this.height / 2;
    // Reflow text immediately using the final width so the height fits without extra clicks
    this.updateDimensions();
    // Adjust center so the top remains fixed after height changes
    this.y = prevTop + this.height / 2;
  }
  
  // Get connection point on the edge of the box
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
  
  toJSON() {
    return {
      x: this.x,
      y: this.y,
      text: this.text,
      width: this.width,
      height: this.height
    };
  }
  
  static fromJSON(data) {
    // Validate input data
    if (!data || typeof data !== 'object') {
      console.warn('Invalid box data');
      return null;
    }
    
    // Validate required fields with defaults
    let x = (data.x != null && !isNaN(data.x)) ? data.x : 100;
    let y = (data.y != null && !isNaN(data.y)) ? data.y : 100;
    let text = data.text != null ? String(data.text) : 'New Node';
    
    let box = new TextBox(x, y, text);
    
    // Set optional dimensions if valid
    if (data.width != null && !isNaN(data.width) && data.width > 0) {
      box.width = data.width;
      // Preserve loaded width as a manual setting so updates don't auto-shrink
      box.userResized = true;
    }
    if (data.height != null && !isNaN(data.height) && data.height > 0) {
      box.height = data.height;
    }
    
    return box;
  }
  
  // Helper methods for cursor
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
      this.resetCursorBlink();
    }
  }
  
  moveCursorRight() {
    if (this.text == null) {
      this.text = '';
    }
    if (this.cursorPosition < this.text.length) {
      this.cursorPosition++;
      this.resetCursorBlink();
    }
  }
  
  moveCursorUp() {
    let wrappedLines = this.wrapText(this.text);
    let { lineIndex, posInLine } = this.getCursorLineAndPosition(wrappedLines);
    
    if (lineIndex > 0) {
      // Move to previous line, same position or end of line
      let prevLineLength = wrappedLines[lineIndex - 1].length;
      let newPosInLine = min(posInLine, prevLineLength);
      
      // Calculate character position in original text
      let charCount = 0;
      for (let i = 0; i < lineIndex - 1; i++) {
        charCount += wrappedLines[i].length;
        // Account for spaces that were consumed during wrapping
        if (i < wrappedLines.length - 1 && !this.text[charCount]) {
          // No newline at this position means it was wrapped
          if (this.text[charCount] !== '\n') {
            charCount++; // Skip the space
          }
        }
      }
      this.cursorPosition = charCount + newPosInLine;
      this.resetCursorBlink();
    }
  }
  
  moveCursorDown() {
    let wrappedLines = this.wrapText(this.text);
    let { lineIndex, posInLine } = this.getCursorLineAndPosition(wrappedLines);
    
    if (lineIndex < wrappedLines.length - 1) {
      // Move to next line, same position or end of line
      let nextLineLength = wrappedLines[lineIndex + 1].length;
      let newPosInLine = min(posInLine, nextLineLength);
      
      // Calculate character position in original text
      let charCount = 0;
      for (let i = 0; i < lineIndex + 1; i++) {
        charCount += wrappedLines[i].length;
        // Account for spaces that were consumed during wrapping
        if (i < wrappedLines.length - 1 && charCount < this.text.length) {
          if (this.text[charCount] === '\n') {
            charCount++; // Skip newline
          } else if (this.text[charCount] === ' ') {
            charCount++; // Skip space
          }
        }
      }
      this.cursorPosition = charCount + newPosInLine;
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
    
    let charCount = 0;
    let lineIndex = 0;
    let posInLine = 0;
    
    for (let i = 0; i < wrappedLines.length; i++) {
      let lineLength = wrappedLines[i] ? wrappedLines[i].length : 0;
      
      if (charCount + lineLength >= this.cursorPosition) {
        lineIndex = i;
        posInLine = this.cursorPosition - charCount;
        break;
      }
      
      charCount += lineLength;
      
      // Account for wrapped spaces and newlines
      if (charCount < this.text.length) {
        if (this.text[charCount] === '\n') {
          charCount++;
        } else if (this.text[charCount] === ' ') {
          charCount++;
        }
      }
      
      if (i === wrappedLines.length - 1) {
        lineIndex = i;
        posInLine = this.cursorPosition - charCount;
      }
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
    
    // Draw cursor line
    push();
    stroke(0, 0, 255);
    strokeWeight(2);
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
    fill(255, 100, 100, 100); // Red overlay with transparency
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
  
  getLineAndPositionFromChar(charPos, wrappedLines) {
    let charCount = 0;
    let lineIndex = 0;
    let posInLine = 0;
    
    for (let i = 0; i < wrappedLines.length; i++) {
      let lineLength = wrappedLines[i].length;
      
      if (charCount + lineLength >= charPos) {
        lineIndex = i;
        posInLine = charPos - charCount;
        break;
      }
      
      charCount += lineLength;
      
      // Account for wrapped spaces and newlines
      if (charCount < this.text.length) {
        if (this.text[charCount] === '\n') {
          charCount++;
        } else if (this.text[charCount] === ' ') {
          charCount++;
        }
      }
      
      if (i === wrappedLines.length - 1) {
        lineIndex = i;
        posInLine = charPos - charCount;
      }
    }
    
    return { lineIndex, posInLine };
  }
}
