/**
 * MindMap class - Core data structure and interaction manager for the mind map.
 *
 * This class is the central controller for mind map data, managing all boxes,
 * connections, selection states, and user interactions.
 *
 * Key Features:
 * - Box and connection management (add, delete, modify)
 * - Multi-selection support for batch operations
 * - Alignment algorithms (left, right, top, bottom, center, distribute)
 * - Hierarchical layout for automatic graph organization
 * - Keyboard navigation with arrow keys (depth-first traversal)
 * - Copy/paste with connection preservation
 * - Animated camera panning to focused elements
 * - Real-time collaboration callbacks for Yjs sync
 * - Save/load functionality with JSON serialization
 *
 * Architecture:
 * - Contains arrays of TextBox and Connection objects
 * - Provides high-level operations that coordinate box/connection changes
 * - Integrates with CollaborationManager via static callbacks
 * - Uses Utils for geometry calculations and validation
 *
 * Dependencies:
 * - TextBox class for individual nodes
 * - Connection class for arrows between nodes
 * - Utils for shared geometry, validation, and logging utilities
 * - p5.js for drawing operations (via draw() method)
 *
 * Navigation Priority System (for arrow-key navigation):
 * - Red boxes (priority 1): Highest priority, visited first
 * - Orange boxes (priority 2): Medium priority
 * - White/other boxes (priority 999): Lowest priority
 */
class MindMap {
  // ============================================================================
  // STATIC CONSTANTS
  // ============================================================================

  // Alignment tolerance: boxes within this pixel distance are snapped together
  static ALIGN_TOLERANCE = 12;

  // Layout constants for hierarchical/automatic arrangement
  static LAYOUT = {
    HORIZONTAL_SPACING: 200,  // Pixels between boxes horizontally
    VERTICAL_SPACING: 120,    // Pixels between boxes vertically
    START_X: 100,             // Initial X position for layout
    START_Y: 100              // Initial Y position for layout
  };

  // Color constants for connection preview lines
  static COLORS = {
    CONNECTING_LINE: { r: 100, g: 100, b: 255 },  // Blue line when creating connection
    CONNECTOR_DOT: { r: 100, g: 150, b: 255 }     // Blue dot at connection endpoints
  };

  // Stroke weight for connection preview (in pixels)
  static STROKE_WEIGHT_PREVIEW = 2;

  // ============================================================================
  // COLLABORATION CALLBACKS
  // ============================================================================
  // These callbacks are set by CollaborationManager to sync changes to Yjs

  /** @type {function(TextBox):void|null} Called when a box is added or modified */
  static onBoxChange = null;

  /** @type {function(string):void|null} Called when a box is deleted (receives box ID) */
  static onBoxDelete = null;

  /** @type {function():void|null} Called when connections change */
  static onConnectionsChange = null;

  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================

