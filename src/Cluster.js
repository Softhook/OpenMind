/**
 * Cluster.js
 *
 * A visual grouping element that sits behind a set of boxes.
 * It has no functional behaviour beyond acting as a coloured background
 * to visually associate boxes.
 *
 * Key Features:
 * - Organic curved shape drawn around a set of TextBox objects using a
 *   padded convex hull and Catmull-Rom splines (manual interpolation + vertex())
 * - Dynamically updates as member boxes move (references are live)
 * - Can be selected and deleted independently (does not delete member boxes)
 * - Persisted via JSON serialization (box IDs are stored, resolved on load)
 *
 * Dependencies:
 * - p5.js for drawing (beginShape, vertex, endShape, fill, stroke, etc.)
 * - Utils for UUID generation
 * - ColorPalette for cluster fill and stroke colors
 */
class Cluster {
  // ============================================================================
  // STATIC CONSTANTS
  // ============================================================================

  /** Padding (px) added around each box when computing the hull */
  static PADDING = 30;

  /** Stroke weight (px) when the cluster is selected */
  static STROKE_WEIGHT_SELECTED = 2;

  /**
   * Extra hit margin (px) outside the visible hull outline.
   * Adds a border zone so the organic edge is easy to click.
   */
  static HIT_MARGIN = 20;

  /**
   * Inner hit margin (px) inside the visible hull outline.
   * Only this ring around the border is selectable; the deep interior is not.
   */
  static INNER_HIT_MARGIN = 20;

