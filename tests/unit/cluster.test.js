/**
 * @jest-environment jsdom
 *
 * Unit tests for the Cluster visual-grouping feature.
 *
 * Covers:
 * - Cluster creation (requires ≥ 2 boxes)
 * - Convex hull geometry
 * - Bounding box calculation
 * - containsBox / removeBox membership
 * - contains() hit-detection
 * - JSON serialization / deserialization round-trip
 * - MindMap.addCluster / deleteCluster integration
 * - Box deletion cleans up cluster membership
 * - Cluster is drawn before boxes in MindMap.draw()
 */

const fs   = require('fs');
const path = require('path');

// ============================================================================
// Bootstrap global dependencies (same pattern as collaboration.test.js)
// ============================================================================

global.Utils        = require('../../src/utils');
global.ColorPalette = require('../../src/ColorPalette');

// Stub p5.js drawing functions used by Cluster and MindMap
global.fill         = jest.fn();
global.noFill       = jest.fn();
global.stroke       = jest.fn();
global.noStroke     = jest.fn();
global.strokeWeight = jest.fn();
global.push         = jest.fn();
global.pop          = jest.fn();
global.beginShape   = jest.fn();
global.endShape     = jest.fn();
global.vertex       = jest.fn();
global.curveVertex  = jest.fn(); // kept as stub; no longer called by Cluster.draw()
global.CLOSE        = 2; // p5.js constant
global.rect         = jest.fn();
global.text         = jest.fn();
global.textSize     = jest.fn();
global.textWidth    = jest.fn((s) => (s ? s.length * 10 : 50));
global.textAlign    = jest.fn();
global.translate    = jest.fn();
global.cursor       = jest.fn();
global.line         = jest.fn();
global.circle       = jest.fn();
global.max          = Math.max;
global.min          = Math.min;
global.lerp         = (a, b, t) => a + (b - a) * t;
global.keyIsDown    = jest.fn(() => false);
global.BACKSPACE    = 8;
global.DELETE       = 46;
global.LEFT_ARROW   = 37;
global.RIGHT_ARROW  = 39;
global.UP_ARROW     = 38;
global.DOWN_ARROW   = 40;

// Provide a simple world-mouse stub so MindMap mouse handlers don't throw
global.worldMouseX = () => 0;
global.worldMouseY = () => 0;

// Load Cluster class
const Cluster = require('../../src/Cluster');
global.Cluster = Cluster;

// Load remaining classes
const TextBox   = require('../../src/TextBox');
const Connection = require('../../src/Connection');
const MindMap   = require('../../src/MindMap');

global.TextBox   = TextBox;
global.Connection = Connection;
global.MindMap   = MindMap;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Creates a minimal TextBox-like stub with the properties Cluster needs.
 */
function makeBox(x, y, w = 150, h = 40) {
  const box = new TextBox(x, y, 'test');
  box.x      = x;
  box.y      = y;
  box.width  = w;
  box.height = h;
  return box;
}

// ============================================================================
// Cluster class unit tests
// ============================================================================

