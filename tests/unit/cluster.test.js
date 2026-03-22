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
  describe('contains() hit-detection', () => {
    test('returns true for a point inside the padded bounds', () => {
      const b1 = makeBox(0, 0, 100, 50);
      const b2 = makeBox(200, 0, 100, 50);
      const cluster = new Cluster([b1, b2]);
      // centre between the two boxes — inside the padded hull
      expect(cluster.contains(100, 0)).toBe(true);
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
    test('produces n * steps points for a closed polygon', () => {
      const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
      const steps = 10;
      const result = Cluster._catmullRomPoints(pts, steps);
      expect(result).toHaveLength(pts.length * steps); // 4 segments * 10 steps
    });

    test('first computed point equals the first hull point', () => {
      const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
      const result = Cluster._catmullRomPoints(pts, 10);
      // At t=0 of segment 0, Catmull-Rom evaluates to p1 = pts[0]
      expect(result[0].x).toBeCloseTo(pts[0].x, 5);
      expect(result[0].y).toBeCloseTo(pts[0].y, 5);
    });

    test('last computed point is close to the first (curve closes)', () => {
      const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
      const steps = 100;
      const result = Cluster._catmullRomPoints(pts, steps);
      const last = result[result.length - 1];
      // At t = (steps-1)/steps the Catmull-Rom evaluates very close to pts[0].
      // With 100 steps, the deviation is < 1 px, so use a 1-pixel tolerance.
      expect(Math.abs(last.x - pts[0].x)).toBeLessThan(1);
      expect(Math.abs(last.y - pts[0].y)).toBeLessThan(1);
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

});
