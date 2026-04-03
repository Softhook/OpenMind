/**
 * TimelineMode.js - Horizontal calendar timeline overlay for mind mapping.
 *
 * Follows the ExtensionBridge "ghost plugin" pattern used by ThrustGame:
 *   - Zero CPU overhead when inactive (static check + immediate return)
 *   - Lazily loaded on first Ctrl+K key press
 *
 * Keyboard shortcut : Ctrl+K – toggle Timeline Mode
 *
 * World-space placement:
 *   The bar lives at world coordinates (0, 0).  It is drawn INSIDE the camera
 *   transform (translate + scale) so it zooms and pans exactly like the rest of
 *   the mind-map content.  Text and stroke weights are divided by the current
 *   zoom so they stay a constant size on screen.
 *
 * Resizing:
 *   Drag the resize handle (semi-transparent grip at the right edge) left/right
 *   to shorten or lengthen the bar.
 *
 * Connections:
 *   Drag from a box connector dot and release over the timeline bar to attach
 *   the box to a day tick.  Connections are full Connection-look-alike arrows
 *   (TimelineConnection objects stored in mindMap.timelineConnections).
 *   Click a connection line to select it; press Delete/Backspace to remove it.
 *   All add/remove operations go through mindMap._wrapInTransaction() so they
 *   are tracked by the Yjs UndoManager and can be undone with Ctrl+Z.
 */

// ==============================================================================
// TimelineConnection – arrow from a TextBox to a calendar-bar day tick
// ==============================================================================
/**
 * Looks and behaves like a normal Connection but its "to" endpoint is a fixed
 * point on the timeline bar (the nearest top/bottom edge of the bar at the
 * day tick's world X coordinate).
 *
 * Stored in mindMap.timelineConnections (separate from mindMap.connections so
 * that MindMap's Yjs connection sync does not interfere).
 */
class TimelineConnection {
  /**
   * @param {TextBox} fromBox   – source box
   * @param {number}  dayIndex  – 0 … TimelineMode.TOTAL_DAYS-1
   */
  constructor(fromBox, dayIndex) {
    this.fromBox  = fromBox;
    this.dayIndex = dayIndex;
    this.selected = false;
  }

  // ---------------------------------------------------------------------------
  // Internal geometry helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the world-space attachment point on the bar.
   * Attaches to the top edge (y=0) when the box is above the bar mid-line,
   * otherwise to the bottom edge (y=BAR_HEIGHT).
   * @returns {{x:number, y:number}|null}
   */
  _getTickPoint() {
    const inst = (typeof TimelineMode !== 'undefined') ? TimelineMode.instance : null;
    if (!inst || !this.fromBox) return null;
    const tx = inst._worldDayX(this.dayIndex);
    const ty = (this.fromBox.y < TimelineMode.BAR_HEIGHT / 2) ? 0 : TimelineMode.BAR_HEIGHT;
    return { x: tx, y: ty };
  }

  /**
   * Returns { start, end } world-space points (box edge → tick).
   * @returns {{start:{x,y}, end:{x,y}}|null}
   */
  _getEndpoints() {
    const tick = this._getTickPoint();
    if (!tick) return null;
    if (!this.fromBox || typeof this.fromBox.getConnectionPoint !== 'function') return null;
    const start = this.fromBox.getConnectionPoint(tick);
    if (!start || !isFinite(start.x) || !isFinite(start.y)) return null;
    return { start, end: tick };
  }

  // ---------------------------------------------------------------------------
  // Rendering  (called inside the camera transform – pure world space)
  // ---------------------------------------------------------------------------

