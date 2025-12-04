/**
 * MindMap class - manages the entire mind map including boxes, connections,
 * selection state, undo/redo, and navigation.
 * Uses shared utilities from utils.js when available.
 */
class MindMap {
  // Constants for configuration
  static MAX_UNDO_STACK = 20; // Increased from 5 for better UX
  static ALIGN_TOLERANCE = 12;
  
  /**
   * Helper to check if a number is valid (uses Utils if available)
   * @private
   */
  static _isValidNumber(value) {
    if (typeof Utils !== 'undefined' && Utils.isValidNumber) {
      return Utils.isValidNumber(value);
    }
    return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value);
  }
  
  /**
   * Helper to safely clone an object
   * @private
   */
  static _deepClone(obj) {
    if (typeof Utils !== 'undefined' && Utils.deepClone) {
      return Utils.deepClone(obj);
    }
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      console.warn('deepClone failed:', e);
      return obj;
    }
  }
  
  /**
   * Initializes a new MindMap with default state
   */
  constructor() {
    this.boxes = [];
    this.connections = [];
    this.selectedBox = null;
    this.selectedConnection = null;
    this.connectingFrom = null;
    this.connectingFromInitiatedByKeyboard = false;
    this.draggingConnection = null; // { conn, originalTo }

    // Undo history - optimized with larger stack
    this.undoStack = [];
    this.maxUndo = MindMap.MAX_UNDO_STACK;

    // Multi-selection of boxes
    this.selectedBoxes = new Set();
    // Multi-selection of connections
    this.selectedConnections = new Set();
    
    // Clipboard for copying/pasting boxes
    this.copiedBoxes = [];
    
    // Performance optimization: track if content has changed
    this.isDirty = true;
    
    // Autosave tracking
    this.isSaved = true; // Track if current state is saved
    
    // Arrow key navigation tracking
    this.isArrowKeyNavigating = false;
    
    // Pan animation settings
    this.panAnimationSpeed = 0.15; // 0 to 1, higher = faster (0.15 is smooth)
    this.isPanAnimating = false;
    this.panTargetX = 0;
    this.panTargetY = 0;
    // Zoom animation settings (for arrow-key navigation)
    this.zoomTarget = null;
    this.isZoomAnimating = false;
    this.zoomAnimationSpeed = 0.12; // separate speed for zoom interpolation
  }
  
  /**
   * Adds a new box to the mind map
   * @param {TextBox} box - The box to add
   */
  addBox(box) {
    this.pushUndo();
    this.boxes.push(box);
    this.isDirty = true;
  }
  
  /**
   * Adds a connection between two boxes
   * @param {TextBox} fromBox - Source box
   * @param {TextBox} toBox - Target box
   */
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
        return;
      }
    }
    
    this.pushUndo();
    this.connections.push(new Connection(fromBox, toBox));
    this.isDirty = true;
  }

  /**
   * Pushes current state to undo stack before making a change
   * Uses shared deep clone utility for reliable copying
   */
  pushUndo() {
    try {
      const snap = this.toJSON();
      // Deep clone to prevent reference issues
      const clonedSnap = MindMap._deepClone(snap);
      this.undoStack.push(clonedSnap);
      
      // Limit stack size for memory management
      if (this.undoStack.length > this.maxUndo) {
        this.undoStack.shift();
      }
      
      // Mark as unsaved since we're about to make a change
      this.isSaved = false;
    } catch (e) {
      console.warn('Failed to push undo snapshot:', e);
    }
  }

  /**
   * Reverts to the most recent snapshot from undo stack
   */
  undo() {
    if (!this.undoStack || this.undoStack.length === 0) return;
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.fromJSON(snap);
    this.isDirty = true;
    this.isSaved = false;
  }
  
  /**
   * Gets the color priority for a box (lower number = higher priority)
   * Red: priority 1, Orange: priority 2, White/other: priority 999
   * @param {TextBox} box - The box to check
   * @returns {number} Priority value
   */
  getBoxColorPriority(box) {
    if (!box || !box.backgroundColor) return 999; // white/default gets lowest priority
    const { r, g, b } = box.backgroundColor;
    
    // Red: r=255, g=140, b=140
    if (r === 255 && g === 140 && b === 140) return 1;
    
    // Orange: r=255, g=200, b=140
    if (r === 255 && g === 200 && b === 140) return 2;
    
    // White or other: lowest priority
    return 999;
  }
  
  /**
   * Updates animation states (call this every frame)
   */
  update() {
    // Handle pan animation
    if ((this.isPanAnimating || this.isZoomAnimating) && typeof centerCameraOn === 'function') {
      // Get current camera position in world space
      const currentWorldX = typeof camX !== 'undefined' && typeof width !== 'undefined' && typeof zoom !== 'undefined'
        ? (width / 2 - camX) / zoom
        : 0;
      const currentWorldY = typeof camY !== 'undefined' && typeof height !== 'undefined' && typeof zoom !== 'undefined'
        ? (height / 2 - camY) / zoom
        : 0;

      // Determine pan interpolation
      const dx = this.panTargetX - currentWorldX;
      const dy = this.panTargetY - currentWorldY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Determine zoom interpolation
      const currentZoom = (typeof zoom !== 'undefined') ? zoom : 1;
      const targetZoom = (this.zoomTarget != null) ? this.zoomTarget : currentZoom;
      const dz = targetZoom - currentZoom;

      // Compute new zoom value by easing
      let newZoom = currentZoom;
      if (this.isZoomAnimating) {
        newZoom = currentZoom + dz * this.zoomAnimationSpeed;
        // Stop zooming when close enough
        if (Math.abs(targetZoom - newZoom) < 0.001) {
          newZoom = targetZoom;
        }
        // Apply new zoom immediately so centerCameraOn uses correct scale
        zoom = constrain(newZoom, (typeof CONFIG !== 'undefined' && CONFIG.ZOOM && CONFIG.ZOOM.MIN) ? CONFIG.ZOOM.MIN : 0.2,
                        (typeof CONFIG !== 'undefined' && CONFIG.ZOOM && CONFIG.ZOOM.MAX) ? CONFIG.ZOOM.MAX : 3.0);
      }

      // Compute new world center by easing
      let newWorldX = currentWorldX;
      let newWorldY = currentWorldY;
      if (this.isPanAnimating) {
        newWorldX = currentWorldX + dx * this.panAnimationSpeed;
        newWorldY = currentWorldY + dy * this.panAnimationSpeed;
        // If very close, snap to target
        if (distance < 1) {
          newWorldX = this.panTargetX;
          newWorldY = this.panTargetY;
        }
      }

      // Center camera on interpolated world point using the (possibly) updated zoom
      centerCameraOn(newWorldX, newWorldY);

      // Update animation flags
      if (this.isPanAnimating && distance < 1) this.isPanAnimating = false;
      if (this.isZoomAnimating && Math.abs(targetZoom - zoom) < 0.001) this.isZoomAnimating = false;
    }
  }
  
  /**
   * Draws the mind map (connections and boxes)
   */
  draw() {
    // Update animations
    this.update();
    
    // Draw existing connections (skip the one being reattached)
    if (this.connections) {
      for (let conn of this.connections) {
        if (!conn) continue;
        if (this.draggingConnection && this.draggingConnection.conn === conn) continue;
        try { conn.draw(); } catch (e) { console.error('Error drawing connection:', e); }
      }
    }

    // Draw boxes
    if (this.boxes) {
      for (let box of this.boxes) {
        if (!box) continue;
        try { 
          // Pass navigation state to box for dimming effect
          box.draw(this.isArrowKeyNavigating && this.selectedBox !== box); 
        } catch (e) { console.error('Error drawing box:', e); }
      }
    }

    // Draw connector dots on hovered or active boxes (but not when editing)
    if (this.boxes) {
      for (let box of this.boxes) {
        if (!box) continue;
        // Don't show connectors if the box is being edited
        if (box.isEditing) continue;
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

    // Draw live reattach line if dragging an existing connection's arrow head
    if (this.draggingConnection && this.draggingConnection.conn && typeof worldMouseX === 'function' && typeof worldMouseY === 'function') {
      const conn = this.draggingConnection.conn;
      const from = conn.fromBox ? conn.fromBox.getConnectionPoint({ x: worldMouseX(), y: worldMouseY() }) : null;
      if (from && !isNaN(from.x) && !isNaN(from.y)) {
        const mx = worldMouseX();
        const my = worldMouseY();
        push();
        stroke(100, 100, 255);
        strokeWeight(2);
        line(from.x, from.y, mx, my);
        // Arrow head at mouse
        const angle = atan2(my - from.y, mx - from.x);
        fill(100, 150, 255);
        noStroke();
        push();
        translate(mx, my);
        rotate(angle);
        const size = (conn.arrowSize || 10);
        triangle(0, 0, -size, -size/2, -size, size/2);
        pop();
        pop();
      }
    }
  }
  
  /**
   * Aligns boxes' x and y positions when they are within a tolerance.
   * Groups nearby coordinates into clusters and snaps each cluster to its average.
   * @param {number} tolerance - Distance threshold for alignment (default: ALIGN_TOLERANCE)
   */
  alignBoxes(tolerance = MindMap.ALIGN_TOLERANCE) {
    const tol = Math.max(0, Number.isFinite(tolerance) ? tolerance : MindMap.ALIGN_TOLERANCE);
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
  
  /**
   * Left-aligns all selected boxes to the leftmost box's left edge.
   * If no boxes are selected, aligns all boxes.
   */
  leftAlignSelectedBoxes() {
    // Determine which boxes to align
    let boxesToAlign = [];
    if (this.selectedBoxes && this.selectedBoxes.size > 0) {
      boxesToAlign = Array.from(this.selectedBoxes);
    } else if (this.boxes && this.boxes.length > 0) {
      boxesToAlign = this.boxes.filter(b => b != null);
    }
    
    if (boxesToAlign.length < 2) return;
    
    // Find the leftmost left edge (box.x - box.width/2)
    let minLeftEdge = Infinity;
    for (const box of boxesToAlign) {
      if (!box || !MindMap._isValidNumber(box.x) || !MindMap._isValidNumber(box.width)) continue;
      const leftEdge = box.x - box.width / 2;
      if (leftEdge < minLeftEdge) {
        minLeftEdge = leftEdge;
      }
    }
    
    if (!Number.isFinite(minLeftEdge)) return;
    
    // Align all boxes so their left edge matches the minimum left edge
    for (const box of boxesToAlign) {
      if (!box || !MindMap._isValidNumber(box.x) || !MindMap._isValidNumber(box.width)) continue;
      // New center x = minLeftEdge + width/2
      box.x = minLeftEdge + box.width / 2;
    }
    
    this.isDirty = true;
    this.isSaved = false;
  }
  
  /**
   * Arranges selected boxes (or all boxes) in a hierarchical layout based on connections.
   * Uses a tree/graph layout algorithm to create a structured network diagram.
   * Root nodes (nodes with no incoming connections) are placed at the top.
   */
  hierarchicalLayout() {
    // Determine which boxes to layout
    let boxesToLayout = [];
    if (this.selectedBoxes && this.selectedBoxes.size > 0) {
      boxesToLayout = Array.from(this.selectedBoxes);
    } else if (this.boxes && this.boxes.length > 0) {
      boxesToLayout = this.boxes.filter(b => b != null);
    }
    
    if (boxesToLayout.length < 1) return;
    
    const boxSet = new Set(boxesToLayout);
    
    // Build adjacency lists for the selected boxes only
    // fromBox -> toBox means an arrow goes from fromBox to toBox
    const children = new Map(); // box -> array of child boxes
    const parents = new Map();  // box -> array of parent boxes
    
    for (const box of boxesToLayout) {
      children.set(box, []);
      parents.set(box, []);
    }
    
    // Only consider connections where both endpoints are in the selection
    for (const conn of this.connections) {
      if (!conn || !conn.fromBox || !conn.toBox) continue;
      if (boxSet.has(conn.fromBox) && boxSet.has(conn.toBox)) {
        children.get(conn.fromBox).push(conn.toBox);
        parents.get(conn.toBox).push(conn.fromBox);
      }
    }
    
    // Find root nodes (boxes with no parents in the selection)
    const roots = boxesToLayout.filter(box => parents.get(box).length === 0);
    
    // If no roots found (all nodes are in cycles), pick the first node
    if (roots.length === 0 && boxesToLayout.length > 0) {
      roots.push(boxesToLayout[0]);
    }
    
    // Sort roots by color priority (red first, then orange, then white)
    roots.sort((a, b) => {
      const priorityA = this.getBoxColorPriority(a);
      const priorityB = this.getBoxColorPriority(b);
      return priorityA - priorityB;
    });
    
    // Layout configuration
    const HORIZONTAL_SPACING = 200; // Space between siblings
    const VERTICAL_SPACING = 120;   // Space between levels
    const START_X = 100;            // Starting X position
    const START_Y = 100;            // Starting Y position
    
    // Assign levels using BFS from roots
    const levels = new Map(); // box -> level (0 = root)
    const visited = new Set();
    const queue = [];
    
    // Initialize roots at level 0
    for (const root of roots) {
      levels.set(root, 0);
      queue.push(root);
      visited.add(root);
    }
    
    // BFS to assign levels
    while (queue.length > 0) {
      const current = queue.shift();
      const currentLevel = levels.get(current);
      
      for (const child of children.get(current)) {
        if (!visited.has(child)) {
          visited.add(child);
          levels.set(child, currentLevel + 1);
          queue.push(child);
        }
      }
    }
    
    // Handle any unvisited nodes (disconnected within selection)
    for (const box of boxesToLayout) {
      if (!visited.has(box)) {
        visited.add(box);
        levels.set(box, 0);
      }
    }
    
    // Group boxes by level
    const levelGroups = new Map(); // level -> array of boxes
    for (const box of boxesToLayout) {
      const level = levels.get(box) || 0;
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level).push(box);
    }
    
    // Sort boxes within each level by their original x position for stability
    for (const boxes of levelGroups.values()) {
      boxes.sort((a, b) => {
        // Primary sort: color priority
        const priorityDiff = this.getBoxColorPriority(a) - this.getBoxColorPriority(b);
        if (priorityDiff !== 0) return priorityDiff;
        // Secondary sort: original x position
        return a.x - b.x;
      });
    }
    
    // Calculate positions for each level
    const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
    
    // Calculate center X based on the widest level
    let maxLevelWidth = 0;
    for (const [level, boxes] of levelGroups) {
      let totalWidth = 0;
      for (const box of boxes) {
        totalWidth += (box.width || 100) + HORIZONTAL_SPACING;
      }
      totalWidth -= HORIZONTAL_SPACING; // Remove trailing spacing
      if (totalWidth > maxLevelWidth) maxLevelWidth = totalWidth;
    }
    
    const centerX = START_X + maxLevelWidth / 2;
    
    // Position boxes level by level
    for (const level of sortedLevels) {
      const boxes = levelGroups.get(level);
      const y = START_Y + level * VERTICAL_SPACING;
      
      // Calculate total width of this level
      let totalWidth = 0;
      for (const box of boxes) {
        totalWidth += (box.width || 100) + HORIZONTAL_SPACING;
      }
      totalWidth -= HORIZONTAL_SPACING;
      
      // Start X position to center this level
      let x = centerX - totalWidth / 2;
      
      // Position each box
      for (const box of boxes) {
        const boxWidth = box.width || 100;
        box.x = x + boxWidth / 2;
        box.y = y;
        x += boxWidth + HORIZONTAL_SPACING;
      }
    }
    
    this.isDirty = true;
    this.isSaved = false;
  }
  
  /**
   * Navigates between boxes using arrow keys
   * UP/DOWN: Traverse depth-first through connections (priority: red → orange → white)
   * LEFT/RIGHT: Move between boxes at same hierarchy level (siblings)
   * @param {number} keyCode - The key code of the pressed arrow key
   */
  navigateBoxes(keyCode) {
    if (!this.boxes || this.boxes.length === 0) return;
    
    if (keyCode === UP_ARROW || keyCode === DOWN_ARROW) {
      // UP/DOWN: Navigate through depth-first traversal
      const buildNavigationOrder = () => {
        const visited = new Set();
        const orderedBoxes = [];
        
        // Get connected boxes for a given box (both directions)
        const getConnectedBoxes = (box) => {
          const connected = [];
          for (const conn of this.connections) {
            if (conn.fromBox === box && !visited.has(conn.toBox)) {
              connected.push(conn.toBox);
            }
            if (conn.toBox === box && !visited.has(conn.fromBox)) {
              connected.push(conn.fromBox);
            }
          }
          // Sort connected boxes by position: top-to-bottom, left-to-right
          return connected.sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) > 10) return yDiff;
            return a.x - b.x;
          });
        };
        
        // Depth-first traversal starting from a root box
        const traverse = (box) => {
          if (visited.has(box)) return;
          visited.add(box);
          orderedBoxes.push(box);
          
          const connected = getConnectedBoxes(box);
          for (const connectedBox of connected) {
            traverse(connectedBox);
          }
        };
        
        // Group boxes by priority
        const priorityGroups = new Map();
        for (const box of this.boxes) {
          const priority = this.getBoxColorPriority(box);
          if (!priorityGroups.has(priority)) {
            priorityGroups.set(priority, []);
          }
          priorityGroups.get(priority).push(box);
        }
        
        // Sort each priority group by position
        for (const [priority, boxes] of priorityGroups) {
          boxes.sort((a, b) => {
            const yDiff = a.y - b.y;
            if (Math.abs(yDiff) > 10) return yDiff;
            return a.x - b.x;
          });
        }
        
        // Process each priority group in order
        const sortedPriorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b);
        for (const priority of sortedPriorities) {
          const boxes = priorityGroups.get(priority);
          for (const box of boxes) {
            if (!visited.has(box)) {
              traverse(box);
            }
          }
        }
        
        return orderedBoxes;
      };
      
      const sortedBoxes = buildNavigationOrder();
      
      // Find current box in sorted list
      let currentIndex = -1;
      if (this.selectedBox) {
        currentIndex = sortedBoxes.indexOf(this.selectedBox);
      }
      
      // Calculate next box based on arrow key
      let nextIndex = -1;
      
      if (keyCode === UP_ARROW) {
        // Move to previous box
        if (currentIndex === -1) {
          nextIndex = sortedBoxes.length - 1;
        } else {
          nextIndex = (currentIndex - 1 + sortedBoxes.length) % sortedBoxes.length;
        }
      } else if (keyCode === DOWN_ARROW) {
        // Move to next box
        if (currentIndex === -1) {
          nextIndex = 0;
        } else {
          nextIndex = (currentIndex + 1) % sortedBoxes.length;
        }
      }
      
      // Select the next box
      if (nextIndex >= 0 && nextIndex < sortedBoxes.length) {
        this.selectAndPanToBox(sortedBoxes[nextIndex]);
      }
      
    } else if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) {
      // LEFT/RIGHT: Navigate between siblings (same hierarchy level)
      
      // Get all boxes at the same priority level as current
      const currentPriority = this.selectedBox ? this.getBoxColorPriority(this.selectedBox) : 999;
      
      // Get all boxes with same priority, sorted by position
      const samePriorityBoxes = this.boxes
        .filter(box => this.getBoxColorPriority(box) === currentPriority)
        .sort((a, b) => {
          const yDiff = a.y - b.y;
          if (Math.abs(yDiff) > 10) return yDiff;
          return a.x - b.x;
        });
      
      if (samePriorityBoxes.length === 0) return;
      
      // Find current box in same-priority list
      let currentIndex = -1;
      if (this.selectedBox) {
        currentIndex = samePriorityBoxes.indexOf(this.selectedBox);
      }
      
      // Calculate next box
      let nextIndex = -1;
      
      if (keyCode === LEFT_ARROW) {
        if (currentIndex === -1) {
          nextIndex = samePriorityBoxes.length - 1;
        } else {
          nextIndex = (currentIndex - 1 + samePriorityBoxes.length) % samePriorityBoxes.length;
        }
      } else if (keyCode === RIGHT_ARROW) {
        if (currentIndex === -1) {
          nextIndex = 0;
        } else {
          nextIndex = (currentIndex + 1) % samePriorityBoxes.length;
        }
      }
      
      // Select the next box
      if (nextIndex >= 0 && nextIndex < samePriorityBoxes.length) {
        this.selectAndPanToBox(samePriorityBoxes[nextIndex]);
      }
    }
  }
  
  /**
   * Selects a box and pans camera to it
   * @param {TextBox} box - The box to select
   */
  selectAndPanToBox(box) {
    if (!box) return;
    
    // Mark that we're navigating via arrow keys
    this.isArrowKeyNavigating = true;
    
    // Stop editing current box
    if (this.selectedBox && this.selectedBox.isEditing) {
      this.selectedBox.stopEditing();
    }
    
    // Clear all selections
    this.clearBoxSelection();
    if (this.selectedConnection) {
      this.selectedConnection.selected = false;
      this.selectedConnection = null;
    }
    if (this.clearConnectionSelection) {
      this.clearConnectionSelection();
    }
    
    // Select the new box
    this.selectedBox = box;
    this.addBoxToSelection(box);
    
    // Compute target zoom using the same fit logic as the '+' key (setMaxZoom)
    let targetZoom = null;
    try {
      if (typeof width !== 'undefined' && typeof height !== 'undefined' && box && box.width && box.height) {
        const margin = 1.1; // same margin used in setMaxZoom
        const widthWorld = Math.max(box.width, 1);
        const heightWorld = Math.max(box.height, 1);
        const fitZoomX = width / (widthWorld * margin);
        const fitZoomY = height / (heightWorld * margin);
        const candidate = Math.min(fitZoomX, fitZoomY);
        const maxZ = (typeof CONFIG !== 'undefined' && CONFIG.ZOOM && CONFIG.ZOOM.MAX) ? CONFIG.ZOOM.MAX : 3.0;
        targetZoom = Math.min(maxZ, candidate);
        if (!Number.isFinite(targetZoom) || targetZoom <= 0) targetZoom = null;
      }
    } catch (e) { targetZoom = null; }

    // Pan and zoom camera to show the selected box
    this.panToBox(box, true, targetZoom);
  }
  
  /**
   * Pans camera to center a box
   * @param {TextBox} box - The box to pan to
   * @param {boolean} animated - Whether to animate the pan (default: true)
   */
  panToBox(box, animated = true, targetZoom = null) {
    if (!box) return;
    
    if (animated) {
      // Start animated pan
      this.panTargetX = box.x;
      this.panTargetY = box.y;
      this.isPanAnimating = true;
      // Set zoom target (explicitly clear if null) and enable zoom animation if valid
      if (targetZoom != null && Number.isFinite(targetZoom)) {
        this.zoomTarget = targetZoom;
        this.isZoomAnimating = true;
      } else {
        this.zoomTarget = null;
        this.isZoomAnimating = false;
      }
    } else {
      // Instant pan
      if (typeof centerCameraOn === 'function') {
        if (targetZoom != null && Number.isFinite(targetZoom)) {
          zoom = constrain(targetZoom, (typeof CONFIG !== 'undefined' && CONFIG.ZOOM && CONFIG.ZOOM.MIN) ? CONFIG.ZOOM.MIN : 0.2,
                          (typeof CONFIG !== 'undefined' && CONFIG.ZOOM && CONFIG.ZOOM.MAX) ? CONFIG.ZOOM.MAX : 3.0);
        }
        centerCameraOn(box.x, box.y);
      }
    }
  }

  /**
   * Returns the top-most box under the current mouse position, if any
   * @returns {TextBox|null}
   */
  getTopMostBoxUnderMouse() {
    if (!this.boxes || this.boxes.length === 0) return null;
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const box = this.boxes[i];
      if (!box || typeof box.isMouseOver !== 'function') continue;
      try {
        if (box.isMouseOver()) {
          return box;
        }
      } catch (_) {}
    }
    return null;
  }

  /**
   * Initiates a connection from the provided box using the connector closest to the mouse
   * @param {TextBox} box - Source box to start the connection from
   */
  startConnectionFromBox(box) {
    if (!box || typeof box.getConnectorPoints !== 'function') return;

    // Default target to box center if mouse coordinates are unavailable
    const hasWorldMouse = typeof worldMouseX === 'function' && typeof worldMouseY === 'function';
    const mx = hasWorldMouse ? worldMouseX() : NaN;
    const my = hasWorldMouse ? worldMouseY() : NaN;
    const mouseXWorld = Number.isFinite(mx) ? mx : box.x;
    const mouseYWorld = Number.isFinite(my) ? my : box.y;

    const points = box.getConnectorPoints();
    if (!points || typeof points !== 'object') return;

    let nearestSide = null;
    let nearestDistSq = Infinity;
    for (const [side, point] of Object.entries(points)) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const dx = point.x - mouseXWorld;
      const dy = point.y - mouseYWorld;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearestSide = side;
      }
    }

    if (!nearestSide) {
      nearestSide = 'right';
    }

    this.isArrowKeyNavigating = false;
    this.connectingFrom = { box, side: nearestSide };
    this.connectingFromInitiatedByKeyboard = true;
  }

  /**
   * Completes the pending connection if a valid target is provided or under the mouse
   * @param {TextBox|null} targetBox - Optional target box to connect to
   * @returns {boolean} true if a connection was created
   */
  completeConnection(targetBox = null) {
    if (!this.connectingFrom || !this.connectingFrom.box) {
      this.connectingFrom = null;
      this.connectingFromInitiatedByKeyboard = false;
      return false;
    }

    const sourceBox = this.connectingFrom.box;
    let destination = targetBox;

    if (!destination) {
      if (this.boxes) {
        for (const box of this.boxes) {
          if (!box || box === sourceBox || typeof box.isMouseOver !== 'function') continue;
          try {
            if (box.isMouseOver()) {
              destination = box;
              break;
            }
          } catch (_) {}
        }
      }
    }

    let connected = false;
    if (destination && destination !== sourceBox) {
      this.addConnection(sourceBox, destination);
      connected = true;
    }

    this.connectingFrom = null;
    this.connectingFromInitiatedByKeyboard = false;
    return connected;
  }
  
  /**
   * Handles mouse press events
   * Includes improved validation using shared utilities
   */
  handleMousePressed() {
    // Clear arrow key navigation flag when mouse is used
    this.isArrowKeyNavigating = false;
    
    // Validate mouse coordinates using shared utility if available
    const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
    const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
    const validCoords = typeof Utils !== 'undefined' && Utils.areValidCoordinates
      ? Utils.areValidCoordinates(mx, my)
      : (mx != null && my != null && !isNaN(mx) && !isNaN(my));
    if (!validCoords) {
      return;
    }
    const shiftDown = keyIsDown(16); // SHIFT
    
    if (this.connectingFrom && this.connectingFromInitiatedByKeyboard) {
      const hoveredBox = this.getTopMostBoxUnderMouse();
      if (hoveredBox && hoveredBox !== this.connectingFrom.box) {
        this.completeConnection(hoveredBox);
      } else {
        this.connectingFrom = null;
        this.connectingFromInitiatedByKeyboard = false;
      }
      return;
    }

    // (connection deselection centralized in clearConnectionSelection())
    // Color circle clicks removed - colors are now changed via keyboard shortcuts (1, 2, 3)
    
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
    
    // PRIORITY: Arrowhead reattach comes before connector dots to avoid conflict when overlapping
    // Check if clicking on an existing connection's arrow head to reattach
    for (let i = this.connections.length - 1; i >= 0; i--) {
      const conn = this.connections[i];
      if (!conn || !conn.isMouseOverArrowHead || !conn.getArrowHeadPosition) continue;
      try {
        if (conn.isMouseOverArrowHead()) {
          // Begin dragging the arrow head to a new target
          this.draggingConnection = { conn, originalTo: conn.toBox };
          // Select this connection
          if (this.selectedConnection && this.selectedConnection !== conn) {
            this.selectedConnection.selected = false;
          }
          this.selectedConnection = conn;
          conn.selected = true;
          return;
        }
      } catch (_) {}
    }

    // Check if clicking on a connector dot at box edge center for connection
    for (let box of this.boxes) {
      const side = box.getConnectorUnderMouse();
      if (side) {
        this.connectingFrom = { box, side };
        this.connectingFromInitiatedByKeyboard = false;
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
          // Edge click: start drag. If multiple boxes are selected, drag all of them together.
          this.pushUndo();
          
          // If this box is already in selection and we have multiple selected, drag all
          const hasMultipleSelected = this.selectedBoxes && this.selectedBoxes.size > 1;
          const boxInSelection = this.selectedBoxes && this.selectedBoxes.has(box);
          
          if (!boxInSelection || shiftDown) {
            // Box not selected or shift held: update selection
            if (!shiftDown) {
              this.clearBoxSelection();
            }
            this.addBoxToSelection(box);
          }

          // Stop editing to avoid text interaction while dragging
          box.stopEditing();

          // Start drag for all selected boxes if we have multiple, otherwise just this one
          if (hasMultipleSelected && boxInSelection) {
            for (const b of this.selectedBoxes) {
              b.startDrag(mx, my);
            }
          } else if (this.selectedBoxes.size > 1) {
            // Box was just added to an existing multi-selection
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
        // Clear multi-selection of boxes
        this.clearBoxSelection();

        // Clear any previous connection multi-selection and select this connection
        if (this.clearConnectionSelection) this.clearConnectionSelection();
        if (this.addConnectionToSelection) this.addConnectionToSelection(conn);

        // Keep legacy single pointer as well
        this.selectedConnection = conn;
        conn.selected = true;
        return;
      }
    }
    
    // Clicked outside all boxes and connections -> clear all selections
    if (this.selectedBox) {
      this.selectedBox.stopEditing();
      this.selectedBox = null;
    }

    // Always clear box multi-selection when clicking the empty background
    this.clearBoxSelection();

    // Always clear connection multi-selection and single selected connection
    if (this.clearConnectionSelection) this.clearConnectionSelection();
  }
  
  /**
   * Handles mouse release events
   */
  handleMouseReleased() {
    // Complete reattachment if dragging an existing connection
    if (this.draggingConnection && this.draggingConnection.conn) {
      const { conn, originalTo } = this.draggingConnection;
      let droppedOn = null;
      for (let box of this.boxes) {
        if (!box) continue;
        if (box.isMouseOver && box.isMouseOver()) { droppedOn = box; break; }
      }

      let changed = false;
      if (droppedOn && conn.fromBox && droppedOn !== conn.fromBox) {
        // Avoid creating duplicates
        const duplicate = this.connections.some(c => c !== conn && c.fromBox === conn.fromBox && c.toBox === droppedOn);
        if (!duplicate) {
          if (droppedOn !== originalTo) {
            this.pushUndo();
            conn.toBox = droppedOn;
            changed = true;
          }
        }
      }

      // If not changed, keep original
      conn.toBox = changed ? conn.toBox : originalTo;
      this.draggingConnection = null;
      return;
    }

    // Complete connection if in connection mode
    if (this.connectingFrom) {
      this.completeConnection();
    }
    
    // Stop dragging and resizing all boxes
    for (let box of this.boxes) {
      if (!box) continue;
      box.stopDrag();
      box.stopResize();
      box.stopSelecting();
    }
  }
  
  /**
   * Handles mouse drag events
   */
  handleMouseDragged() {
    // Validate mouse coordinates
    const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
    const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
    if (mx == null || my == null || isNaN(mx) || isNaN(my)) {
      return;
    }
    // If any gesture is in progress (dragging/resizing/connecting), mark as unsaved continuously
    // This ensures autosave doesn’t flip to saved mid-gesture and miss later changes in the same gesture.
    try {
      let gestureActive = !!this.connectingFrom || !!this.draggingConnection;
      if (!gestureActive) {
        for (let b of this.boxes) {
          if (b && (b.isDragging || b.isResizing)) { gestureActive = true; break; }
        }
      }
      if (gestureActive) this.isSaved = false;
    } catch (_) {}

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
  
  /**
   * Handles key press events
   * @param {string} key - The key that was pressed
   * @param {number} keyCode - The key code
   * @param {boolean} isRepeat - Whether this is a repeated key press
   */
  handleKeyPressed(key, keyCode, isRepeat = false) {
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
        } else if (key === 'b' || key === 'B') {
          // Highlight selected text (toggle)
          try {
            if (this.selectedBox && typeof this.selectedBox.toggleHighlightOnSelection === 'function') {
              this.pushUndo();
              this.selectedBox.toggleHighlightOnSelection();
            }
          } catch (e) { console.error('Highlight toggle failed', e); }
          return;
        }
      }
      
      // Handle arrow keys for cursor movement within text
      if (keyCode === LEFT_ARROW) {
        this.selectedBox.moveCursorLeft();
      } else if (keyCode === RIGHT_ARROW) {
        this.selectedBox.moveCursorRight();
      } else if (keyCode === UP_ARROW) {
        this.selectedBox.moveCursorUp();
      } else if (keyCode === DOWN_ARROW) {
        this.selectedBox.moveCursorDown();
      } else if (keyCode === BACKSPACE) {
        if (!isRepeat) this.pushUndo();
        // Modifier variants for deletion
        if (keyIsDown(91) || keyIsDown(93)) { // CMD -> delete to start of line
          this.selectedBox.deleteToLineStart();
        } else if (keyIsDown(18) || keyIsDown(17)) { // ALT/OPTION or CTRL -> delete previous word
          this.selectedBox.deleteWordLeft();
        } else {
          this.selectedBox.removeChar();
        }
      } else if (keyCode === DELETE) {
        if (!isRepeat) this.pushUndo();
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
    } else if (keyCode === UP_ARROW || keyCode === DOWN_ARROW || keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) {
      // Arrow keys for box navigation when NOT editing text
      this.navigateBoxes(keyCode);
    } else if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17))) {
      // CMD/CTRL combinations when NOT editing text
      if (key === 'c' || key === 'C') {
        // Copy selected box(es)
        if (this.selectedBoxes && this.selectedBoxes.size > 0) {
          this.copiedBoxes = [];
          for (const box of this.selectedBoxes) {
            if (box) {
              this.copiedBoxes.push(box.toJSON());
            }
          }
        } else if (this.selectedBox) {
          this.copiedBoxes = [this.selectedBox.toJSON()];
        }
        return;
      } else if (key === 'v' || key === 'V') {
        // Paste copied box(es) at cursor position
        if (this.copiedBoxes && this.copiedBoxes.length > 0) {
          this.pushUndo();
          const mx = typeof worldMouseX === 'function' ? worldMouseX() : mouseX;
          const my = typeof worldMouseY === 'function' ? worldMouseY() : mouseY;
          
          // Calculate offset from first copied box to paste location
          const firstBox = this.copiedBoxes[0];
          const offsetX = mx - firstBox.x;
          const offsetY = my - firstBox.y;
          
          // Clear current selection
          this.clearBoxSelection();
          if (this.selectedBox) {
            this.selectedBox.stopEditing();
            this.selectedBox = null;
          }
          
          // Paste all copied boxes with offset
          for (const boxData of this.copiedBoxes) {
            const newBoxData = {
              ...boxData,
              x: boxData.x + offsetX,
              y: boxData.y + offsetY
            };
            const newBox = TextBox.fromJSON(newBoxData);
            if (newBox) {
              this.boxes.push(newBox);
              this.addBoxToSelection(newBox);
            }
          }
        }
        return;
      }
    } else if (key === 'c' || key === 'C') {
      const hasModifier = keyIsDown(16) || keyIsDown(18) || keyIsDown(91) || keyIsDown(93) || keyIsDown(17);
      if (!hasModifier) {
        let sourceBox = this.selectedBox;
        if (!sourceBox && this.selectedBoxes && this.selectedBoxes.size === 1) {
          sourceBox = this.selectedBoxes.values().next().value;
        }
        if (sourceBox && !sourceBox.isEditing) {
          if (this.connectingFrom && this.connectingFrom.box === sourceBox && this.connectingFromInitiatedByKeyboard) {
            this.connectingFrom = null;
            this.connectingFromInitiatedByKeyboard = false;
          } else {
            this.startConnectionFromBox(sourceBox);
          }
        }
      }
    } else if ((key === ' ' || keyCode === 32)) {
      // Space: reverse selected connection when not editing
      if (this.selectedConnection) {
        this.pushUndo();
        this.selectedConnection.reverse();
      }
      // Nothing else to do here; top-level caller prevents default
    } else if (keyCode === BACKSPACE || keyCode === DELETE) {
      // Delete selected boxes or connection(s)
      if (this.selectedBoxes && this.selectedBoxes.size > 0) {
        // Delete all selected boxes
        this.pushUndo();
        const boxesToDelete = Array.from(this.selectedBoxes);
        
        for (const box of boxesToDelete) {
          // Remove connections involving this box
          this.connections = this.connections.filter(conn => 
            conn.fromBox !== box && conn.toBox !== box
          );
          
          // Remove the box
          const index = this.boxes.indexOf(box);
          if (index > -1) {
            this.boxes.splice(index, 1);
          }
        }
        
        // Clear selection
        this.clearBoxSelection();
        if (this.selectedBox) {
          this.selectedBox = null;
        }
      } else if (this.selectedConnections && this.selectedConnections.size > 0) {
        // Delete all selected connections (multi-selection)
        this.pushUndo();
        this.connections = this.connections.filter(conn => !this.selectedConnections.has(conn));
        this.clearConnectionSelection();
        if (this.selectedConnection && !this.connections.includes(this.selectedConnection)) {
          this.selectedConnection = null;
        }
      } else if (this.selectedConnection) {
        // Delete selected connection only
        this.pushUndo();
        let index = this.connections.indexOf(this.selectedConnection);
        if (index > -1) {
          this.connections.splice(index, 1);
          this.selectedConnection = null;
        }
      }
    } else if (key === '1' || key === '2' || key === '3') {
      // Number keys to change selected box colors (when not editing)
      // 1 = red, 2 = orange, 3 = white
      const hasModifier = keyIsDown(91) || keyIsDown(93) || keyIsDown(17) || keyIsDown(18) || keyIsDown(16);
      if (!hasModifier) {
        if (this.selectedBoxes && this.selectedBoxes.size > 0) {
          this.pushUndo();
          const colorKey = key === '1' ? 'red' : (key === '2' ? 'orange' : 'white');
          for (const box of this.selectedBoxes) {
            if (box && typeof box.setBackgroundByKey === 'function') {
              box.setBackgroundByKey(colorKey);
            }
          }
        } else if (this.selectedBox && !this.selectedBox.isEditing) {
          this.pushUndo();
          const colorKey = key === '1' ? 'red' : (key === '2' ? 'orange' : 'white');
          if (typeof this.selectedBox.setBackgroundByKey === 'function') {
            this.selectedBox.setBackgroundByKey(colorKey);
          }
        }
      }
    }
  }

  /**
   * Serializes the mind map to JSON
   * @returns {Object} JSON representation of the mind map
   */
  toJSON() {
    return {
      boxes: this.boxes.map(box => box.toJSON()),
      connections: this.connections.map(conn => conn.toJSON(this.boxes))
    };
  }
  
  /**
   * Loads mind map from JSON data
   * Uses shared utilities for safe iteration when available
   * @param {Object} data - JSON data to load from
   */
  fromJSON(data) {
    // Validate input data
    if (!data || typeof data !== 'object') {
      console.error('Invalid data format');
      return;
    }
    
    // Clean up existing references to prevent memory leaks
    this.boxes = [];
    this.connections = [];
    this.selectedBox = null;
    this.selectedConnection = null;
    this.connectingFrom = null;
    if (this.selectedBoxes) {
      this.selectedBoxes.clear();
    }
    if (this.selectedConnections) {
      this.selectedConnections.clear();
    }
    
    // Load boxes with error handling
    // Use safe iteration utility if available
    if (Array.isArray(data.boxes)) {
      const loadBox = (boxData) => {
        if (!boxData) return;
        try {
          let box = TextBox.fromJSON(boxData);
          if (box) {
            this.boxes.push(box);
          }
        } catch (e) {
          console.error('Failed to load box:', e);
        }
      };
      
      if (typeof Utils !== 'undefined' && Utils.safeForEach) {
        Utils.safeForEach(data.boxes, loadBox);
      } else {
        for (let boxData of data.boxes) {
          loadBox(boxData);
        }
      }
    } else {
      console.warn('No boxes data found');
    }
    
    // Load connections with error handling
    if (Array.isArray(data.connections)) {
      const loadConnection = (connData) => {
        if (!connData) return;
        try {
          let conn = Connection.fromJSON(connData, this.boxes);
          if (conn && conn.fromBox && conn.toBox) {
            this.connections.push(conn);
          }
        } catch (e) {
          console.error('Failed to load connection:', e);
        }
      };
      
      if (typeof Utils !== 'undefined' && Utils.safeForEach) {
        Utils.safeForEach(data.connections, loadConnection);
      } else {
        for (let connData of data.connections) {
          loadConnection(connData);
        }
      }
    } else {
      console.warn('No connections data found');
    }
    
    this.isDirty = true;
  }
  
  /**
   * Gets the last used filename from localStorage
   * @returns {string} The last used filename or default
   */
  getLastUsedFilename() {
    try {
      const saved = localStorage.getItem('openmind_last_filename');
      return saved || 'openmind.json';
    } catch (e) {
      return 'openmind.json';
    }
  }

  /**
   * Saves the last used filename to localStorage
   * @param {string} filename - The filename to remember
   */
  setLastUsedFilename(filename) {
    try {
      if (filename && typeof filename === 'string') {
        localStorage.setItem('openmind_last_filename', filename);
      }
    } catch (e) {
      // Silently fail if localStorage is not available
    }
    try {
      if (typeof document !== 'undefined') {
        // Show just the basename (without path or .json) in the tab title,
        // appended with the app name as a suffix.
        let name = filename || '';
        name = name.split('/').pop().split('\\').pop();
        name = name.replace(/\.json$/i, '').trim();
        document.title = name ? (name + ' — OpenMind') : 'OpenMind';
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Saves the mind map to a JSON file
   * Uses File System Access API on supported browsers, falls back to download
   */
  async save() {
    const data = this.toJSON();
    const defaultFilename = this.getLastUsedFilename();
    
    try {
      // Use the File System Access API when available to let the user choose a location
      if (typeof window !== 'undefined' && window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: defaultFilename,
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
        
        // Remember the filename for next time
        this.setLastUsedFilename(handle.name);
      } else {
        // Fallback: regular download (browser chooses default Downloads location)
        saveJSON(data, defaultFilename);
        // Note: In fallback mode, we keep using the same filename since we can't detect what the user named it
      }
      // Mark as saved regardless of localStorage outcome; seed localStorage best-effort
      this.isSaved = true;
      try { this.saveToLocalStorage(); } catch (_) {}
    } catch (e) {
      // User may cancel the dialog; that's not an error
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return;
      console.error('Save failed:', e);
      try { alert('Save failed: ' + (e && e.message ? e.message : String(e))); } catch (_) {}
    }
  }
  
  /**
   * Loads mind map from external JSON data
   * @param {Object} data - The JSON data to load
   */
  async load(data) {
    // Before loading, attempt to convert any embedded data-URL images to downscaled WebP
    try {
      if (data && Array.isArray(data.boxes)) {
        for (let i = 0; i < data.boxes.length; i++) {
          const box = data.boxes[i];
          try {
            if (box && box.imageUrl && typeof box.imageUrl === 'string' && box.imageUrl.startsWith('data:image/')) {
              // Skip if already webp
              if (!box.imageUrl.startsWith('data:image/webp')) {
                if (typeof convertDataUrlToWebP === 'function') {
                  try {
                    // Perform conversion sequentially to avoid memory spikes
                    const converted = await convertDataUrlToWebP(box.imageUrl, { maxWidth: 1600, maxHeight: 1600, quality: 0.75 });
                    if (converted && typeof converted === 'string') {
                      box.imageUrl = converted;
                    }
                  } catch (e) {
                    console.warn('Failed to convert embedded image to WebP:', e);
                    // leave original imageUrl if conversion fails
                  }
                }
              }
            }
          } catch (e) {
            // per-box errors shouldn't abort loading
            console.warn('Error processing box image during load:', e);
          }
        }
      }
    } catch (e) {
      console.warn('Pre-load image conversion failed:', e);
    }

    this.fromJSON(data);
    // Seed autosave immediately after loading external data so the indicator shows saved
    try { this.saveToLocalStorage(); } catch (_) {}
    this.isSaved = true;
  }

  // ============================================================================
  // BOX SELECTION HELPERS
  // ============================================================================
  
  /**
   * Clears all box selections
   */
  clearBoxSelection() {
    if (!this.selectedBoxes) this.selectedBoxes = new Set();
    for (const b of this.selectedBoxes) {
      if (b) b.selected = false;
    }
    this.selectedBoxes.clear();
  }

  /**
   * Adds a box to the current selection
   * @param {TextBox} box - The box to add to selection
   */
  addBoxToSelection(box) {
    if (!box) return;
    if (!this.selectedBoxes) this.selectedBoxes = new Set();
    this.selectedBoxes.add(box);
    box.selected = true;
  }

  /**
   * Removes a box from the current selection
   * @param {TextBox} box - The box to remove from selection
   */
  removeBoxFromSelection(box) {
    if (!box || !this.selectedBoxes) return;
    if (this.selectedBoxes.has(box)) this.selectedBoxes.delete(box);
    box.selected = false;
  }

  /**
   * Toggles a box's selection state
   * @param {TextBox} box - The box to toggle
   */
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

  // ============================================================================
  // CONNECTION SELECTION HELPERS
  // ============================================================================
  
  /**
   * Clears all connection selections
   */
  clearConnectionSelection() {
    if (!this.selectedConnections) this.selectedConnections = new Set();
    for (const c of this.selectedConnections) {
      if (c) c.selected = false;
    }
    this.selectedConnections.clear();

    // Also clear the single selectedConnection pointer if present
    if (this.selectedConnection) {
      try { this.selectedConnection.selected = false; } catch (_) {}
      this.selectedConnection = null;
    }
  }

  /**
   * Adds a connection to the current selection
   * @param {Connection} conn - The connection to add
   */
  addConnectionToSelection(conn) {
    if (!conn) return;
    if (!this.selectedConnections) this.selectedConnections = new Set();
    this.selectedConnections.add(conn);
    conn.selected = true;
  }

  /**
   * Removes a connection from the current selection
   * @param {Connection} conn - The connection to remove
   */
  removeConnectionFromSelection(conn) {
    if (!conn || !this.selectedConnections) return;
    if (this.selectedConnections.has(conn)) this.selectedConnections.delete(conn);
    conn.selected = false;
  }

  /**
   * Toggles a connection's selection state
   * @param {Connection} conn - The connection to toggle
   */
  toggleConnectionSelection(conn) {
    if (!conn) return;
    if (!this.selectedConnections) this.selectedConnections = new Set();
    if (this.selectedConnections.has(conn)) {
      this.removeConnectionFromSelection(conn);
    } else {
      this.addConnectionToSelection(conn);
    }
  }

  // ============================================================================
  // LOCAL STORAGE / AUTOSAVE
  // ============================================================================
  
  /**
   * Saves current state to localStorage
   * @returns {boolean} true if successful
   */
  saveToLocalStorage() {
    try {
      const data = this.toJSON();
      const jsonString = JSON.stringify(data);
      
      // Check localStorage availability and quota
      if (typeof localStorage === 'undefined') {
        console.warn('localStorage is not available');
        return false;
      }
      
      localStorage.setItem('openmind_autosave', jsonString);
      this.isSaved = true;
      return true;
    } catch (e) {
      // Handle quota exceeded errors specifically
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.error('localStorage quota exceeded. Unable to autosave. Consider exporting your work.');
        // Try to show user-friendly error
        if (typeof alert !== 'undefined') {
          alert('Storage quota exceeded. Please export your mind map to save your work.');
        }
      } else {
        console.error('Failed to autosave to localStorage:', e);
      }
      return false;
    }
  }

  /**
   * Loads state from localStorage
   * @returns {boolean} true if successful
   */
  loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem('openmind_autosave');
      if (saved) {
        const data = JSON.parse(saved);
        // fromJSON handles validation internally
        this.fromJSON(data);
        // Only mark as saved if we successfully loaded data
        this.isSaved = true;
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to load from localStorage:', e);
      // Don't mark as saved if loading failed
      this.isSaved = false;
      return false;
    }
  }

  /**
   * Checks if there's a saved state in localStorage
   * @returns {boolean} true if autosave data exists
   */
  hasLocalStorageData() {
    try {
      return localStorage.getItem('openmind_autosave') !== null;
    } catch (e) {
      return false;
    }
  }
}
