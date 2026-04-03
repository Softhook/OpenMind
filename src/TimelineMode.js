/**
 * TimelineMode.js - Horizontal calendar timeline overlay for mind mapping.
 *
 * Fully integrated into MindMap — no more singleton/lazy-loading pattern.
 * All active state lives in the MindMap instance; this file provides:
 *   - TimelineConnection class (arrow from a TextBox to a calendar-bar day tick)
 *   - TimelineMode class with static constants + static utility/draw functions
 *
 * Keyboard shortcut : Ctrl+K – toggle Timeline Mode (handled in MindMap.toggleTimeline())
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
   * @param {*}       mindMap   – MindMap instance (for bar width lookup)
   */
  constructor(fromBox, dayIndex, mindMap = null) {
    this.fromBox  = fromBox;
    this.dayIndex = dayIndex;
    this.mindMap  = mindMap;
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
    const barWidth = this.mindMap ? this.mindMap.getTimelineBarWidth() : TimelineMode.DEFAULT_WIDTH;
    if (!this.fromBox) return null;
    const tx = TimelineMode.worldDayX(this.dayIndex, barWidth);
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
   * @param {*}                   mindMap     – MindMap instance (optional)
   * @returns {TimelineConnection|null}
   */
  static fromJSON(data, boxesOrMap, mindMap = null) {
    if (!data || !data.fromId || data.dayIndex == null) return null;
    let fromBox = null;
    if (boxesOrMap instanceof Map) {
      fromBox = boxesOrMap.get(data.fromId);
    } else if (Array.isArray(boxesOrMap)) {
      fromBox = boxesOrMap.find(b => b && b.id === data.fromId);
    }
    if (!fromBox) return null;
    return new TimelineConnection(fromBox, data.dayIndex, mindMap);
  }
}

