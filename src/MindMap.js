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

  // Color constants - using centralized ColorPalette
  static COLORS = {
    CONNECTING_LINE: ColorPalette.CONNECTION.PREVIEW_LINE,
    CONNECTOR_DOT: ColorPalette.CONNECTION.CONNECTOR_DOT
  };

  // Stroke weight for connection preview (in pixels)
  static STROKE_WEIGHT_PREVIEW = 2;

  // Fallback bar width (px) used when TimelineMode is not loaded
  static FALLBACK_TIMELINE_WIDTH = 800;

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

  /** @type {function(boolean=):void|null} Called when clusters change (receives optional skipTransactionWrapper) */
  static onClustersChange = null;

  /** @type {function(boolean=):void|null} Called when timeline connections change */
  static onTimelineConnectionsChange = null;

  /** @type {function():void|null} Called when timeline active state changes (on/off toggle) */
  static onTimelineActiveChange = null;

  /**
   * Called when a box's health changes from a remote Yjs update.
   * Registered by ThrustGame to track damaged boxes without CollaborationManager
   * needing any direct knowledge of ThrustGame.
   * @type {function(string, number|undefined):void|null}
   */
  static onBoxHealthChanged = null;

  // ============================================================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================================================

  /**
   * Initializes a new MindMap with default state
   */
  constructor() {
    this.boxes = [];
    this.connections = [];

    // Track the top-most box under the pointer for hover-only visuals
    this._topHoverBox = null;

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

    // Visual grouping clusters
    this.clusters = [];
    this.selectedCluster = null;

    // Clipboard for copying/pasting boxes and their connections
    this.copiedBoxes = [];
    this.copiedConnections = [];

    // O(1) Lookup Index
    // Maps boxId -> TextBox instance
    // Must be kept in sync with this.boxes array
    this.boxIdMap = new Map();

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

    // Timeline Mode connections (TimelineConnection objects; TimelineMode.js reads/writes this)
    this.timelineConnections = [];
    // Persisted bar width (null = use TimelineMode.DEFAULT_WIDTH) — legacy, now derived from timelineTotalDays
    this.timelineBarWidth = null;
    // Number of days shown on the bar (null = use TimelineMode.DEFAULT_TOTAL_DAYS)
    this.timelineTotalDays = null;
    // Bar position in world space (placed at cursor when created via Ctrl+K)
    this.timelineBarX = 0;
    this.timelineBarY = 0;
    // Currently selected timeline connection (for delete, visual highlight)
    this.selectedTimelineConnection = null;
    // Whether the bar itself is selected (for move / delete)
    this.timelineSelected = false;

    // Timeline Mode active state and configuration
    this.timelineActive = false;
    this.timelineStartDate = null;   // origin date for day-index labels; persisted in save files
    // Right-handle (extend future) drag state
    this.timelineDraggingResize = false;
    this.timelineDragStartWorldX = 0;
    this.timelineDragStartWidth = 0;
    // Left-handle (extend past) drag state
    this.timelineDraggingLeftHandle = false;
    this.timelineDragStartTotalDays = 0;
    this.timelineDragStartBarX = 0;
    this.timelineDragStartDate = null;
    this.timelineDragLastDeltaDays = 0;
    this.timelineDragStartDayIndices = null;
    // Bar body drag state (moving the whole bar)
    this.timelineBarDragging = false;
    this.timelineBarDragOffsetX = 0;
    this.timelineBarDragOffsetY = 0;
  }

  // ============================================================================
  // BASIC BOX & CONNECTION MANAGEMENT
  // ============================================================================

  /**
   * Adds a new box to the mind map
   * @param {TextBox} box - The box to add
   */
  addBox(box) {
    // Wrap in transaction for proper undo tracking
    this._wrapInTransaction(() => {
      this._registerBox(box);

      // Notify collaboration system
      // Pass skipTransactionWrapper=true since we're already in a transaction
      if (MindMap.onBoxChange && box) {
        MindMap.onBoxChange(box, true);
      }
    });
  }

  /**
   * Batch adds boxes and connections to the mind map.
   * Highly efficient: performs ONE sync reconciliation at the end.
   * @param {TextBox[]} boxes - Array of boxes to add
   * @param {Connection[]} connections - Array of connections to add
   */
  batchAdd(boxes = [], connections = []) {
    if ((!boxes || boxes.length === 0) && (!connections || connections.length === 0)) return;

    this._wrapInTransaction(() => {
      // 1. Register all boxes and sync to Yjs (O(1) per box)
      for (const box of boxes) {
        if (!box) continue;
        this._registerBox(box);
        if (MindMap.onBoxChange) {
          MindMap.onBoxChange(box, true);
        }
      }

      // 2. Register all connections (O(1) per connection)
      for (const conn of connections) {
        if (!conn) continue;
        this._registerConnection(conn);
      }

      // 3. Reconcile ALL connections on Yjs once (O(N_connections))
      if (MindMap.onConnectionsChange && connections.length > 0) {
        MindMap.onConnectionsChange(true);
      }
    });
  }

  /**
   * Internal data structure methods to maintain index integrity.
   * Using these instead of direct array manipulation ensures boxIdMap stays in sync.
   * @private
   */

  /**
   * Registers a box to the internal state (array and O(1) map).
   * @param {TextBox} box 
   */
  _registerBox(box) {
    if (!box) return;
    this.boxes.push(box);
    if (box.id && this.boxIdMap) {
      this.boxIdMap.set(box.id, box);
    }
    this.isDirty = true;
    this.isSaved = false;
  }

  /**
   * Unregisters a box from the internal state (array and O(1) map).
   * Note: Does NOT handle connections or selection cleanup.
   * @param {TextBox|string} boxOrId 
   */
  _unregisterBox(boxOrId) {
    if (!boxOrId) return false;

    // Support passing either the box object or its ID
    let box, boxId;
    if (typeof boxOrId === 'string') {
      boxId = boxOrId;
      box = this.getBoxById(boxId);
    } else {
      box = boxOrId;
      boxId = box.id;
    }

    if (!box) return false;

    const index = this.boxes.indexOf(box);
    if (index > -1) {
      this.boxes.splice(index, 1);
      if (boxId && this.boxIdMap) this.boxIdMap.delete(boxId);

      // Cleanup selection state if this box was selected
      if (this.selectedBox === box) {
        if (box.isEditing) box.stopEditing();
        this.selectedBox = null;
      }
      if (this.selectedBoxes) this.selectedBoxes.delete(box);

      this.isDirty = true;
      this.isSaved = false;
      return true;
    }
    return false;
  }

  /**
   * Registers a connection to the internal state.
   * @param {Connection} conn 
   */
  _registerConnection(conn) {
    if (!conn) return;
    this.connections.push(conn);
    this.isDirty = true;
    this.isSaved = false;
  }

  /**
   * Unregisters a connection.
   * @param {Connection} conn 
   * @returns {boolean} True if found and removed
   */
  _unregisterConnection(conn) {
    if (!conn) return false;
    const index = this.connections.indexOf(conn);
    if (index > -1) {
      this.connections.splice(index, 1);

      // Cleanup selection state if this connection was selected
      if (this.selectedConnection === conn) this.selectedConnection = null;
      if (this.selectedConnections) this.selectedConnections.delete(conn);
      conn.selected = false;

      this.isDirty = true;
      this.isSaved = false;
      return true;
    }
    return false;
  }

  /**
   * Bulk deletes specified connections.
   * Efficiently handles array filtering and selection cleanup.
   * Handles both regular Connection and TimelineConnection objects.
   * @param {Connection[]} connectionsToDelete 
   */
  _performConnectionDeletion(connectionsToDelete) {
    if (!connectionsToDelete || connectionsToDelete.length === 0) return;

    // Single-pass O(n) partition: timeline vs regular.
    // Use a Set of the timeline connections for O(1) membership test.
    const timelineSet = new Set(this.timelineConnections || []);
    const timelineConns = [];
    const regularConns = [];
    for (const c of connectionsToDelete) {
      if (timelineSet.has(c)) {
        timelineConns.push(c);
      } else {
        regularConns.push(c);
      }
    }

    // Delete timeline connections via their dedicated path (handles Yjs sync)
    for (const tc of timelineConns) {
      this.removeTimelineConnection(tc);
    }

    // Delete regular connections
    if (regularConns.length > 0) {
      const regularSet = new Set(regularConns);
      const initialLength = this.connections.length;

      this.connections = this.connections.filter(c => !regularSet.has(c));

      if (this.connections.length !== initialLength) {
        // Cleanup selection state for all deleted connections
        for (const conn of regularConns) {
          if (this.selectedConnection === conn) this.selectedConnection = null;
          if (this.selectedConnections) this.selectedConnections.delete(conn);
          conn.selected = false;
        }

        this.isDirty = true;
        this.isSaved = false;

        // Sync connection deletion to collaboration
        if (MindMap.onConnectionsChange) {
          MindMap.onConnectionsChange();
        }
      }
    }
  }

  /**
   * Low-level helper to bring a box to the top of the Z-order (end of array).
   * @param {TextBox} box 
   */
  _bringBoxToTop(box) {
    if (!box) return;
    const index = this.boxes.indexOf(box);
    if (index > -1) {
      this.boxes.splice(index, 1);
      this.boxes.push(box);
      this.isDirty = true;
      this.isSaved = false;
    }
  }

  /**
   * Filters out connections involving the specified box.
   * @param {TextBox} box 
   */
  _removeConnectionsForBox(box) {
    if (!box) return;
    this._removeConnectionsForBoxes([box]);
  }

  /**
   * Bulk filters out connections involving any of the specified boxes.
   * Efficiently cleans up all related connections in a single pass.
   * @param {TextBox[]} boxes - Array of boxes to clear connections for
   */
  _removeConnectionsForBoxes(boxes) {
    if (!boxes || boxes.length === 0) return;
    const boxSet = new Set(boxes);
    const initialLength = this.connections.length;

    // Track which connections are being removed for selection cleanup
    const removedConns = this.connections.filter(c => boxSet.has(c.fromBox) || boxSet.has(c.toBox));

    this.connections = this.connections.filter(
      c => !boxSet.has(c.fromBox) && !boxSet.has(c.toBox)
    );

    if (this.connections.length !== initialLength) {
      // Cleanup selection state for all removed connections
      for (const conn of removedConns) {
        if (this.selectedConnection === conn) this.selectedConnection = null;
        if (this.selectedConnections) this.selectedConnections.delete(conn);
        conn.selected = false;
      }

      this.isDirty = true;
      this.isSaved = false;
    }
  }

  /**
   * Finds a box by its unique ID
   * @param {string} id - The box ID to search for
   * @returns {TextBox|null} The box with the given ID, or null if not found
   */
  getBoxById(id) {
    if (!id || typeof id !== 'string') return null;
    return this.boxIdMap.get(id) || null;
  }

  /**
   * Rebuilds the O(1) lookup map from the current boxes array.
   * Call this if the boxes array is modified directly (e.g. by CollaborationManager).
   */
  rebuildIndex() {
    this.boxIdMap.clear();
    for (const box of this.boxes) {
      if (box && box.id) {
        this.boxIdMap.set(box.id, box);
      }
    }
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

    // Wrap in transaction for proper undo tracking
    this._wrapInTransaction(() => {
      this._registerConnection(new Connection(fromBox, toBox));

      // Notify collaboration system
      // Pass skipTransactionWrapper=true since we're already in a transaction
      if (MindMap.onConnectionsChange) {
        MindMap.onConnectionsChange(true);
      }
    });
  }

  /**
   * Adds a timeline connection (box → day-tick) with full undo tracking.
   * Prevents duplicate connections for the same (fromBox, dayIndex) pair.
   * @param {TextBox} fromBox  – source box
   * @param {number}  dayIndex – 0 … TimelineMode.TOTAL_DAYS-1
   */
  addTimelineConnection(fromBox, dayIndex) {
    if (!fromBox || dayIndex == null) return;
    if (!this.timelineConnections) this.timelineConnections = [];

    // Prevent duplicate
    const already = this.timelineConnections.some(
      c => c.fromBox === fromBox && c.dayIndex === dayIndex
    );
    if (already) return;

    this._wrapInTransaction(() => {
      const conn = new TimelineConnection(fromBox, dayIndex, this);
      this.timelineConnections.push(conn);
      if (MindMap.onTimelineConnectionsChange) {
        MindMap.onTimelineConnectionsChange(true);
      }
    });
  }

  /**
   * Removes a timeline connection with full undo tracking.
   * @param {TimelineConnection} conn – the connection to remove
   */
  removeTimelineConnection(conn) {
    if (!conn || !this.timelineConnections) return;
    const idx = this.timelineConnections.indexOf(conn);
    if (idx < 0) return;

    this._wrapInTransaction(() => {
      this.timelineConnections.splice(idx, 1);
      // Clear selection if this connection was selected
      if (this.selectedTimelineConnection === conn) {
        this.selectedTimelineConnection = null;
      }
      if (MindMap.onTimelineConnectionsChange) {
        MindMap.onTimelineConnectionsChange(true);
      }
    });
  }

  /** Returns the current bar width: totalDays × DAY_WIDTH (fixed scale). */
  getTimelineBarWidth() {
    // Guard: TimelineMode may be undefined in Jest/Node test environments (no browser globals)
    if (typeof TimelineMode === 'undefined') return MindMap.FALLBACK_TIMELINE_WIDTH;
    const days = (this.timelineTotalDays && typeof this.timelineTotalDays === 'number')
      ? this.timelineTotalDays
      : TimelineMode.DEFAULT_TOTAL_DAYS;
    return days * TimelineMode.DAY_WIDTH;
  }

  /**
   * Create a new timeline bar at the given world position, or remove it if already active.
   * Replaces the old toggle behaviour with placement at cursor (like the N key for boxes).
   * @param {number} worldX – world-space X to place the bar's left edge at
   * @param {number} worldY – world-space Y to vertically centre the bar on
   */
  createTimeline(worldX = 0, worldY = 0) {
    const barHalfHeight = (typeof TimelineMode !== 'undefined' &&
      typeof TimelineMode.BAR_HEIGHT === 'number')
      ? TimelineMode.BAR_HEIGHT / 2
      : 40; // fallback: half of the default 80px bar height

    if (!this.timelineActive) {
      this.timelineActive = true;
      // Only initialise position and start date for a genuinely fresh timeline.
      // If the bar was previously active (timelineStartDate already set), preserve
      // the original bar position, start date, and total days so that existing
      // connections remain anchored to the correct calendar dates.
      if (!this.timelineStartDate) {
        // Fresh create: place bar so its vertical centre is at the cursor
        this.timelineBarX = worldX;
        this.timelineBarY = worldY - barHalfHeight;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        this.timelineStartDate = today;
        this.timelineTotalDays = (typeof TimelineMode !== 'undefined' && TimelineMode.DEFAULT_TOTAL_DAYS)
          ? TimelineMode.DEFAULT_TOTAL_DAYS
          : 31;
      }
      // Ensure the connections array exists (may have been cleared by a hard reset)
      if (!this.timelineConnections) this.timelineConnections = [];
    } else {
      this.timelineActive = false;
      this.timelineDraggingResize = false;
      this.timelineBarDragging = false;
      this.timelineSelected = false;
    }
    this.isSaved = false;
    this.isDirty = true;
    // Notify collaboration layer so remote users see the change
    if (MindMap.onTimelineActiveChange) MindMap.onTimelineActiveChange();
  }

  /** Draw the timeline bar (thin wrapper around TimelineMode.drawBar). */
  drawTimeline() {
    if (!this.timelineActive || !this.timelineStartDate) return;
    if (typeof TimelineMode === 'undefined') return; // guard: script not loaded
    TimelineMode.drawBar(this);
  }

  /** Draw timeline connections under boxes so arrows do not overlay box content. */
  drawTimelineConnectionsUnderlay() {
    if (!this.timelineActive || !this.timelineStartDate) return;
    if (typeof TimelineMode === 'undefined') return;
    if (typeof TimelineMode.drawConnectionsUnderlay !== 'function') return;
    TimelineMode.drawConnectionsUnderlay(this);
  }

  /**
   * Draw date-assignment labels (day badges) above boxes that have a timeline
   * connection, even when the timeline bar itself is hidden.
   * Called every frame from sketch.js inside the camera transform.
   */
  drawTimelineDateLabels() {
    if (typeof TimelineMode === 'undefined') return;
    if (!this.timelineConnections || this.timelineConnections.length === 0) return;
    // Use stored start date; fall back to today so labels can still show even
    // when the timeline bar has been toggled off (timelineStartDate is preserved).
    let startDate = this.timelineStartDate;
    if (!startDate) {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      this.timelineStartDate = startDate; // cache so all callers agree
    }
    const z = typeof CameraUtils !== 'undefined' ? (CameraUtils.zoom || 1) : 1;
    const safeZ = Math.max(0.01, z);
    const totalDays = this.timelineTotalDays || TimelineMode.DEFAULT_TOTAL_DAYS;
    const visibleConns = this.timelineConnections.filter(c => c.dayIndex >= 0 && c.dayIndex < totalDays);
    push();
    TimelineMode.drawBoxDateLabels(visibleConns, startDate, safeZ);
    pop();
  }

  /**
   * Handle a mouse-press in world coordinates for the timeline bar.
   * Returns true if the event was consumed.
   */
  handleTimelineMousePressed(worldX, worldY) {
    if (!this.timelineActive) {
      this.timelineSelected = false;
      return false;
    }
    const barX = this.timelineBarX || 0;
    const barY = this.timelineBarY || 0;
    const barWidth = this.getTimelineBarWidth();
    // Convert to bar-local coordinates for all geometry checks
    const localX = worldX - barX;
    const localY = worldY - barY;

    if (!TimelineMode.isOverBarWorld(localX, localY, barWidth)) {
      // Click outside the bar — clear bar selection and let normal handling proceed
      this.timelineSelected = false;
      return false;
    }

    // If the click lands on a timeline connection's arrowhead, let handleMousePressed
    // handle it (timeline endpoint drag) rather than consuming it here.
    if (this.timelineConnections) {
      for (const tc of this.timelineConnections) {
        if (tc && typeof tc.isMouseOverArrowHead === 'function') {
          try { if (tc.isMouseOverArrowHead()) return false; } catch (_) { }
        }
      }
    }

    if (TimelineMode.isRightDragHandle(localX, localY, barWidth)) {
      // Right handle: extends the future end of the timeline
      this.timelineDraggingResize = true;
      this.timelineDragStartWorldX = worldX;
      this.timelineDragStartWidth = barWidth;
    } else if (TimelineMode.isLeftDragHandle(localX, localY)) {
      // Left handle: extends the past end of the timeline
      this.timelineDraggingLeftHandle = true;
      this.timelineDragStartWorldX = worldX;
      this.timelineDragStartTotalDays = this.timelineTotalDays || TimelineMode.DEFAULT_TOTAL_DAYS;
      this.timelineDragStartBarX = this.timelineBarX || 0;
      this.timelineDragStartDate = new Date(this.timelineStartDate);
      this.timelineDragLastDeltaDays = 0;
      // Snapshot current day indices so we can restore from absolute delta each frame
      this.timelineDragStartDayIndices = new Map(
        (this.timelineConnections || []).map(c => [c, c.dayIndex])
      );
    } else {
      // Bar body click: select the bar and begin a move drag
      this.timelineSelected = true;
      this.timelineBarDragging = true;
      this.timelineBarDragOffsetX = localX;
      this.timelineBarDragOffsetY = localY;
      // Clear other selections so the bar is the only thing selected
      this.clearBoxSelection();
      this.selectedBox = null;
      this.clearConnectionSelection();
    }
    return true;
  }

  /**
   * Handle a drag update in world coordinates for timeline resize or bar move.
   * Returns true if consumed.
   */
  handleTimelineDrag(worldX, worldY) {
    if (this.timelineBarDragging) {
      // Move the bar: offset was recorded at mousedown so dragging feels natural
      this.timelineBarX = worldX - this.timelineBarDragOffsetX;
      this.timelineBarY = worldY - this.timelineBarDragOffsetY;
      this.isSaved = false;
      this.isDirty = true;
      return true;
    }
    if (this.timelineDraggingResize) {
      // Right handle: add/remove days from the future end, bar grows/shrinks right
      const deltaX = worldX - this.timelineDragStartWorldX;
      const DAY_WIDTH = (typeof TimelineMode !== 'undefined') ? TimelineMode.DAY_WIDTH : 40;
      const MIN_DAYS  = (typeof TimelineMode !== 'undefined') ? TimelineMode.MIN_TOTAL_DAYS : 7;
      const startDays = this.timelineDragStartWidth / DAY_WIDTH;
      const newDays = Math.max(MIN_DAYS, Math.round(startDays + deltaX / DAY_WIDTH));
      this.timelineTotalDays = newDays;
      this.isSaved = false;
      this.isDirty = true;
      return true;
    }
    if (this.timelineDraggingLeftHandle) {
      // Left handle: shift start date into the past, bar grows/shrinks left
      const DAY_WIDTH = (typeof TimelineMode !== 'undefined') ? TimelineMode.DAY_WIDTH : 40;
      const MIN_DAYS  = (typeof TimelineMode !== 'undefined') ? TimelineMode.MIN_TOTAL_DAYS : 7;
      const deltaX = worldX - this.timelineDragStartWorldX;
      // Positive deltaDays means we're extending further into the past
      const maxDelta = this.timelineDragStartTotalDays - MIN_DAYS; // can't shrink below minimum
      const deltaDays = Math.max(-maxDelta, Math.round(-deltaX / DAY_WIDTH));
      if (deltaDays !== this.timelineDragLastDeltaDays) {
        // Update start date (shift back by deltaDays relative to drag start)
        const newStart = new Date(this.timelineDragStartDate);
        newStart.setDate(newStart.getDate() - deltaDays);
        this.timelineStartDate = newStart;
        // Move bar left edge left by the same amount
        this.timelineBarX = this.timelineDragStartBarX - deltaDays * DAY_WIDTH;
        // Grow/shrink total days
        this.timelineTotalDays = this.timelineDragStartTotalDays + deltaDays;
        // Shift all connection day indices so dates are preserved
        for (const [conn, origIdx] of (this.timelineDragStartDayIndices || [])) {
          conn.dayIndex = origIdx + deltaDays;
        }
        this.timelineDragLastDeltaDays = deltaDays;
      }
      this.isSaved = false;
      this.isDirty = true;
      return true;
    }
    return false;
  }

  /** End a timeline resize or move drag; sync position/size to collaborators. */
  handleTimelineRelease() {
    const wasDragging = this.timelineBarDragging || this.timelineDraggingResize || this.timelineDraggingLeftHandle;
    this.timelineBarDragging = false;
    this.timelineDraggingResize = false;
    this.timelineDraggingLeftHandle = false;
    this.timelineDragStartDayIndices = null;
    this.timelineDragLastDeltaDays = 0;
    if (wasDragging) {
      this.isSaved = false;
      this.isDirty = true;
      // Sync updated position or width to collaborators
      if (MindMap.onTimelineActiveChange) MindMap.onTimelineActiveChange();
    }
  }

  /**
   * Handle a connection drag dropped over the timeline bar.
   * Returns true if a timeline connection was created.
   */
  handleTimelineConnectionDropped(worldX, worldY, fromBox) {
    if (!this.timelineActive) return false;
    const barX = this.timelineBarX || 0;
    const barY = this.timelineBarY || 0;
    const barWidth = this.getTimelineBarWidth();
    const localX = worldX - barX;
    const localY = worldY - barY;
    if (!TimelineMode.isOverBarWorld(localX, localY, barWidth)) return false;
    if (!fromBox) return false;
    if (TimelineMode.isDragHandle(localX, localY, barWidth)) return false;
    const totalDays = this.timelineTotalDays || TimelineMode.DEFAULT_TOTAL_DAYS;
    const dayIndex = Math.min(TimelineMode.dayFromWorldX(localX, barWidth), totalDays - 1);
    this.addTimelineConnection(fromBox, dayIndex);
    return true;
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

    // Helper to skip off-screen connections when both ends are outside the viewport
    const shouldCullConnection = (conn) => {
      if (!useCulling || !viewportBounds || !conn) return false;
      const fromVisible = isBoxVisibleFast(conn.fromBox);
      const toVisible = isBoxVisibleFast(conn.toBox);
      return !fromVisible && !toVisible;
    };

    // Helper: detect overlap between two boxes using their axis-aligned bounds
    const boxesOverlap = (a, b) => {
      if (!a || !b) return false;
      if (!Utils.isValidNumber(a.x) || !Utils.isValidNumber(a.y) ||
        !Utils.isValidNumber(a.width) || !Utils.isValidNumber(a.height) ||
        !Utils.isValidNumber(b.x) || !Utils.isValidNumber(b.y) ||
        !Utils.isValidNumber(b.width) || !Utils.isValidNumber(b.height)) {
        return false;
      }

      // Add a small margin so near-overlaps also hide the connection
      const margin = 6;

      const aLeft = a.x - a.width / 2 - margin;
      const aRight = a.x + a.width / 2 + margin;
      const aTop = a.y - a.height / 2 - margin;
      const aBottom = a.y + a.height / 2 + margin;

      const bLeft = b.x - b.width / 2 - margin;
      const bRight = b.x + b.width / 2 + margin;
      const bTop = b.y - b.height / 2 - margin;
      const bBottom = b.y + b.height / 2 + margin;

      return !(aRight < bLeft || aLeft > bRight || aBottom < bTop || aTop > bBottom);
    };

    // Track the top-most box (last in render order) so its connections can render above lower boxes
    const topBox = (this.boxes && this.boxes.length > 0) ? this.boxes[this.boxes.length - 1] : null;
    const overlayConnections = [];

    // Draw clusters behind everything (connections and boxes)
    if (this.clusters && this.clusters.length > 0) {
      for (const cluster of this.clusters) {
        if (!cluster) continue;
        // Viewport culling: skip clusters whose AABB is entirely off-screen
        if (useCulling && viewportBounds) {
          const b = cluster.getBounds();
          if (b) {
            const m = 50; // small extra margin so partially-visible clusters always draw
            if (b.right  + m < viewportBounds.worldLeft  ||
                b.left   - m > viewportBounds.worldRight  ||
                b.bottom + m < viewportBounds.worldTop    ||
                b.top    - m > viewportBounds.worldBottom) {
              continue;
            }
          }
        }
        try { cluster.draw(); } catch (e) { console.error('Error drawing cluster:', e); }
      }
    }

    // Draw existing connections (skip the one being reattached)
    if (this.connections) {
      for (let conn of this.connections) {
        if (!conn) continue;
        if (this.draggingConnection && this.draggingConnection.conn === conn) continue;

        // If the connected boxes overlap, hide the connection until they separate
        if (boxesOverlap(conn.fromBox, conn.toBox)) {
          continue;
        }

        // Defer connections attached to the top/dragged box so they render above lower boxes
        const touchesTopBox = topBox && (conn.fromBox === topBox || conn.toBox === topBox);
        const hasDraggingEndpoint = (conn.fromBox && conn.fromBox.isDragging) || (conn.toBox && conn.toBox.isDragging);
        if (touchesTopBox || hasDraggingEndpoint) {
          overlayConnections.push(conn);
          continue;
        }

        // Skip off-screen connections for better performance
        if (shouldCullConnection(conn)) {
          continue;
        }

        try { conn.draw(); } catch (e) { console.error('Error drawing connection:', e); }
      }
    }

    // Draw boxes
    if (this.boxes) {
      // Compute the top-most hovered box once per frame so hover visuals do not leak to underlying boxes
      this._topHoverBox = this.getTopMostBoxUnderMouse();

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

    // Draw deferred connections for the top/dragged box above underlying boxes
    if (overlayConnections.length > 0) {
      for (let conn of overlayConnections) {
        if (!conn) continue;
        if (boxesOverlap(conn.fromBox, conn.toBox)) continue;
        if (shouldCullConnection(conn)) continue;
        try { conn.draw(); } catch (e) { console.error('Error drawing connection:', e); }
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
        const isTopHover = this._topHoverBox === box;
        if ((!this.isArrowKeyNavigating && isTopHover) || active) {
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
        Utils.applyStroke(lineColor, MindMap.STROKE_WEIGHT_PREVIEW);
        line(start.x, start.y, worldMouseX(), worldMouseY());
        noStroke();
        Utils.applyFill(dotColor);
        circle(start.x, start.y, 10);
        circle(worldMouseX(), worldMouseY(), 8);
        pop();
      }
    }

    // Draw live reattach line if dragging an existing connection's arrow head.
    // This also covers TimelineConnection endpoint drags since they now use draggingConnection.
    if (this.draggingConnection && this.draggingConnection.conn && typeof worldMouseX === 'function' && typeof worldMouseY === 'function') {
      const conn = this.draggingConnection.conn;
      const from = conn.fromBox ? conn.fromBox.getConnectionPoint({ x: worldMouseX(), y: worldMouseY() }) : null;
      if (from && !isNaN(from.x) && !isNaN(from.y)) {
        const mx = worldMouseX();
        const my = worldMouseY();
        const lineColor = MindMap.COLORS.CONNECTING_LINE;
        const dotColor = MindMap.COLORS.CONNECTOR_DOT;
        push();
        Utils.applyStroke(lineColor, MindMap.STROKE_WEIGHT_PREVIEW);
        line(from.x, from.y, mx, my);
        // Arrow head at mouse
        const angle = atan2(my - from.y, mx - from.x);
        Utils.applyFill(dotColor);
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

    // Filter out boxes that are locked by remote editing
    const unlocked = this.boxes.filter(b => !(b.isLockedByRemoteEdit && b.isLockedByRemoteEdit()));

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

    // X alignment (only on unlocked boxes)
    const xVals = unlocked.map((b, i) => ({ v: b.x, i }));
    const xClusters = clusterValues(xVals);
    for (const cluster of xClusters) {
      if (cluster.length < 2) continue; // Only snap when there are at least 2
      const avg = cluster.reduce((s, it) => s + it.v, 0) / cluster.length;
      for (const it of cluster) {
        const box = unlocked[it.i];
        box.x = avg;
        box.targetX = avg; // Sync target to prevent rubber-banding
      }
    }

    // Y alignment (only on unlocked boxes)
    const yVals = unlocked.map((b, i) => ({ v: b.y, i }));
    const yClusters = clusterValues(yVals);
    for (const cluster of yClusters) {
      if (cluster.length < 2) continue;
      const avg = cluster.reduce((s, it) => s + it.v, 0) / cluster.length;
      for (const it of cluster) {
        const box = unlocked[it.i];
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

    // Filter out boxes locked by remote editing
    const unlocked = boxesToAlign.filter(b => !(b.isLockedByRemoteEdit && b.isLockedByRemoteEdit()));

    if (unlocked.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performLeftAlign(unlocked);
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

    // Filter out boxes locked by remote editing
    const unlocked = boxesToAlign.filter(b => !(b.isLockedByRemoteEdit && b.isLockedByRemoteEdit()));

    if (unlocked.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performRightAlign(unlocked);
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

    // Filter out boxes locked by remote editing
    const unlocked = boxesToAlign.filter(b => !(b.isLockedByRemoteEdit && b.isLockedByRemoteEdit()));

    if (unlocked.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performTopAlign(unlocked);
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

    // Filter out boxes locked by remote editing
    const unlocked = boxesToAlign.filter(b => !(b.isLockedByRemoteEdit && b.isLockedByRemoteEdit()));

    if (unlocked.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performBottomAlign(unlocked);
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

    // Filter out boxes locked by remote editing
    const unlocked = boxesToAlign.filter(b => !(b.isLockedByRemoteEdit && b.isLockedByRemoteEdit()));

    if (unlocked.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performCenterAlign(unlocked);
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

    // Filter out boxes locked by remote editing
    const unlocked = boxesToAlign.filter(b => !(b.isLockedByRemoteEdit && b.isLockedByRemoteEdit()));

    if (unlocked.length < 2) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performHorizontalCenterAlign(unlocked);
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

    // Filter out boxes locked by remote editing
    const unlocked = boxes.filter(b => !(b.isLockedByRemoteEdit && b.isLockedByRemoteEdit()));

    if (unlocked.length < 3) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performVerticalDistribute(unlocked);
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

    // Filter out boxes locked by remote editing
    const unlocked = boxes.filter(b => !(b.isLockedByRemoteEdit && b.isLockedByRemoteEdit()));

    if (unlocked.length < 3) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performHorizontalDistribute(unlocked);
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

    // Filter out boxes locked by remote editing
    const unlocked = boxesToLayout.filter(b => !(b.isLockedByRemoteEdit && b.isLockedByRemoteEdit()));

    if (unlocked.length < 1) return false;

    // Wrap in transaction for single undo step
    this._wrapInTransaction(() => {
      this._performHierarchicalLayout(unlocked);
    });
    return true;
  }

  /**
   * Internal implementation of hierarchical layout
   * @private
   */
  _performHierarchicalLayout(boxesToLayout) {
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const avg = (values) => {
      if (!Array.isArray(values) || values.length === 0) return null;
      const finite = values.filter(Number.isFinite);
      if (finite.length === 0) return null;
      return finite.reduce((sum, v) => sum + v, 0) / finite.length;
    };
    const getBoxWidth = (box) => {
      if (!box) return 80;
      if (Utils.isValidNumber(box.width)) return Math.max(60, box.width);
      return 100;
    };
    const getBoxHeight = (box) => {
      if (!box) return 60;
      if (Utils.isValidNumber(box.height)) return Math.max(40, box.height);
      return 60;
    };

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

    // Layout configuration using class constants with adaptive spacing bounds
    const HORIZONTAL_SPACING = MindMap.LAYOUT.HORIZONTAL_SPACING;
    const VERTICAL_SPACING = MindMap.LAYOUT.VERTICAL_SPACING;
    const START_X = MindMap.LAYOUT.START_X;
    const START_Y = MindMap.LAYOUT.START_Y;
    const MIN_GAP_X = Math.max(60, HORIZONTAL_SPACING * 0.55);
    const MAX_GAP_X = Math.max(MIN_GAP_X * 1.25, HORIZONTAL_SPACING * 1.15);
    const MIN_GAP_Y = Math.max(60, VERTICAL_SPACING);
    const EXTERNAL_PULL = 0.4; // weight for external anchors vs parents
    const GROUP_EXTERNAL_BLEND = 0.35; // how much group centering leans toward external anchors

    // Capture anchors to boxes that connect to nodes outside the selection.
    // This keeps the layout sensitive to external context without moving those nodes.
    const externalAnchors = new Map(); // box -> average external X
    for (const box of boxesToLayout) {
      let sum = 0;
      let count = 0;
      for (const conn of this.connections) {
        if (!conn || !conn.fromBox || !conn.toBox) continue;
        if (conn.fromBox === box && !boxSet.has(conn.toBox) && Utils.isValidNumber(conn.toBox.x)) {
          sum += conn.toBox.x;
          count++;
        }
        if (conn.toBox === box && !boxSet.has(conn.fromBox) && Utils.isValidNumber(conn.fromBox.x)) {
          sum += conn.fromBox.x;
          count++;
        }
      }
      if (count > 0) {
        externalAnchors.set(box, sum / count);
      }
    }
    const externalCenterX = avg(Array.from(externalAnchors.values()));

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

    // Compute per-level metrics for adaptive vertical spacing
    const levelHeights = new Map();
    for (const [level, boxes] of levelGroups) {
      const height = Math.max(...boxes.map(getBoxHeight));
      levelHeights.set(level, height);
    }

    const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);

    // Place levels top-down while respecting anchors and avoiding overlaps
    const placedPositions = new Map(); // box -> { x, y }
    let currentY = START_Y;
    let prevHeight = 0;

    for (let li = 0; li < sortedLevels.length; li++) {
      const level = sortedLevels[li];
      const boxes = levelGroups.get(level);
      const levelHeight = levelHeights.get(level) || 60;

      if (li === 0) {
        currentY = START_Y + levelHeight / 2;
      } else {
        currentY += prevHeight / 2 + levelHeight / 2 + MIN_GAP_Y;
      }
      prevHeight = levelHeight;

      // Desired X pulls: parent barycenter first, then external anchors, then original position
      const desiredX = new Map();
      for (const box of boxes) {
        const parentXs = (parents.get(box) || [])
          .map(p => placedPositions.get(p)?.x)
          .filter(Number.isFinite);
        const parentTarget = avg(parentXs);
        const externalTarget = externalAnchors.get(box);
        let target = null;
        if (Number.isFinite(parentTarget) && Number.isFinite(externalTarget)) {
          target = parentTarget * (1 - EXTERNAL_PULL) + externalTarget * EXTERNAL_PULL;
        } else if (Number.isFinite(parentTarget)) {
          target = parentTarget;
        } else if (Number.isFinite(externalTarget)) {
          target = externalTarget;
        }
        if (!Number.isFinite(target) && Utils.isValidNumber(box.x)) {
          target = box.x;
        }
        desiredX.set(box, target);
      }

      // Stable ordering: by desired position, then color priority, then original x
      boxes.sort((a, b) => {
        const da = desiredX.get(a);
        const db = desiredX.get(b);
        if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return da - db;
        const priorityDiff = this.getBoxColorPriority(a) - this.getBoxColorPriority(b);
        if (priorityDiff !== 0) return priorityDiff;
        return a.x - b.x;
      });

      // Initial compact layout using minimum gaps
      const minTotalWidth = boxes.reduce((sum, box, idx) => sum + getBoxWidth(box) + (idx > 0 ? MIN_GAP_X : 0), 0);
      const desiredCenter = avg(Array.from(desiredX.values())) ?? START_X + minTotalWidth / 2;
      let sweepX = desiredCenter - minTotalWidth / 2;
      const provisional = new Map();
      for (const box of boxes) {
        const w = getBoxWidth(box);
        provisional.set(box, sweepX + w / 2);
        sweepX += w + MIN_GAP_X;
      }

      // Relaxation: pull toward desired positions while clamping gaps
      const iterations = Math.max(2, Math.min(5, boxes.length));
      for (let iter = 0; iter < iterations; iter++) {
        // Spring toward desired anchors
        for (const box of boxes) {
          const target = desiredX.get(box);
          if (!Number.isFinite(target)) continue;
          const currentX = provisional.get(box);
          provisional.set(box, currentX + (target - currentX) * 0.35);
        }

        // Left-to-right clamp to avoid overlaps and cap huge gaps
        for (let i = 1; i < boxes.length; i++) {
          const prev = boxes[i - 1];
          const curr = boxes[i];
          const prevHalf = getBoxWidth(prev) / 2;
          const currHalf = getBoxWidth(curr) / 2;
          const lower = provisional.get(prev) + prevHalf + MIN_GAP_X + currHalf;
          const upper = provisional.get(prev) + prevHalf + MAX_GAP_X + currHalf;
          const clamped = clamp(provisional.get(curr), lower, upper);
          provisional.set(curr, clamped);
        }

        // Right-to-left clamp to compress excessive whitespace
        for (let i = boxes.length - 2; i >= 0; i--) {
          const curr = boxes[i];
          const next = boxes[i + 1];
          const currHalf = getBoxWidth(curr) / 2;
          const nextHalf = getBoxWidth(next) / 2;
          const upper = provisional.get(next) - nextHalf - MIN_GAP_X - currHalf;
          const lower = provisional.get(next) - nextHalf - MAX_GAP_X - currHalf;
          const clamped = clamp(provisional.get(curr), lower, upper);
          provisional.set(curr, clamped);
        }
      }

      // Commit positions for this level
      for (const box of boxes) {
        const x = provisional.get(box);
        box.x = x;
        box.y = currentY;
        box.targetX = box.x;
        box.targetY = box.y;
        placedPositions.set(box, { x: box.x, y: box.y });
      }
    }

    // After layout, shift group so its center matches the original (in-place layout)
    const postBounds = getBounds(boxesToLayout);
    if (preBounds && postBounds) {
      let targetCenterX = preBounds.centerX;
      if (Number.isFinite(externalCenterX)) {
        targetCenterX = preBounds.centerX * (1 - GROUP_EXTERNAL_BLEND) + externalCenterX * GROUP_EXTERNAL_BLEND;
      }
      const dx = targetCenterX - postBounds.centerX;
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
  _wrapInTransaction(operation, label = '') {
    if (typeof collaborationManager !== 'undefined' && collaborationManager) {
      collaborationManager.transact(operation, label);
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
        this._registerBox(newBox);
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
          this._registerConnection(new Connection(fromBox, toBox));
        }
      }
    }

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
    if (!boxesToDelete || boxesToDelete.length === 0) return;

    // 1. Bulk remove all related connections efficiently (O(Connections))
    this._removeConnectionsForBoxes(boxesToDelete);

    // 1b. Remove timeline connections for deleted boxes
    if (this.timelineConnections && this.timelineConnections.length > 0) {
      const boxSet = new Set(boxesToDelete);
      const prev = this.timelineConnections.length;
      this.timelineConnections = this.timelineConnections.filter(c => !c || !boxSet.has(c.fromBox));
      if (this.selectedTimelineConnection && boxSet.has(this.selectedTimelineConnection.fromBox)) {
        this.selectedTimelineConnection = null;
      }
      if (this.timelineConnections.length !== prev && MindMap.onTimelineConnectionsChange) {
        MindMap.onTimelineConnectionsChange(true);
      }
    }

    // 2. Remove deleted boxes from any clusters they belong to;
    //    prune clusters that drop below 2 members.
    if (this.clusters && this.clusters.length > 0) {
      for (const cluster of this.clusters) {
        if (!cluster) continue;
        for (const box of boxesToDelete) {
          cluster.removeBox(box);
        }
      }
      // Remove clusters that now have fewer than 2 valid members
      const pruned = this.clusters.filter(c => c && c.boxes.length >= 2);
      const removed = this.clusters.length !== pruned.length;
      this.clusters = pruned;
      // Clear selectedCluster if it was pruned
      if (removed && this.selectedCluster && !this.clusters.includes(this.selectedCluster)) {
        this.selectedCluster = null;
      }
    }

    // Sync updated cluster state to Yjs BEFORE box deletions so both land in the
    // same outer transaction (enabling proper undo of cluster membership).
    if (MindMap.onClustersChange) {
      MindMap.onClustersChange(true);
    }

    // 3. Unregister boxes and notify collaboration
    for (const box of boxesToDelete) {
      if (!box) continue;
      this._unregisterBox(box);

      // Notify collaboration system of deletion
      if (MindMap.onBoxDelete && box.id) {
        MindMap.onBoxDelete(box.id);
      }
    }

    // 4. Notify collaboration system of connection changes once
    if (MindMap.onConnectionsChange) {
      MindMap.onConnectionsChange(true);
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
        // Check if box is locked before starting resize
        if (box.isLockedByRemoteEdit && box.isLockedByRemoteEdit()) {
          const remoteState = TextBox.getRemoteEditingState(box.id);
          box._showEditingBlockedNotification(remoteState);
          return;
        }
        this.isArrowKeyNavigating = false; // Clear navigation when resizing
        this.selectedBox = box;
        // Single select this box when resizing
        if (!shiftDown) this.clearBoxSelection();
        this.addBoxToSelection(box);
        box.startResize(mx, my);
        return;
      }
    }

    // PRIORITY: Arrowhead reattach comes before connector dots to avoid conflict when overlapping
    // Check if clicking on a timeline connection's arrow head (inherited from Connection).
    // These use the same draggingConnection mechanism as normal connections — drop on bar
    // re-dates; drop on a box converts the timeline connection to a regular one.
    if (this.timelineActive && this.timelineConnections && this.timelineConnections.length > 0) {
      for (let i = this.timelineConnections.length - 1; i >= 0; i--) {
        const tc = this.timelineConnections[i];
        if (!tc || typeof tc.isMouseOverArrowHead !== 'function') continue;
        try {
          if (tc.isMouseOverArrowHead()) {
            this.isArrowKeyNavigating = false;
            // Use the same draggingConnection state as normal connections.
            // originalTo is null because timeline connections have no target box.
            this.draggingConnection = { conn: tc, originalTo: null };
            if (this.selectedTimelineConnection && this.selectedTimelineConnection !== tc) {
              this.selectedTimelineConnection.selected = false;
            }
            this.selectedTimelineConnection = tc;
            tc.selected = true;
            return;
          }
        } catch (_) { }
      }
    }

    // Check if clicking on an existing connection's arrow head to reattach
    for (let i = this.connections.length - 1; i >= 0; i--) {
      const conn = this.connections[i];
      if (!conn || !conn.isMouseOverArrowHead || !conn.getArrowHeadPosition) continue;
      try {
        if (conn.isMouseOverArrowHead()) {
          // Drag Lock Protection: Check if either end of the connection is locked
          const lockedBox = this._isAnyBoxLocked([conn.fromBox, conn.toBox]);
          if (lockedBox) {
            const remoteState = TextBox.getRemoteEditingState(lockedBox.id);
            lockedBox._showEditingBlockedNotification(remoteState);
            return;
          }

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

          // Drag Lock Protection: Check if ANY selected box is locked before starting the drag.
          // This prevents "fragmented" dragging where some boxes move and others stay.
          const boxesToDrag = (hasMultipleSelected && boxInSelection) ? Array.from(this.selectedBoxes) : [box];
          const lockedBox = this._isAnyBoxLocked(boxesToDrag);
          if (lockedBox) {
            const remoteState = TextBox.getRemoteEditingState(lockedBox.id);
            lockedBox._showEditingBlockedNotification(remoteState);
            return;
          }

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

        // Move this box to the end (on top) for Z-order
        this._bringBoxToTop(box);
        // Deselect any active cluster when a box is clicked
        if (this.selectedCluster) {
          this.selectedCluster.selected = false;
          this.selectedCluster = null;
        }
        // Snapshot cluster hulls so _updateClusterMembership can measure removal
        // distance from the pre-drag boundary rather than the live (deformed) hull.
        if (onEdge) this._captureDragStartClusterSnapshots();
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
        // Deselect any active cluster
        if (this.selectedCluster) {
          this.selectedCluster.selected = false;
          this.selectedCluster = null;
        }

        // Clear any previous connection multi-selection and select this connection
        if (this.clearConnectionSelection) this.clearConnectionSelection();
        if (this.addConnectionToSelection) this.addConnectionToSelection(conn);

        // Keep legacy single pointer as well
        this.selectedConnection = conn;
        conn.selected = true;
        return;
      }
    }

    // Check if clicking on a timeline connection (when timeline is active)
    if (this.timelineConnections && this.timelineConnections.length > 0) {
      for (let i = this.timelineConnections.length - 1; i >= 0; i--) {
        const tc = this.timelineConnections[i];
        if (!tc || typeof tc.isMouseOver !== 'function') continue;
        if (tc.isMouseOver()) {
          this.isArrowKeyNavigating = false;
          if (this.selectedBox) {
            this.selectedBox.stopEditing();
            this.selectedBox = null;
          }
          this.clearBoxSelection();
          if (this.selectedCluster) {
            this.selectedCluster.selected = false;
            this.selectedCluster = null;
          }
          // Clear normal connection selection, then select this timeline connection.
          // Also add to selectedConnections so behaviour is consistent with regular connections.
          if (this.clearConnectionSelection) this.clearConnectionSelection();
          this.selectedTimelineConnection = tc;
          if (this.addConnectionToSelection) this.addConnectionToSelection(tc);
          return;
        }
      }
    }

    // Clicked outside all boxes and connections.
    // Check if a cluster was clicked before clearing all selections.
    let clickedCluster = null;
    if (this.clusters && this.clusters.length > 0) {
      for (let i = this.clusters.length - 1; i >= 0; i--) {
        const cluster = this.clusters[i];
        if (cluster && cluster.contains(mx, my)) {
          clickedCluster = cluster;
          break;
        }
      }
    }

    if (clickedCluster) {
      // Select the cluster; clear box / connection selections
      if (this.selectedBox) {
        this.selectedBox.stopEditing();
        this.selectedBox = null;
      }
      this.isArrowKeyNavigating = false;
      this.clearBoxSelection();
      if (this.clearConnectionSelection) this.clearConnectionSelection();

      // Deselect any previously selected cluster
      if (this.selectedCluster && this.selectedCluster !== clickedCluster) {
        this.selectedCluster.selected = false;
      }
      this.selectedCluster = clickedCluster;
      clickedCluster.selected = true;

      // Set potential drag state - do NOT select boxes yet
      this._potentialClusterDrag = clickedCluster;
      this._dragStartWorldX = mx;
      this._dragStartWorldY = my;

      return;
    }

    // No cluster was clicked — clear all selections including any selected cluster
    if (this.selectedCluster) {
      this.selectedCluster.selected = false;
      this.selectedCluster = null;
    }
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

    // Clear timeline bar selection when clicking empty background
    this.timelineSelected = false;
  }

  /**
   * Handles mouse release events
   */
  handleMouseReleased() {
    // Complete reattachment if dragging an existing connection (including TimelineConnections).
    if (this.draggingConnection && this.draggingConnection.conn) {
      const { conn, originalTo } = this.draggingConnection;

      // ── TimelineConnection dropped on bar → re-date; dropped on box → convert ──
      if (typeof TimelineConnection !== 'undefined' && conn instanceof TimelineConnection) {
        this.draggingConnection = null;
        if (typeof worldMouseX === 'function' && typeof worldMouseY === 'function') {
          const wx = worldMouseX();
          const wy = worldMouseY();
          const bw = this.getTimelineBarWidth();
          const bx = this.timelineBarX || 0;
          const by = this.timelineBarY || 0;
          const lx = wx - bx;
          const ly = wy - by;

          // Dropped on bar → change the day
          if (TimelineMode.isOverBarWorld(lx, ly, bw) && !TimelineMode.isDragHandle(lx, ly, bw)) {
            const totalDays = this.timelineTotalDays || TimelineMode.DEFAULT_TOTAL_DAYS;
            const newDay = Math.min(TimelineMode.dayFromWorldX(lx, bw), totalDays - 1);
            if (newDay !== conn.dayIndex) {
              const dup = this.timelineConnections.some(
                c => c !== conn && c.fromBox === conn.fromBox && c.dayIndex === newDay
              );
              if (!dup) {
                this._wrapInTransaction(() => {
                  conn.dayIndex = newDay;
                  if (MindMap.onTimelineConnectionsChange) MindMap.onTimelineConnectionsChange(true);
                });
              }
            }
            return;
          }

          // Dropped on a box → convert to a regular Connection
          let droppedBox = null;
          for (const box of this.boxes) {
            if (box && box !== conn.fromBox && box.isMouseOver && box.isMouseOver()) {
              droppedBox = box;
              break;
            }
          }
          if (droppedBox) {
            // Check lock
            if (droppedBox.isLockedByRemoteEdit && droppedBox.isLockedByRemoteEdit()) {
              const remoteState = TextBox.getRemoteEditingState(droppedBox.id);
              if (droppedBox._showEditingBlockedNotification) {
                droppedBox._showEditingBlockedNotification(remoteState);
              }
              return;
            }
            const dup = this.connections.some(c => c.fromBox === conn.fromBox && c.toBox === droppedBox);
            if (!dup) {
              this._wrapInTransaction(() => {
                this.removeTimelineConnection(conn);
                const newConn = new Connection(conn.fromBox, droppedBox);
                this._registerConnection(newConn);
                if (MindMap.onConnectionsChange) MindMap.onConnectionsChange(true);
              });
            }
          }
          // else: dropped nowhere → no change (dayIndex was never mutated)
        }
        return;
      }

      // ── Normal Connection dropped on timeline bar → convert to TimelineConnection ──
      if (this.timelineActive && typeof worldMouseX === 'function' && typeof worldMouseY === 'function') {
        const wx = worldMouseX();
        const wy = worldMouseY();
        const bw = this.getTimelineBarWidth();
        const bx = this.timelineBarX || 0;
        const by = this.timelineBarY || 0;
        const lx = wx - bx;
        const ly = wy - by;
        if (TimelineMode.isOverBarWorld(lx, ly, bw) && !TimelineMode.isDragHandle(lx, ly, bw)) {
          const totalDays = this.timelineTotalDays || TimelineMode.DEFAULT_TOTAL_DAYS;
          const dayIndex = Math.min(TimelineMode.dayFromWorldX(lx, bw), totalDays - 1);
          this._wrapInTransaction(() => {
            this._unregisterConnection(conn);
            // Notify Yjs that the regular connection was removed
            if (MindMap.onConnectionsChange) MindMap.onConnectionsChange(true);
            this.addTimelineConnection(conn.fromBox, dayIndex);
          });
          this.draggingConnection = null;
          return;
        }
      }

      // ── Standard Connection reattachment to another box ──
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
            // Drag Lock Protection: Check if the new target box is locked
            if (droppedOn && droppedOn.isLockedByRemoteEdit && droppedOn.isLockedByRemoteEdit()) {
              const remoteState = TextBox.getRemoteEditingState(droppedOn.id);
              if (droppedOn._showEditingBlockedNotification) {
                droppedOn._showEditingBlockedNotification(remoteState);
              }
              // Reset drag state or just don't apply the change
              changed = false;
            } else {
              changed = true;
            }

            // Wrap connection reattachment in transaction for proper undo tracking
            this._wrapInTransaction(() => {
              conn.toBox = droppedOn;
              this.isSaved = false; // Mark as unsaved for browser autosave
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
        const changedBoxes = [];

        // Stop dragging all boxes and collect only those that actually moved
        for (const box of boxesThatWereDragging) {
          const changed = box.stopDrag(true); // skipSync=true
          if (changed) changedBoxes.push(box);
        }

        // Stop resizing all boxes and collect only those that actually changed size
        for (const box of boxesThatWereResizing) {
          const changed = box.stopResize(true); // skipSync=true
          if (changed) changedBoxes.push(box);
        }

        // Sync only boxes that changed to avoid empty undo entries when no movement occurred
        if (changedBoxes.length > 0) {
          this._notifyBoxesChanged(changedBoxes, true); // already in a transaction
        }

        // Resolve cluster membership changes inside the same Yjs transaction so
        // that a drag that moves a box out of (or into) a cluster produces a single
        // undo entry covering BOTH the position change and the membership change.
        // Yjs nests the inner ydoc.transact() call inside _updateClusterMembership
        // into this outer transaction, making the two sets of writes atomic.
        // This must run after stopDrag() so boxes have their final positions.
        this._updateClusterMembership(boxesThatWereDragging);
      }, 'dragRelease');

      // Close the combined undo boundary (position changes + any membership changes).
      if (typeof collaborationManager !== 'undefined' && collaborationManager) {
        collaborationManager.stopCapturing();
      }

      this.isArrowKeyNavigating = false;
    }

    // Always clear cluster-drag state on release
    this.draggingCluster = null;
    this._potentialClusterDrag = null;

    // Clear drag-interaction highlights on all clusters regardless of whether
    // any box actually moved.
    this._clearClusterDragHighlights();

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

    // Continuous mark as unsaved for gestures
    try {
      let gestureActive = !!this.connectingFrom || !!this.draggingConnection || !!this._potentialClusterDrag;
      if (!gestureActive) {
        for (let b of this.boxes) {
          if (b && (b.isDragging || b.isResizing)) { gestureActive = true; break; }
        }
      }
      if (gestureActive) this.isSaved = false;
    } catch (_) { }

    // Refined Cluster Dragging: Trigger actual box selection/drag start only after a threshold
    if (this._potentialClusterDrag) {
      const d = dist(mx, my, this._dragStartWorldX, this._dragStartWorldY);
      if (d > 3) {
        const cluster = this._potentialClusterDrag;
        this._potentialClusterDrag = null;

        // Check if any box in the cluster is locked by a remote user
        const lockedBox = this._isAnyBoxLocked(cluster.boxes);
        if (lockedBox) {
          if (typeof TextBox !== 'undefined' && TextBox.getRemoteEditingState) {
            const remoteState = TextBox.getRemoteEditingState(lockedBox.id);
            if (remoteState && lockedBox._showEditingBlockedNotification) {
              lockedBox._showEditingBlockedNotification(remoteState);
            }
          }
          return;
        }

        // officially start the drag for all boxes
        for (const box of cluster.boxes) {
          this.addBoxToSelection(box);
          box.startDrag(this._dragStartWorldX, this._dragStartWorldY);
          this._bringBoxToTop(box);
        }
        this.draggingCluster = cluster;
        this._captureDragStartClusterSnapshots();
      }
    }

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

    // Update visual drag-interaction highlights on all clusters
    this._updateClusterDragHighlights(draggingBoxes);
  }

  /**
   * Helper to check if any of the given boxes are locked by remote editing.
   * Returns the first locked box found, or null if none are locked.
   * @param {Array<TextBox>|Set<TextBox>} boxes 
   * @returns {TextBox|null}
   * @private
   */
  _isAnyBoxLocked(boxes) {
    if (!boxes) return null;
    // Iterate directly over Set or Array to avoid allocation
    for (const b of boxes) {
      if (b && b.isLockedByRemoteEdit && b.isLockedByRemoteEdit()) {
        return b;
      }
    }
    return null;
  }

  /**
   * Applies a soft snap-to-grid to all actively dragged boxes when the grid is visible.
   * Uses the primary selected box (or the first dragged box) as the anchor so groups
   * stay together instead of each box snapping independently.
   * Respects Shift-constrained dragging by not snapping on the locked axis.
   * @param {Array<TextBox>} draggingBoxes - Boxes currently being dragged
   */
  _applyGridSnapping(draggingBoxes) {
    if (!draggingBoxes || draggingBoxes.length === 0) return;
    if (typeof isGridVisible === 'undefined' || !isGridVisible) return;

    // Check if any box has an active shift-lock constraint
    const anchorBox = (this.selectedBox && this.selectedBox.isDragging)
      ? this.selectedBox
      : draggingBoxes[0];
    const lockAxis = anchorBox ? anchorBox._dragLockAxis : undefined;

    const snapDelta = this._computeGridSnapDelta(draggingBoxes);
    if (!snapDelta) return;

    for (const box of draggingBoxes) {
      // Skip snapping on the locked axis to preserve Shift-constraint
      if (lockAxis === 'x') {
        // Horizontal lock active - only apply vertical snapping
        box.y += snapDelta.dy;
      } else if (lockAxis === 'y') {
        // Vertical lock active - only apply horizontal snapping
        box.x += snapDelta.dx;
      } else {
        // No lock - apply both axes
        box.x += snapDelta.dx;
        box.y += snapDelta.dy;
      }
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
        const isShift = keyIsDown(16);
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
          // Paste is handled via the native 'paste' event in sketch.js
          // to support rich formatting and better browser compatibility.
          // We return early here to prevent 'v' from being added as a character.
          return;
        } else if (key === 'u' || key === 'U') {
          // Highlight selected text (toggle) with Cmd/Ctrl+U
          try {
            if (this.selectedBox && typeof this.selectedBox.toggleHighlightOnSelection === 'function') {
              this._wrapInTransaction(() => {
                this.selectedBox.toggleHighlightOnSelection();
                // Pass skipTransactionWrapper=true since we're already in a transaction
                if (MindMap.onBoxChange) {
                  MindMap.onBoxChange(this.selectedBox, true);
                }
              });

              // Force an explicit undo boundary for formatting commands
              if (typeof collaborationManager !== 'undefined' && collaborationManager && collaborationManager.stopCapturing) {
                collaborationManager.stopCapturing();
              }
            }
          } catch (e) { console.error('Highlight toggle failed', e); }
          return;
        } else if (key === 'b' || key === 'B') {
          // Faux bold via outline stroke
          try {
            if (this.selectedBox && typeof this.selectedBox.toggleBoldOutlineOnSelection === 'function') {
              this._wrapInTransaction(() => {
                this.selectedBox.toggleBoldOutlineOnSelection();
                if (MindMap.onBoxChange) {
                  MindMap.onBoxChange(this.selectedBox, true);
                }
              });

              if (typeof collaborationManager !== 'undefined' && collaborationManager && collaborationManager.stopCapturing) {
                collaborationManager.stopCapturing();
              }
            }
          } catch (e) { console.error('Bold toggle failed', e); }
          return;
        } else if (key === 'i' || key === 'I') {
          // Faux italic via shear transform
          try {
            if (this.selectedBox && typeof this.selectedBox.toggleItalicSlantOnSelection === 'function') {
              this._wrapInTransaction(() => {
                this.selectedBox.toggleItalicSlantOnSelection();
                if (MindMap.onBoxChange) {
                  MindMap.onBoxChange(this.selectedBox, true);
                }
              });

              if (typeof collaborationManager !== 'undefined' && collaborationManager && collaborationManager.stopCapturing) {
                collaborationManager.stopCapturing();
              }
            }
          } catch (e) { console.error('Italic toggle failed', e); }
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
        if (!isRepeat) this.isSaved = false; // Mark as unsaved
        // Modifier variants for deletion
        if (keyIsDown(91) || keyIsDown(93)) { // CMD -> delete to start of line
          this.selectedBox.deleteToLineStart();
        } else if (keyIsDown(18) || keyIsDown(17)) { // ALT/OPTION or CTRL -> delete previous word
          this.selectedBox.deleteWordLeft();
        } else {
          this.selectedBox.removeChar();
        }
      } else if (keyCode === DELETE) {
        if (!isRepeat) this.isSaved = false; // Mark as unsaved
        // Forward delete and modifier variants
        if (keyIsDown(91) || keyIsDown(93)) { // CMD -> delete to end of line
          this.selectedBox.deleteToLineEnd();
        } else if (keyIsDown(18) || keyIsDown(17)) { // ALT/OPTION or CTRL -> delete next word
          this.selectedBox.deleteWordRight();
        } else {
          this.selectedBox.removeForwardChar();
        }
      } else if (keyCode === ENTER) {
        this.isSaved = false; // Mark as unsaved
        this.selectedBox.addChar('\n');
      } else if (key && key.length === 1) {
        this.isSaved = false; // Mark as unsaved
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
        // Wrap connection reverse in transaction for proper undo tracking
        this._wrapInTransaction(() => {
          this.selectedConnection.reverse();
          this.isSaved = false; // Mark as unsaved for browser autosave
          // Sync connection change to collaboration
          // Pass skipTransactionWrapper=true since we're in a transaction
          if (MindMap.onConnectionsChange) {
            MindMap.onConnectionsChange(true);
          }
        });
      }
      // Nothing else to do here; top-level caller prevents default
    } else if (keyCode === BACKSPACE || keyCode === DELETE) {
      // Delete selected cluster (does NOT delete member boxes) — wrap in transaction for undo
      if (this.selectedCluster) {
        const clusterToDelete = this.selectedCluster;
        this.selectedCluster = null;
        this._wrapInTransaction(() => {
          this.deleteCluster(clusterToDelete);
        });
      } else if (this.selectedBoxes && this.selectedBoxes.size > 0) {
        // Delete all selected boxes - wrap in transaction for single undo step
        const boxesToDelete = Array.from(this.selectedBoxes);

        // Drag Lock Protection: Check if ANY selected box is locked before deletion
        const lockedBox = this._isAnyBoxLocked(boxesToDelete);
        if (lockedBox) {
          const remoteState = TextBox.getRemoteEditingState(lockedBox.id);
          if (lockedBox._showEditingBlockedNotification) {
            lockedBox._showEditingBlockedNotification(remoteState);
          }
          return;
        }

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
        const connsToDelete = Array.from(this.selectedConnections);
        this._wrapInTransaction(() => {
          this._performConnectionDeletion(connsToDelete);
        });

        // Clear navigation mode after deleting connections
        this.isArrowKeyNavigating = false;
      } else if (this.selectedConnection) {
        // Delete selected connection only
        this._wrapInTransaction(() => {
          this._unregisterConnection(this.selectedConnection);
          // Sync connection deletion to collaboration
          if (MindMap.onConnectionsChange) {
            MindMap.onConnectionsChange();
          }
        });
      } else if (this.selectedTimelineConnection) {
        // Delete selected timeline connection
        this.removeTimelineConnection(this.selectedTimelineConnection);
      } else if (this.timelineSelected) {
        // Delete the timeline bar itself
        this.createTimeline();
      }
      // Clear navigation mode after deleting single connection
      this.isArrowKeyNavigating = false;
    } else if (key === '1' || key === '2' || key === '3' || key === '4' || key === '5' || key === '6' || key === '7' || key === '8' || key === '9') {
      // Number keys change colours (when not editing, no modifier held)
      const hasModifier = keyIsDown(91) || keyIsDown(93) || keyIsDown(17) || keyIsDown(18) || keyIsDown(16);
      if (!hasModifier) {
        if (this.selectedCluster) {
          // Keys 1-9: cycle through the predefined cluster fill colours
          const fills = ColorPalette.CLUSTER.FILLS;
          const newIndex = (parseInt(key, 10) - 1) % fills.length;
          this._wrapInTransaction(() => {
            this.selectedCluster.colorIndex = newIndex;
            this.isSaved = false;
            if (MindMap.onClustersChange) MindMap.onClustersChange(true);
          });
        } else if (key === '1' || key === '2' || key === '3') {
          // Keys 1-3: change selected box colors (1 = red, 2 = orange, 3 = white)
          const colorKey = key === '1' ? 'red' : (key === '2' ? 'orange' : 'white');
          if (this.selectedBoxes && this.selectedBoxes.size > 0) {
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
            if (typeof this.selectedBox.setBackgroundByKey === 'function') {
              this._wrapInTransaction(() => {
                this.selectedBox.setBackgroundByKey(colorKey);
                this._notifyBoxesChanged([this.selectedBox], true);
              });
            }
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
    const tlConns = (this.timelineConnections || []).map(c =>
      (c && typeof c.toJSON === 'function') ? c.toJSON() : c
    ).filter(Boolean);

    return {
      boxes: this.boxes.map(box => box.toJSON()),
      connections: this.connections.map(conn => conn.toJSON(this.boxes)),
      clusters: this.clusters
        ? this.clusters.filter(c => c).map(c => c.toJSON())
        : [],
      timelineConnections: tlConns,
      timelineBarWidth: this.timelineBarWidth || null,
      timelineTotalDays: this.timelineTotalDays || null,
      timelineBarX: this.timelineBarX || 0,
      timelineBarY: this.timelineBarY || 0,
      timelineActive: this.timelineActive || false,
      // Persist as ISO string so day-index labels show the same calendar dates
      // across reloads (without this, labels would shift to today each time).
      timelineStartDate: this.timelineStartDate ? this.timelineStartDate.toISOString() : null,
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
    this.clusters = [];
    this.selectedCluster = null;
    if (this.boxIdMap) this.boxIdMap.clear();
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
    this.selectedTimelineConnection = null;
    this.timelineSelected = false;
    this.timelineBarDragging = false;
    this.timelineActive = false;
    this.timelineStartDate = null;
    this.timelineDraggingResize = false;
    this.timelineDraggingLeftHandle = false;
    this.timelineDragStartDayIndices = null;

    // Load boxes with error handling
    // Use safe iteration utility if available
    if (Array.isArray(data.boxes)) {
      const loadBox = (boxData) => {
        if (!boxData) return;
        try {
          let box = TextBox.fromJSON(boxData);
          if (box) {
            this._registerBox(box);
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
            this._registerConnection(conn);
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

    // Load clusters with error handling (boxes must be loaded first)
    if (Array.isArray(data.clusters) && typeof Cluster !== 'undefined') {
      for (const clusterData of data.clusters) {
        if (!clusterData) continue;
        try {
          const cluster = Cluster.fromJSON(clusterData, this.boxes);
          if (cluster) this.clusters.push(cluster);
        } catch (e) {
          console.error('Failed to load cluster:', e);
        }
      }
    }

    // Restore Timeline Mode connections
    this.timelineConnections = [];
    this.selectedTimelineConnection = null;
    if (Array.isArray(data.timelineConnections)) {
      for (const tcData of data.timelineConnections) {
        if (!tcData) continue;
        try {
          const tc = TimelineConnection.fromJSON(tcData, this.boxIdMap, this);
          if (tc) this.timelineConnections.push(tc);
        } catch (e) {
          console.error('Failed to load timeline connection:', e);
        }
      }
    }
    // Restore persisted bar position and day count.
    // Legacy files without barX/barY default to (0, 0) so old maps still work.
    // Legacy files with timelineBarWidth are converted to timelineTotalDays.
    this.timelineBarX = (typeof data.timelineBarX === 'number') ? data.timelineBarX : 0;
    this.timelineBarY = (typeof data.timelineBarY === 'number') ? data.timelineBarY : 0;
    if (data.timelineTotalDays && typeof data.timelineTotalDays === 'number') {
      this.timelineTotalDays = data.timelineTotalDays;
    } else if (data.timelineBarWidth && typeof data.timelineBarWidth === 'number' && typeof TimelineMode !== 'undefined') {
      // Migrate legacy width to day count
      this.timelineTotalDays = Math.max(
        TimelineMode.MIN_TOTAL_DAYS,
        Math.round(data.timelineBarWidth / TimelineMode.DAY_WIDTH)
      );
    } else {
      this.timelineTotalDays = null; // will use DEFAULT_TOTAL_DAYS
    }
    this.timelineBarWidth = null; // no longer used

    // Restore timeline active state and start date.
    // timelineStartDate is persisted so that day-index labels show the same
    // calendar dates across reloads rather than shifting to "today".
    this.timelineActive = data.timelineActive === true;
    if (data.timelineStartDate) {
      const parsed = new Date(data.timelineStartDate);
      this.timelineStartDate = isNaN(parsed.getTime()) ? null : parsed;
    } else if (this.timelineActive) {
      // Fallback for maps saved before timelineStartDate was persisted.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      this.timelineStartDate = today;
    } else {
      this.timelineStartDate = null;
    }

    this.isDirty = true;

    // Sync loaded boxes, connections, and clusters to Yjs (for unified undo).
    // This ensures loaded data is tracked by UndoManager and visible to
    // collaborators who are already in the room when the file is loaded.
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
    if (MindMap.onClustersChange) {
      MindMap.onClustersChange();
    }
    if (MindMap.onTimelineConnectionsChange) {
      MindMap.onTimelineConnectionsChange();
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
  // CLUSTER MANAGEMENT
  // ============================================================================

  /**
   * Creates a new Cluster around the given boxes and registers it.
   * Requires at least 2 boxes; silently returns null otherwise.
   * @param {TextBox[]} boxes - Array of boxes to group
   * @returns {Cluster|null}
   */
  addCluster(boxes) {
    if (!boxes || boxes.length < 2) return null;
    if (typeof Cluster === 'undefined') return null;

    const cluster = new Cluster(boxes);
    if (!this.clusters) this.clusters = [];

    this._wrapInTransaction(() => {
      this.clusters.push(cluster);
      this.isSaved = false;
      if (MindMap.onClustersChange) MindMap.onClustersChange(true);
    });

    return cluster;
  }

  /**
   * Removes a cluster without affecting its member boxes.
   * Wraps in a transaction (like addCluster) so deletion is always tracked for undo
   * whether called standalone or from within another transaction.
   * @param {Cluster} cluster
   */
  deleteCluster(cluster) {
    if (!cluster || !this.clusters) return;
    const idx = this.clusters.indexOf(cluster);
    if (idx === -1) return;

    this._wrapInTransaction(() => {
      this.clusters.splice(idx, 1);
      this.isSaved = false;
      if (MindMap.onClustersChange) MindMap.onClustersChange(true);
    });

    if (this.selectedCluster === cluster) {
      this.selectedCluster = null;
    }
  }

  /**
   * Returns the first cluster that contains the given box, or null.
   * @param {TextBox} box
   * @returns {Cluster|null}
   */
  getClusterForBox(box) {
    if (!box || !this.clusters) return null;
    return this.clusters.find(c => c && c.containsBox(box)) || null;
  }

  /**
   * Snapshots the convex hull of every cluster that has at least one member
   * currently being dragged.  The snapshot is stored as
   * `cluster._dragStartHull` so that {@link Cluster#isBoxFarOutside} can
   * measure the removal threshold against the *pre-drag* cluster boundary
   * rather than the live (deformed) hull.
   *
   * Must be called immediately after `box.startDrag()` in
   * `handleMousePressed`, before any movement has occurred.
   * @private
   */
  _captureDragStartClusterSnapshots() {
    if (!this.clusters || this.clusters.length === 0) return;

    const draggingBoxes = this.boxes ? this.boxes.filter(b => b && b.isDragging) : [];

    for (const cluster of this.clusters) {
      if (!cluster) continue;
      const hasDraggingMember = draggingBoxes.some(b => cluster.containsBox(b));
      if (hasDraggingMember) {
        // Ensure geometry is fresh before snapshotting
        if (cluster._isGeometryDirty()) cluster._refreshGeometry();
        cluster._dragStartHull = cluster._hullCache ? [...cluster._hullCache] : null;
      } else {
        cluster._dragStartHull = null;
      }
    }
  }

  /**
   * Updates the `dragAddHighlight` / `dragRemoveHighlight` flags on every
   * cluster while boxes are being dragged.  Called from `handleMouseDragged`.
   *
   * - `dragAddHighlight` → true when a non-member box is fully enclosed in
   *   the cluster's hull (signalling it would be added on release).
   * - `dragRemoveHighlight` → true when a member box is far enough outside
   *   the pre-drag hull snapshot used by {@link Cluster#isBoxFarOutside}
   *   (signalling it would be removed on release).
   *
   * @param {TextBox[]} draggingBoxes
   * @private
   */
  _updateClusterDragHighlights(draggingBoxes) {
    if (!this.clusters || this.clusters.length === 0) return;

    // Reset all flags first
    for (const cluster of this.clusters) {
      if (!cluster) continue;
      cluster.dragAddHighlight    = false;
      cluster.dragRemoveHighlight = false;
    }

    if (!draggingBoxes || draggingBoxes.length === 0) return;

    const draggingSet = new Set(draggingBoxes);

    // Pre-compute which boxes already belong to at least one cluster.
    // A box that is already in another cluster cannot be drag-added (the
    // nowInCluster guard in _updateClusterMembership prevents it), so showing
    // dragAddHighlight for such a box would be a false visual cue.
    const boxesInAnyClusters = new Set();
    for (const c of this.clusters) {
      if (c) for (const b of c.boxes) boxesInAnyClusters.add(b);
    }

    for (const cluster of this.clusters) {
      if (!cluster) continue;

      // If every member of this cluster is currently being dragged, they are
      // moving together (the cluster is being moved) so we should NOT show
      // a removal highlight even if they are far from the original hull.
      const allMembersDragging = cluster.boxes.length > 0 &&
                                 cluster.boxes.every(b => draggingSet.has(b));

      for (const box of draggingBoxes) {
        if (cluster.containsBox(box)) {
          if (!allMembersDragging && cluster.isBoxFarOutside(box)) {
            cluster.dragRemoveHighlight = true;
          }
        } else if (!boxesInAnyClusters.has(box)) {
          // Only offer drag-add highlight for boxes that are free of all clusters.
          if (cluster.isBoxFullyEnclosed(box)) {
            cluster.dragAddHighlight = true;
          }
        }
      }
    }
  }

  /**
   * Clears `dragAddHighlight`, `dragRemoveHighlight`, and `_dragStartHull` on
   * every cluster.  Called from `handleMouseReleased` once drag-end processing
   * is complete.
   * @private
   */
  _clearClusterDragHighlights() {
    if (!this.clusters) return;
    for (const cluster of this.clusters) {
      if (!cluster) continue;
      cluster.dragAddHighlight    = false;
      cluster.dragRemoveHighlight = false;
      cluster._dragStartHull      = null;
    }
  }

  /**
   * Resolves cluster membership after a drag ends.
   *
   * For each dragged box:
   *  - If the box belongs to a cluster and, relative to the drag-start hull
   *    snapshot captured at drag begin (see `_dragStartHull`), is now far
   *    enough outside that hull, it is removed from that cluster.
   *  - If the box does not belong to any cluster and every one of its corners
   *    lies inside a cluster's hull, it is added to that cluster.
   *
   * Clusters that drop below two members are deleted.
   * The whole operation is wrapped in a single undo transaction and triggers
   * `MindMap.onClustersChange` if anything changed.
   *
   * @param {TextBox[]} draggedBoxes - Boxes whose positions may have changed
   * @private
   */
  _updateClusterMembership(draggedBoxes) {
    if (!this.clusters || !draggedBoxes || draggedBoxes.length === 0) return;

    let changed = false;

    this._wrapInTransaction(() => {
      // Pre-identify clusters that are being moved entirely (all members dragged).
      // These are immune to removal checks because they are moving with their boxes.
      const draggedSet = new Set(draggedBoxes);
      const clustersMovingEntirely = new Set();
      if (this.clusters) {
        for (const cluster of this.clusters) {
          if (cluster && cluster.boxes.length > 0 &&
              cluster.boxes.every(b => draggedSet.has(b))) {
            clustersMovingEntirely.add(cluster);
          }
        }
      }

      for (const box of draggedBoxes) {
        // ── Removal check ─────────────────────────────────────────────────
        for (const cluster of this.clusters) {
          if (!cluster) continue;
          if (cluster.containsBox(box)) {
            if (!clustersMovingEntirely.has(cluster) && cluster.isBoxFarOutside(box)) {
              cluster.removeBox(box);
              changed = true;
            }
          }
        }

        // ── Addition check ────────────────────────────────────────────────
        // Only consider adding if the box is not (or is no longer) in any cluster
        const nowInCluster = this.clusters.some(c => c && c.containsBox(box));
        if (!nowInCluster) {
          for (const cluster of this.clusters) {
            if (!cluster) continue;
            if (cluster.isBoxFullyEnclosed(box)) {
              cluster.addBox(box);
              changed = true;
              break; // add to the first matching cluster only
            }
          }
        }
      }

      if (changed) {
        // Prune clusters that no longer have at least two members
        const valid = this.clusters.filter(c => c && c.boxes.length >= 2);
        if (valid.length !== this.clusters.length) {
          if (this.selectedCluster && !valid.includes(this.selectedCluster)) {
            this.selectedCluster = null;
          }
          this.clusters = valid;
        }

        this.isSaved = false;
        if (MindMap.onClustersChange) MindMap.onClustersChange(true);
      }
    }, 'clusterMembership');

    if (changed) {
      if (typeof collaborationManager !== 'undefined' && collaborationManager) {
        collaborationManager.stopCapturing();
      }
    }
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
   * Clears all connection selections (normal and timeline)
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

    // Clear any selected timeline connection
    if (this.selectedTimelineConnection) {
      try { this.selectedTimelineConnection.selected = false; } catch (_) { }
      this.selectedTimelineConnection = null;
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
   * Gets the current storage key
   * @returns {string} The storage key
   */
  getStorageKey() {
    return this.storageKey;
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
// Expose MindMap globally for browser/test usage
if (typeof globalThis !== 'undefined') {
  globalThis.MindMap = MindMap;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MindMap;
}
if (typeof window !== 'undefined') {
  window.MindMap = MindMap;
}
