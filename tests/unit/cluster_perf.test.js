/**
 * @jest-environment jsdom
 *
 * Performance / stress tests for the Cluster feature.
 *
 * These tests:
 *  1. Verify that the geometry cache eliminates redundant recomputation on
 *     static frames (no box movement).
 *  2. Verify that the cache is correctly invalidated and recomputed when
 *     boxes move (as happens during drag).
 *  3. Measure throughput in a stress scenario with 50 overlapping clusters
 *     × 5 boxes each to confirm the hot path stays fast.
 *  4. Verify viewport culling skips off-screen clusters in MindMap.draw().
 */

global.Utils        = require('../../src/utils');
global.ColorPalette = require('../../src/ColorPalette');

// ── p5.js stubs ───────────────────────────────────────────────────────────────
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
global.curveVertex  = jest.fn();
global.CLOSE        = 2;
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
global.abs          = Math.abs;
global.lerp         = (a, b, t) => a + (b - a) * t;
global.keyIsDown    = jest.fn(() => false);
global.BACKSPACE    = 8;
global.DELETE       = 46;
global.LEFT_ARROW   = 37;
global.RIGHT_ARROW  = 39;
global.UP_ARROW     = 38;
global.DOWN_ARROW   = 40;
global.worldMouseX  = () => 0;
global.worldMouseY  = () => 0;
global.width        = 1280;
global.height       = 800;

const Cluster    = require('../../src/Cluster');
const TextBox    = require('../../src/TextBox');
const Connection = require('../../src/Connection');
const MindMap    = require('../../src/MindMap');

global.Cluster    = Cluster;
global.TextBox    = TextBox;
global.Connection = Connection;
global.MindMap    = MindMap;

// ── helpers ───────────────────────────────────────────────────────────────────

function makeBox(x, y, w = 120, h = 40) {
  const box = new TextBox(x, y, 'test');
  box.x = x; box.y = y;
  box.width = w; box.height = h;
  return box;
}