describe('Cluster', () => {

  beforeEach(() => {
    // Reset the color-cycle counter so tests are deterministic
    Cluster._nextColorIndex = 0;
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  describe('constructor', () => {
    test('stores a copy of the boxes array', () => {
      const b1 = makeBox(0, 0);
      const b2 = makeBox(200, 0);
      const cluster = new Cluster([b1, b2]);

      expect(cluster.boxes).toHaveLength(2);
      expect(cluster.boxes).toContain(b1);
      expect(cluster.boxes).toContain(b2);
      // Stored as a copy, not the same reference
      expect(cluster.boxes).not.toBe([b1, b2]);
    });

    test('assigns a unique ID', () => {
      const b1 = makeBox(0, 0);
      const b2 = makeBox(100, 0);
      const c1 = new Cluster([b1, b2]);
      const c2 = new Cluster([b1, b2]);
      expect(c1.id).toBeTruthy();
      expect(c1.id).not.toBe(c2.id);
    });

    test('cycles through fill colors', () => {
      const boxes = [makeBox(0, 0), makeBox(100, 0)];
      const c0 = new Cluster(boxes);
      const c1 = new Cluster(boxes);
      expect(c0.colorIndex).toBe(0);
      expect(c1.colorIndex).toBe(1);
    });

    test('starts unselected', () => {
      const cluster = new Cluster([makeBox(0, 0), makeBox(100, 0)]);
      expect(cluster.selected).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  describe('getBounds()', () => {
    test('returns null for empty cluster', () => {
      const cluster = new Cluster([]);
      expect(cluster.getBounds()).toBeNull();
    });

    test('returns padded bounding box for two side-by-side boxes', () => {
      const P = Cluster.PADDING;
      const b1 = makeBox(0, 0, 100, 50);   // extends x: -50..50, y: -25..25
      const b2 = makeBox(200, 0, 100, 50); // extends x: 150..250, y: -25..25
      const cluster = new Cluster([b1, b2]);
      const bounds = cluster.getBounds();

      expect(bounds.left  ).toBe(-50  - P);
      expect(bounds.right ).toBe(250  + P);
      expect(bounds.top   ).toBe(-25  - P);
      expect(bounds.bottom).toBe(25   + P);
    });
  });

  // --------------------------------------------------------------------------
  describe('containsBox() / removeBox()', () => {
    test('containsBox returns true for a member box', () => {
      const b1 = makeBox(0, 0);
      const b2 = makeBox(100, 0);
      const cluster = new Cluster([b1, b2]);
      expect(cluster.containsBox(b1)).toBe(true);
    });

    test('containsBox returns false for a non-member', () => {
      const b1 = makeBox(0, 0);
      const b2 = makeBox(100, 0);
      const b3 = makeBox(300, 0);
      const cluster = new Cluster([b1, b2]);
      expect(cluster.containsBox(b3)).toBe(false);
    });

    test('removeBox removes a member', () => {
      const b1 = makeBox(0, 0);
      const b2 = makeBox(100, 0);
      const cluster = new Cluster([b1, b2]);
      cluster.removeBox(b1);
      expect(cluster.boxes).not.toContain(b1);
      expect(cluster.boxes).toHaveLength(1);
    });

    test('removeBox is a no-op for non-members', () => {
      const b1 = makeBox(0, 0);
      const b2 = makeBox(100, 0);
      const b3 = makeBox(300, 0);
      const cluster = new Cluster([b1, b2]);
      expect(() => cluster.removeBox(b3)).not.toThrow();
      expect(cluster.boxes).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  describe('addBox()', () => {
    test('adds a non-member box to the cluster', () => {
      const b1 = makeBox(0, 0);
      const b2 = makeBox(200, 0);
      const b3 = makeBox(100, 0);
      const cluster = new Cluster([b1, b2]);
      cluster.addBox(b3);
      expect(cluster.boxes).toContain(b3);
      expect(cluster.boxes).toHaveLength(3);
    });

    test('is a no-op when the box is already a member', () => {
      const b1 = makeBox(0, 0);
      const b2 = makeBox(200, 0);
      const cluster = new Cluster([b1, b2]);
      cluster.addBox(b1);
      expect(cluster.boxes).toHaveLength(2); // unchanged
    });

    test('forces a geometry cache refresh', () => {
      const b1 = makeBox(0, 0);
      const b2 = makeBox(200, 0);
      const b3 = makeBox(100, 0, 50, 50);
      const cluster = new Cluster([b1, b2]);
      // Warm up cache
      cluster.getBounds();
      expect(cluster._boxSnapshot).not.toBeNull();
      cluster.addBox(b3);
      expect(cluster._boxSnapshot).toBeNull(); // cache invalidated
    });

    test('is a no-op for null/undefined', () => {
      const b1 = makeBox(0, 0);
      const b2 = makeBox(200, 0);
      const cluster = new Cluster([b1, b2]);
      expect(() => cluster.addBox(null)).not.toThrow();
      expect(() => cluster.addBox(undefined)).not.toThrow();
      expect(cluster.boxes).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  describe('isBoxFullyEnclosed()', () => {
    // Two boxes 400 px apart create a wide cluster hull.
    // Hull corners (PADDING = 30):
    //   B1 (x=0, w=100, h=50): padded corners at (-80,-55) and (80,55)
    //   B2 (x=400, w=100, h=50): padded corners at (320,-55) and (480,55)
    //   Combined hull: rectangle from (-80,-55) to (480,55)

    test('returns true when all box corners are inside the hull', () => {
      const b1 = makeBox(  0, 0, 100, 50);
      const b2 = makeBox(400, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      // Small box at center, well within the hull
      const inner = makeBox(200, 0, 50, 20);
      expect(cluster.isBoxFullyEnclosed(inner)).toBe(true);
    });

    test('returns false when any corner is outside the hull', () => {
      const b1 = makeBox(  0, 0, 100, 50);
      const b2 = makeBox(400, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      // Box that extends far above (top edge at y = -200-30 = -230 < -55)
      const tall = makeBox(200, 0, 50, 500);
      expect(cluster.isBoxFullyEnclosed(tall)).toBe(false);
    });

    test('returns false when box is completely outside the hull', () => {
      const b1 = makeBox(  0, 0, 100, 50);
      const b2 = makeBox(400, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      const outside = makeBox(1000, 0, 50, 20);
      expect(cluster.isBoxFullyEnclosed(outside)).toBe(false);
    });

    test('returns false when cluster has no hull (empty boxes)', () => {
      const cluster = new Cluster([]);
      expect(cluster.isBoxFullyEnclosed(makeBox(0, 0, 50, 20))).toBe(false);
    });

    test('returns false for null input', () => {
      const b1 = makeBox(  0, 0, 100, 50);
      const b2 = makeBox(400, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      expect(cluster.isBoxFullyEnclosed(null)).toBe(false);
    });

    // ── AABB pre-check ───────────────────────────────────────────────────────
    // Verifies that the AABB rejection path fires correctly and that it does
    // not produce false negatives for boxes that genuinely fit inside the hull.

    test('AABB pre-check: returns false quickly when box extends beyond cluster bounds', () => {
      // Hull bounds: left=-80, right=480, top=-55, bottom=55
      // Box right edge at 480 + 1 = 481 > bounds.right → AABB reject
      const b1 = makeBox(  0, 0, 100, 50);
      const b2 = makeBox(400, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      // Box centred at x=460 with w=50 → right edge = 460+25 = 485 > 480
      const overEdge = makeBox(460, 0, 50, 20);
      expect(cluster.isBoxFullyEnclosed(overEdge)).toBe(false);
    });

    test('AABB pre-check: does not produce false negative for a box inside bounds', () => {
      const b1 = makeBox(  0, 0, 100, 50);
      const b2 = makeBox(400, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      // Box at (200, 0) with w=40, h=20 — all corners inside hull
      const inside = makeBox(200, 0, 40, 20);
      expect(cluster.isBoxFullyEnclosed(inside)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  describe('isBoxFarOutside()', () => {
    // Cluster: B1 at (0,0) w=100 h=50, B2 at (0,200) w=100 h=50
    // Hull spans from (-80,-55) to (80,255).
    // B1 centre at (0,0) — inside the hull.
    // With _dragStartHull set to this hull, B1 is "far outside" only when its
    // centre is more than REMOVAL_DISTANCE (80) px outside the hull boundary.

    function makeClusterWithSnapshot() {
      const b1 = makeBox(0,   0, 100, 50);
      const b2 = makeBox(0, 200, 100, 50);
      const cluster = new Cluster([b1, b2]);
      // Force geometry computation and take a snapshot as MindMap would
      if (cluster._isGeometryDirty()) cluster._refreshGeometry();
      cluster._dragStartHull = cluster._hullCache ? [...cluster._hullCache] : null;
      return { cluster, b1, b2 };
    }

    test('returns false when the member box is still inside the drag-start hull', () => {
      const { cluster, b1 } = makeClusterWithSnapshot();
      // b1 centre at (0,0) is inside the hull — not far outside
      expect(cluster.isBoxFarOutside(b1)).toBe(false);
    });

    test('returns true when the member box has moved past REMOVAL_DISTANCE outside the hull', () => {
      const { cluster, b1 } = makeClusterWithSnapshot();
      // Hull top edge at y = -55.  Moving b1 centre to y = -200 puts it
      // 145 px above the top edge, well beyond REMOVAL_DISTANCE (80).
      b1.y = -200;
      expect(cluster.isBoxFarOutside(b1)).toBe(true);
    });

    test('returns false when box is just outside hull but within REMOVAL_DISTANCE', () => {
      const { cluster, b1 } = makeClusterWithSnapshot();
      // Hull top edge at y = -55.  Move b1 centre to y = -100 (45 px outside).
      b1.y = -100;
      expect(cluster.isBoxFarOutside(b1)).toBe(false);
    });

    test('returns false for null input', () => {
      const { cluster } = makeClusterWithSnapshot();
      expect(cluster.isBoxFarOutside(null)).toBe(false);
    });

    test('returns false when no drag-start hull snapshot is set', () => {
      // Without a snapshot, isBoxFarOutside always returns false to avoid
      // incorrectly removing boxes that started far apart in the cluster.
      const b1 = makeBox(0, 0, 100, 50);
      const b2 = makeBox(0, 200, 100, 50);
      const cluster = new Cluster([b1, b2]);
      // _dragStartHull is null by default
      b1.x = 1000; // very far from b2, but no snapshot → conservative false
      expect(cluster.isBoxFarOutside(b1)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  describe('contains() hit-detection', () => {
    test('returns false for a point deep in the interior (outline-only selection)', () => {
      // Hull for two 100×50 boxes at x=0 and x=200, PADDING=30:
      // Rectangle from (-80,-55) to (280,55).
      // Centre (100,0) is 55px from the nearest (top/bottom) edge — well beyond
      // INNER_HIT_MARGIN (20px) — so it must NOT be selectable.
      const b1 = makeBox(0, 0, 100, 50);
      const b2 = makeBox(200, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      expect(cluster.contains(100, 0)).toBe(false);
    });

    test('returns true for a point near the inner edge of the hull', () => {
      // Hull top edge is at y = -55.  A point at y = -44 is 11px inside the top
      // edge — within INNER_HIT_MARGIN (20px) — so it IS selectable.
      const b1 = makeBox(0, 0, 100, 50);
      const b2 = makeBox(200, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      expect(cluster.contains(100, -44)).toBe(true);
    });

    test('returns false for a point well outside the bounds', () => {
      const b1 = makeBox(0, 0, 100, 50);
      const b2 = makeBox(200, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      expect(cluster.contains(1000, 1000)).toBe(false);
    });

    test('returns false when cluster has no boxes', () => {
      const cluster = new Cluster([]);
      expect(cluster.contains(0, 0)).toBe(false);
    });

    test('returns true for a point just outside the hull but within HIT_MARGIN', () => {
      // Two horizontally separated boxes.
      // The right boundary of the hull is at box2.x + box2.w/2 + PADDING
      // = 200 + 50 + 30 = 280.  A point at x=290 is 10px outside, which is
      // within HIT_MARGIN (20px).
      const b1 = makeBox(  0, 0, 100, 50);
      const b2 = makeBox(200, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      expect(cluster.contains(290, 0)).toBe(true);
    });

    test('returns false for a point beyond HIT_MARGIN outside the hull', () => {
      // 400 is 120px beyond the right edge (280) of the hull above.
      const b1 = makeBox(  0, 0, 100, 50);
      const b2 = makeBox(200, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      expect(cluster.contains(400, 0)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  describe('_convexHull()', () => {
    test('returns all points when fewer than 3 provided', () => {
      const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
      const hull = Cluster._convexHull(pts);
      expect(hull).toHaveLength(2);
    });

    test('returns correct hull for axis-aligned rectangle corners', () => {
      // 4 corners of a rectangle
      const pts = [
        { x:   0, y:   0 },
        { x: 100, y:   0 },
        { x: 100, y:  50 },
        { x:   0, y:  50 }
      ];
      const hull = Cluster._convexHull(pts);
      // Hull should contain all 4 corners (no interior points)
      expect(hull).toHaveLength(4);
    });

    test('interior point is excluded from the hull', () => {
      const pts = [
        { x:   0, y:   0 },
        { x: 100, y:   0 },
        { x: 100, y: 100 },
        { x:   0, y: 100 },
        { x:  50, y:  50 }  // interior
      ];
      const hull = Cluster._convexHull(pts);
      expect(hull).toHaveLength(4);
      const hullSet = hull.map(p => `${p.x},${p.y}`);
      expect(hullSet).not.toContain('50,50');
    });

    test('handles null/empty input gracefully', () => {
      expect(Cluster._convexHull(null)).toEqual([]);
      expect(Cluster._convexHull([])).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  describe('_catmullRomPoints()', () => {
    test('returns an empty array for fewer than 3 hull points', () => {
      expect(Cluster._catmullRomPoints([])).toHaveLength(0);
      expect(Cluster._catmullRomPoints([{ x: 0, y: 0 }])).toHaveLength(0);
      expect(Cluster._catmullRomPoints([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toHaveLength(0);
    });

    test('returns a non-empty array of points for a valid hull', () => {
      const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
      const result = Cluster._catmullRomPoints(pts);
      expect(result.length).toBeGreaterThan(0);
    });

    test('total point count is within adaptive-step bounds for a uniform hull', () => {
      // Square hull: 4 segments, each 100 px.
      // steps = ceil(100/15) = 7, clamped to [3,16] → 7 per segment, 8 pts each (step 0..7).
      const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
      const result = Cluster._catmullRomPoints(pts);
      const n = pts.length;
      const MIN_STEPS = 3, MAX_STEPS = 16;
      expect(result.length).toBeGreaterThanOrEqual(n * (MIN_STEPS + 1)); // +1 for inclusive endpoint
      expect(result.length).toBeLessThanOrEqual(n * (MAX_STEPS + 1));
    });

    test('total point count is within adaptive-step bounds for a non-uniform hull', () => {
      // Alternating long (800 px) and short (100 px) segments — the problematic
      // aspect ratio that triggered the horn artefact.
      const hull = [
        { x: -430, y: -50 }, // TL: long horizontal follows
        { x:  430, y: -50 }, // TR: short vertical follows
        { x:  430, y:  50 }, // BR: long horizontal follows
        { x: -430, y:  50 }, // BL: short vertical follows
      ];
      const result = Cluster._catmullRomPoints(hull);
      const n = hull.length;
      const MIN_STEPS = 3, MAX_STEPS = 16;
      expect(result.length).toBeGreaterThanOrEqual(n * (MIN_STEPS + 1));
      expect(result.length).toBeLessThanOrEqual(n * (MAX_STEPS + 1));
      // For this hull: long segs get ceil(860/15)=57→capped at 16, short segs get ceil(100/15)=7.
      // Expected total = 2*(16+1) + 2*(7+1) = 34 + 16 = 50
      expect(result.length).toBe(50);
    });

    test('first computed point equals the first hull point', () => {
      const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
      const result = Cluster._catmullRomPoints(pts);
      // At t = t1 (step=0 of segment 0), centripetal CR evaluates exactly to pts[0].
      expect(result[0].x).toBeCloseTo(pts[0].x, 5);
      expect(result[0].y).toBeCloseTo(pts[0].y, 5);
    });

    test('last computed point exactly equals first hull point (curve closes perfectly)', () => {
      const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
      const result = Cluster._catmullRomPoints(pts);
      const last = result[result.length - 1];
      // The endpoint of the last segment is hull[0] exactly (step = steps → t = t2 → p2 = hull[0]).
      expect(last.x).toBeCloseTo(pts[0].x, 5);
      expect(last.y).toBeCloseTo(pts[0].y, 5);
    });

    test('centripetal CR eliminates the large x-overshoot at short vertical edges (no horn)', () => {
      // Wide text box: hull is 860 px wide × 100 px tall (800w + 2×30 pad, 40h + 2×30 pad).
      // With uniform Catmull-Rom the short vertical segments overshoot by 107 px in x
      // (creating the visible horn).  Centripetal CR must reduce that to < 25 px.
      const P = 30, bw = 800, bh = 40;
      const hw = bw / 2 + P, hh = bh / 2 + P;
      // Hull in CCW order (as produced by _convexHull → Graham scan): TL, TR, BR, BL
      const hull = [
        { x: -hw, y: -hh }, // TL
        { x:  hw, y: -hh }, // TR
        { x:  hw, y:  hh }, // BR
        { x: -hw, y:  hh }, // BL
      ];
      const result = Cluster._catmullRomPoints(hull);
      const maxX = Math.max(...result.map(p => p.x));
      const minX = Math.min(...result.map(p => p.x));
      // Centripetal CR rounds corners smoothly; x-overshoot at the short right / left
      // vertical edges (which caused the visible horn) must be well below 25 px.
      // Uniform CR produced 107 px of x-overshoot here.
      const X_TOLERANCE = 25;
      expect(maxX).toBeLessThan(hw + X_TOLERANCE);
      expect(minX).toBeGreaterThan(-hw - X_TOLERANCE);
    });
  });

  // --------------------------------------------------------------------------
  describe('_isPointInExpandedHull()', () => {
    // Simple CCW square: (0,0), (100,0), (100,100), (0,100)
    // Note: Graham scan returns CCW, so for a square with bottom-left pivot the
    // CCW order is: bottom-left, bottom-right, top-right, top-left.
    const square = [
      { x:   0, y:   0 },
      { x: 100, y:   0 },
      { x: 100, y: 100 },
      { x:   0, y: 100 }
    ];

    test('returns true for a point clearly inside the hull', () => {
      expect(Cluster._isPointInExpandedHull(50, 50, square, 0)).toBe(true);
    });

    test('returns false for a point outside the hull with margin=0', () => {
      expect(Cluster._isPointInExpandedHull(110, 50, square, 0)).toBe(false);
    });

    test('returns true for a point just outside the hull but within margin', () => {
      // 105 is 5px outside the right edge (100); margin=10 → should be true
      expect(Cluster._isPointInExpandedHull(105, 50, square, 10)).toBe(true);
    });

    test('returns false for a point farther outside than the margin', () => {
      // 120 is 20px outside the right edge; margin=10 → should be false
      expect(Cluster._isPointInExpandedHull(120, 50, square, 10)).toBe(false);
    });

    // ── Sqrt-free implementation boundary checks ────────────────────────────
    // These verify the squared-comparison path produces the same answer as the
    // original sqrt+division path at the exact margin boundary.

    test('returns true for a point exactly on the margin boundary (margin=10)', () => {
      // Point at (110, 50) is exactly 10 px outside the right edge (x=100).
      // signedDist = -10 = -margin → the condition is signedDist >= -margin → true
      expect(Cluster._isPointInExpandedHull(110, 50, square, 10)).toBe(true);
    });

    test('returns false for a point one pixel past the margin boundary (margin=10)', () => {
      // Point at (111, 50) is 11 px outside the right edge — beyond margin=10.
      expect(Cluster._isPointInExpandedHull(111, 50, square, 10)).toBe(false);
    });

    test('handles a degenerate (zero-length) edge without throwing', () => {
      // A hull with two coincident points produces a degenerate edge.
      // The function must not divide by zero or throw.
      const degenerate = [
        { x: 0, y: 0 }, { x: 0, y: 0 }, // degenerate
        { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }
      ];
      expect(() => Cluster._isPointInExpandedHull(50, 50, degenerate, 0)).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  describe('draw()', () => {
    test('calls beginShape / vertex / endShape(CLOSE) when hull has ≥ 3 points', () => {
      const b1 = makeBox(  0, 0, 100, 50);
      const b2 = makeBox(200, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      cluster.draw();

      expect(global.beginShape).toHaveBeenCalled();
      expect(global.vertex).toHaveBeenCalled();
      // curveVertex must NOT be called (old approach caused artefacts)
      expect(global.curveVertex).not.toHaveBeenCalled();
      expect(global.endShape).toHaveBeenCalledWith(global.CLOSE);
    });

    test('does NOT draw when cluster has fewer than 3 hull points', () => {
      const cluster = new Cluster([]);
      cluster.draw();
      expect(global.beginShape).not.toHaveBeenCalled();
    });

    test('applies stroke when selected', () => {
      const b1 = makeBox(  0, 0, 100, 50);
      const b2 = makeBox(200, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      cluster.selected = true;
      cluster.draw();

      expect(global.stroke).toHaveBeenCalled();
      expect(global.strokeWeight).toHaveBeenCalledWith(Cluster.STROKE_WEIGHT_SELECTED);
    });

    test('calls noStroke when not selected', () => {
      const b1 = makeBox(  0, 0, 100, 50);
      const b2 = makeBox(200, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      cluster.selected = false;
      cluster.draw();

      expect(global.noStroke).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  describe('toJSON() / fromJSON()', () => {
    test('round-trip preserves id, colorIndex, and box membership', () => {
      const b1 = makeBox(  0, 0);
      const b2 = makeBox(200, 0);
      const original = new Cluster([b1, b2]);
      original.colorIndex = 3;

      const json = original.toJSON();
      expect(json.id).toBe(original.id);
      expect(json.colorIndex).toBe(3);
      expect(json.boxIds).toEqual([b1.id, b2.id]);

      const boxes = [b1, b2];
      const restored = Cluster.fromJSON(json, boxes);
      expect(restored).not.toBeNull();
      expect(restored.id).toBe(original.id);
      expect(restored.colorIndex).toBe(3);
      expect(restored.boxes).toHaveLength(2);
    });

    test('fromJSON returns null when data is missing or invalid', () => {
      expect(Cluster.fromJSON(null,        [])).toBeNull();
      expect(Cluster.fromJSON(undefined,   [])).toBeNull();
      expect(Cluster.fromJSON({},          [])).toBeNull();
      expect(Cluster.fromJSON({ boxIds: [] }, [])).toBeNull();
    });

    test('fromJSON returns null when fewer than 2 IDs resolve to boxes', () => {
      const b1 = makeBox(0, 0);
      // Only one box in the available pool
      const json = { id: 'x', colorIndex: 0, boxIds: [b1.id, 'missing-id'] };
      const result = Cluster.fromJSON(json, [b1]);
      expect(result).toBeNull();
    });

    test('toJSON excludes boxes without IDs', () => {
      const b1 = makeBox(0, 0);
      const b2 = makeBox(100, 0);
      b2.id = null; // strip ID
      const cluster = new Cluster([b1, b2]);
      const json = cluster.toJSON();
      // Only b1 (with valid ID) should appear
      expect(json.boxIds).toHaveLength(1);
      expect(json.boxIds[0]).toBe(b1.id);
    });

    test('fromJSON does not advance _nextColorIndex (no color-counter pollution)', () => {
      // Bug: every new Cluster() in the constructor increments _nextColorIndex.
      // fromJSON always overrides colorIndex with the stored value, so advancing
      // the counter is a side effect that skips palette entries for subsequent
      // user-created clusters.  The fix saves/restores the counter.
      const b1 = makeBox(0, 0);
      const b2 = makeBox(100, 0);
      const c = new Cluster([b1, b2]);
      c.colorIndex = 4;
      const json = c.toJSON();

      const before = Cluster._nextColorIndex;
      Cluster.fromJSON(json, [b1, b2]);
      expect(Cluster._nextColorIndex).toBe(before); // must not advance

      // Calling fromJSON multiple times (as _rebuildClustersFromYjs does) must
      // not change the counter.
      Cluster.fromJSON(json, [b1, b2]);
      Cluster.fromJSON(json, [b1, b2]);
      expect(Cluster._nextColorIndex).toBe(before);
    });

    test('new user-created cluster after fromJSON gets the correct color', () => {
      // Create two clusters so _nextColorIndex is at 2.
      const b1 = makeBox(0, 0);
      const b2 = makeBox(100, 0);
      const b3 = makeBox(200, 0);
      const b4 = makeBox(300, 0);
      const c1 = new Cluster([b1, b2]); // colorIndex 0, _next → 1
      const c2 = new Cluster([b3, b4]); // colorIndex 1, _next → 2

      // Deserialize c1 (simulates _rebuildClustersFromYjs)
      const json1 = c1.toJSON();
      Cluster.fromJSON(json1, [b1, b2]);

      // _nextColorIndex must still be 2, so the next new cluster gets 2.
      const c3 = new Cluster([b1, b3]);
      expect(c3.colorIndex).toBe(2);
    });
  });

});

// ============================================================================
// MindMap cluster integration tests
// ============================================================================

describe('MindMap cluster integration', () => {

  let mindMap;

  beforeEach(() => {
    Cluster._nextColorIndex = 0;
    jest.clearAllMocks();
    MindMap.onBoxChange         = null;
    MindMap.onBoxDelete         = null;
    MindMap.onConnectionsChange = null;
    mindMap = new MindMap();
  });

  function addBox(x, y) {
    const box = makeBox(x, y);
    mindMap._registerBox(box);
    return box;
  }

  // --------------------------------------------------------------------------
  describe('addCluster()', () => {
    test('creates a cluster with ≥ 2 boxes', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      const cluster = mindMap.addCluster([b1, b2]);

      expect(cluster).not.toBeNull();
      expect(mindMap.clusters).toHaveLength(1);
      expect(mindMap.clusters[0]).toBe(cluster);
    });

    test('returns null and does not add a cluster for < 2 boxes', () => {
      const b1 = addBox(0, 0);
      const result = mindMap.addCluster([b1]);

      expect(result).toBeNull();
      expect(mindMap.clusters).toHaveLength(0);
    });

    test('returns null for empty input', () => {
      expect(mindMap.addCluster([])).toBeNull();
      expect(mindMap.addCluster(null)).toBeNull();
    });

    test('marks the map as unsaved', () => {
      mindMap.isSaved = true;
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      mindMap.addCluster([b1, b2]);
      expect(mindMap.isSaved).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  describe('deleteCluster()', () => {
    test('removes the cluster from the clusters array', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      const cluster = mindMap.addCluster([b1, b2]);
      mindMap.deleteCluster(cluster);

      expect(mindMap.clusters).toHaveLength(0);
    });

    test('does NOT delete the member boxes', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      const cluster = mindMap.addCluster([b1, b2]);
      mindMap.deleteCluster(cluster);

      expect(mindMap.boxes).toContain(b1);
      expect(mindMap.boxes).toContain(b2);
    });

    test('clears selectedCluster when the selected cluster is deleted', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      const cluster = mindMap.addCluster([b1, b2]);
      mindMap.selectedCluster = cluster;
      mindMap.deleteCluster(cluster);

      expect(mindMap.selectedCluster).toBeNull();
    });

    test('is a no-op for a cluster that does not exist', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      mindMap.addCluster([b1, b2]);
      const ghost = new Cluster([b1, b2]);
      expect(() => mindMap.deleteCluster(ghost)).not.toThrow();
      expect(mindMap.clusters).toHaveLength(1); // original untouched
    });
  });

  // --------------------------------------------------------------------------
  describe('getClusterForBox()', () => {
    test('returns the cluster that contains the box', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      const cluster = mindMap.addCluster([b1, b2]);

      expect(mindMap.getClusterForBox(b1)).toBe(cluster);
    });

    test('returns null when box is not in any cluster', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      const b3 = addBox(400, 0);
      mindMap.addCluster([b1, b2]);

      expect(mindMap.getClusterForBox(b3)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  describe('box deletion cleans up clusters', () => {
    test('deletes a cluster when it drops to < 2 members', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      mindMap.addCluster([b1, b2]);

      // Deleting one box should drop the cluster to 1 member → pruned
      mindMap._performBoxDeletion([b1]);
      expect(mindMap.clusters).toHaveLength(0);
    });

    test('keeps a cluster when it still has ≥ 2 members after deletion', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      const b3 = addBox(400, 0);
      mindMap.addCluster([b1, b2, b3]);

      mindMap._performBoxDeletion([b1]);
      expect(mindMap.clusters).toHaveLength(1);
      expect(mindMap.clusters[0].boxes).not.toContain(b1);
      expect(mindMap.clusters[0].boxes).toHaveLength(2);
    });

    test('clears selectedCluster when it is pruned', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      const cluster = mindMap.addCluster([b1, b2]);
      mindMap.selectedCluster = cluster;

      mindMap._performBoxDeletion([b1]);
      expect(mindMap.selectedCluster).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  describe('toJSON() / fromJSON() round-trip', () => {
    test('serializes and restores clusters', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      mindMap.addCluster([b1, b2]);

      const json = mindMap.toJSON();
      expect(json.clusters).toHaveLength(1);
      expect(json.clusters[0].boxIds).toContain(b1.id);
      expect(json.clusters[0].boxIds).toContain(b2.id);

      const newMap = new MindMap();
      newMap.fromJSON(json);
      expect(newMap.clusters).toHaveLength(1);
      expect(newMap.clusters[0].boxes).toHaveLength(2);
    });

    test('fromJSON ignores clusters whose boxes cannot be resolved', () => {
      const json = {
        boxes: [],
        connections: [],
        clusters: [{ id: 'ghost', colorIndex: 0, boxIds: ['missing-a', 'missing-b'] }]
      };
      const newMap = new MindMap();
      newMap.fromJSON(json);
      // Cluster cannot be restored because the boxes are absent → skipped
      expect(newMap.clusters).toHaveLength(0);
    });

    test('fromJSON resets existing clusters on load', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      mindMap.addCluster([b1, b2]);

      // Load fresh empty data
      mindMap.fromJSON({ boxes: [], connections: [] });
      expect(mindMap.clusters).toHaveLength(0);
      expect(mindMap.selectedCluster).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  describe('onClustersChange callback (undo / collaboration integration)', () => {
    test('addCluster fires onClustersChange', () => {
      const callback = jest.fn();
      MindMap.onClustersChange = callback;

      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      mindMap.addCluster([b1, b2]);

      expect(callback).toHaveBeenCalledTimes(1);
      MindMap.onClustersChange = null;
    });

    test('deleteCluster fires onClustersChange', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      const cluster = mindMap.addCluster([b1, b2]);

      const callback = jest.fn();
      MindMap.onClustersChange = callback;
      mindMap.deleteCluster(cluster);

      expect(callback).toHaveBeenCalledTimes(1);
      MindMap.onClustersChange = null;
    });

    test('_performBoxDeletion fires onClustersChange when a cluster is pruned', () => {
      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      mindMap.addCluster([b1, b2]);

      const callback = jest.fn();
      MindMap.onClustersChange = callback;
      mindMap._performBoxDeletion([b1]);

      // onClustersChange must be called (cluster was pruned)
      expect(callback).toHaveBeenCalled();
      MindMap.onClustersChange = null;
    });

    test('_performBoxDeletion fires onClustersChange even when no clusters exist', () => {
      const b1 = addBox(  0, 0);
      const callback = jest.fn();
      MindMap.onClustersChange = callback;
      mindMap._performBoxDeletion([b1]);
      // Still fires (called unconditionally so Yjs state stays in sync)
      expect(callback).toHaveBeenCalled();
      MindMap.onClustersChange = null;
    });

    test('addCluster passes skipTransactionWrapper=true to the callback', () => {
      let receivedArg;
      MindMap.onClustersChange = (skip) => { receivedArg = skip; };

      const b1 = addBox(  0, 0);
      const b2 = addBox(200, 0);
      mindMap.addCluster([b1, b2]);

      expect(receivedArg).toBe(true);
      MindMap.onClustersChange = null;
    });
  });

  // --------------------------------------------------------------------------
  describe('_updateClusterMembership()', () => {
    // Cluster geometry reference:
    //   b1 at (0, 0) w=100 h=50:   padded corners (-80,-55) to (80,55)
    //   b2 at (0, 200) w=100 h=50: padded corners (-80,145) to (80,255)
    //   Combined hull: rectangle from (-80,-55) to (80,255)
    //
    // A 40×20 box centred at (0,100) has corners (-20,90),(20,90),(20,110),(-20,110)
    // — all inside the hull → isBoxFullyEnclosed returns true.

    function makeAndRegister(x, y, w, h) {
      const box = makeBox(x, y, w, h);
      mindMap._registerBox(box);
      return box;
    }

    test('adds a box to a cluster when it is fully enclosed', () => {
      const b1 = makeAndRegister(  0,   0, 100, 50);
      const b2 = makeAndRegister(  0, 200, 100, 50);
      const cluster = mindMap.addCluster([b1, b2]);

      // Small box that fits entirely inside the cluster hull
      const inner = makeAndRegister(0, 100, 40, 20);

      mindMap._updateClusterMembership([inner]);

      expect(cluster.containsBox(inner)).toBe(true);
    });

    test('does NOT add a box that is only partially inside the hull', () => {
      const b1 = makeAndRegister(  0,   0, 100, 50);
      const b2 = makeAndRegister(  0, 200, 100, 50);
      const cluster = mindMap.addCluster([b1, b2]);

      // Box that extends far beyond the hull boundary (hull right at x=80)
      const outside = makeAndRegister(0, 100, 500, 20);

      mindMap._updateClusterMembership([outside]);

      expect(cluster.containsBox(outside)).toBe(false);
    });

    test('removes a member box that is beyond REMOVAL_DISTANCE outside the drag-start hull', () => {
      const b1 = makeAndRegister(  0,   0, 100, 50);
      const b2 = makeAndRegister(  0, 200, 100, 50);
      const cluster = mindMap.addCluster([b1, b2]);

      // Snapshot the hull as MindMap would at drag-start (b1 at its original position)
      if (cluster._isGeometryDirty()) cluster._refreshGeometry();
      cluster._dragStartHull = cluster._hullCache ? [...cluster._hullCache] : null;

      // Move b1 far to the left — 1000 px outside the original boundary
      b1.x = -1000;

      mindMap._updateClusterMembership([b1]);

      expect(cluster.containsBox(b1)).toBe(false);
    });

    test('does NOT remove a member box that is still within REMOVAL_DISTANCE of the hull', () => {
      const b1 = makeAndRegister(  0,   0, 100, 50);
      const b2 = makeAndRegister(  0, 200, 100, 50);
      const cluster = mindMap.addCluster([b1, b2]);

      // Snapshot the hull (hull left edge at x=-80; REMOVAL_DISTANCE=80)
      if (cluster._isGeometryDirty()) cluster._refreshGeometry();
      cluster._dragStartHull = cluster._hullCache ? [...cluster._hullCache] : null;

      // Move b1 centre to x=-120 → 40 px outside the hull left edge (< REMOVAL_DISTANCE=80)
      b1.x = -120;

      mindMap._updateClusterMembership([b1]);

      expect(cluster.containsBox(b1)).toBe(true);
    });

    test('prunes cluster when it drops below 2 members after removal', () => {
      const b1 = makeAndRegister(  0,   0, 100, 50);
      const b2 = makeAndRegister(  0, 200, 100, 50);
      const cluster = mindMap.addCluster([b1, b2]);

      // Snapshot hull
      if (cluster._isGeometryDirty()) cluster._refreshGeometry();
      cluster._dragStartHull = cluster._hullCache ? [...cluster._hullCache] : null;
      
      // Move ONLY one box far away (simulates b1 being dragged out, b2 is static)
      b1.x = -2000;

      // Update for b1 only. Since b2 is NOT in this list, it's not dragging,
      // so the cluster is NOT "moving entirely".
      mindMap._updateClusterMembership([b1]);

      // b1 removed -> cluster has < 2 members (only b2) -> pruned
      expect(mindMap.clusters).toHaveLength(0);
    });

    test('does NOT prune cluster when all members are moved together', () => {
      const b1 = makeAndRegister(  0,   0, 100, 50);
      const b2 = makeAndRegister(  0, 200, 100, 50);
      const cluster = mindMap.addCluster([b1, b2]);

      // Snapshot hull and move both boxes far away
      if (cluster._isGeometryDirty()) cluster._refreshGeometry();
      cluster._dragStartHull = cluster._hullCache ? [...cluster._hullCache] : null;

      b1.x = -2000; b2.x = 2000;

      // Both boxes moved together -> cluster "moves entirely" with them
      mindMap._updateClusterMembership([b1, b2]);

      // Cluster is preserved
      expect(mindMap.clusters).toHaveLength(1);
      expect(cluster.boxes).toContain(b1);
      expect(cluster.boxes).toContain(b2);
    });

    test('fires onClustersChange when membership changes', () => {
      const b1 = makeAndRegister(  0,   0, 100, 50);
      const b2 = makeAndRegister(  0, 200, 100, 50);
      const cluster = mindMap.addCluster([b1, b2]);

      if (cluster._isGeometryDirty()) cluster._refreshGeometry();
      cluster._dragStartHull = cluster._hullCache ? [...cluster._hullCache] : null;
      b1.x = -2000;

      const callback = jest.fn();
      MindMap.onClustersChange = callback;
      mindMap._updateClusterMembership([b1]);

      expect(callback).toHaveBeenCalled();
      MindMap.onClustersChange = null;
    });

    test('is a no-op when there are no clusters', () => {
      const b1 = addBox(0, 0);
      expect(() => mindMap._updateClusterMembership([b1])).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  describe('_captureDragStartClusterSnapshots()', () => {
    test('snapshots the hull of a cluster whose member is dragging', () => {
      const b1 = makeBox(  0,   0, 100, 50); mindMap._registerBox(b1);
      const b2 = makeBox(  0, 200, 100, 50); mindMap._registerBox(b2);
      const cluster = mindMap.addCluster([b1, b2]);

      // Simulate b1 starting a drag
      b1.isDragging = true;

      mindMap._captureDragStartClusterSnapshots();

      expect(cluster._dragStartHull).not.toBeNull();
      expect(Array.isArray(cluster._dragStartHull)).toBe(true);
      expect(cluster._dragStartHull.length).toBeGreaterThanOrEqual(3);
    });

    test('sets _dragStartHull to null when no member is dragging', () => {
      const b1 = makeBox(  0,   0, 100, 50); mindMap._registerBox(b1);
      const b2 = makeBox(  0, 200, 100, 50); mindMap._registerBox(b2);
      const cluster = mindMap.addCluster([b1, b2]);

      // No box is dragging
      mindMap._captureDragStartClusterSnapshots();

      expect(cluster._dragStartHull).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  describe('_updateClusterDragHighlights()', () => {
    function makeAndRegister(x, y, w, h) {
      const box = makeBox(x, y, w, h);
      mindMap._registerBox(box);
      return box;
    }

    /** Sets _dragStartHull on every cluster that has a dragging member. */
    function snapshotHulls() {
      for (const c of mindMap.clusters) {
        if (c._isGeometryDirty()) c._refreshGeometry();
        c._dragStartHull = c._hullCache ? [...c._hullCache] : null;
      }
    }

    test('sets dragRemoveHighlight when a member box is far outside the snapshot hull', () => {
      const b1 = makeAndRegister(  0,   0, 100, 50);
      const b2 = makeAndRegister(  0, 200, 100, 50);
      const cluster = mindMap.addCluster([b1, b2]);
      snapshotHulls();

      b1.x = -2000; // far outside
      mindMap._updateClusterDragHighlights([b1]);

      expect(cluster.dragRemoveHighlight).toBe(true);
      expect(cluster.dragAddHighlight).toBe(false);
    });

    test('sets dragAddHighlight for a free box dragged fully inside a cluster', () => {
      const b1 = makeAndRegister(  0,   0, 100, 50);
      const b2 = makeAndRegister(  0, 200, 100, 50);
      const cluster = mindMap.addCluster([b1, b2]);

      // Small free box centred at (0,100) — fully inside the cluster hull.
      const free = makeAndRegister(0, 100, 40, 20);

      mindMap._updateClusterDragHighlights([free]);

      expect(cluster.dragAddHighlight).toBe(true);
      expect(cluster.dragRemoveHighlight).toBe(false);
    });

    test('does NOT set dragAddHighlight for a box that already belongs to another cluster', () => {
      // Cluster A: large, positioned so its hull covers (0..600, -60..260)
      const aLeft  = makeAndRegister(  0, 100, 100, 50);
      const aRight = makeAndRegister(600, 100, 100, 50);
      const clusterA = mindMap.addCluster([aLeft, aRight]);

      // Cluster B: small, positioned at the left side inside A's hull
      const bInner1 = makeAndRegister(100,  80, 60, 30);
      const bInner2 = makeAndRegister(100, 130, 60, 30);
      const clusterB = mindMap.addCluster([bInner1, bInner2]);

      // boxInA is a member of cluster A.  Geometrically its position sits
      // inside cluster B's hull so _isBoxFullyEnclosed would be true for B.
      const boxInA = makeAndRegister(100, 105, 40, 20);
      clusterA.addBox(boxInA);

      // Verify the test precondition: boxInA really is enclosed in B
      expect(clusterB.isBoxFullyEnclosed(boxInA)).toBe(true);

      mindMap._updateClusterDragHighlights([boxInA]);

      // B must NOT show add-highlight — the box is attached to A so no add
      // would happen on release, making a highlight a false cue.
      expect(clusterB.dragAddHighlight).toBe(false);
      // A should also not show remove-highlight (no snapshot → isBoxFarOutside=false)
      expect(clusterA.dragRemoveHighlight).toBe(false);
    });

    test('resets all flags to false when called with an empty box list', () => {
      const b1 = makeAndRegister(0,   0, 100, 50);
      const b2 = makeAndRegister(0, 200, 100, 50);
      const cluster = mindMap.addCluster([b1, b2]);
      cluster.dragAddHighlight    = true;
      cluster.dragRemoveHighlight = true;

      mindMap._updateClusterDragHighlights([]);

      expect(cluster.dragAddHighlight).toBe(false);
      expect(cluster.dragRemoveHighlight).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  describe('_clearClusterDragHighlights()', () => {
    test('resets all drag highlight flags and hull snapshots', () => {
      const b1 = makeBox(  0,   0, 100, 50); mindMap._registerBox(b1);
      const b2 = makeBox(  0, 200, 100, 50); mindMap._registerBox(b2);
      const cluster = mindMap.addCluster([b1, b2]);

      cluster.dragAddHighlight    = true;
      cluster.dragRemoveHighlight = true;
      cluster._dragStartHull      = [{ x: 0, y: 0 }];

      mindMap._clearClusterDragHighlights();

      expect(cluster.dragAddHighlight).toBe(false);
      expect(cluster.dragRemoveHighlight).toBe(false);
      expect(cluster._dragStartHull).toBeNull();
    });
  });

});