  /**
   * Initializes a new MindMap with default state
   */
  constructor() {
    this.boxes = [];
    this.connections = [];

    // Default storage key for autosave
    this.storageKey = 'openmind_autosave';

    this.selectedBox = null;
    this.selectedConnection = null;
    this.connectingFrom = null;
    this.connectingFromInitiatedByKeyboard = false;
    this.draggingConnection = null; // { conn, originalTo }

    // Multi-selection of boxes
    this.selectedBoxes = new Set();
    // Multi-selection of connections
    this.selectedConnections = new Set();

    // Clipboard for copying/pasting boxes and their connections
    this.copiedBoxes = [];
    this.copiedConnections = [];

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

  // ============================================================================
  // BASIC BOX & CONNECTION MANAGEMENT
  // ============================================================================

  /**
   * Adds a new box to the mind map
   * @param {TextBox} box - The box to add
   */
  addBox(box) {
    this.pushUndo();
    
    // Wrap in transaction for proper undo tracking
    this._wrapInTransaction(() => {
      this.boxes.push(box);
      this.isDirty = true;

      // Notify collaboration system
      // Pass skipTransactionWrapper=true since we're already in a transaction
      if (MindMap.onBoxChange && box) {
        MindMap.onBoxChange(box, true);
      }
    });
  }

  /**
   * Finds a box by its unique ID
   * @param {string} id - The box ID to search for
   * @returns {TextBox|null} The box with the given ID, or null if not found
   */
  getBoxById(id) {
    if (!id || typeof id !== 'string') return null;
    return this.boxes.find(box => box && box.id === id) || null;
  }

  /**
   * Adds a connection between two boxes
   * @param {TextBox} fromBox - Source box
   * @param {TextBox} toBox - Target box
   */
  addConnection(fromBox, toBox) {
    // Validate inputs
    if (!fromBox || !toBox) {
      Utils.Logger.error('[MindMap] addConnection: Invalid boxes');
      return;
    }

    // Prevent self-connections
    if (fromBox === toBox) {
      Utils.Logger.error('[MindMap] addConnection: Cannot create self-connection');
      return;
    }

    // Check if connection already exists (same direction)
    for (let conn of this.connections) {
      if (conn.fromBox === fromBox && conn.toBox === toBox) {
        Utils.Logger.error('[MindMap] addConnection: Connection already exists');
        return;
      }
    }

    this.pushUndo();
    
    // Wrap in transaction for proper undo tracking
    this._wrapInTransaction(() => {
      this.connections.push(new Connection(fromBox, toBox));
      this.isDirty = true;

      // Notify collaboration system
      // Pass skipTransactionWrapper=true since we're already in a transaction
      if (MindMap.onConnectionsChange) {
        MindMap.onConnectionsChange(true);
      }
    });
  }

  /**
   * DEPRECATED: Pushes current state to undo stack.
   * This is now a no-op. Undo is handled by Yjs UndoManager via CollaborationManager.
   * Kept for backwards compatibility with existing code that calls pushUndo().
   */
  pushUndo() {
    // No-op: Yjs UndoManager tracks changes automatically
    // Mark as unsaved since we're about to make a change
    this.isSaved = false;
  }

  /**
   * DEPRECATED: Use collaborationManager.undo() instead.
   * This method is kept for backwards compatibility but should not be called.
   */
  undo() {
    console.warn('MindMap.undo() is deprecated. Use collaborationManager.undo() instead.');
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

  // ============================================================================
  // ANIMATION & RENDERING
  // ============================================================================

  /**
   * Updates animation states (call this every frame)
   */
  update() {
    // 1. Update all boxes (coordinates, animations, interpolation)
    // This must happen every frame even for off-screen boxes to ensure sync
    if (this.boxes) {
      for (let i = 0; i < this.boxes.length; i++) {
        const box = this.boxes[i];
        if (box && typeof box.update === 'function') {
          box.update();
        }
      }
    }

    // 2. Handle camera animations (pan/zoom)
    if ((this.isPanAnimating || this.isZoomAnimating) && typeof CameraUtils !== 'undefined') {
      const widthVal = typeof width !== 'undefined' ? width : 800;
      const heightVal = typeof height !== 'undefined' ? height : 600;

      // Get current camera position in world space
      const currentWorldX = (widthVal / 2 - CameraUtils.x) / CameraUtils.zoom;
      const currentWorldY = (heightVal / 2 - CameraUtils.y) / CameraUtils.zoom;

      // Determine pan interpolation
      const dx = this.panTargetX - currentWorldX;
      const dy = this.panTargetY - currentWorldY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Determine zoom interpolation
      const currentZoom = CameraUtils.zoom;
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
        CameraUtils.zoom = constrain(newZoom, (typeof CONFIG !== 'undefined' && CONFIG.ZOOM && CONFIG.ZOOM.MIN) ? CONFIG.ZOOM.MIN : 0.2,
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
      if (typeof centerCameraOn === 'function') {
        centerCameraOn(newWorldX, newWorldY);
      } else {
        CameraUtils.centerOn(newWorldX, newWorldY, widthVal, heightVal);
      }

      // Update animation flags
      if (this.isPanAnimating && distance < 1) this.isPanAnimating = false;
      if (this.isZoomAnimating && Math.abs(targetZoom - CameraUtils.zoom) < 0.001) this.isZoomAnimating = false;
    }
  }

  /**
   * Draws the mind map (connections and boxes)
   */
  draw() {
    // Update animations
    this.update();

    // Get viewport dimensions for culling
    const viewportWidth = typeof width !== 'undefined' ? width : 800;
    const viewportHeight = typeof height !== 'undefined' ? height : 600;
    const useCulling = typeof CameraUtils !== 'undefined' && CameraUtils.isBoxVisible;

    // Cache viewport bounds once per frame to avoid redundant coordinate transformations
    let viewportBounds = null;
    const isBoxVisibleFast = (box) => {
      if (!box || box.x == null || box.y == null || box.width == null || box.height == null) {
        return false;
      }
      const boxLeft = box.x - box.width / 2;
      const boxRight = box.x + box.width / 2;
      const boxTop = box.y - box.height / 2;
      const boxBottom = box.y + box.height / 2;
      return !(boxRight < viewportBounds.worldLeft ||
        boxLeft > viewportBounds.worldRight ||
        boxBottom < viewportBounds.worldTop ||
        boxTop > viewportBounds.worldBottom);
    };

    if (useCulling) {
      const margin = 200;
      viewportBounds = {
        worldLeft: CameraUtils.worldX(0) - margin,
        worldRight: CameraUtils.worldX(viewportWidth) + margin,
        worldTop: CameraUtils.worldY(0) - margin,
        worldBottom: CameraUtils.worldY(viewportHeight) + margin
      };
    }

    // Draw existing connections (skip the one being reattached)
    if (this.connections) {
      for (let conn of this.connections) {
        if (!conn) continue;
        if (this.draggingConnection && this.draggingConnection.conn === conn) continue;

        // Skip off-screen connections for better performance
        if (useCulling && viewportBounds) {
          const fromVisible = isBoxVisibleFast(conn.fromBox);
          const toVisible = isBoxVisibleFast(conn.toBox);
          if (!fromVisible && !toVisible) {
            continue;
          }
        }

        try { conn.draw(); } catch (e) { console.error('Error drawing connection:', e); }
      }
    }

    // Draw boxes
    if (this.boxes) {
      for (let box of this.boxes) {
        if (!box) continue;

        // Skip off-screen boxes for better performance
        // Check cheap conditions first (selected, editing) before expensive visibility check
        // Always draw selected boxes and boxes being edited
        if (!box.selected &&
          !box.isEditing &&
          useCulling &&
          viewportBounds &&
          !isBoxVisibleFast(box)) {
          continue;
        }

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

        // Skip off-screen boxes for connector dots
        if (useCulling && viewportBounds && !isBoxVisibleFast(box)) {
          continue;
        }

        const active = this.connectingFrom && this.connectingFrom.box === box;
        // During arrow-key navigation (presentation), don't show hover-triggered connectors
        if ((!this.isArrowKeyNavigating && box.isMouseOver()) || active) {
          try { box.drawConnectors(!!active); } catch (e) { }
        }
      }
    }

    // Draw live connecting line and dots if connecting
    if (this.connectingFrom && typeof worldMouseX === 'function' && typeof worldMouseY === 'function') {
      const { box, side } = this.connectingFrom;
      const start = box.getConnectorCenter(side);
      if (start && !isNaN(start.x) && !isNaN(start.y)) {
        const lineColor = MindMap.COLORS.CONNECTING_LINE;
        const dotColor = MindMap.COLORS.CONNECTOR_DOT;
        push();
        stroke(lineColor.r, lineColor.g, lineColor.b);
        strokeWeight(MindMap.STROKE_WEIGHT_PREVIEW);
        line(start.x, start.y, worldMouseX(), worldMouseY());
        noStroke();
        fill(dotColor.r, dotColor.g, dotColor.b);
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
        const lineColor = MindMap.COLORS.CONNECTING_LINE;
        const dotColor = MindMap.COLORS.CONNECTOR_DOT;
        push();
        stroke(lineColor.r, lineColor.g, lineColor.b);
        strokeWeight(MindMap.STROKE_WEIGHT_PREVIEW);
        line(from.x, from.y, mx, my);
        // Arrow head at mouse
        const angle = atan2(my - from.y, mx - from.x);
        fill(dotColor.r, dotColor.g, dotColor.b);
        noStroke();
        push();
        translate(mx, my);
        rotate(angle);
        const size = (conn.arrowSize || 10);
        triangle(0, 0, -size, -size / 2, -size, size / 2);
        pop();
        pop();
      }
    }
  }

  // ============================================================================
  // ALIGNMENT ALGORITHMS
  // ============================================================================

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
        const box = this.boxes[it.i];
        box.x = avg;
        box.targetX = avg; // Sync target to prevent rubber-banding
      }
    }

    // Y alignment
    const yVals = this.boxes.map((b, i) => ({ v: b.y, i }));
    const yClusters = clusterValues(yVals);
    for (const cluster of yClusters) {
      if (cluster.length < 2) continue;
      const avg = cluster.reduce((s, it) => s + it.v, 0) / cluster.length;
      for (const it of cluster) {
        const box = this.boxes[it.i];
        box.y = avg;
        box.targetY = avg; // Sync target to prevent rubber-banding
      }
    }
  }

