/**
 * Cluster.js
 *
 * A visual grouping element that sits behind a set of boxes.
 * It has no functional behaviour beyond acting as a coloured background
 * to visually associate boxes.
 *
 * Key Features:
 * - Organic curved shape drawn around a set of TextBox objects using a
 *   padded convex hull and Catmull-Rom splines (p5.js curveVertex)
 * - Dynamically updates as member boxes move (references are live)
 * - Can be selected and deleted independently (does not delete member boxes)
 * - Persisted via JSON serialization (box IDs are stored, resolved on load)
 *
 * Dependencies:
 * - p5.js for drawing (beginShape, curveVertex, endShape, fill, stroke, etc.)
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
   * outline (Catmull-Rom splines via p5.js curveVertex).
   * Call this before drawing connections and boxes.
   */
  draw() {
    const hull = this._getHullPoints();
    if (!hull || hull.length < 3) return;

    push();

    const c = this.color;
    fill(c.r, c.g, c.b, c.a);

    if (this.selected) {
      const sc = ColorPalette.CLUSTER.SELECTED_STROKE;
      stroke(sc.r, sc.g, sc.b, sc.a);
      strokeWeight(Cluster.STROKE_WEIGHT_SELECTED);
    } else {
      noStroke();
    }

    // Draw a closed Catmull-Rom curve through the hull points.
    // p5.js requires the last point before and the second point after the
    // sequence to act as control points for the start and end of the curve.
    beginShape();
    curveVertex(hull[hull.length - 1].x, hull[hull.length - 1].y); // control
    for (const pt of hull) {
      curveVertex(pt.x, pt.y);
    }
    curveVertex(hull[0].x, hull[0].y);      // wrap-around control
    curveVertex(hull[1].x, hull[1].y);      // wrap-around control
    endShape(CLOSE);

    pop();
  }

  // ============================================================================
  // HIT DETECTION
  // ============================================================================

  /**
   * Returns true if (x, y) falls within the cluster's padded bounding box.
   * Fast AABB check; sufficient because the visual shape is close to the AABB.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  contains(x, y) {
    const b = this.getBounds();
    if (!b) return false;
    return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  }

  // ============================================================================
  // BOUNDING BOX
  // ============================================================================

  /**
   * Returns the padded axis-aligned bounding box enclosing all member boxes.
   * @returns {{left:number, top:number, right:number, bottom:number}|null}
   */
  getBounds() {
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
    if (idx !== -1) this.boxes.splice(idx, 1);
  }

  // ============================================================================
  // GEOMETRY HELPERS
  // ============================================================================

  /**
   * Computes hull points for drawing: each member box contributes 4 expanded
   * corner points; the convex hull of all those points is returned.
   * @returns {{x:number, y:number}[]}
   * @private
   */
  _getHullPoints() {
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

    // Sort by polar angle from pivot; ties broken by distance (farther first)
    const rest = pts.slice(1).sort((a, b) => {
      const cross = Cluster._cross(pivot, a, b);
      if (cross !== 0) return -cross; // counter-clockwise order
      const da = (a.x - pivot.x) ** 2 + (a.y - pivot.y) ** 2;
      const db = (b.x - pivot.x) ** 2 + (b.y - pivot.y) ** 2;
      return db - da; // farther point first (eliminates collinear points naturally)
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
    const resolved = data.boxIds
      .map(id => (boxes || []).find(b => b && b.id === id))
      .filter(b => !!b);
    if (resolved.length < 2) return null;

    const cluster = new Cluster(resolved);
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