// ==============================================================================
// TimelineMode – static constants and utility functions
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
  // STATIC GEOMETRY UTILITIES
  // ============================================================================

  /** World X of a given day tick */
  static worldDayX(dayIndex, barWidth) {
    return (dayIndex / (TimelineMode.TOTAL_DAYS - 1)) * barWidth;
  }

  /** Day index (0 … TOTAL_DAYS-1) from a world X coordinate */
  static dayFromWorldX(worldX, barWidth) {
    const frac = Math.max(0, Math.min(1, worldX / barWidth));
    return Math.round(frac * (TimelineMode.TOTAL_DAYS - 1));
  }

  /**
   * True when (worldX, worldY) is within the interactive hit area of the bar.
   * HIT_EXTEND provides a small tolerance around all four edges.
   */
  static isOverBarWorld(worldX, worldY, barWidth) {
    const ext = TimelineMode.HIT_EXTEND;
    return worldX >= -ext &&
           worldX <= barWidth + ext &&
           worldY >= -ext &&
           worldY <= TimelineMode.BAR_HEIGHT + ext;
  }

  /**
   * True when (worldX, worldY) is over the drag-resize handle at the right edge.
   * Uses HANDLE_RADIUS as a world-unit tolerance.
   */
  static isDragHandle(worldX, worldY, barWidth) {
    const r = TimelineMode.HANDLE_RADIUS;
    return Math.abs(worldX - barWidth) <= r &&
           worldY >= -r && worldY <= TimelineMode.BAR_HEIGHT + r;
  }

  /** Returns the Date corresponding to a given day index */
  static dateForDay(dayIndex, startDate) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayIndex);
    return d;
  }

  /** ISO week number */
  static weekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  // ============================================================================
  // STATIC DRAW METHODS
  // ============================================================================

  /**
   * Draw the full timeline bar for the live canvas.
   * Must be called INSIDE the camera transform (push/translate/scale already applied).
   * Reads all state from mindMap.
   *
   * @param {*} mindMap – current MindMap instance
   */
  static drawBar(mindMap) {
    if (!mindMap || !mindMap.timelineActive || !mindMap.timelineStartDate) return;

    const bw      = mindMap.getTimelineBarWidth();
    const bh      = TimelineMode.BAR_HEIGHT;
    const conns   = mindMap.timelineConnections || [];
    const startDate = mindMap.timelineStartDate;

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

    // --- Date labels above each connected box (world-space, outside bar) ---
    TimelineMode._drawBoxDateLabels(conns, startDate, bw, safeZ);

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
    TimelineMode._drawGradations(bw, bh, highlightedDays, safeZ, sw, ts, startDate);

    // --- Snap preview: highlight nearest tick while dragging a connection ---
    TimelineMode._drawConnectionDragPreview(bw, bh, safeZ, sw, mindMap);

    // --- Resize handle ---
    TimelineMode._drawResizeHandle(bw, bh, sw);

    // --- Hint label ---
    noStroke();
    fill(80, 100, 160, 160);
    textSize(9 / safeZ);
    textAlign(RIGHT, BOTTOM);
    text('Ctrl+K: exit timeline', bw - 6 / safeZ, bh - 3 / safeZ);

    pop();
  }

  /**
   * Draw the timeline bar into a p5 graphics buffer.
   * Must be called INSIDE a pg.push() / pg.translate(contentOffX, contentOffY)
   * block so that world (0, 0) maps to the correct export-canvas position.
   * Text and stroke weights are drawn at world scale (zoom = 1 for exports).
   *
   * @param {p5.Graphics} pg      – offscreen graphics buffer
   * @param {*}           mindMap – used to resolve box positions and bar width
   */
  static drawToGraphics(pg, mindMap) {
    if (!mindMap) return;
    const bw   = mindMap.getTimelineBarWidth ? mindMap.getTimelineBarWidth() : TimelineMode.DEFAULT_WIDTH;
    const bh   = TimelineMode.BAR_HEIGHT;
    const conns = (mindMap && mindMap.timelineConnections) ? mindMap.timelineConnections : [];
    const highlightedDays = new Set(conns.map(c => c.dayIndex));
    const startDate = (mindMap && mindMap.timelineStartDate) ? mindMap.timelineStartDate : new Date();

    // --- TimelineConnection arrows (drawn behind the bar so the bar sits on top) ---
    for (const conn of conns) {
      if (typeof conn.draw !== 'function') continue;
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
    let currentMonth = -1;

    for (let d = 0; d < totalDays; d++) {
      const date = TimelineMode.dateForDay(d, startDate);
      const x   = TimelineMode.worldDayX(d, bw);
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
          pg.text('W' + TimelineMode.weekNumber(date), x, bh - TimelineMode.WEEK_TICK_H - 2);
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
  // PRIVATE STATIC DRAW HELPERS
  // ============================================================================

  /** @private */
  static _drawConnectionDragPreview(bw, bh, safeZ, sw, mindMap) {
    if (!mindMap) return;
    if (typeof worldMouseX === 'undefined' || typeof worldMouseY === 'undefined') return;

    const mx = worldMouseX();
    const my = worldMouseY();

    // Determine which source box drives the snap (new connection OR timeline endpoint drag)
    let sourceBox = null;
    if (mindMap.connectingFrom) {
      sourceBox = mindMap.connectingFrom.box;
    } else if (mindMap.draggingTimelineConnection) {
      sourceBox = mindMap.draggingTimelineConnection.conn.fromBox;
    }
    if (!sourceBox) return;
    if (!TimelineMode.isOverBarWorld(mx, my, bw)) return;

    const dayIndex = TimelineMode.dayFromWorldX(mx, bw);
    const tx = TimelineMode.worldDayX(dayIndex, bw);
    const ty = (sourceBox.y < bh / 2) ? 0 : bh;

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

  /**
   * Draw a small date badge above the top-right corner of each box that has a
   * timeline connection.  Drawn outside (above) the bar so it always shows even
   * when the box is far from the bar.
   * @private
   */
  static _drawBoxDateLabels(conns, startDate, bw, safeZ) {
    if (!conns || conns.length === 0) return;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const fontSize = 9 / safeZ;
    const padding  = 3 / safeZ;

    for (const conn of conns) {
      if (!conn || !conn.fromBox || conn.dayIndex == null) continue;
      const box = conn.fromBox;
      if (box.x == null || box.y == null || box.width == null || box.height == null) continue;

      const date   = TimelineMode.dateForDay(conn.dayIndex, startDate);
      const label  = date.getDate() + ' ' + monthNames[date.getMonth()];

      // Position: top-right corner of the box, shifted up so it doesn't overlap the box outline.
      // box.x is the box centre, so box.x + box.width/2 is the right edge in world space.
      // lx is the left edge of the pill so that lx + labelW == right edge of box.
      textSize(fontSize);
      const labelW = textWidth(label) + padding * 2;
      const labelH = fontSize + padding * 2;
      const lx = box.x + box.width / 2 - labelW;  // pill right edge aligns with box right edge
      const ly = box.y - box.height / 2 - labelH - 2 / safeZ; // just above the box

      // Pill background
      noStroke();
      fill(conn.selected ? 255 : 80,
           conn.selected ? 140 : 140,
           conn.selected ? 0   : 220,
           210);
      rect(lx, ly, labelW, labelH, labelH / 2);

      // Label text
      fill(255, 255, 255, 245);
      noStroke();
      textAlign(CENTER, CENTER);
      text(label, lx + labelW / 2, ly + labelH / 2);
    }
  }

  /** @private */
  static _drawGradations(bw, bh, highlightedDays, safeZ, sw, ts, startDate) {
    const totalDays    = TimelineMode.TOTAL_DAYS;
    const dayWorldPx   = bw / (totalDays - 1);
    const showDayNums  = dayWorldPx * safeZ >= 14; // visible at ≥14 screen-px/day
    const showWeekNums = dayWorldPx * safeZ >= 4;
    const monthNames   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    let currentMonth = -1;

    for (let d = 0; d < totalDays; d++) {
      const date = TimelineMode.dateForDay(d, startDate);
      const x   = TimelineMode.worldDayX(d, bw);
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
          text('W' + TimelineMode.weekNumber(date), x, bh - TimelineMode.WEEK_TICK_H - 2 / safeZ);
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

  /** @private */
  static _drawResizeHandle(bw, bh, sw) {
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
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TimelineMode;
  module.exports.TimelineConnection = TimelineConnection;
}

// ==============================================================================
// BROWSER SELF-REGISTRATION
// ==============================================================================
/* istanbul ignore next */
if (typeof window !== 'undefined') {
  window.TimelineMode = TimelineMode;
  window.TimelineConnection = TimelineConnection;
}
