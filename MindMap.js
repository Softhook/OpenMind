class MindMap {
  constructor() {
    this.boxes = [];
    this.connections = [];
    this.selectedBox = null;
    this.selectedConnection = null;
    // If connecting, stores { box, side }
    this.connectingFrom = null;

    // Undo history (up to 5 snapshots)
    this.undoStack = [];
    this.maxUndo = 5;

    // Multi-selection of boxes
    this.selectedBoxes = new Set();
  }
  
  addBox(box) {
    this.pushUndo();
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
    
    this.pushUndo();
    this.connections.push(new Connection(fromBox, toBox));
  }

  // Push current state to undo stack (before making a change)
  pushUndo() {
    try {
      const snap = this.toJSON();
      this.undoStack.push(JSON.parse(JSON.stringify(snap)));
      if (this.undoStack.length > this.maxUndo) {
        this.undoStack.shift();
      }
    } catch (e) {
      console.warn('Failed to push undo snapshot:', e);
    }
  }

  // Revert to the most recent snapshot
  undo() {
    if (!this.undoStack || this.undoStack.length === 0) return;
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.fromJSON(snap);
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
    if (this.connectingFrom && typeof worldMouseX === 'function' && typeof worldMouseY === 'function') {
      const { box, side } = this.connectingFrom;
      const start = box.getConnectorCenter(side);
      if (start && !isNaN(start.x) && !isNaN(start.y)) {
        push();
        stroke(100, 100, 255);
        strokeWeight(2);
        line(start.x, start.y, worldMouseX(), worldMouseY());
        noStroke();
        fill(100, 150, 255);
        circle(start.x, start.y, 10);
        circle(worldMouseX(), worldMouseY(), 8);
        pop();
      }
    }
  }
  
  // Align boxes' x and y positions when they are within a tolerance.
  // Groups nearby coordinates into clusters and snaps each cluster to its average.
  alignBoxes(tolerance = 12) {
    const tol = Math.max(0, Number.isFinite(tolerance) ? tolerance : 12);
    if (!this.boxes || this.boxes.length < 2) return;

    // Helper: cluster numerical values and return array of clusters (arrays of indices)
    const clusterValues = (values) => {
      // values: [{v:number, i:number}]
      const sorted = values.slice().sort((a, b) => a.v - b.v);
      const clusters = [];
      let current = [];
      for (let k = 0; k < sorted.length; k++) {
        const item = sorted[k];
        if (current.length === 0) {
          current.push(item);
        } else {
          const prev = current[current.length - 1];
          if (Math.abs(item.v - prev.v) <= tol) {
            current.push(item);
          } else {
            if (current.length > 0) clusters.push(current);
            current = [item];
          }
        }
      }
      if (current.length > 0) clusters.push(current);
      return clusters;
    };

    // X alignment
    const xVals = this.boxes.map((b, i) => ({ v: b.x, i }));
    const xClusters = clusterValues(xVals);
    for (const cluster of xClusters) {
      if (cluster.length < 2) continue; // Only snap when there are at least 2
      const avg = cluster.reduce((s, it) => s + it.v, 0) / cluster.length;
      for (const it of cluster) {
        this.boxes[it.i].x = avg;
      }
    }

    // Y alignment
    const yVals = this.boxes.map((b, i) => ({ v: b.y, i }));
    const yClusters = clusterValues(yVals);
    for (const cluster of yClusters) {
      if (cluster.length < 2) continue;
      const avg = cluster.reduce((s, it) => s + it.v, 0) / cluster.length;
      for (const it of cluster) {
        this.boxes[it.i].y = avg;
      }
    }
  }
  
  handleMousePressed() {
    // Validate mouse coordinates
    const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
    const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
    if (mx == null || my == null || isNaN(mx) || isNaN(my)) {
      return;
    }
    const shiftDown = keyIsDown(16); // SHIFT
    
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
        this.pushUndo();
        // Remove connections that involve this box
        this.connections = this.connections.filter(conn => 
          conn.fromBox !== box && conn.toBox !== box
        );
        // Remove the box
        this.boxes.splice(i, 1);
        // Remove from multi-selection if present
        if (this.selectedBoxes.has(box)) {
          this.selectedBoxes.delete(box);
        }
        if (box.selected) box.selected = false;
        if (this.selectedBox === box) {
          this.selectedBox = null;
        }
        return;
      }
    }
    
      // Check if clicking on a background color circle of any selected box (top-most first)
      for (let i = this.boxes.length - 1; i >= 0; i--) {
        const box = this.boxes[i];
        if (!box || !box.selected || box.isEditing || typeof box.getColorCircleUnderMouse !== 'function') continue;
        const key = box.getColorCircleUnderMouse();
        if (key) {
          this.pushUndo();
          box.setBackgroundByKey(key);
          return;
        }
      }
    
    // Check if clicking on resize handle
    for (let box of this.boxes) {
      if (box.isMouseOverResizeHandle()) {
        this.selectedBox = box;
        // Single select this box when resizing
        if (!shiftDown) this.clearBoxSelection();
        this.addBoxToSelection(box);
        this.pushUndo();
        box.startResize(mx, my);
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
        // If a different box is being edited and we're interacting with a new one, stop editing
        if (this.selectedBox && this.selectedBox !== box) {
          this.selectedBox.stopEditing();
        }

        const onEdge = (typeof box.isMouseOnEdge === 'function' && box.isMouseOnEdge());

        if (onEdge) {
          // Edge click: start drag. If Shift is held, drag all selected boxes (including this one).
          this.pushUndo();
          // Ensure selection
          if (!shiftDown) {
            this.clearBoxSelection();
          }
          this.addBoxToSelection(box);

          // Stop editing to avoid text interaction while dragging
          box.stopEditing();

          // Start drag for all selected boxes when shift held; otherwise just this one
          if (shiftDown && this.selectedBoxes.size > 0) {
            for (const b of this.selectedBoxes) {
              b.startDrag(mx, my);
            }
          } else {
            box.startDrag(mx, my);
          }
        } else {
          // Center click
          if (shiftDown) {
            // Toggle selection without entering text edit
            this.toggleBoxSelection(box);
            // Also stop editing any box when toggling selection
            if (this.selectedBox) {
              this.selectedBox.stopEditing();
            }
            this.selectedBox = null;
          } else {
            // Single-select and enter editing
            this.clearBoxSelection();
            this.addBoxToSelection(box);
            this.selectedBox = box;
            box.handleMouseDown(mx, my);
          }
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
        // Clear multi-selection
        this.clearBoxSelection();
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
    if (!shiftDown) this.clearBoxSelection();
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
    const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
    const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
    if (mx == null || my == null || isNaN(mx) || isNaN(my)) {
      return;
    }
    
    for (let box of this.boxes) {
      if (!box) continue;
      // If this is the actively edited box and selection is in progress, update selection
      if (box === this.selectedBox && box.isSelecting) {
        box.updateSelection(mx, my);
      } else {
        box.drag(mx, my);
        box.resize(mx, my);
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
        } else if (key === 'x' || key === 'X') {
          // Cut: copy selection then delete it
          try {
            let selectedText = this.selectedBox.getSelectedText();
            if (selectedText && navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(selectedText).catch(err => {
                console.error('Failed to cut (copy) text: ', err);
              });
            }
          } catch (e) {
            console.error('Clipboard cut not supported:', e);
          }
          // Delete selection regardless of clipboard outcome
          this.pushUndo();
          if (this.selectedBox.selectionStart !== -1 && this.selectedBox.selectionEnd !== -1) {
            this.selectedBox.deleteSelection();
          }
          return;
        } else if (key === 'v' || key === 'V') {
          // Paste from clipboard
          try {
            if (navigator.clipboard && navigator.clipboard.readText) {
              navigator.clipboard.readText().then(text => {
                if (text && this.selectedBox) {
                  this.pushUndo();
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
        this.pushUndo();
        // Modifier variants for deletion
        if (keyIsDown(91) || keyIsDown(93)) { // CMD -> delete to start of line
          this.selectedBox.deleteToLineStart();
        } else if (keyIsDown(18) || keyIsDown(17)) { // ALT/OPTION or CTRL -> delete previous word
          this.selectedBox.deleteWordLeft();
        } else {
          this.selectedBox.removeChar();
        }
      } else if (keyCode === DELETE) {
        this.pushUndo();
        // Forward delete and modifier variants
        if (keyIsDown(91) || keyIsDown(93)) { // CMD -> delete to end of line
          this.selectedBox.deleteToLineEnd();
        } else if (keyIsDown(18) || keyIsDown(17)) { // ALT/OPTION or CTRL -> delete next word
          this.selectedBox.deleteWordRight();
        } else {
          this.selectedBox.removeForwardChar();
        }
      } else if (keyCode === ENTER) {
        this.pushUndo();
        this.selectedBox.addChar('\n');
      } else if (key && key.length === 1) {
        this.pushUndo();
        this.selectedBox.addChar(key);
      }
    } else if (keyCode === BACKSPACE || keyCode === DELETE) {
      // Delete selected connection only
      if (this.selectedConnection) {
        this.pushUndo();
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
  
  async save() {
    const data = this.toJSON();
    try {
      // Use the File System Access API when available to let the user choose a location
      if (typeof window !== 'undefined' && window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'openmind.json',
          types: [
            {
              description: 'JSON Files',
              accept: { 'application/json': ['.json'] }
            }
          ]
        });
        const writable = await handle.createWritable();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        await writable.write(blob);
        await writable.close();
      } else {
        // Fallback: regular download (browser chooses default Downloads location)
        saveJSON(data, 'openmind.json');
      }
    } catch (e) {
      // User may cancel the dialog; that's not an error
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return;
      console.error('Save failed:', e);
      try { alert('Save failed: ' + (e && e.message ? e.message : String(e))); } catch (_) {}
    }
  }
  
  load(data) {
    this.fromJSON(data);
  }

  // Selection helpers
  clearBoxSelection() {
    if (!this.selectedBoxes) this.selectedBoxes = new Set();
    for (const b of this.selectedBoxes) {
      if (b) b.selected = false;
    }
    this.selectedBoxes.clear();
  }

  addBoxToSelection(box) {
    if (!box) return;
    if (!this.selectedBoxes) this.selectedBoxes = new Set();
    this.selectedBoxes.add(box);
    box.selected = true;
  }

  removeBoxFromSelection(box) {
    if (!box || !this.selectedBoxes) return;
    if (this.selectedBoxes.has(box)) this.selectedBoxes.delete(box);
    box.selected = false;
  }

  toggleBoxSelection(box) {
    if (!box) return;
    if (!this.selectedBoxes) this.selectedBoxes = new Set();
    if (this.selectedBoxes.has(box)) {
      this.selectedBoxes.delete(box);
      box.selected = false;
    } else {
      this.selectedBoxes.add(box);
      box.selected = true;
    }
  }
}