// Spy on _computeHullPoints and _catmullRomPoints to count recomputations.
// Each call = one cache miss (geometry was dirty and needed refresh).
function spyRecomputeCount(cluster) {
  let hullCount = 0;
  let splineCount = 0;
  const origRefresh = cluster._refreshGeometry.bind(cluster);
  cluster._refreshGeometry = function () {
    hullCount++;
    // _catmullRomPoints is called inside _refreshGeometry → count separately
    origRefresh();
    splineCount = hullCount; // refreshes always recompute both together
  };
  return { getHullCount: () => hullCount, getSplineCount: () => splineCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Geometry cache: no recomputation on static frames
// ─────────────────────────────────────────────────────────────────────────────

describe('Geometry cache — static frames', () => {
  beforeEach(() => {
    Cluster._nextColorIndex = 0;
    jest.clearAllMocks();
  });

  test('draw() recomputes geometry exactly once on the first call', () => {
    const b1 = makeBox(0,   0);
    const b2 = makeBox(200, 0);
    const cluster = new Cluster([b1, b2]);
    const spy = spyRecomputeCount(cluster);

    cluster.draw();

    expect(spy.getHullCount()).toBe(1);
  });

  test('draw() does NOT recompute geometry on subsequent calls when boxes are static', () => {
    const b1 = makeBox(0,   0);
    const b2 = makeBox(200, 0);
    const cluster = new Cluster([b1, b2]);
    const spy = spyRecomputeCount(cluster);

    // First draw seeds the cache
    cluster.draw();
    const after1 = spy.getHullCount();

    // 99 more draws with no box movement
    for (let i = 0; i < 99; i++) cluster.draw();

    expect(spy.getHullCount()).toBe(after1); // still just 1
  });

  test('contains() reuses the hull cache populated by draw()', () => {
    const b1 = makeBox(0,   0);
    const b2 = makeBox(200, 0);
    const cluster = new Cluster([b1, b2]);
    const spy = spyRecomputeCount(cluster);

    cluster.draw();           // seeds cache (1 recompute)
    cluster.contains(150, 0); // should NOT trigger another recompute

    expect(spy.getHullCount()).toBe(1);
  });

  test('getBounds() reuses the cache populated by draw()', () => {
    const b1 = makeBox(0,   0);
    const b2 = makeBox(200, 0);
    const cluster = new Cluster([b1, b2]);
    const spy = spyRecomputeCount(cluster);

    cluster.draw();
    cluster.getBounds();
    cluster.getBounds();

    expect(spy.getHullCount()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Geometry cache: invalidation on box movement
// ─────────────────────────────────────────────────────────────────────────────

describe('Geometry cache — invalidation on box movement', () => {
  beforeEach(() => {
    Cluster._nextColorIndex = 0;
    jest.clearAllMocks();
  });

  test('cache is invalidated when a member box moves', () => {
    const b1 = makeBox(0,   0);
    const b2 = makeBox(200, 0);
    const cluster = new Cluster([b1, b2]);
    const spy = spyRecomputeCount(cluster);

    cluster.draw();              // 1st recompute
    b1.x = 50;                  // move box
    cluster.draw();              // must recompute again

    expect(spy.getHullCount()).toBe(2);
  });

  test('cache is invalidated when a member box is resized', () => {
    const b1 = makeBox(0,   0);
    const b2 = makeBox(200, 0);
    const cluster = new Cluster([b1, b2]);
    const spy = spyRecomputeCount(cluster);

    cluster.draw();
    b2.width = 300; // resize
    cluster.draw();

    expect(spy.getHullCount()).toBe(2);
  });

  test('cache is NOT invalidated on the frame after movement stops', () => {
    const b1 = makeBox(0,   0);
    const b2 = makeBox(200, 0);
    const cluster = new Cluster([b1, b2]);
    const spy = spyRecomputeCount(cluster);

    cluster.draw();   // 1 — initial
    b1.x = 50;
    cluster.draw();   // 2 — after move
    cluster.draw();   // 3? — no, boxes haven't moved again → still 2

    expect(spy.getHullCount()).toBe(2);
  });

  test('removeBox() invalidates the cache so the next draw recomputes', () => {
    const b1 = makeBox(0,   0);
    const b2 = makeBox(200, 0);
    const b3 = makeBox(400, 0);
    const cluster = new Cluster([b1, b2, b3]);
    const spy = spyRecomputeCount(cluster);

    cluster.draw();           // 1 — seeds cache for 3 boxes
    cluster.removeBox(b3);    // invalidates
    cluster.draw();           // 2 — recomputes for 2 boxes

    expect(spy.getHullCount()).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Stress test: 50 clusters × 5 boxes, many simulated static frames
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress test — 50 clusters, static frames', () => {
  let clusters;

  beforeAll(() => {
    Cluster._nextColorIndex = 0;
    jest.clearAllMocks();

    // Build 50 overlapping clusters, 5 boxes each.
    // Boxes are positioned so every cluster overlaps with its neighbours.
    clusters = [];
    for (let c = 0; c < 50; c++) {
      const cx = (c % 10) * 150;  // 10 columns, 150 px apart
      const cy = Math.floor(c / 10) * 120; // 5 rows, 120 px apart
      const boxes = [];
      for (let b = 0; b < 5; b++) {
        boxes.push(makeBox(cx + b * 40, cy, 120, 40));
      }
      clusters.push(new Cluster(boxes));
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('first frame seeds all geometry caches (50 recomputes)', () => {
    const spies = clusters.map(c => jest.spyOn(c, '_refreshGeometry'));

    for (const c of clusters) c.draw();

    const totalRecomputes = spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
    expect(totalRecomputes).toBe(50);
  });

  test('100 subsequent static frames produce zero recomputes', () => {
    // Caches are warm from the previous test; count any new recomputes
    const spies = clusters.map(c => jest.spyOn(c, '_refreshGeometry'));

    for (let frame = 0; frame < 100; frame++) {
      for (const c of clusters) c.draw();
    }

    const recomputes = spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
    expect(recomputes).toBe(0);
  });

  test('100 static frames — timing (opt-in strict check via CLUSTER_PERF_BENCHMARK=1)', () => {
    const start = Date.now();
    for (let frame = 0; frame < 100; frame++) {
      for (const c of clusters) c.draw();
    }
    const elapsed = Date.now() - start;
    if (process.env.CLUSTER_PERF_BENCHMARK === '1') {
      // Strict bound for controlled / profiling environments only.
      expect(elapsed).toBeLessThan(500);
    } else {
      // Default: sanity-check only; avoid flaky wall-clock assertions on CI.
      expect(elapsed).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Stress test: 50 clusters, all boxes moving every frame (worst case)
// ─────────────────────────────────────────────────────────────────────────────

describe('Stress test — 50 clusters, all boxes moving every frame', () => {
  let clusters;
  let allBoxes;

  beforeAll(() => {
    Cluster._nextColorIndex = 0;
    jest.clearAllMocks();

    clusters = [];
    allBoxes = [];
    for (let c = 0; c < 50; c++) {
      const cx = (c % 10) * 200;
      const cy = Math.floor(c / 10) * 150;
      const boxes = [];
      for (let b = 0; b < 5; b++) {
        const box = makeBox(cx + b * 40, cy, 120, 40);
        boxes.push(box);
        allBoxes.push(box);
      }
      clusters.push(new Cluster(boxes));
    }
  });

  test('60 frames of continuous movement — timing (opt-in strict check via CLUSTER_PERF_BENCHMARK=1)', () => {
    const start = Date.now();
    for (let frame = 0; frame < 60; frame++) {
      // Simulate every box moving slightly each frame (drag scenario)
      for (const box of allBoxes) {
        box.x += 0.5;
        box.y += 0.3;
      }
      for (const c of clusters) c.draw();
    }
    const elapsed = Date.now() - start;
    if (process.env.CLUSTER_PERF_BENCHMARK === '1') {
      // Strict bound for controlled / profiling environments only.
      expect(elapsed).toBeLessThan(500);
    } else {
      // Default: sanity-check only; avoid flaky wall-clock assertions on CI.
      expect(elapsed).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. AABB pre-filter in contains()
// ─────────────────────────────────────────────────────────────────────────────

describe('AABB pre-filter in contains()', () => {
  beforeEach(() => {
    Cluster._nextColorIndex = 0;
    jest.clearAllMocks();
  });

  test('rejects a point clearly outside AABB without touching hull test', () => {
    const b1 = makeBox(0,   0, 100, 50);
    const b2 = makeBox(200, 0, 100, 50);
    const cluster = new Cluster([b1, b2]);

    // Warm the cache
    cluster.draw();

    // Patch _isPointNearHullOutline to detect if it's called
    let hullTestCalled = false;
    const origFn = Cluster._isPointNearHullOutline;
    Cluster._isPointNearHullOutline = (...args) => {
      hullTestCalled = true;
      return origFn(...args);
    };

    try {
      const result = cluster.contains(10000, 10000); // far outside
      expect(result).toBe(false);
      expect(hullTestCalled).toBe(false); // AABB filter should have short-circuited
    } finally {
      Cluster._isPointNearHullOutline = origFn;
    }
  });

  test('does reach hull test for a point inside the AABB', () => {
    const b1 = makeBox(0,   0, 100, 50);
    const b2 = makeBox(200, 0, 100, 50);
    const cluster = new Cluster([b1, b2]);

    cluster.draw();

    let hullTestCalled = false;
    const origFn = Cluster._isPointNearHullOutline;
    Cluster._isPointNearHullOutline = (...args) => {
      hullTestCalled = true;
      return origFn(...args);
    };

    try {
      // Point near the top edge — inside AABB, should reach hull test
      cluster.contains(100, -50);
      expect(hullTestCalled).toBe(true);
    } finally {
      Cluster._isPointNearHullOutline = origFn;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Viewport culling in MindMap.draw()
// ─────────────────────────────────────────────────────────────────────────────

describe('Viewport culling in MindMap.draw()', () => {
  let mindMap;

  beforeEach(() => {
    Cluster._nextColorIndex = 0;
    jest.clearAllMocks();
    MindMap.onClustersChange = null;
    MindMap.onBoxChange      = null;
    MindMap.onBoxDelete      = null;
    MindMap.onConnectionsChange = null;
    global.collaborationManager = undefined;
    mindMap = new MindMap();
    mindMap.isDirty = true;
  });

  /**
   * Build a mock CameraUtils that makes everything outside the viewport.
   */
  function mockCameraOffscreen() {
    global.CameraUtils = {
      isBoxVisible: jest.fn(() => false),
      worldX: jest.fn((sx) => sx + 50000), // viewport world origin at 50000
      worldY: jest.fn((sy) => sy + 50000),
      zoom: 1, x: 0, y: 0,
    };
  }

  function mockCameraOnscreen() {
    global.CameraUtils = {
      isBoxVisible: jest.fn(() => true),
      worldX: jest.fn((sx) => sx),  // 1:1 mapping, origin at 0
      worldY: jest.fn((sy) => sy),
      zoom: 1, x: 0, y: 0,
    };
  }

  function restoreCamera() {
    delete global.CameraUtils;
  }

  test('cluster.draw() is skipped when cluster is entirely off-screen', () => {
    // Plain objects satisfy Cluster's box contract (x, y, width, height).
    const b1 = { x: 0, y: 0, width: 100, height: 40 };
    const b2 = { x: 200, y: 0, width: 100, height: 40 };
    const cluster = mindMap.addCluster([b1, b2]);
    expect(cluster).not.toBeNull();

    const drawSpy = jest.spyOn(cluster, 'draw');
    mockCameraOffscreen(); // viewport is at world (50000,50000) → cluster not visible
    try {
      mindMap.isDirty = true;
      mindMap.draw();
      expect(drawSpy).not.toHaveBeenCalled();
    } finally {
      restoreCamera();
    }
  });

  test('cluster.draw() is called when cluster is on-screen', () => {
    const b1 = { x: 100, y: 100, width: 100, height: 40 };
    const b2 = { x: 300, y: 100, width: 100, height: 40 };
    const cluster = mindMap.addCluster([b1, b2]);
    expect(cluster).not.toBeNull();

    const drawSpy = jest.spyOn(cluster, 'draw');
    mockCameraOnscreen();
    try {
      mindMap.isDirty = true;
      mindMap.draw();
      expect(drawSpy).toHaveBeenCalled();
    } finally {
      restoreCamera();
    }
  });
});
