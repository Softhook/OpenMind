class MindMap {
  constructor() {
    this.boxes = [];
    this.connections = [];
    this.selectedBox = null;
    this.selectedConnection = null;
    // If connecting, stores { box, side }
    this.connectingFrom = null;
  }
  
  addBox(box) {
    this.boxes.push(box);
  }
  
  addConnection(fromBox, toBox) {
    // Validate inputs
    if (!fromBox || !toBox) {
      console.warn('Cannot create connection: invalid boxes');
      return;
    }
    
    // Prevent self-connections
    if (fromBox === toBox) {
      console.warn('Cannot create connection to self');
      return;
    }
    
    // Check if connection already exists (same direction)
    for (let conn of this.connections) {
      if (conn.fromBox === fromBox && conn.toBox === toBox) {
        console.warn('Connection already exists');
        return; // Connection already exists
      }
    }
    
    this.connections.push(new Connection(fromBox, toBox));
  }
  
  draw() {
    // Draw existing connections
    if (this.connections) {
      for (let conn of this.connections) {
        if (!conn) continue;
        try { conn.draw(); } catch (e) { console.error('Error drawing connection:', e); }
      }
    }

    // Draw boxes
    if (this.boxes) {
      for (let box of this.boxes) {
        if (!box) continue;
        try { box.draw(); } catch (e) { console.error('Error drawing box:', e); }
      }
    }

    // Draw connector dots on hovered or active boxes
    if (this.boxes) {
      for (let box of this.boxes) {
        if (!box) continue;
        const active = this.connectingFrom && this.connectingFrom.box === box;
        if (box.isMouseOver() || active) {
          try { box.drawConnectors(!!active); } catch (e) {}
        }
      }
    }

    // Draw live connecting line and dots if connecting
    if (this.connectingFrom && mouseX != null && mouseY != null && !isNaN(mouseX) && !isNaN(mouseY)) {
      const { box, side } = this.connectingFrom;
      const start = box.getConnectorCenter(side);
      if (start && !isNaN(start.x) && !isNaN(start.y)) {
        push();
        stroke(100, 100, 255);
        strokeWeight(2);
        line(start.x, start.y, mouseX, mouseY);
        noStroke();
        fill(100, 150, 255);
        circle(start.x, start.y, 10);
        circle(mouseX, mouseY, 8);
        pop();
      }
    }
  }
  
  handleMousePressed() {
    // Validate mouse coordinates
    if (mouseX == null || mouseY == null || isNaN(mouseX) || isNaN(mouseY)) {
      return;
    }
    
    // Deselect any previously selected connection
    if (this.selectedConnection) {
      this.selectedConnection.selected = false;
      this.selectedConnection = null;
    }
    
    // Check if clicking on delete icon of any box
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      let box = this.boxes[i];
      if (!box) continue; // Skip null boxes
      if (box.isMouseOverDeleteIcon()) {
        // Remove connections that involve this box
        this.connections = this.connections.filter(conn => 
          conn.fromBox !== box && conn.toBox !== box
        );
        // Remove the box
        this.boxes.splice(i, 1);
        if (this.selectedBox === box) {
          this.selectedBox = null;
        }
        return;
      }
    }
    
    // Check if clicking on resize handle
    for (let box of this.boxes) {
      if (box.isMouseOverResizeHandle()) {
        this.selectedBox = box;
        box.startResize(mouseX, mouseY);
        return;
      }
    }
    
    // Check if clicking on a connector dot at box edge center for connection
    for (let box of this.boxes) {
      const side = box.getConnectorUnderMouse();
      if (side) {
        this.connectingFrom = { box, side };
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
        // If click is in text area, enter editing and prepare selection.
        if (box.isPointInTextArea(mouseX, mouseY)) {
          box.handleMouseDown(mouseX, mouseY);
        } else {
          // Otherwise drag the box
          box.stopEditing();
          box.startDrag(mouseX, mouseY);
        }
        
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
        if (!box) continue;
        if (box !== this.connectingFrom.box && box.isMouseOver()) {
          this.addConnection(this.connectingFrom.box, box);
          break;
        }
      }
      this.connectingFrom = null;
    }
    
    // Stop dragging and resizing all boxes
    for (let box of this.boxes) {
      if (!box) continue;
      box.stopDrag();
      box.stopResize();
      box.stopSelecting();
    }
  }
  
  handleMouseDragged() {
    // Validate mouse coordinates
    if (mouseX == null || mouseY == null || isNaN(mouseX) || isNaN(mouseY)) {
      return;
    }
    
    for (let box of this.boxes) {
      if (!box) continue;
      // If this is the actively edited box and selection is in progress, update selection
      if (box === this.selectedBox && box.isSelecting) {
        box.updateSelection(mouseX, mouseY);
      } else {
        box.drag(mouseX, mouseY);
        box.resize(mouseX, mouseY);
      }
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
          try {
            let selectedText = this.selectedBox.getSelectedText();
            if (selectedText && navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(selectedText).catch(err => {
                console.error('Failed to copy text: ', err);
              });
            }
          } catch (e) {
            console.error('Clipboard copy not supported:', e);
          }
          return;
        } else if (key === 'v' || key === 'V') {
          // Paste from clipboard
          try {
            if (navigator.clipboard && navigator.clipboard.readText) {
              navigator.clipboard.readText().then(text => {
                if (text && this.selectedBox) {
                  this.selectedBox.pasteText(text);
                }
              }).catch(err => {
                console.error('Failed to paste text: ', err);
              });
            }
          } catch (e) {
            console.error('Clipboard paste not supported:', e);
          }
          return;
        }
      }
      
      // Handle arrow keys for cursor movement
      if (keyCode === LEFT_ARROW) {
        this.selectedBox.moveCursorLeft();
      } else if (keyCode === RIGHT_ARROW) {
        this.selectedBox.moveCursorRight();
      } else if (keyCode === UP_ARROW) {
        this.selectedBox.moveCursorUp();
      } else if (keyCode === DOWN_ARROW) {
        this.selectedBox.moveCursorDown();
      } else if (keyCode === BACKSPACE) {
        this.selectedBox.removeChar();
      } else if (keyCode === ENTER) {
        this.selectedBox.addChar('\n');
      } else if (key && key.length === 1) {
        this.selectedBox.addChar(key);
      }
    } else if (keyCode === BACKSPACE) {
      // Delete selected connection only
      if (this.selectedConnection) {
        let index = this.connections.indexOf(this.selectedConnection);
        if (index > -1) {
          this.connections.splice(index, 1);
          this.selectedConnection = null;
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
    // Validate input data
    if (!data || typeof data !== 'object') {
      console.error('Invalid data format');
      return;
    }
    
    this.boxes = [];
    this.connections = [];
    this.selectedBox = null;
    this.selectedConnection = null;
    this.connectingFrom = null;
    
    // Load boxes with error handling
    if (Array.isArray(data.boxes)) {
      for (let boxData of data.boxes) {
        try {
          if (boxData) {
            let box = TextBox.fromJSON(boxData);
            if (box) {
              this.boxes.push(box);
            }
          }
        } catch (e) {
          console.error('Failed to load box:', e);
        }
      }
    } else {
      console.warn('No boxes data found');
    }
    
    // Load connections with error handling
    if (Array.isArray(data.connections)) {
      for (let connData of data.connections) {
        try {
          if (connData) {
            let conn = Connection.fromJSON(connData, this.boxes);
            if (conn && conn.fromBox && conn.toBox) {
              this.connections.push(conn);
            }
          }
        } catch (e) {
          console.error('Failed to load connection:', e);
        }
      }
    } else {
      console.warn('No connections data found');
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