  draw() {
    const ep = this._getEndpoints();
    if (!ep) return;
    const { start, end } = ep;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const angle     = Math.atan2(dy, dx);
    const arrowSize = 12;
    // Shortened line endpoint (stops where the arrowhead begins)
    const ex = end.x - arrowSize * Math.cos(angle);
    const ey = end.y - arrowSize * Math.sin(angle);

    // Reuse Connection's colour palette and weights when available
    const colors  = (typeof Connection !== 'undefined') ? Connection.COLORS  : null;
    const normalW = (typeof Connection !== 'undefined') ? Connection.STROKE_WEIGHT_NORMAL   : 2;
    const selectW = (typeof Connection !== 'undefined') ? Connection.STROKE_WEIGHT_SELECTED : 3;
    const col     = this.selected ? (colors ? colors.SELECTED : null) : (colors ? colors.NORMAL : null);
    const weight  = this.selected ? selectW : normalW;

    push();

    // Line
    if (col && typeof Utils !== 'undefined' && Utils.applyStroke) {
      Utils.applyStroke(col, weight);
    } else {
      stroke(this.selected ? 255 : 80, this.selected ? 140 : 100, this.selected ? 0 : 160);
      strokeWeight(weight);
    }
    noFill();
    line(start.x, start.y, ex, ey);

    // Arrowhead
    if (col && typeof Utils !== 'undefined' && Utils.applyFill) {
      Utils.applyFill(col);
    } else {
      fill(this.selected ? 255 : 80, this.selected ? 140 : 100, this.selected ? 0 : 160);
    }
    noStroke();
    push();
    translate(end.x, end.y);
    rotate(angle);
    triangle(0, 0, -arrowSize, -arrowSize / 2, -arrowSize, arrowSize / 2);
    pop();

    pop();
  }

  // ---------------------------------------------------------------------------
  // Hit testing  (world-space mouse coordinates via Utils)
  // ---------------------------------------------------------------------------

  isMouseOver() {
    const ep = this._getEndpoints();
    if (!ep) return false;
    if (typeof Utils === 'undefined') return false;
    const { x: mx, y: my } = Utils.getWorldMouseCoordinates();
    if (!Utils.areValidCoordinates(mx, my)) return false;

    const { start, end } = ep;
    const angle     = Math.atan2(end.y - start.y, end.x - start.x);
    const arrowSize = 12;
    const ex = end.x - arrowSize * Math.cos(angle);
    const ey = end.y - arrowSize * Math.sin(angle);
    const threshold = (typeof Connection !== 'undefined') ? Connection.HIT_THRESHOLD : 7;
    return Utils.distanceToSegment(mx, my, start.x, start.y, ex, ey) < threshold;
  }

  isMouseOverArrowHead() {
    const ep = this._getEndpoints();
    if (!ep) return false;
    if (typeof Utils === 'undefined') return false;
    const { x: mx, y: my } = Utils.getWorldMouseCoordinates();
    if (!Utils.areValidCoordinates(mx, my)) return false;

    const { end } = ep;
    const currentZoom = (typeof Utils.getCurrentZoom === 'function') ? Utils.getCurrentZoom() : 1;
    const safeZoom    = Math.max(0.25, Math.min(4, currentZoom));
    const hitRadius   = 10 / Math.sqrt(safeZoom);
    return Utils.distance(mx, my, end.x, end.y) <= hitRadius;
  }

  // ---------------------------------------------------------------------------
  // Serialisation
  // ---------------------------------------------------------------------------

  toJSON() {
    return {
      fromId:   this.fromBox ? this.fromBox.id : null,
      dayIndex: this.dayIndex,
    };
  }

  /**
   * Reconstruct a TimelineConnection from stored JSON.
   * @param {Object}              data        – {fromId, dayIndex}
   * @param {Map|Array<TextBox>}  boxesOrMap  – boxIdMap or boxes array
   * @returns {TimelineConnection|null}
   */
  static fromJSON(data, boxesOrMap) {
    if (!data || !data.fromId || data.dayIndex == null) return null;
    let fromBox = null;
    if (boxesOrMap instanceof Map) {
      fromBox = boxesOrMap.get(data.fromId);
    } else if (Array.isArray(boxesOrMap)) {
      fromBox = boxesOrMap.find(b => b && b.id === data.fromId);
    }
    if (!fromBox) return null;
    return new TimelineConnection(fromBox, data.dayIndex);
  }
}