  /**
   * Minimum distance (px) a member box must travel outside the cluster's
   * remaining-member hull before it is removed on drag-end.  Large enough
   * to prevent accidental removal during small adjustments.
   */
  static REMOVAL_DISTANCE = 80;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  /**
   * Creates a new Cluster from an array of TextBox objects.
   * @param {TextBox[]} boxes - Array of at least 2 TextBox references
   */
  constructor(boxes) {
    this.id = (typeof Utils !== 'undefined' && Utils.generateUUID)
      ? Utils.generateUUID()
      : `cluster-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.boxes = Array.isArray(boxes) ? [...boxes] : [];
    this.selected = false;

    // Assign the next available fill color from the palette
    this.colorIndex = Cluster._nextColorIndex;
    Cluster._nextColorIndex =
      (Cluster._nextColorIndex + 1) % ColorPalette.CLUSTER.FILLS.length;

    // ── Geometry cache ────────────────────────────────────────────────────
    // These are recomputed only when member boxes change position/size, not
    // on every frame.  A Float64Array snapshot of (x,y,w,h) per box is used
    // for a fast dirty check without heap allocation.
    /** @private */ this._boxSnapshot  = null; // Float64Array [x0,y0,w0,h0, ...]
    /** @private */ this._hullCache    = null; // {x,y}[] convex hull
    /** @private */ this._splineCache  = null; // {x,y}[] catmull-rom spline
    /** @private */ this._boundsCache  = null; // {left,top,right,bottom}

    // ── Drag-interaction state ────────────────────────────────────────────
    /** Set to true while a non-member box being dragged is fully inside this
     *  cluster's hull.  Cleared on mouse release. */
    this.dragAddHighlight    = false;
    /** Set to true while a member box being dragged is far enough outside
     *  the remaining cluster hull to trigger removal on release.
     *  Cleared on mouse release. */
    this.dragRemoveHighlight = false;
    /**
     * Snapshot of the hull points taken at the very start of a drag gesture,
     * before any member box has moved.  Used by {@link isBoxFarOutside} so
     * the removal threshold is measured relative to the cluster's *original*
     * visible boundary rather than the (deformed) live hull.
     * Set by MindMap._captureDragStartClusterSnapshots() and cleared by
     * MindMap._clearClusterDragHighlights().
     * @private
     */
    this._dragStartHull = null;
  }

  // ============================================================================
  // COLOR
  // ============================================================================

  /** Returns the fill color for this cluster. */
  get color() {
    const fills = ColorPalette.CLUSTER.FILLS;
    return fills[this.colorIndex % fills.length];
  }

  // ============================================================================
  // DRAWING
  // ============================================================================

  /**
   * Draws the cluster shape behind member boxes using a smooth convex-hull
   * outline.  The spline is computed manually (Catmull-Rom) so that each
   * segment is drawn with regular vertex() calls — this avoids the straight-
   * line artefact that p5.js curveVertex produces when closing a shape with
   * endShape(CLOSE).
   * Call this before drawing connections and boxes.
   */
  draw() {
    if (this._isGeometryDirty()) this._refreshGeometry();
    const hull = this._hullCache;
    if (!hull || hull.length < 3) return;

    push();

    const c = this.color;
    fill(c.r, c.g, c.b, c.a);

    if (this.dragRemoveHighlight) {
      const rc = ColorPalette.CLUSTER.DRAG_REMOVE_STROKE;
      stroke(rc.r, rc.g, rc.b, rc.a);
      strokeWeight(Cluster.STROKE_WEIGHT_SELECTED);
    } else if (this.dragAddHighlight) {
      const ac = ColorPalette.CLUSTER.DRAG_ADD_STROKE;
      stroke(ac.r, ac.g, ac.b, ac.a);
      strokeWeight(Cluster.STROKE_WEIGHT_SELECTED);
    } else if (this.selected) {
      const sc = ColorPalette.CLUSTER.SELECTED_STROKE;
      stroke(sc.r, sc.g, sc.b, sc.a);
      strokeWeight(Cluster.STROKE_WEIGHT_SELECTED);
    } else {
      noStroke();
    }

    // Use cached spline points — recomputed only when geometry is dirty.
    const splinePts = this._splineCache;
    if (!splinePts || splinePts.length === 0) { pop(); return; }
    beginShape();
    for (const pt of splinePts) {
      vertex(pt.x, pt.y);
    }
    endShape(CLOSE);

    pop();
  }

  /**
   * Draws this cluster into a p5.js graphics buffer (for off-screen rendering,
   * e.g. PNG export).  The logic mirrors draw() but uses pg.* methods instead
   * of global p5 functions.
   * @param {p5.Graphics} pg - A p5.js graphics buffer created with createGraphics()
   */
  drawToGraphics(pg) {
    if (this._isGeometryDirty()) this._refreshGeometry();
    const hull = this._hullCache;
    if (!hull || hull.length < 3) return;

    pg.push();

    const c = this.color;
    pg.fill(c.r, c.g, c.b, c.a);
    pg.noStroke();

    const splinePts = this._splineCache;
    if (!splinePts || splinePts.length === 0) { pg.pop(); return; }
    pg.beginShape();
    for (const pt of splinePts) {
      pg.vertex(pt.x, pt.y);
    }
    pg.endShape(CLOSE);

    pg.pop();
  }

  // ============================================================================
  // HIT DETECTION
  // ============================================================================

  /**
   * Returns true if (x, y) is within the border ring of the cluster hull —
   * i.e. within HIT_MARGIN pixels outside the outline OR within INNER_HIT_MARGIN
   * pixels inside it.  Points that lie deep in the interior are rejected so
   * that only the outline area is selectable.
   *
   * Uses a fast AABB pre-filter (cached bounds + margins) to reject obviously
   * out-of-range points without running the per-edge hull test.
   * Falls back to a padded AABB check when the hull is degenerate.
   *
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  contains(x, y) {
    if (this._isGeometryDirty()) this._refreshGeometry();
    const hull = this._hullCache;

    if (!hull || hull.length < 3) {
      const b = this._boundsCache;
      if (!b) return false;
      return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    }

    // Fast AABB pre-filter: reject clicks clearly outside the expanded bounds.
    const b = this._boundsCache;
    if (b) {
      const m = Cluster.HIT_MARGIN;
      if (x < b.left - m || x > b.right + m || y < b.top - m || y > b.bottom + m) {
        return false;
      }
    }

    return Cluster._isPointNearHullOutline(
      x, y, hull, Cluster.HIT_MARGIN, Cluster.INNER_HIT_MARGIN
    );
  }

  // ============================================================================
  // BOUNDING BOX
  // ============================================================================

  /**
   * Returns the padded axis-aligned bounding box enclosing all member boxes.
   * The result is cached and recomputed only when member box geometry changes.
   * @returns {{left:number, top:number, right:number, bottom:number}|null}
   */
  getBounds() {
    if (this._isGeometryDirty()) this._refreshGeometry();
    return this._boundsCache;
  }

  // ============================================================================
  // BOX MEMBERSHIP
  // ============================================================================

  /**
   * Returns true if this cluster contains the given box.
   * @param {TextBox} box
   * @returns {boolean}
   */
  containsBox(box) {
    return this.boxes.includes(box);
  }

  /**
   * Removes a box from this cluster.
   * @param {TextBox} box
   */
  removeBox(box) {
    const idx = this.boxes.indexOf(box);
    if (idx !== -1) {
      this.boxes.splice(idx, 1);
      this._boxSnapshot = null; // force geometry refresh
    }
  }

  /**
   * Adds a box to this cluster if it is not already a member.
   * Forces a geometry cache refresh so the hull/spline/bounds are recomputed
   * on the next draw call.
   * @param {TextBox} box
   */
  addBox(box) {
    if (!box || this.boxes.includes(box)) return;
    this.boxes.push(box);
    this._boxSnapshot = null; // force geometry refresh
  }

  /**
   * Returns true when every corner of `box` lies inside this cluster's current
   * convex hull.  Used during a drag to decide whether the box can be added.
   *
   * The hull is already padded by {@link Cluster.PADDING} around its member
   * boxes, so a dragged box only needs all four of its own corners (no extra
   * padding) to be strictly inside that region.
   *
   * @param {TextBox} box - The box to test (may or may not be a member)
   * @returns {boolean}
   */
  isBoxFullyEnclosed(box) {
    if (!box) return false;
    if (this._isGeometryDirty()) this._refreshGeometry();
    const hull = this._hullCache;
    if (!hull || hull.length < 3) return false;

    const hw = box.width  / 2;
    const hh = box.height / 2;
    return (
      Cluster._isPointInExpandedHull(box.x - hw, box.y - hh, hull, 0) &&
      Cluster._isPointInExpandedHull(box.x + hw, box.y - hh, hull, 0) &&
      Cluster._isPointInExpandedHull(box.x + hw, box.y + hh, hull, 0) &&
      Cluster._isPointInExpandedHull(box.x - hw, box.y + hh, hull, 0)
    );
  }

  /**
   * Returns true when a *member* box has been dragged far enough outside the
   * cluster that it should be removed on mouse release.
   *
   * Requires a pre-drag hull snapshot (`_dragStartHull`) to be set by
   * MindMap._captureDragStartClusterSnapshots() before the drag begins.
   * The removal threshold is measured relative to the cluster's *original*
   * visible boundary so that boxes which were already far apart when the
   * cluster was created do not get removed by small adjustments.
   *
   * Returns false (conservatively keeps the box) when no snapshot is present
   * (e.g. in unit tests that do not simulate the full drag lifecycle).
   *
   * @param {TextBox} box - A member box being tested for removal
   * @returns {boolean}
   */
  isBoxFarOutside(box) {
    if (!box) return false;

    const referenceHull = this._dragStartHull;
    if (!referenceHull || referenceHull.length < 3) return false;

    return !Cluster._isPointInExpandedHull(
      box.x, box.y, referenceHull, Cluster.REMOVAL_DISTANCE
    );
  }

  // ============================================================================
  // GEOMETRY HELPERS
  // ============================================================================

  // ── Geometry cache helpers ────────────────────────────────────────────────

  /**
   * Returns true if any member box has moved or resized since the last
   * geometry refresh.  Uses a compact Float64Array snapshot for the
   * comparison to avoid allocations on the hot path.
   * @returns {boolean}
   * @private
   */
  _isGeometryDirty() {
    const boxes = this.boxes;
    if (!boxes) return true;
    const n = boxes.length;
    const snap = this._boxSnapshot;
    if (!snap || snap.length !== n * 4) return true;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const b = boxes[i];
      if (!b) return true;
      if (snap[j] !== b.x || snap[j + 1] !== b.y ||
          snap[j + 2] !== b.width || snap[j + 3] !== b.height) return true;
    }
    return false;
  }

  /**
   * Recomputes the hull, spline, and AABB caches, then snapshots the current
   * box positions/sizes so subsequent calls to `_isGeometryDirty()` are cheap.
   * @private
   */
  _refreshGeometry() {
    const boxes = this.boxes;
    const n = boxes ? boxes.length : 0;

    // Update position snapshot
    if (!this._boxSnapshot || this._boxSnapshot.length !== n * 4) {
      this._boxSnapshot = new Float64Array(n * 4);
    }
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const b = boxes[i];
      if (b) {
        this._boxSnapshot[j]     = b.x;
        this._boxSnapshot[j + 1] = b.y;
        this._boxSnapshot[j + 2] = b.width;
        this._boxSnapshot[j + 3] = b.height;
      }
    }

    // Recompute hull and derived data
    const hull = this._computeHullPoints();
    this._hullCache   = hull;
    this._splineCache = (hull && hull.length >= 3)
      ? Cluster._catmullRomPoints(hull)
      : [];
    this._boundsCache = this._computeBounds();
  }

  /**
   * Computes hull points for drawing: each member box contributes 4 expanded
   * corner points; the convex hull of all those points is returned.
   * @returns {{x:number, y:number}[]}
   * @private
   */
  _computeHullPoints() {
    if (!this.boxes || this.boxes.length === 0) return [];
    const P = Cluster.PADDING;
    const points = [];
    for (const box of this.boxes) {
      if (!box) continue;
      const hw = box.width  / 2 + P;
      const hh = box.height / 2 + P;
      points.push({ x: box.x - hw, y: box.y - hh }); // top-left
      points.push({ x: box.x + hw, y: box.y - hh }); // top-right
      points.push({ x: box.x + hw, y: box.y + hh }); // bottom-right
      points.push({ x: box.x - hw, y: box.y + hh }); // bottom-left
    }
    return Cluster._convexHull(points);
  }

  /**
   * Computes the padded AABB directly from member boxes.
   * Called by `_refreshGeometry()` — use `getBounds()` for the cached version.
   * @returns {{left:number, top:number, right:number, bottom:number}|null}
   * @private
   */
  _computeBounds() {
    if (!this.boxes || this.boxes.length === 0) return null;
    const P = Cluster.PADDING;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const box of this.boxes) {
      if (!box) continue;
      left   = Math.min(left,   box.x - box.width  / 2);
      top    = Math.min(top,    box.y - box.height / 2);
      right  = Math.max(right,  box.x + box.width  / 2);
      bottom = Math.max(bottom, box.y + box.height / 2);
    }
    if (left === Infinity) return null;
    return { left: left - P, top: top - P, right: right + P, bottom: bottom + P };
  }

  /**
   * Returns the cached hull points, refreshing if geometry is stale.
   * @returns {{x:number, y:number}[]}
   * @private
   */
  _getHullPoints() {
    if (this._isGeometryDirty()) this._refreshGeometry();
    return this._hullCache || [];
  }

  /**
   * Graham-scan convex hull.  Returns points in counter-clockwise order.
   * @param {{x:number, y:number}[]} points
   * @returns {{x:number, y:number}[]}
   * @private
   */
  static _convexHull(points) {
    if (!points || points.length < 3) return points ? [...points] : [];

    // Find pivot: lowest y, then leftmost x
    let pivotIdx = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].y < points[pivotIdx].y ||
          (points[i].y === points[pivotIdx].y && points[i].x < points[pivotIdx].x)) {
        pivotIdx = i;
      }
    }

    const pts = [...points];
    [pts[0], pts[pivotIdx]] = [pts[pivotIdx], pts[0]];
    const pivot = pts[0];

    // Sort by polar angle from pivot; ties broken by distance (closer first so
    // the farthest collinear point is pushed last and survives the Graham scan)
    const rest = pts.slice(1).sort((a, b) => {
      const cross = Cluster._cross(pivot, a, b);
      if (cross !== 0) return -cross; // counter-clockwise order
      const da = (a.x - pivot.x) ** 2 + (a.y - pivot.y) ** 2;
      const db = (b.x - pivot.x) ** 2 + (b.y - pivot.y) ** 2;
      return da - db; // closer first: farthest collinear point is processed last and retained
    });

    // Graham scan
    const hull = [pivot, rest[0]];
    for (let i = 1; i < rest.length; i++) {
      while (hull.length > 1 &&
             Cluster._cross(hull[hull.length - 2], hull[hull.length - 1], rest[i]) <= 0) {
        hull.pop();
      }
      hull.push(rest[i]);
    }

    return hull;
  }

  /**
   * Cross product of vectors OA and OB.
   * Positive ⟹ B is counter-clockwise from A relative to O.
   * @private
   */
  static _cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  /**
   * Computes centripetal Catmull-Rom spline points for a closed polygon.
   *
   * Uses the centripetal parameterisation (α = 0.5) via the Barry-Goldman
   * recursive formula.  Unlike the uniform parameterisation (α = 0), the
   * centripetal variant is mathematically guaranteed to be loop-free and
   * cusp-free regardless of control-point spacing.  This eliminates the
   * "horn" artefacts that occurred when a long hull edge is adjacent to a
   * short one (e.g. a wide text box with a tall aspect ratio).
   *
   * Each segment emits `steps + 1` points (t = t1 … t2 inclusive) so the
   * endpoint of segment i exactly equals the start of segment i+1.  The last
   * point of the final segment is exactly hull[0], giving perfect closure
   * without relying on endShape(CLOSE) to bridge a visible gap.
   *
   * Step count is adaptive: one step per {@link PIXELS_PER_STEP} pixels of
   * chord length, clamped to [MIN_STEPS, MAX_STEPS].  This keeps the total
   * vertex count proportional to the visible curve length rather than the
   * number of hull edges, improving performance for large maps.
   *
   * @param {{x:number, y:number}[]} hull - Convex hull points (CCW order)
   * @returns {{x:number, y:number}[]}
   * @private
   */
  static _catmullRomPoints(hull) {
    const n = hull.length;
    if (n < 3) return [];

    const ALPHA         = 0.5;  // centripetal — prevents loops and cusps
    const MIN_STEPS     = 3;    // minimum interpolation steps per segment
    const MAX_STEPS     = 16;   // maximum interpolation steps per segment
    const PIXELS_PER_STEP = 15; // ~1 step per 15 px of chord length

    // Centripetal knot spacing: t_{k+1} = t_k + ||P_{k+1} - P_k||^alpha
    const chord = (a, b) =>
      Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));

    // Pre-compute chord lengths for all hull edges to avoid repeated sqrt calls
    // in the inner loop.  chords[i] = ||hull[i] - hull[(i-1+n)%n]||
    const chords = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      chords[i] = Math.max(chord(hull[(i - 1 + n) % n], hull[i]), 1e-10);
    }

    const pts = [];

    for (let i = 0; i < n; i++) {
      const p0 = hull[(i - 1 + n) % n];
      const p1 = hull[i];
      const p2 = hull[(i + 1) % n];
      const p3 = hull[(i + 2) % n];

      // Build the four non-uniform knot values for this segment using the
      // pre-computed chord lengths.  A tiny floor (1e-10, already applied
      // above) prevents division-by-zero if two hull points coincide.
      const t0 = 0;
      const t1 = t0 + Math.pow(chords[i],           ALPHA);
      const t2 = t1 + Math.pow(chords[(i + 1) % n], ALPHA);
      const t3 = t2 + Math.pow(chords[(i + 2) % n], ALPHA);

      // Adaptive step count proportional to this segment's chord length.
      const segLen = chords[(i + 1) % n];
      const steps  = Math.max(MIN_STEPS, Math.min(MAX_STEPS,
                       Math.ceil(segLen / PIXELS_PER_STEP)));

      // Emit steps + 1 points: t = t1 (= p1) up to and including t = t2 (= p2).
      // Including the endpoint means consecutive segments share the hull vertex
      // exactly, giving a perfectly closed curve.
      // Scalar temporaries are used throughout to avoid allocating intermediate
      // {x,y} objects on every step, which would create GC pressure in the
      // per-frame draw path when many clusters are visible.
      //
      // The chord pre-computation (chords[i] ≥ 1e-10) guarantees that all knot
      // intervals (t1-t0), (t2-t1), (t3-t2), and the level-2 spans (t2-t0) and
      // (t3-t1) are strictly positive, so none of the divisions below can
      // produce NaN or Infinity.
      for (let step = 0; step <= steps; step++) {
        const t = t1 + (t2 - t1) * (step / steps);

        // Barry-Goldman recursive linear interpolation (non-uniform de Boor),
        // implemented with scalar temporaries to avoid per-step object churn.
        const k01 = (t - t0) / (t1 - t0);
        const k12 = (t - t1) / (t2 - t1);
        const k23 = (t - t2) / (t3 - t2);

        // Level 1
        const A1x = p0.x + (p1.x - p0.x) * k01;
        const A1y = p0.y + (p1.y - p0.y) * k01;
        const A2x = p1.x + (p2.x - p1.x) * k12;
        const A2y = p1.y + (p2.y - p1.y) * k12;
        const A3x = p2.x + (p3.x - p2.x) * k23;
        const A3y = p2.y + (p3.y - p2.y) * k23;

        // Level 2
        const k02 = (t - t0) / (t2 - t0);
        const k13 = (t - t1) / (t3 - t1);
        const B1x = A1x + (A2x - A1x) * k02;
        const B1y = A1y + (A2y - A1y) * k02;
        const B2x = A2x + (A3x - A2x) * k13;
        const B2y = A2y + (A3y - A2y) * k13;

        // Level 3 — output point on the curve (reuses k12 = (t-t1)/(t2-t1))
        pts.push({ x: B1x + (B2x - B1x) * k12, y: B1y + (B2y - B1y) * k12 });
      }
    }

    return pts;
  }

  /**
   * Returns true if (x, y) is within the border ring of the convex hull —
   * within `outerMargin` pixels outside the outline OR within `innerMargin`
   * pixels inside it.  Points deeper than `innerMargin` inside every edge are
   * in the interior and return false.
   *
   * Algorithm:
   *  1. For each directed CCW edge a→b, compute the signed distance from (x,y)
   *     to the edge line (positive = inside / left side).
   *  2. If the signed distance is less than -outerMargin for any edge, the
   *     point is too far outside → false.
   *  3. Track the minimum signed distance across all edges.  If that minimum
   *     exceeds innerMargin the point is entirely inside the shrunken hull
   *     (deep interior) → false.
   *  4. Otherwise the point lies in the border ring → true.
   *
   * @param {number} x
   * @param {number} y
   * @param {{x:number, y:number}[]} hull - CCW convex hull points
   * @param {number} outerMargin - tolerance outside the hull
   * @param {number} innerMargin - tolerance inside the hull
   * @returns {boolean}
   * @private
   */
  static _isPointNearHullOutline(x, y, hull, outerMargin, innerMargin) {
    const n = hull.length;
    let minSignedDist = Infinity;
    for (let i = 0; i < n; i++) {
      const a  = hull[i];
      const b  = hull[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;
      // Signed distance: positive means left of a→b (inside for CCW hull)
      const signedDist = (dx * (y - a.y) - dy * (x - a.x)) / len;
      if (signedDist < -outerMargin) return false;
      if (signedDist < minSignedDist) minSignedDist = signedDist;
    }
    // Reject points that are more than innerMargin inside every edge (deep interior)
    return minSignedDist <= innerMargin;
  }

  /**
   * Returns true if (x, y) is within `margin` pixels of the interior of the
   * convex hull.  Hull points must be in counter-clockwise order.
   *
   * For each directed edge a→b the signed distance from (x, y) to the edge
   * line is computed (positive = inside / left side for a CCW polygon).  The
   * point is "within margin" of the hull when every signed distance is ≥ -margin,
   * i.e. it is at most `margin` pixels outside each edge.
   *
   * @param {number} x
   * @param {number} y
   * @param {{x:number, y:number}[]} hull
   * @param {number} margin - pixels of tolerance outside the hull
   * @returns {boolean}
   * @private
   */
  static _isPointInExpandedHull(x, y, hull, margin) {
    const n = hull.length;
    for (let i = 0; i < n; i++) {
      const a  = hull[i];
      const b  = hull[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;
      // Signed distance: positive means left of a→b (inside for CCW hull)
      const signedDist = (dx * (y - a.y) - dy * (x - a.x)) / len;
      if (signedDist < -margin) return false;
    }
    return true;
  }

  // ============================================================================
  // SERIALIZATION
  // ============================================================================

  /**
   * Serializes this cluster to a plain JSON-compatible object.
   * Box references are stored as IDs so they can be resolved on load.
   * @returns {{id:string, colorIndex:number, boxIds:string[]}}
   */
  toJSON() {
    return {
      id: this.id,
      colorIndex: this.colorIndex,
      boxIds: this.boxes.filter(b => b && b.id).map(b => b.id)
    };
  }

  /**
   * Deserializes a Cluster from JSON, resolving box IDs against a live array.
   * Returns null if the resolved box count is less than 2 (invalid cluster).
   * @param {Object} data - Serialized cluster data
   * @param {TextBox[]} boxes - Available TextBox instances to resolve IDs against
   * @returns {Cluster|null}
   */
  static fromJSON(data, boxes) {
    if (!data || !Array.isArray(data.boxIds)) return null;

    // Build a one-time id → box map for O(1) lookups per boxId instead of
    // O(boxes) linear scans, which matters when loading maps with many boxes.
    const boxArray = Array.isArray(boxes) ? boxes : [];
    const boxMap = new Map();
    for (const box of boxArray) {
      if (box && box.id) boxMap.set(box.id, box);
    }

    const resolved = data.boxIds.map(id => boxMap.get(id)).filter(b => !!b);
    if (resolved.length < 2) return null;

    // Preserve the shared color-cycle counter: the constructor advances it for
    // every `new Cluster()` call, but fromJSON always overrides colorIndex with
    // the stored value anyway.  Restoring the counter ensures that
    // deserialization (e.g. repeated _rebuildClustersFromYjs calls during
    // collaboration) does not cause subsequent user-created clusters to skip
    // palette entries.
    const savedColorIndex = Cluster._nextColorIndex;
    let cluster;
    try {
      cluster = new Cluster(resolved);
    } finally {
      Cluster._nextColorIndex = savedColorIndex;
    }

    if (data.id) cluster.id = data.id;
    if (typeof data.colorIndex === 'number') cluster.colorIndex = data.colorIndex;
    return cluster;
  }
}

// Shared color-cycle counter so successive clusters get different fills
Cluster._nextColorIndex = 0;

// Export for Node.js / Jest
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Cluster;
}
