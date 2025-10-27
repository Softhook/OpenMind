class MindMap {
  constructor() {
    this.boxes = [];
    this.connections = [];
    this.selectedBox = null;
    this.selectedConnection = null;
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
    // Deselect any previously selected connection
    if (this.selectedConnection) {
      this.selectedConnection.selected = false;
      this.selectedConnection = null;
    }
    
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
    
    // Check if clicking on a connection
    for (let conn of this.connections) {
      if (conn.isMouseOver()) {
        // Deselect any selected box
        if (this.selectedBox) {
          this.selectedBox.stopEditing();
          this.selectedBox = null;
        }
        this.selectedConnection = conn;
        conn.selected = true;
        return;
      }
    }
    
    // Clicked outside all boxes and connections
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
      // Check for CMD/CTRL key combinations
      if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17))) { // CMD or CTRL key
        if (key === 'a' || key === 'A') {
          // Select all text
          this.selectedBox.selectAll();
          return;
        } else if (key === 'c' || key === 'C') {
          // Copy selected text to clipboard
          let selectedText = this.selectedBox.getSelectedText();
          if (selectedText) {
            navigator.clipboard.writeText(selectedText).catch(err => {
              console.error('Failed to copy text: ', err);
            });
          }
          return;
        } else if (key === 'v' || key === 'V') {
          // Paste from clipboard
          navigator.clipboard.readText().then(text => {
            if (text) {
              this.selectedBox.pasteText(text);
            }
          }).catch(err => {
            console.error('Failed to paste text: ', err);
          });
          return;
        }
      }
      
      if (keyCode === BACKSPACE) {
        this.selectedBox.removeChar();
      } else if (keyCode === ENTER) {
        this.selectedBox.addChar('\n');
      } else if (key.length === 1) {
        this.selectedBox.addChar(key);
      }
    } else if (keyCode === BACKSPACE) {
      // Delete selected connection
      if (this.selectedConnection) {
        let index = this.connections.indexOf(this.selectedConnection);
        if (index > -1) {
          this.connections.splice(index, 1);
          this.selectedConnection = null;
        }
      }
      // Delete selected box (when not editing)
      else if (this.selectedBox) {
        // Remove connections that involve this box
        this.connections = this.connections.filter(conn => 
          conn.fromBox !== this.selectedBox && conn.toBox !== this.selectedBox
        );
        // Remove the box
        let index = this.boxes.indexOf(this.selectedBox);
        if (index > -1) {
          this.boxes.splice(index, 1);
          this.selectedBox = null;
        }
      }
    }
  }
  
  toJSON() {
    return {
      boxes: this.boxes.map(box => box.toJSON()),
      connections: this.connections.map(conn => conn.toJSON(this.boxes))
    };
  }
  
  handleRightClick() {
    // Reverse connection direction on right click
    if (this.selectedConnection) {
      this.selectedConnection.reverse();
      return true; // Indicate we handled the right click
    }
    return false;
  }
  
  fromJSON(data) {
    this.boxes = [];
    this.connections = [];
    this.selectedBox = null;
    this.selectedConnection = null;
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