// ==============================================================================
// TimelineMode – the main timeline-bar overlay controller
// ==============================================================================
class TimelineMode {
  // ============================================================================
  // STATIC CONSTANTS
  // ============================================================================

  /** Height of the calendar bar in world units */
  static BAR_HEIGHT = 80;
  /** Default bar width in world units */
  static DEFAULT_WIDTH = 3000;
  /** Minimum bar width in world units */
  static MIN_WIDTH = 400;
  /** Total days displayed (≈ 6 months) */
  static TOTAL_DAYS = 183;
  /** World-unit tolerance for click-hit detection around the bar edges */
  static HIT_EXTEND = 15;
  /** World-unit hit radius for the resize handle at the right edge */
  static HANDLE_RADIUS = 20;

  /** Tick heights measured from bar bottom edge (world units) */
  static MONTH_TICK_H = 56;
  static WEEK_TICK_H  = 32;
  static DAY_TICK_H   = 18;

  // ============================================================================
  // STATIC STATE
  // ============================================================================

  /** @type {TimelineMode|null} singleton instance */
  static instance = null;

  // ============================================================================
  // STATIC INTERFACE  (called from sketch.js)
  // ============================================================================

  /**
   * Main draw hook – called every frame from sketch.js INSIDE the camera
   * transform so the bar zooms/pans with the map.
   * Zero overhead when not loaded; near-zero when loaded-but-inactive.
   * @param {*} collaborationManager  – unused, passed for convention parity
   * @param {*} mindMap               – current MindMap instance
   */
  static loop(collaborationManager, mindMap) {
    if (!TimelineMode.instance || !TimelineMode.instance.active) return;
    TimelineMode.instance.mindMap = mindMap;
    TimelineMode.instance.draw();
  }

  /**
   * Keyboard handler.  Returns true if the event was consumed.
   * @param {string}  key     – p5.js `key` value
   * @param {number}  keyCode – p5.js `keyCode` value
   * @param {*}       mindMap
   * @param {Object}  options – { isCtrl }
   */
  static handleInput(key, keyCode, mindMap, options = {}) {
    const isCtrl = options.isCtrl ?? TimelineMode._isCtrlPressed();
    if ((key === 'k' || key === 'K') && isCtrl) {
      TimelineMode.toggle(mindMap);
      return true;
    }
    return false;
  }

