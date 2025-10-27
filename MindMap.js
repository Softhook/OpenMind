class MindMap {
  constructor() {
    this.boxes = [];
    this.connections = [];
    this.selectedBox = null;
    this.connectingFrom = null;
  }
  
  addBox(box) {
    this.boxes.push(box);
  }
  
  addConnection(fromBox, toBox) {
    // Check if connection already exists
    for (let conn of this.connections) {
      if (conn.fromBox === fromBox && conn.toBox === toBox) {
        return; // Connection already exists
      }
    }
    this.connections.push(new Connection(fromBox, toBox));
  }
  
  draw() {
    // Draw connections first (behind boxes)
    for (let conn of this.connections) {
      conn.draw();
    }
    
    // Draw connecting line if in connection mode
    if (this.connectingFrom) {
      push();
      stroke(100, 100, 255);
      strokeWeight(2);
      let start = this.connectingFrom.getConnectionPoint({ x: mouseX, y: mouseY });
      line(start.x, start.y, mouseX, mouseY);
      pop();
    }
    
    // Draw boxes
    for (let box of this.boxes) {
      box.draw();
    }
  }
  
  handleMousePressed() {
    // Check if clicking on a box edge for connection
    for (let box of this.boxes) {
      if (box.isMouseOnEdge()) {
        this.connectingFrom = box;
        return;
      }
    }
    
    // Check if clicking inside a box
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      let box = this.boxes[i];
      if (box.isMouseOver()) {
        // If a box is currently being edited, stop editing it
        if (this.selectedBox && this.selectedBox !== box) {
          this.selectedBox.stopEditing();
        }
        
        // Start editing or dragging
        this.selectedBox = box;
        box.startEditing();
        box.startDrag(mouseX, mouseY);
        
        // Move this box to the end (on top)
        this.boxes.splice(i, 1);
        this.boxes.push(box);
        return;
      }
    }
    
    // Clicked outside all boxes
    if (this.selectedBox) {
      this.selectedBox.stopEditing();
      this.selectedBox = null;
    }
  }
  
  handleMouseReleased() {
    // Complete connection if in connection mode
    if (this.connectingFrom) {
      for (let box of this.boxes) {
        if (box !== this.connectingFrom && box.isMouseOver()) {
          this.addConnection(this.connectingFrom, box);
          break;
        }
      }
      this.connectingFrom = null;
    }
    
    // Stop dragging all boxes
    for (let box of this.boxes) {
      box.stopDrag();
    }
  }
  
  handleMouseDragged() {
    for (let box of this.boxes) {
      box.drag(mouseX, mouseY);
    }
  }
  
  handleKeyPressed(key, keyCode) {
    if (this.selectedBox && this.selectedBox.isEditing) {
      if (keyCode === BACKSPACE) {
        this.selectedBox.removeChar();
      } else if (keyCode === ENTER) {
        this.selectedBox.addChar('\n');
      } else if (key.length === 1) {
        this.selectedBox.addChar(key);
      }
    }
  }
  
  toJSON() {
    return {
      boxes: this.boxes.map(box => box.toJSON()),
      connections: this.connections.map(conn => conn.toJSON(this.boxes))
    };
  }
  
  fromJSON(data) {
    this.boxes = [];
    this.connections = [];
    this.selectedBox = null;
    this.connectingFrom = null;
    
    // Load boxes
    for (let boxData of data.boxes) {
      this.boxes.push(TextBox.fromJSON(boxData));
    }
    
    // Load connections
    for (let connData of data.connections) {
      this.connections.push(Connection.fromJSON(connData, this.boxes));
    }
  }
  
  save() {
    let data = this.toJSON();
    saveJSON(data, 'mindmap.json');
  }
  
  load(data) {
    this.fromJSON(data);
  }
}