  /**
   * Left-aligns all selected boxes to the leftmost box's left edge.
   * Requires at least two selected boxes.
   */
  leftAlignSelectedBoxes() {
    const boxesToAlign = this._getSelectedBoxes();
    if (boxesToAlign.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performLeftAlign(boxesToAlign);
    });
    return true;
  }

  /**
   * Internal implementation of left alignment
   * @private
   */
  _performLeftAlign(boxesToAlign) {
    // Find the leftmost left edge (box.x - box.width/2)
    let minLeftEdge = Infinity;
    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.x) || !Utils.isValidNumber(box.width)) continue;
      const leftEdge = box.x - box.width / 2;
      if (leftEdge < minLeftEdge) {
        minLeftEdge = leftEdge;
      }
    }

    if (!Number.isFinite(minLeftEdge)) return false;

    // Align all boxes so their left edge matches the minimum left edge
    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.x) || !Utils.isValidNumber(box.width)) continue;
      // New center x = minLeftEdge + width/2
      box.x = minLeftEdge + box.width / 2;
      box.targetX = box.x; // Sync target to prevent rubber-banding
    }

    this.isDirty = true;
    this.isSaved = false;
    this._notifyBoxesChanged(boxesToAlign, true);
  }

  /**
   * Right-aligns all selected boxes to the rightmost box's right edge.
   * Requires at least two selected boxes.
   */
  rightAlignSelectedBoxes() {
    const boxesToAlign = this._getSelectedBoxes();
    if (boxesToAlign.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performRightAlign(boxesToAlign);
    });
    return true;
  }

  /**
   * Internal implementation of right alignment
   * @private
   */
  _performRightAlign(boxesToAlign) {
    let maxRightEdge = -Infinity;
    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.x) || !Utils.isValidNumber(box.width)) continue;
      const rightEdge = box.x + box.width / 2;
      if (rightEdge > maxRightEdge) {
        maxRightEdge = rightEdge;
      }
    }

    if (!Number.isFinite(maxRightEdge)) return false;

    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.x) || !Utils.isValidNumber(box.width)) continue;
      box.x = maxRightEdge - box.width / 2;
      box.targetX = box.x; // Sync target to prevent rubber-banding
    }

    this.isDirty = true;
    this.isSaved = false;
    this._notifyBoxesChanged(boxesToAlign, true);
  }

  /**
   * Top-aligns all selected boxes to the highest box's top edge.
   * Requires at least two selected boxes.
   */
  topAlignSelectedBoxes() {
    const boxesToAlign = this._getSelectedBoxes();
    if (boxesToAlign.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performTopAlign(boxesToAlign);
    });
    return true;
  }

  /**
   * Internal implementation of top alignment
   * @private
   */
  _performTopAlign(boxesToAlign) {
    let minTopEdge = Infinity;
    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.y) || !Utils.isValidNumber(box.height)) continue;
      const topEdge = box.y - box.height / 2;
      if (topEdge < minTopEdge) {
        minTopEdge = topEdge;
      }
    }

    if (!Number.isFinite(minTopEdge)) return false;

    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.y) || !Utils.isValidNumber(box.height)) continue;
      box.y = minTopEdge + box.height / 2;
      box.targetY = box.y; // Sync target to prevent rubber-banding
    }

    this.isDirty = true;
    this.isSaved = false;
    this._notifyBoxesChanged(boxesToAlign, true);
  }

  /**
   * Bottom-aligns all selected boxes to the lowest box's bottom edge.
   * Requires at least two selected boxes.
   */
  bottomAlignSelectedBoxes() {
    const boxesToAlign = this._getSelectedBoxes();
    if (boxesToAlign.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performBottomAlign(boxesToAlign);
    });
    return true;
  }

  /**
   * Internal implementation of bottom alignment
   * @private
   */
  _performBottomAlign(boxesToAlign) {
    let maxBottomEdge = -Infinity;
    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.y) || !Utils.isValidNumber(box.height)) continue;
      const bottomEdge = box.y + box.height / 2;
      if (bottomEdge > maxBottomEdge) {
        maxBottomEdge = bottomEdge;
      }
    }

    if (!Number.isFinite(maxBottomEdge)) return false;

    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.y) || !Utils.isValidNumber(box.height)) continue;
      box.y = maxBottomEdge - box.height / 2;
      box.targetY = box.y; // Sync target to prevent rubber-banding
    }

    this.isDirty = true;
    this.isSaved = false;
    this._notifyBoxesChanged(boxesToAlign, true);
  }

  /**
   * Center-aligns selected boxes horizontally.
   * Calculates the average X position of selected boxes and moves them all to that center.
   * If no boxes are selected, does nothing.
   */
  centerAlignSelectedBoxes() {
    const boxesToAlign = this._getSelectedBoxes();
    if (boxesToAlign.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performCenterAlign(boxesToAlign);
    });
    return true;
  }

  /**
   * Internal implementation of center alignment
   * @private
   */
  _performCenterAlign(boxesToAlign) {
    // Calculate the average X position (center) of all selected boxes
    let sumX = 0;
    let validCount = 0;
    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.x)) continue;
      sumX += box.x;
      validCount++;
    }

    if (validCount < 2) return false;

    const centerX = sumX / validCount;

    if (!Number.isFinite(centerX)) return false;

    // Move all selected boxes to the calculated center X
    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.x)) continue;
      box.x = centerX;
      box.targetX = centerX; // Sync target to prevent rubber-banding
    }

    this.isDirty = true;
    this.isSaved = false;
    this._notifyBoxesChanged(boxesToAlign, true);
  }

  /**
   * Horizontally aligns selected boxes to a shared center Y coordinate.
   * Requires at least two selected boxes.
   */
  horizontalCenterAlignSelectedBoxes() {
    const boxesToAlign = this._getSelectedBoxes();
    if (boxesToAlign.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performHorizontalCenterAlign(boxesToAlign);
    });
    return true;
  }

  /**
   * Internal implementation of horizontal center alignment
   * @private
   */
  _performHorizontalCenterAlign(boxesToAlign) {
    let sumY = 0;
    let validCount = 0;
    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.y)) continue;
      sumY += box.y;
      validCount++;
    }

    if (validCount < 2) return false;

    const centerY = sumY / validCount;
    if (!Number.isFinite(centerY)) return false;

    for (const box of boxesToAlign) {
      if (!box || !Utils.isValidNumber(box.y)) continue;
      box.y = centerY;
      box.targetY = centerY; // Sync target to prevent rubber-banding
    }

    this.isDirty = true;
    this.isSaved = false;
    this._notifyBoxesChanged(boxesToAlign, true);
  }

  /**
   * Distributes selected boxes vertically (equal spacing between box edges).
   * Preserves the top edge of the top-most box and the bottom edge of the bottom-most box.
   * Requires at least three selected boxes.
   */
  distributeSelectedBoxesVertically() {
    const boxes = this._getSelectedBoxes();
    if (boxes.length < 3) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performVerticalDistribute(boxes);
    });
    return true;
  }

  /**
   * Internal implementation of vertical distribution
   * @private
   */
  _performVerticalDistribute(boxes) {
    // Sort by Y position
    boxes.sort((a, b) => a.y - b.y);

    // Calculate boundaries based on edges
    const firstBox = boxes[0];
    const lastBox = boxes[boxes.length - 1];

    if (!Utils.isValidNumber(firstBox.y) || !Utils.isValidNumber(firstBox.height) ||
      !Utils.isValidNumber(lastBox.y) || !Utils.isValidNumber(lastBox.height)) {
      return false;
    }

    const topEdge = firstBox.y - firstBox.height / 2;
    const bottomEdge = lastBox.y + lastBox.height / 2;
    const totalAvailableSpace = bottomEdge - topEdge;

    // Calculate total height of all boxes
    let totalBoxHeight = 0;
    for (const box of boxes) {
      if (!Utils.isValidNumber(box.height)) return false;
      totalBoxHeight += box.height;
    }

    // Calculate gap
    const totalGap = totalAvailableSpace - totalBoxHeight;
    const gap = totalGap / (boxes.length - 1);

    // Reposition boxes
    let currentTop = topEdge;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      // Set new center Y
      box.y = currentTop + box.height / 2;
      box.targetY = box.y; // Sync target to prevent rubber-banding
      // Advance currentTop for next box
      currentTop += box.height + gap;
    }

    this.isDirty = true;
    this.isSaved = false;
    this._notifyBoxesChanged(boxes, true);
  }

  /**
   * Distributes selected boxes horizontally (equal spacing between box edges).
   * Preserves the left edge of the left-most box and the right edge of the right-most box.
   * Requires at least three selected boxes.
   */
  distributeSelectedBoxesHorizontally() {
    const boxes = this._getSelectedBoxes();
    if (boxes.length < 3) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performHorizontalDistribute(boxes);
    });
    return true;
  }

  /**
   * Internal implementation of horizontal distribution
   * @private
   */
  _performHorizontalDistribute(boxes) {
    // Sort by X position
    boxes.sort((a, b) => a.x - b.x);

    // Calculate boundaries based on edges
    const firstBox = boxes[0];
    const lastBox = boxes[boxes.length - 1];

    if (!Utils.isValidNumber(firstBox.x) || !Utils.isValidNumber(firstBox.width) ||
      !Utils.isValidNumber(lastBox.x) || !Utils.isValidNumber(lastBox.width)) {
      return false;
    }

    const leftEdge = firstBox.x - firstBox.width / 2;
    const rightEdge = lastBox.x + lastBox.width / 2;
    const totalAvailableSpace = rightEdge - leftEdge;

    // Calculate total width of all boxes
    let totalBoxWidth = 0;
    for (const box of boxes) {
      if (!Utils.isValidNumber(box.width)) return false;
      totalBoxWidth += box.width;
    }

    // Calculate gap
    const totalGap = totalAvailableSpace - totalBoxWidth;
    const gap = totalGap / (boxes.length - 1);

    // Reposition boxes
    let currentLeft = leftEdge;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      // Set new center X
      box.x = currentLeft + box.width / 2;
      box.targetX = box.x; // Sync target to prevent rubber-banding
      // Advance currentLeft for next box
      currentLeft += box.width + gap;
    }

    this.isDirty = true;
    this.isSaved = false;
    this._notifyBoxesChanged(boxes, true);
  }

  /**
  * Arranges selected boxes in a hierarchical layout based on connections.
  * Uses a tree/graph layout algorithm to create a structured network diagram.
  * Root nodes (nodes with no incoming connections) are placed at the top and the layout is re-centered to keep the group in place.
   */
  hierarchicalLayout() {
    // Determine which boxes to layout (selection only; otherwise do nothing)
    const boxesToLayout = this._getSelectedBoxes();
    if (boxesToLayout.length < 1) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performHierarchicalLayout(boxesToLayout);
    });
    return true;
  }

  /**
   * Internal implementation of hierarchical layout
   * @private
   */
  _performHierarchicalLayout(boxesToLayout) {
    const getBounds = (boxes) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const box of boxes) {
        if (!box) continue;
        const halfW = Utils.isValidNumber(box.width) ? box.width / 2 : 0;
        const halfH = Utils.isValidNumber(box.height) ? box.height / 2 : 0;
        const left = Utils.isValidNumber(box.x) ? box.x - halfW : null;
        const right = Utils.isValidNumber(box.x) ? box.x + halfW : null;
        const top = Utils.isValidNumber(box.y) ? box.y - halfH : null;
        const bottom = Utils.isValidNumber(box.y) ? box.y + halfH : null;
        if (left !== null) minX = Math.min(minX, left);
        if (right !== null) maxX = Math.max(maxX, right);
        if (top !== null) minY = Math.min(minY, top);
        if (bottom !== null) maxY = Math.max(maxY, bottom);
      }
      if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        return null;
      }
      return {
        minX,
        maxX,
        minY,
        maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
      };
    };

    const preBounds = getBounds(boxesToLayout);

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

    // Layout configuration using class constants
    const HORIZONTAL_SPACING = MindMap.LAYOUT.HORIZONTAL_SPACING;
    const VERTICAL_SPACING = MindMap.LAYOUT.VERTICAL_SPACING;
    const START_X = MindMap.LAYOUT.START_X;
    const START_Y = MindMap.LAYOUT.START_Y;

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
        box.targetX = box.x; // Sync target to prevent rubber-banding
        box.targetY = box.y;
        x += boxWidth + HORIZONTAL_SPACING;
      }
    }

    // After layout, shift group so its center matches the original (in-place layout)
    const postBounds = getBounds(boxesToLayout);
    if (preBounds && postBounds) {
      const dx = preBounds.centerX - postBounds.centerX;
      const dy = preBounds.centerY - postBounds.centerY;
      if (Number.isFinite(dx) && Number.isFinite(dy)) {
        for (const box of boxesToLayout) {
          if (!box || !Utils.isValidNumber(box.x) || !Utils.isValidNumber(box.y)) continue;
          box.x += dx;
          box.y += dy;
          box.targetX = box.x; // Sync target to prevent rubber-banding
          box.targetY = box.y;
        }
      }
    }

    this.isDirty = true;
    this.isSaved = false;
    this._notifyBoxesChanged(boxesToLayout, true);
  }

  /**
   * Returns selected boxes as an array, filtered for null/undefined.
   */
  _getSelectedBoxes() {
    if (!this.selectedBoxes || this.selectedBoxes.size === 0) {
      return [];
    }
    return Array.from(this.selectedBoxes).filter(b => b !== null && b !== undefined);
  }

  /**
   * Wraps an operation in a Yjs transaction for action-based undo.
   * Falls back to direct execution if collaborationManager is not available.
   * @param {Function} operation - The operation to execute
   * @private
   */
  _wrapInTransaction(operation) {
    if (typeof collaborationManager !== 'undefined' && collaborationManager) {
      collaborationManager.transact(operation);
    } else {
      operation();
    }
  }

  /**
   * Internal implementation of paste operation
   * @private
   */
  _performPaste(offsetX, offsetY) {
    // Paste all copied boxes with offset and track new boxes
    const newBoxes = [];
    for (const boxData of this.copiedBoxes) {
      // Destructure to exclude id - pasted boxes must get new unique IDs
      const { id: _excludedId, ...boxDataWithoutId } = boxData;
      const newBoxData = {
        ...boxDataWithoutId,
        x: boxData.x + offsetX,
        y: boxData.y + offsetY
      };
      const newBox = TextBox.fromJSON(newBoxData);
      if (newBox) {
        this.boxes.push(newBox);
        this.addBoxToSelection(newBox);
        newBoxes.push(newBox);
      }
    }

    // Recreate connections between the pasted boxes
    if (this.copiedConnections && this.copiedConnections.length > 0) {
      for (const connData of this.copiedConnections) {
        const fromBox = newBoxes[connData.from];
        const toBox = newBoxes[connData.to];
        if (fromBox && toBox) {
          this.connections.push(new Connection(fromBox, toBox));
        }
      }
    }

    this.isDirty = true;

    // Sync pasted boxes and connections to collaboration
    for (const box of newBoxes) {
      if (MindMap.onBoxChange) {
        MindMap.onBoxChange(box);
      }
    }
    if (newBoxes.length > 0 || (this.copiedConnections && this.copiedConnections.length > 0)) {
      if (MindMap.onConnectionsChange) {
        MindMap.onConnectionsChange();
      }
    }
  }

  /**
   * Internal implementation of box deletion
   * @private
   */
  _performBoxDeletion(boxesToDelete) {
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

      // Notify collaboration system of deletion
      if (MindMap.onBoxDelete && box.id) {
        MindMap.onBoxDelete(box.id);
      }
    }

    // Notify collaboration system of connection changes
    if (MindMap.onConnectionsChange) {
      MindMap.onConnectionsChange();
    }
  }

  /**
   * Notifies the collaboration system that boxes have changed.
   * Call this after batch operations like alignment/distribution.
   * @param {TextBox[]} boxes - Array of boxes that changed
   * @param {boolean} skipTransactionWrapper - If true, don't wrap in transaction (already in one)
   * @private
   */
  _notifyBoxesChanged(boxes, skipTransactionWrapper = false) {
    if (!MindMap.onBoxChange || !boxes || boxes.length === 0) return;
    for (const box of boxes) {
      if (box) {
        // IMPORTANT: Sync targetX/targetY to prevent interpolation snap-back
        // When making local changes, the target must match the new position
        if (typeof box.targetX !== 'undefined') box.targetX = box.x;
        if (typeof box.targetY !== 'undefined') box.targetY = box.y;

        MindMap.onBoxChange(box, skipTransactionWrapper);
      }
    }
  }

  // ============================================================================
  // NAVIGATION & FOCUS MANAGEMENT
  // ============================================================================

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
          if (typeof CameraUtils !== 'undefined') {
            CameraUtils.zoom = constrain(targetZoom, (typeof CONFIG !== 'undefined' && CONFIG.ZOOM && CONFIG.ZOOM.MIN) ? CONFIG.ZOOM.MIN : 0.2,
              (typeof CONFIG !== 'undefined' && CONFIG.ZOOM && CONFIG.ZOOM.MAX) ? CONFIG.ZOOM.MAX : 3.0);
          }
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
      } catch (_) { }
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
          } catch (_) { }
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
    // Clear navigation mode after completing connection so arrow keys don't immediately navigate
    this.isArrowKeyNavigating = false;
    return connected;
  }

  // ============================================================================
  // MOUSE & KEYBOARD INPUT HANDLERS
  // ============================================================================

  /**
   * Handles mouse press events
   * Includes improved validation using shared utilities
   */
  handleMousePressed() {
    // Note: We intentionally DON'T clear isArrowKeyNavigating here anymore.
    // This allows users to click a box edge (to select it without editing)
    // and then use arrow keys to navigate from that box in presentation mode.
    // The flag will be cleared when actually editing text or other interactions.

    // Validate mouse coordinates using shared utility if available
    const { x: mx, y: my } = Utils.getWorldMouseCoordinates();
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
        this.isArrowKeyNavigating = false; // Clear navigation when resizing
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
          this.isArrowKeyNavigating = false; // Clear navigation when reattaching
          this.draggingConnection = { conn, originalTo: conn.toBox };
          // Select this connection
          if (this.selectedConnection && this.selectedConnection !== conn) {
            this.selectedConnection.selected = false;
          }
          this.selectedConnection = conn;
          conn.selected = true;
          return;
        }
      } catch (_) { }
    }

    // Check if clicking on a connector dot at box edge center for connection
    for (let box of this.boxes) {
      const side = box.getConnectorUnderMouse();
      if (side) {
        this.isArrowKeyNavigating = false; // Clear navigation when creating connection
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

          // Set as the primary selected box (important for arrow key navigation)
          this.selectedBox = box;

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
            this.isArrowKeyNavigating = false; // Clear navigation when multi-selecting
            this.toggleBoxSelection(box);
            // Also stop editing any box when toggling selection
            if (this.selectedBox) {
              this.selectedBox.stopEditing();
            }
            this.selectedBox = null;
          } else {
            // Single-select and enter editing
            this.isArrowKeyNavigating = false; // Clear navigation mode when entering edit
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
        this.isArrowKeyNavigating = false; // Clear navigation when selecting connection
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

    // Clear navigation mode when clicking empty background
    this.isArrowKeyNavigating = false;

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
            changed = true;
            
            // Wrap connection reattachment in transaction for proper undo tracking
            this._wrapInTransaction(() => {
              conn.toBox = droppedOn;
              // Sync connection change to collaboration
              // Pass skipTransactionWrapper=true since we're in a transaction
              if (MindMap.onConnectionsChange) {
                MindMap.onConnectionsChange(true);
              }
            });
          }
        }
      }

      // If not changed, keep original
      if (!changed) {
        conn.toBox = originalTo;
      }
      this.draggingConnection = null;
      return;
    }

    // Complete connection if in connection mode
    if (this.connectingFrom) {
      this.completeConnection();
    }

    // Stop dragging and resizing all boxes
    // If any box was being dragged or resized, clear navigation mode
    // so arrow keys will enter presentation mode on current box rather than continuing navigation

    // Collect boxes that were dragging or resizing to batch sync them in a single transaction
    const boxesThatWereDragging = [];
    const boxesThatWereResizing = [];

    for (let box of this.boxes) {
      if (!box) continue;
      if (box.isDragging) {
        boxesThatWereDragging.push(box);
      }
      // Note: A box can't be both dragging and resizing at the same time in practice
      // due to mutually exclusive mouse interactions, but we check separately for clarity
      else if (box.isResizing) {
        boxesThatWereResizing.push(box);
      }
    }

    const wasInteracting = boxesThatWereDragging.length > 0 || boxesThatWereResizing.length > 0;

    // Group all drag/resize operations in a single transaction for grouped undo
    if (wasInteracting) {
      this._wrapInTransaction(() => {
        // Stop dragging all boxes
        for (const box of boxesThatWereDragging) {
          box.stopDrag(true); // skipSync=true
        }

        // Stop resizing all boxes
        for (const box of boxesThatWereResizing) {
          box.stopResize(true); // skipSync=true
        }

        // Batch sync ALL boxes that were interacting (not just those that changed)
        // This maintains consistency with original behavior and ensures proper
        // collaborative sync and targetX/targetY updates
        // Pass skipTransactionWrapper=true since we're already in a transaction
        const allInteractingBoxes = [...boxesThatWereDragging, ...boxesThatWereResizing];
        this._notifyBoxesChanged(allInteractingBoxes, true);
      });

      // Close the undo boundary to ensure the transaction is captured as a single undo item
      // This is important when captureTimeout=0 (action-based undo)
      if (typeof collaborationManager !== 'undefined' && collaborationManager) {
        collaborationManager.stopCapturing();
      }

      this.isArrowKeyNavigating = false;
    }

    // Stop selecting on all boxes (this doesn't need transaction wrapping)
    for (let box of this.boxes) {
      if (!box) continue;
      box.stopSelecting();
    }
  }

  /**
   * Handles mouse drag events
   */
  handleMouseDragged() {
    // Validate mouse coordinates
    const { x: mx, y: my } = Utils.getWorldMouseCoordinates();
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
    } catch (_) { }

    const draggingBoxes = [];
    const resizingBoxes = [];

    for (let box of this.boxes) {
      if (!box) continue;
      // If this is the actively edited box and selection is in progress, update selection
      if (box === this.selectedBox && box.isSelecting) {
        box.updateSelection(mx, my);
      } else {
        box.drag(mx, my);
        if (box.isDragging) {
          draggingBoxes.push(box);
        }
        box.resize(mx, my);
        if (box.isResizing) {
          resizingBoxes.push(box);
        }
      }
    }

    // Apply gentle snap-to-grid only when the grid overlay is visible
    this._applyGridSnapping(draggingBoxes);
    this._applyGridSnappingDuringResize(resizingBoxes);
  }

  /**
   * Applies a soft snap-to-grid to all actively dragged boxes when the grid is visible.
   * Uses the primary selected box (or the first dragged box) as the anchor so groups
   * stay together instead of each box snapping independently.
   * @param {Array<TextBox>} draggingBoxes - Boxes currently being dragged
   */
  _applyGridSnapping(draggingBoxes) {
    if (!draggingBoxes || draggingBoxes.length === 0) return;
    if (typeof isGridVisible === 'undefined' || !isGridVisible) return;

    const snapDelta = this._computeGridSnapDelta(draggingBoxes);
    if (!snapDelta) return;

    for (const box of draggingBoxes) {
      box.x += snapDelta.dx;
      box.y += snapDelta.dy;
    }
  }

  /**
   * Computes the translation needed to snap the anchor box to the nearest grid line.
   * Prefers center snapping, but will also consider top-left alignment when that is
   * closer, matching common design tools. Snapping is axis-aware so you can snap
   * horizontally without being forced vertically (and vice-versa).
   * @param {Array<TextBox>} draggingBoxes - Boxes currently being dragged
   * @returns {{dx:number, dy:number}|null}
   */
  _computeGridSnapDelta(draggingBoxes) {
    const anchorBox = (this.selectedBox && this.selectedBox.isDragging)
      ? this.selectedBox
      : draggingBoxes[0];

    if (!anchorBox || !Number.isFinite(anchorBox.x) || !Number.isFinite(anchorBox.y)) {
      return null;
    }

    const { spacing, threshold } = this._getGridSnapSettings();
    if (!Number.isFinite(spacing) || spacing <= 0) return null;

    const width = Number.isFinite(anchorBox.width) ? anchorBox.width : 0;
    const height = Number.isFinite(anchorBox.height) ? anchorBox.height : 0;
    const halfW = width / 2;
    const halfH = height / 2;

    // Candidate targets: box center or top-left corner aligned to the grid
    const centerTargetX = Math.round(anchorBox.x / spacing) * spacing;
    const centerTargetY = Math.round(anchorBox.y / spacing) * spacing;

    const topLeftX = anchorBox.x - halfW;
    const topLeftY = anchorBox.y - halfH;
    const cornerTargetX = Math.round(topLeftX / spacing) * spacing + halfW;
    const cornerTargetY = Math.round(topLeftY / spacing) * spacing + halfH;

    const chooseAxisTarget = (current, centerCandidate, cornerCandidate) => {
      const centerDist = Math.abs(centerCandidate - current);
      const cornerDist = Math.abs(cornerCandidate - current);
      return (cornerDist < centerDist)
        ? { target: cornerCandidate, dist: cornerDist }
        : { target: centerCandidate, dist: centerDist };
    };

    const snapX = chooseAxisTarget(anchorBox.x, centerTargetX, cornerTargetX);
    const snapY = chooseAxisTarget(anchorBox.y, centerTargetY, cornerTargetY);

    const dx = (snapX.dist <= threshold) ? (snapX.target - anchorBox.x) : 0;
    const dy = (snapY.dist <= threshold) ? (snapY.target - anchorBox.y) : 0;

    if (dx === 0 && dy === 0) return null;
    return { dx, dy };
  }

  /**
   * Applies snap-to-grid while resizing. Only the moving bottom/right edges are snapped
   * so the anchored top-left remains stable. Keeps widths/heights above minimums.
   * @param {Array<TextBox>} resizingBoxes - Boxes currently being resized
   */
  _applyGridSnappingDuringResize(resizingBoxes) {
    if (!resizingBoxes || resizingBoxes.length === 0) return;
    if (typeof isGridVisible === 'undefined' || !isGridVisible) return;

    const { spacing, threshold } = this._getGridSnapSettings();
    if (!Number.isFinite(spacing) || spacing <= 0) return;

    for (const box of resizingBoxes) {
      if (!box) continue;

      const minW = Number.isFinite(box.minWidth) ? box.minWidth : 0;
      const minH = Number.isFinite(box.minHeight) ? box.minHeight : 0;

      const left = Number.isFinite(box.resizeStartLeft)
        ? box.resizeStartLeft
        : (Number.isFinite(box.x) && Number.isFinite(box.width) ? box.x - box.width / 2 : null);
      const top = Number.isFinite(box.resizeStartTop)
        ? box.resizeStartTop
        : (Number.isFinite(box.y) && Number.isFinite(box.height) ? box.y - box.height / 2 : null);

      if (!Number.isFinite(left) || !Number.isFinite(top)) continue;

      let width = Number.isFinite(box.width) ? box.width : 0;
      let height = Number.isFinite(box.height) ? box.height : 0;

      const right = left + width;
      const bottom = top + height;

      const snappedRight = Math.round(right / spacing) * spacing;
      const snappedBottom = Math.round(bottom / spacing) * spacing;

      const deltaRight = snappedRight - right;
      const deltaBottom = snappedBottom - bottom;

      if (Math.abs(deltaRight) <= threshold) {
        width = Math.max(minW, snappedRight - left);
      }
      if (Math.abs(deltaBottom) <= threshold) {
        height = Math.max(minH, snappedBottom - top);
      }

      // Update size and recenter to keep top-left anchored
      if (width !== box.width || height !== box.height) {
        box.width = width;
        box.height = height;
        box.x = left + width / 2;
        box.y = top + height / 2;
      }
    }
  }

  /**
   * Derives snap settings from global grid and camera state.
   * Uses a screen-space threshold so the magnet feels consistent at different zooms.
   * @returns {{spacing:number, threshold:number}}
   */
  _getGridSnapSettings() {
    const spacing = (typeof GRID_CONFIG !== 'undefined' && GRID_CONFIG && Number.isFinite(GRID_CONFIG.SPACING))
      ? GRID_CONFIG.SPACING
      : 100;

    const baseScreenTolerancePx = 12; // pleasant magnetic feel without being grabby
    const zoom = (typeof CameraUtils !== 'undefined' && Number.isFinite(CameraUtils.zoom) && CameraUtils.zoom > 0)
      ? CameraUtils.zoom
      : 1;

    const threshold = baseScreenTolerancePx / Math.max(zoom, 0.0001);
    return { spacing, threshold };
  }

  /**
   * Handles key press events
   * @param {string} key - The key that was pressed
   * @param {number} keyCode - The key code
   * @param {boolean} isRepeat - Whether this is a repeated key press
   */
  handleKeyPressed(key, keyCode, isRepeat = false) {
    // =========================================================================
    // TEXT EDITING KEY HANDLING
    // =========================================================================
    // Text editing undo uses intelligent grouping:
    // - Continuous typing is grouped into a single undo step
    // - Pauses in typing (1 second) create undo boundaries
    // - Stopping editing (clicking away) closes the current undo group
    // This provides natural, meaningful undo behavior while preserving
    // multi-user per-user undo tracking via Yjs UndoManager.
    // =========================================================================
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
          // Wrap in transaction to make cut a discrete operation, not grouped with typing
          this.pushUndo();
          if (this.selectedBox.selectionStart !== -1 && this.selectedBox.selectionEnd !== -1) {
            this._wrapInTransaction(() => {
              this.selectedBox.deleteSelection();
              // Notify collaboration system
              // Pass skipTransactionWrapper=true since we're in a transaction
              if (MindMap.onBoxChange && this.selectedBox) {
                MindMap.onBoxChange(this.selectedBox, true);
              }
            });
          }
          return;
        } else if (key === 'v' || key === 'V') {
          // Paste from clipboard
          try {
            if (navigator.clipboard && navigator.clipboard.readText) {
              navigator.clipboard.readText().then(text => {
                if (text && this.selectedBox) {
                  this.pushUndo();
                  // Wrap in transaction to make paste a discrete operation
                  this._wrapInTransaction(() => {
                    this.selectedBox.pasteText(text);
                    // Notify collaboration system
                    // Pass skipTransactionWrapper=true since we're in a transaction
                    if (MindMap.onBoxChange && this.selectedBox) {
                      MindMap.onBoxChange(this.selectedBox, true);
                    }
                  });
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
          // This is a discrete formatting action, not continuous text input
          // Wrap in transaction for separate undo item
          try {
            if (this.selectedBox && typeof this.selectedBox.toggleHighlightOnSelection === 'function') {
              this.pushUndo();
              
              this._wrapInTransaction(() => {
                this.selectedBox.toggleHighlightOnSelection();
                // Notify collaboration system of highlight change
                // Pass skipTransactionWrapper=true since we're already in a transaction
                if (MindMap.onBoxChange) {
                  MindMap.onBoxChange(this.selectedBox, true);
                }
              });
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

      // Block navigation during active interactions
      if (this.connectingFrom || this.draggingConnection) {
        return; // Ignore arrow keys while creating/reattaching connections
      }

      // Check if any box is being dragged or resized
      let anyBoxInteracting = false;
      if (this.boxes) {
        for (const box of this.boxes) {
          if (box && (box.isDragging || box.isResizing)) {
            anyBoxInteracting = true;
            break;
          }
        }
      }
      if (anyBoxInteracting) {
        return; // Ignore arrow keys during drag/resize operations
      }

      // If a box is selected but in editing mode, exit editing first so navigation can begin from that box
      if (this.selectedBox && this.selectedBox.isEditing) {
        this.selectedBox.stopEditing();
        // Don't navigate on this key press - let user press arrow key again to start navigation
        // This gives them a chance to see the box is no longer editing
        return;
      }

      // If a box is selected but we're not yet in arrow key navigation mode,
      // the first arrow press should enter presentation mode on the CURRENT box
      // (not navigate to the next one yet)
      if (this.selectedBox && !this.isArrowKeyNavigating) {
        this.selectAndPanToBox(this.selectedBox);
        return;
      }

      this.navigateBoxes(keyCode);
    } else if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17))) {
      // CMD/CTRL combinations when NOT editing text
      if (key === 'c' || key === 'C') {
        // Copy selected box(es) and their connections
        let boxesToCopy = [];
        if (this.selectedBoxes && this.selectedBoxes.size > 0) {
          boxesToCopy = Array.from(this.selectedBoxes);
        } else if (this.selectedBox) {
          boxesToCopy = [this.selectedBox];
        }

        if (boxesToCopy.length > 0) {
          this.copiedBoxes = [];
          const boxSet = new Set(boxesToCopy);

          // Copy box data
          for (const box of boxesToCopy) {
            if (box) {
              this.copiedBoxes.push(box.toJSON());
            }
          }

          // Copy connections between the selected boxes
          this.copiedConnections = [];
          for (const conn of this.connections) {
            if (conn && conn.fromBox && conn.toBox) {
              // Only copy connections where both ends are in the selection
              if (boxSet.has(conn.fromBox) && boxSet.has(conn.toBox)) {
                // Store indices relative to the copied boxes array
                const fromIndex = boxesToCopy.indexOf(conn.fromBox);
                const toIndex = boxesToCopy.indexOf(conn.toBox);
                if (fromIndex !== -1 && toIndex !== -1) {
                  this.copiedConnections.push({ from: fromIndex, to: toIndex });
                }
              }
            }
          }
        }
        return;
      } else if (key === 'v' || key === 'V') {
        // Paste copied box(es) and their connections at cursor position
        if (this.copiedBoxes && this.copiedBoxes.length > 0) {
          this.pushUndo();
          const { x: mx, y: my } = Utils.getWorldMouseCoordinates();

          // Calculate offset from first copied box to paste location
          const firstBox = this.copiedBoxes[0];
          const offsetX = mx - firstBox.x;
          const offsetY = my - firstBox.y;

          // Clear current selection and navigation mode
          this.isArrowKeyNavigating = false;
          this.clearBoxSelection();
          if (this.selectedBox) {
            this.selectedBox.stopEditing();
            this.selectedBox = null;
          }

          // Wrap paste operation in transaction for single undo step
          this._wrapInTransaction(() => {
            this._performPaste(offsetX, offsetY);
          });
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
        
        // Wrap connection reverse in transaction for proper undo tracking
        this._wrapInTransaction(() => {
          this.selectedConnection.reverse();
          // Sync connection change to collaboration
          // Pass skipTransactionWrapper=true since we're in a transaction
          if (MindMap.onConnectionsChange) {
            MindMap.onConnectionsChange(true);
          }
        });
      }
      // Nothing else to do here; top-level caller prevents default
    } else if (keyCode === BACKSPACE || keyCode === DELETE) {
      // Delete selected boxes or connection(s)
      if (this.selectedBoxes && this.selectedBoxes.size > 0) {
        // Delete all selected boxes - wrap in transaction for single undo step
        this.pushUndo();
        const boxesToDelete = Array.from(this.selectedBoxes);

        this._wrapInTransaction(() => {
          this._performBoxDeletion(boxesToDelete);
        });

        // Clear selection and navigation mode after deletion
        this.isArrowKeyNavigating = false;
        this.clearBoxSelection();
        if (this.selectedBox) {
          this.selectedBox = null;
        }
      } else if (this.selectedConnections && this.selectedConnections.size > 0) {
        // Delete all selected connections (multi-selection)
        this.pushUndo();

        this._wrapInTransaction(() => {
          this.connections = this.connections.filter(conn => !this.selectedConnections.has(conn));
          this.clearConnectionSelection();
          if (this.selectedConnection && !this.connections.includes(this.selectedConnection)) {
            this.selectedConnection = null;
          }
          // Sync connection deletion to collaboration
          if (MindMap.onConnectionsChange) {
            MindMap.onConnectionsChange();
          }
        });

        // Clear navigation mode after deleting connections
        this.isArrowKeyNavigating = false;
      } else if (this.selectedConnection) {
        // Delete selected connection only
        this.pushUndo();
        let index = this.connections.indexOf(this.selectedConnection);
        if (index > -1) {
          this._wrapInTransaction(() => {
            this.connections.splice(index, 1);
            this.selectedConnection = null;
            // Sync connection deletion to collaboration
            if (MindMap.onConnectionsChange) {
              MindMap.onConnectionsChange();
            }
          });
        }
        // Clear navigation mode after deleting single connection
        this.isArrowKeyNavigating = false;
      }
    } else if (key === '1' || key === '2' || key === '3') {
      // Number keys to change selected box colors (when not editing)
      // 1 = red, 2 = orange, 3 = white
      const hasModifier = keyIsDown(91) || keyIsDown(93) || keyIsDown(17) || keyIsDown(18) || keyIsDown(16);
      if (!hasModifier) {
        if (this.selectedBoxes && this.selectedBoxes.size > 0) {
          this.pushUndo();
          const colorKey = key === '1' ? 'red' : (key === '2' ? 'orange' : 'white');

          this._wrapInTransaction(() => {
            const changedBoxes = [];
            for (const box of this.selectedBoxes) {
              if (box && typeof box.setBackgroundByKey === 'function') {
                box.setBackgroundByKey(colorKey);
                changedBoxes.push(box);
              }
            }
            this._notifyBoxesChanged(changedBoxes, true);
          });
        } else if (this.selectedBox && !this.selectedBox.isEditing) {
          this.pushUndo();
          const colorKey = key === '1' ? 'red' : (key === '2' ? 'orange' : 'white');
          if (typeof this.selectedBox.setBackgroundByKey === 'function') {
            // Wrap for consistency with multi-box color change above.
            // While a single setBackgroundByKey is atomic, wrapping ensures uniform behavior
            // and makes the undo boundary explicit, which is the goal of action-based undo.
            this._wrapInTransaction(() => {
              this.selectedBox.setBackgroundByKey(colorKey);
              this._notifyBoxesChanged([this.selectedBox], true);
            });
          }
        }
      }
    }
  }

  // ============================================================================
  // STATE MANAGEMENT (SAVE/LOAD)
  // ============================================================================

  /**
   * Serializes the mind map to JSON
   * @returns {Object} JSON representation of the mind map
   */
  toJSON() {
    return {
      boxes: this.boxes.map(box => box.toJSON()),
      connections: this.connections.map(conn => conn.toJSON(this.boxes)),
      lastModified: Date.now(),
      name: this.getLastUsedFilename() || 'openmind.json'
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
      Utils.Logger.error('[MindMap] fromJSON: Invalid data format');
      return;
    }

    // Clean up existing references to prevent memory leaks
    this.boxes = [];
    this.connections = [];
    this.selectedBox = null;
    this.selectedConnection = null;
    this.connectingFrom = null;
    this.isArrowKeyNavigating = false; // Clear navigation state when loading new state
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

    // Sync loaded boxes and connections to Yjs (for unified undo)
    // This ensures loaded data is tracked by UndoManager
    if (MindMap.onBoxChange) {
      for (const box of this.boxes) {
        if (box && box.id) {
          MindMap.onBoxChange(box);
        }
      }
    }
    if (MindMap.onConnectionsChange) {
      MindMap.onConnectionsChange();
    }
  }

  /**
   * Gets the last used filename from localStorage
   * If in a collaborative room, uses the room hash as the filename
   * @returns {string} The last used filename or default
   */
  getLastUsedFilename() {
    try {
      // Check for collaboration room hash first
      if (typeof window !== 'undefined' && window.location && window.location.hash) {
        const hash = window.location.hash.slice(1); // Remove '#'
        if (hash && hash.startsWith('room-')) {
          // Use room name as filename (e.g., "room-abc123" -> "room-abc123.json")
          return hash + '.json';
        }
      }

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
        console.log('MindMap.save: Using showSaveFilePicker (Save As dialog)');
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
        console.log('MindMap.save: Fallback to saveJSON (auto-download)');
        saveJSON(data, defaultFilename);
        // Note: In fallback mode, we keep using the same filename since we can't detect what the user named it
      }
      // Mark as saved regardless of localStorage outcome; seed localStorage best-effort
      this.isSaved = true;
      try { this.saveToLocalStorage(); } catch (_) { }
    } catch (e) {
      // User may cancel the dialog; that's not an error
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return;
      console.error('Save failed:', e);
      try { alert('Save failed: ' + (e && e.message ? e.message : String(e))); } catch (_) { }
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
    try { this.saveToLocalStorage(); } catch (_) { }
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
      try { this.selectedConnection.selected = false; } catch (_) { }
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

      localStorage.setItem(this.storageKey, jsonString);
      this.isSaved = true;
      return true;
    } catch (e) {
      // Handle quota exceeded errors specifically
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('localStorage quota exceeded. Attempting to prune old caches...');

        // Try to free up space by removing oldest map caches
        if (this.pruneOldestCache()) {
          // Retry saving
          try {
            const data = this.toJSON();
            localStorage.setItem(this.storageKey, JSON.stringify(data));
            this.isSaved = true;
            console.log('Saved successfully after pruning.');
            return true;
          } catch (retryError) {
            console.error('Failed to save even after pruning:', retryError);
          }
        }

        console.error('localStorage quota exceeded. Unable to autosave. Consider exporting your work.');
        // Try to show user-friendly error
        if (typeof alert !== 'undefined') {
          // Only alert if we haven't alerted recently to avoid spamming
          const now = Date.now();
          if (!this._lastQuotaAlert || now - this._lastQuotaAlert > 60000) {
            alert('Storage quota exceeded. Please export your mind map to save your work.');
            this._lastQuotaAlert = now;
          }
        }
      } else {
        console.error('Failed to autosave to localStorage:', e);
      }
      return false;
    }
  }

  /**
   * Sets the storage key for autosaving
   * @param {string} key - The new storage key
   */
  setStorageKey(key) {
    if (key && typeof key === 'string') {
      this.storageKey = key;
    }
  }

  /**
   * Prunes the oldest map caches to free up space
   * @returns {boolean} true if space was freed
   */
  pruneOldestCache() {
    try {
      if (typeof localStorage === 'undefined') return false;

      const mapKeys = [];
      const prefix = 'openmind_map_';

      // Find all map cache keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix) && key !== 'openmind_autosave') {
          mapKeys.push(key);
        }
      }

      // If no other maps to delete, we can't free space (don't delete current default autosave if possible, 
      // or maybe we should if we are saving proper named map? 
      // Current logic: only prune specific 'openmind_map_' keys, shielding 'openmind_autosave' unless we rename it later)
      if (mapKeys.length === 0) return false;

      // Sort by last modified
      const cacheEntries = [];
      for (const key of mapKeys) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            // optimized: peek at simplified version if parsing huge JSON is too slow?
            // for now, full parse is safest to get reliable timestamp
            const data = JSON.parse(raw);
            cacheEntries.push({
              key: key,
              lastModified: data.lastModified || 0
            });
          }
        } catch (e) {
          // If corrupted, it's a prime candidate for deletion
          cacheEntries.push({ key: key, lastModified: -1 });
        }
      }

      // Sort oldest first
      cacheEntries.sort((a, b) => a.lastModified - b.lastModified);

      // Delete the oldest one (or more if needed? start with 1)
      if (cacheEntries.length > 0) {
        const oldest = cacheEntries[0];
        localStorage.removeItem(oldest.key);
        console.log('Pruned oldest cache:', oldest.key);
        return true;
      }
    } catch (e) {
      console.warn('Error during cache pruning:', e);
    }
    return false;
  }

  /**
   * Loads state from localStorage
   * @returns {boolean} true if successful
   */
  loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem(this.storageKey);
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
      return localStorage.getItem(this.storageKey) !== null;
    } catch (e) {
      return false;
    }
  }
}