  /** Portable ctrl-key detection (mirrors ThrustGame pattern) */
  static _isCtrlPressed() {
    try {
      if (typeof keyIsDown === 'function' && keyIsDown(17)) return true;
      if (typeof window !== 'undefined' && window.event && window.event.ctrlKey) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  /** Toggle Timeline Mode on/off */
  static toggle(mindMap) {
    if (!TimelineMode.instance) TimelineMode.instance = new TimelineMode(mindMap);
    TimelineMode.instance.mindMap = mindMap;
    // Restore persisted bar width if available
    if (mindMap && mindMap.timelineBarWidth) {
      TimelineMode.instance.barWorldWidth = mindMap.timelineBarWidth;
    }
    if (!TimelineMode.instance.active) {
      TimelineMode.instance.start();
    } else {
      TimelineMode.instance.stop();
    }
  }

  /**
   * Mouse-press handler – call from sketch.js mousePressed() BEFORE normal
   * mindMap handling.  Receives WORLD coordinates.
   * Returns true if the event was consumed (bar was clicked).
   * @param {number} worldX  – world-space mouse X (worldMouseX())
   * @param {number} worldY  – world-space mouse Y (worldMouseY())
   * @param {*}      mindMap
   */
  static handleMousePressed(worldX, worldY, mindMap) {
    if (!TimelineMode.instance || !TimelineMode.instance.active) return false;
    return TimelineMode.instance.handleMouseDown(worldX, worldY, mindMap);
  }

  /**
   * Mouse-drag handler – call from sketch.js mouseDragged().
   * Receives WORLD coordinates.
   * Returns true if the drag was consumed (resize in progress).
   * @param {number} worldX
   * @param {number} worldY
   */
  static handleMouseDragged(worldX, worldY) {
    if (!TimelineMode.instance || !TimelineMode.instance.active) return false;
    return TimelineMode.instance.handleDrag(worldX, worldY);
  }

  /**
   * Mouse-release handler – call from sketch.js mouseReleased().
   * Finalises a resize drag and persists the new width.
   */
  static handleMouseReleased() {
    if (!TimelineMode.instance) return;
    TimelineMode.instance.handleRelease();
  }

  /**
   * Called from sketch.js mouseReleased() when a connection drag ends over the
   * timeline bar.  Creates a TimelineConnection from the source box to the
   * nearest day tick via mindMap.addTimelineConnection() (undo-tracked).
   *
   * @param {number} worldX   – world-space mouse X where the drag ended
   * @param {number} worldY   – world-space mouse Y where the drag ended
   * @param {*}      fromBox  – TextBox that the connection was dragged from
   * @param {*}      mindMap  – current MindMap instance
   * @returns {boolean} true if a connection was created
   */
  static handleConnectionDropped(worldX, worldY, fromBox, mindMap) {
    const inst = TimelineMode.instance;
    if (!inst || !inst.active) return false;
    if (!inst._isOverBarWorld(worldX, worldY)) return false;
    if (!fromBox || !mindMap) return false;
    if (inst._isDragHandle(worldX, worldY)) return false; // don't create connection on handle

    const dayIndex = inst._dayFromWorldX(worldX);
    if (typeof mindMap.addTimelineConnection === 'function') {
      mindMap.addTimelineConnection(fromBox, dayIndex);
    } else {
      // Fallback when MindMap hasn't been updated yet
      if (!mindMap.timelineConnections) mindMap.timelineConnections = [];
      const exists = mindMap.timelineConnections.some(
        c => c.fromBox === fromBox && c.dayIndex === dayIndex
      );
      if (!exists) {
        mindMap.timelineConnections.push(new TimelineConnection(fromBox, dayIndex));
      }
    }
    return true;
  }

  // ============================================================================
  // EXPORT HELPER  (called from ExportManager inside push/translate context)
  // ============================================================================

  /**
   * Draw the timeline bar into a p5 graphics buffer.
   * Must be called INSIDE a pg.push() / pg.translate(contentOffX, contentOffY)
   * block so that world (0, 0) maps to the correct export-canvas position.
   * Text and stroke weights are drawn at world scale (zoom = 1 for exports).
   *
   * @param {p5.Graphics} pg      – offscreen graphics buffer
   * @param {*}           mindMap – used to resolve box positions
   */
  static drawToGraphics(pg, mindMap) {
    if (!TimelineMode.instance) return;
    const inst = TimelineMode.instance;
    const bw   = inst.barWorldWidth;
    const bh   = TimelineMode.BAR_HEIGHT;
    const conns = (mindMap && mindMap.timelineConnections) ? mindMap.timelineConnections : [];
    const highlightedDays = new Set(conns.map(c => c.dayIndex));

    // --- TimelineConnection arrows (drawn behind the bar so the bar sits on top) ---
    for (const conn of conns) {
      if (typeof conn.draw !== 'function') continue;
      // Temporarily swap drawing functions to draw into pg
      // We re-implement drawing here to use pg's methods directly
      const tick = conn._getTickPoint && conn._getTickPoint();
      if (!tick || !conn.fromBox || typeof conn.fromBox.getConnectionPoint !== 'function') continue;
      const start = conn.fromBox.getConnectionPoint(tick);
      if (!start || !isFinite(start.x) || !isFinite(start.y)) continue;

      const dx = tick.x - start.x;
      const dy = tick.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;

      const angle     = Math.atan2(dy, dx);
      const arrowSize = 12;
      const ex = tick.x - arrowSize * Math.cos(angle);
      const ey = tick.y - arrowSize * Math.sin(angle);

      pg.stroke(80, 100, 160);
      pg.strokeWeight(2);
      pg.noFill();
      pg.line(start.x, start.y, ex, ey);
      pg.fill(80, 100, 160);
      pg.noStroke();
      pg.push();
      pg.translate(tick.x, tick.y);
      pg.rotate(angle);
      pg.triangle(0, 0, -arrowSize, -arrowSize / 2, -arrowSize, arrowSize / 2);
      pg.pop();
    }

    // --- Bar background ---
    pg.noStroke();
    pg.fill(15, 20, 40, 210);
    pg.rect(0, 0, bw, bh);

    // --- Bar border ---
    pg.stroke(60, 80, 140, 180);
    pg.strokeWeight(1);
    pg.noFill();
    pg.rect(0, 0, bw, bh);

    // --- Gradations ---
    const totalDays = TimelineMode.TOTAL_DAYS;
    const dayWorldPx = bw / (totalDays - 1);
    const showDayNums  = dayWorldPx >= 14;
    const showWeekNums = dayWorldPx >= 4;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const startDate = inst.startDate || new Date();
    let currentMonth = -1;

    for (let d = 0; d < totalDays; d++) {
      const date = inst._dateForDay(d);
      const x   = inst._worldDayX(d);
      const dom = date.getDate();
      const mon = date.getMonth();
      const dow = date.getDay();
      const isHighlighted = highlightedDays.has(d);
      const isToday = d === 0;

      if (dom === 1 || mon !== currentMonth) {
        if (dom === 1 || d === 0) {
          currentMonth = mon;
          pg.noStroke();
          pg.fill(180, 200, 255, 220);
          pg.textSize(11);
          pg.textAlign(pg.LEFT, pg.TOP);
          pg.text(monthNames[mon] + ' ' + date.getFullYear(), x + 3, 3);
          pg.stroke(80, 100, 180, 200);
          pg.strokeWeight(1);
          pg.line(x, 0, x, bh);
          pg.noStroke();
        }
      }

      if (dow === 1 && showWeekNums) {
        pg.stroke(60, 90, 160, 160);
        pg.strokeWeight(1);
        pg.line(x, bh - TimelineMode.WEEK_TICK_H, x, bh);
        pg.noStroke();
        if (showDayNums) {
          pg.fill(140, 160, 220, 180);
          pg.textSize(9);
          pg.textAlign(pg.CENTER, pg.BOTTOM);
          pg.text('W' + inst._weekNumber(date), x, bh - TimelineMode.WEEK_TICK_H - 2);
        }
      }

      const dh = TimelineMode.DAY_TICK_H;
      if (isHighlighted) {
        pg.stroke(100, 200, 255, 255);
        pg.strokeWeight(2);
        pg.line(x, bh - dh * 1.5, x, bh);
        pg.fill(120, 210, 255, 255);
        pg.noStroke();
        pg.textSize(9);
        pg.textAlign(pg.CENTER, pg.BOTTOM);
        pg.text(dom, x, bh - dh * 1.5 - 2);
      } else {
        pg.stroke(50, 65, 120, 140);
        pg.strokeWeight(0.8);
        pg.line(x, bh - dh, x, bh);
        pg.noStroke();
        if (showDayNums) {
          pg.fill(100, 120, 180, 160);
          pg.textSize(8);
          pg.textAlign(pg.CENTER, pg.BOTTOM);
          pg.text(dom, x, bh - dh - 1);
        }
      }

      if (isToday) {
        pg.stroke(255, 220, 50, 240);
        pg.strokeWeight(2);
        pg.line(x, 0, x, bh);
        pg.fill(255, 220, 50, 240);
        pg.noStroke();
        pg.textSize(10);
        pg.textAlign(pg.CENTER, pg.TOP);
        pg.text('TODAY', x, 3);
      }
    }

    // --- Resize handle visual ---
    pg.fill(80, 120, 200, 180);
    pg.noStroke();
    pg.rect(bw - 6, bh * 0.25, 6, bh * 0.5, 3);
  }

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  /**
   * @param {*} mindMap – MindMap instance (may be null; set later on each loop)
   */
  constructor(mindMap = null) {
    this.mindMap        = mindMap;
    this.active         = false;
    this.startDate      = null;
    this.barWorldWidth  = TimelineMode.DEFAULT_WIDTH;

    // Resize-drag internal state
    this._draggingResize  = false;
    this._dragStartWorldX = 0;
    this._dragStartWidth  = 0;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  start() {
    this.active = true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.startDate = today;
    if (this.mindMap && !this.mindMap.timelineConnections) {
      this.mindMap.timelineConnections = [];
    }
  }

  stop() {
    this.active = false;
    this._draggingResize = false;
    // Soft connections remain stored on mindMap.timelineConnections.
  }

  // ============================================================================
  // GEOMETRY HELPERS  (world space)
  // ============================================================================

  /** World X of a given day tick */
  _worldDayX(dayIndex) {
    return (dayIndex / (TimelineMode.TOTAL_DAYS - 1)) * this.barWorldWidth;
  }

  /** Day index (0 … TOTAL_DAYS-1) from a world X coordinate */
  _dayFromWorldX(worldX) {
    const frac = Math.max(0, Math.min(1, worldX / this.barWorldWidth));
    return Math.round(frac * (TimelineMode.TOTAL_DAYS - 1));
  }

  /**
   * True when (worldX, worldY) is within the interactive hit area of the bar.
   * HIT_EXTEND provides a small tolerance around all four edges.
   */
  _isOverBarWorld(worldX, worldY) {
    const ext = TimelineMode.HIT_EXTEND;
    return worldX >= -ext &&
           worldX <= this.barWorldWidth + ext &&
           worldY >= -ext &&
           worldY <= TimelineMode.BAR_HEIGHT + ext;
  }

  /**
   * True when (worldX, worldY) is over the drag-resize handle at the right edge.
   * Uses HANDLE_RADIUS as a world-unit tolerance.
   */
  _isDragHandle(worldX, worldY) {
    const r = TimelineMode.HANDLE_RADIUS;
    return Math.abs(worldX - this.barWorldWidth) <= r &&
           worldY >= -r && worldY <= TimelineMode.BAR_HEIGHT + r;
  }

  /** Returns the Date corresponding to a given day index */
  _dateForDay(dayIndex) {
    const d = new Date(this.startDate);
    d.setDate(d.getDate() + dayIndex);
    return d;
  }

  /** Convenience: returns the soft-connections array from mindMap */
  _connections() {
    return (this.mindMap && this.mindMap.timelineConnections)
      ? this.mindMap.timelineConnections
      : [];
  }

  /** ISO week number */
  _weekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  // ============================================================================
  // INTERACTION
  // ============================================================================

  /**
   * Handle a mouse-press in world coordinates.
   * Only handles the resize handle; connection creation is handled by
   * TimelineMode.handleConnectionDropped() on mouse release.
   * Returns true if the event was consumed.
   */
  handleMouseDown(worldX, worldY, mindMap) {
    if (!this._isOverBarWorld(worldX, worldY)) return false;

    // Consume resize-handle presses
    if (this._isDragHandle(worldX, worldY)) {
      this._draggingResize  = true;
      this._dragStartWorldX = worldX;
      this._dragStartWidth  = this.barWorldWidth;
      return true;
    }

    // Clicks on the bar body (non-handle) are consumed to prevent the camera
    // from interpreting them as empty-canvas clicks (which would deselect boxes).
    return true;
  }

  /**
   * Handle a drag update in world coordinates.
   * Updates barWorldWidth while dragging the resize handle.
   * Returns true if consumed.
   */
  handleDrag(worldX, worldY) {
    if (!this._draggingResize) return false;
    const newWidth = this._dragStartWidth + (worldX - this._dragStartWorldX);
    this.barWorldWidth = Math.max(TimelineMode.MIN_WIDTH, newWidth);
    return true;
  }

  /**
   * Handle mouse-release: end resize drag and persist the new width.
   */
  handleRelease() {
    if (this._draggingResize && this.mindMap) {
      this.mindMap.timelineBarWidth = this.barWorldWidth;
    }
    this._draggingResize = false;
  }

  // ============================================================================
  // DRAWING  (called INSIDE camera transform — pure world-space)
  // ============================================================================

  draw() {
    if (!this.active || !this.startDate) return;

    const bw   = this.barWorldWidth;
    const bh   = TimelineMode.BAR_HEIGHT;
    const conns = this._connections();

    // Zoom compensation: keep strokes and text the same pixel size on screen
    const z     = typeof CameraUtils !== 'undefined' ? (CameraUtils.zoom || 1) : 1;
    const safeZ = Math.max(0.01, z);
    const sw    = 1 / safeZ;  // stroke weight for 1px on screen
    const ts    = 11 / safeZ; // base font size in screen-pixel equivalents

    push();

    // --- TimelineConnection arrows (drawn behind bar so bar sits on top) ---
    for (const conn of conns) {
      if (typeof conn.draw === 'function') {
        try { conn.draw(); } catch (e) { /* skip broken connection */ }
      }
    }

    // --- Bar background ---
    noStroke();
    fill(15, 20, 40, 210);
    rect(0, 0, bw, bh);

    // --- Bar border ---
    stroke(60, 80, 140, 180);
    strokeWeight(sw);
    noFill();
    rect(0, 0, bw, bh);

    // --- Gradations (ticks, labels) ---
    const highlightedDays = new Set(conns.map(c => c.dayIndex));
    this._drawGradations(bw, bh, highlightedDays, safeZ, sw, ts);

    // --- Snap preview: highlight nearest tick while dragging a connection ---
    this._drawConnectionDragPreview(bw, bh, safeZ, sw);

    // --- Resize handle ---
    this._drawResizeHandle(bw, bh, sw);

    // --- Hint label ---
    noStroke();
    fill(80, 100, 160, 160);
    textSize(9 / safeZ);
    textAlign(RIGHT, BOTTOM);
    text('Ctrl+K: exit timeline', bw - 6 / safeZ, bh - 3 / safeZ);

    pop();
  }

  /**
   * Draws a visual snap indicator on the nearest tick while a connection drag
   * is in progress (mindMap.connectingFrom is set and mouse is over the bar).
   * @private
   */
  _drawConnectionDragPreview(bw, bh, safeZ, sw) {
    if (!this.mindMap || !this.mindMap.connectingFrom) return;
    if (typeof worldMouseX === 'undefined' || typeof worldMouseY === 'undefined') return;

    const mx = worldMouseX();
    const my = worldMouseY();
    if (!this._isOverBarWorld(mx, my)) return;

    const dayIndex = this._dayFromWorldX(mx);
    const tx = this._worldDayX(dayIndex);
    const ty = (this.mindMap.connectingFrom.box && this.mindMap.connectingFrom.box.y < bh / 2) ? 0 : bh;

    // Highlight the snap tick
    stroke(100, 200, 255, 255);
    strokeWeight(2 * sw);
    noFill();
    const dh = TimelineMode.DAY_TICK_H;
    line(tx, ty === 0 ? 0 : bh - dh * 1.5, tx, ty === 0 ? dh * 1.5 : bh);

    // Snap dot
    noStroke();
    fill(100, 200, 255, 220);
    circle(tx, ty, 8 * sw);
  }

  _drawGradations(bw, bh, highlightedDays, safeZ, sw, ts) {
    const totalDays    = TimelineMode.TOTAL_DAYS;
    const dayWorldPx   = bw / (totalDays - 1);
    const showDayNums  = dayWorldPx * safeZ >= 14; // visible at ≥14 screen-px/day
    const showWeekNums = dayWorldPx * safeZ >= 4;
    const monthNames   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    let currentMonth = -1;

    for (let d = 0; d < totalDays; d++) {
      const date = this._dateForDay(d);
      const x   = this._worldDayX(d);
      const dom = date.getDate();
      const mon = date.getMonth();
      const dow = date.getDay();   // 0=Sun … 6=Sat
      const isHighlighted = highlightedDays.has(d);
      const isToday       = d === 0;

      // Month divider
      if (dom === 1 || mon !== currentMonth) {
        if (dom === 1 || d === 0) {
          currentMonth = mon;
          noStroke();
          fill(180, 200, 255, 220);
          textSize(ts);
          textAlign(LEFT, TOP);
          text(monthNames[mon] + ' ' + date.getFullYear(), x + 3 / safeZ, 3 / safeZ);
          stroke(80, 100, 180, 200);
          strokeWeight(sw);
          line(x, 0, x, bh);
          noStroke();
        }
      }

      // Week marker (Monday)
      if (dow === 1 && showWeekNums) {
        stroke(60, 90, 160, 160);
        strokeWeight(sw);
        line(x, bh - TimelineMode.WEEK_TICK_H, x, bh);
        noStroke();
        if (showDayNums) {
          fill(140, 160, 220, 180);
          textSize(9 / safeZ);
          textAlign(CENTER, BOTTOM);
          text('W' + this._weekNumber(date), x, bh - TimelineMode.WEEK_TICK_H - 2 / safeZ);
        }
      }

      // Day tick
      const dh = TimelineMode.DAY_TICK_H;
      if (isHighlighted) {
        stroke(100, 200, 255, 255);
        strokeWeight(2 * sw);
        line(x, bh - dh * 1.5, x, bh);
        noStroke();
        fill(120, 210, 255, 255);
        textSize(9 / safeZ);
        textAlign(CENTER, BOTTOM);
        text(dom, x, bh - dh * 1.5 - 2 / safeZ);
      } else {
        stroke(50, 65, 120, 140);
        strokeWeight(0.8 * sw);
        line(x, bh - dh, x, bh);
        noStroke();
        if (showDayNums) {
          fill(100, 120, 180, 160);
          textSize(8 / safeZ);
          textAlign(CENTER, BOTTOM);
          text(dom, x, bh - dh - 1 / safeZ);
        }
      }

      // TODAY marker
      if (isToday) {
        stroke(255, 220, 50, 240);
        strokeWeight(2 * sw);
        line(x, 0, x, bh);
        noStroke();
        fill(255, 220, 50, 240);
        textSize(10 / safeZ);
        textAlign(CENTER, TOP);
        text('TODAY', x, 3 / safeZ);
      }
    }
  }

  _drawResizeHandle(bw, bh, sw) {
    const hr  = bh * 0.5;  // handle height (half bar height)
    const hx  = bw;
    const hy  = bh / 2;
    const hw  = 5 * sw;   // handle width in world units

    // Grip background
    fill(80, 120, 200, 200);
    noStroke();
    rect(hx - hw, hy - hr / 2, hw, hr, 2 * sw);

    // Three grip dots
    fill(180, 210, 255, 220);
    for (let i = -1; i <= 1; i++) {
      circle(hx - hw / 2, hy + i * 5 * sw, 2.5 * sw);
    }
  }
}

// ==============================================================================
// MODULE EXPORT (for Jest / Node.js)
// ==============================================================================
if (typeof module !== 'undefined' && module.exports) module.exports = TimelineMode;

// Also expose TimelineConnection globally
if (typeof module !== 'undefined' && module.exports) module.exports.TimelineConnection = TimelineConnection;

// ==============================================================================
// BROWSER SELF-REGISTRATION
// ==============================================================================
/* istanbul ignore next */
if (typeof window !== 'undefined') {
  window.TimelineMode = TimelineMode;
  window.TimelineConnection = TimelineConnection;
}

