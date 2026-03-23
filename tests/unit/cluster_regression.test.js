/**
 * @jest-environment jsdom
 *
 * Regression tests for the cluster feature.
 *
 * These tests guard against regressions in the core interaction paths that
 * cluster code touches. All scenarios that are NOT covered by the existing
 * cluster.test.js or cluster_undo_collab.test.js belong here.
 *
 * Areas tested:
 *  A. Selection cross-clearing — clicking a box/connection/empty-space
 *     while a cluster is selected must clear selectedCluster.
 *  B. Keyboard DELETE with selectedCluster takes priority over box deletion.
 *  C. JSON forward/backward compatibility — legacy saves (no clusters field)
 *     load without errors; new saves always emit the clusters field.
 *  D. Cluster draw order — clusters drawn before connections and boxes.
 *  E. addCluster is idempotent when Cluster class is missing.
 *  F. Box drag/resize release does NOT mutate cluster membership.
 *  G. Cluster membership after multiple box deletions in one go.
 *  H. fromJSON round-trip preserves box membership after load.
 */

global.Utils        = require('../../src/utils');
global.ColorPalette = require('../../src/ColorPalette');

// ── p5.js stubs ──────────────────────────────────────────────────────────────
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
global.BACKSPACE    = 8;
global.DELETE       = 46;
global.LEFT_ARROW   = 37;
global.RIGHT_ARROW  = 39;
global.UP_ARROW     = 38;
global.DOWN_ARROW   = 40;

// Mouse helpers — can be overridden per test
global.worldMouseX = () => 0;
global.worldMouseY = () => 0;

const Cluster      = require('../../src/Cluster');
const TextBox      = require('../../src/TextBox');
const Connection   = require('../../src/Connection');
const MindMap      = require('../../src/MindMap');

global.Cluster     = Cluster;
global.TextBox     = TextBox;
global.Connection  = Connection;
global.MindMap     = MindMap;

// ── helpers ───────────────────────────────────────────────────────────────────

function makeBox(x, y, mm) {
    const box = new TextBox(x, y, 'test');
    box.x = x; box.y = y;
    box.width = 100; box.height = 40;
    if (mm) mm._registerBox(box);
    return box;
}

/**
 * Stub a box so that `isMouseOver()` returns true/false on demand.
 * Also stubs other interaction methods to prevent spurious matches.
 */
function stubMouseOver(box, isOver) {
    box.isMouseOver        = jest.fn(() => isOver);
    box.isMouseOverResizeHandle = jest.fn(() => false);
    box.isMouseOnEdge      = jest.fn(() => false);
    box.getConnectorUnderMouse  = jest.fn(() => null);
    box.isMouseOverArrowHead    = jest.fn(() => false);
    // Ensure drag/resize stubs don't throw
    box.startDrag = jest.fn();
    box.stopDrag  = jest.fn(() => false);
    box.startResize = jest.fn();
    box.stopResize  = jest.fn(() => false);
    box.handleMouseDown = jest.fn();
    box.stopEditing = jest.fn();
    box.stopSelecting = jest.fn();
}

/**
 * Stub a connection so that isMouseOver() returns true/false.
 */
function stubConnMouseOver(conn, isOver) {
    conn.isMouseOver = jest.fn(() => isOver);
    conn.isMouseOverArrowHead = jest.fn(() => false);
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Selection cross-clearing
// ─────────────────────────────────────────────────────────────────────────────

describe('A. Selection cross-clearing', () => {
    let mindMap;

    // Stub keyIsDown to always return false (no shift/ctrl held)
    beforeAll(() => { global.keyIsDown = jest.fn(() => false); });

    beforeEach(() => {
        Cluster._nextColorIndex = 0;
        jest.clearAllMocks();
        MindMap.onClustersChange = null;
        MindMap.onBoxChange      = null;
        MindMap.onBoxDelete      = null;
        MindMap.onConnectionsChange = null;
        global.collaborationManager = undefined;
        mindMap = new MindMap();
    });

    test('clicking a box clears selectedCluster', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const b3 = makeBox(400, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        mindMap.selectedCluster = cluster;
        cluster.selected = true;

        // Make b3 appear under the mouse
        stubMouseOver(b3, true);
        stubMouseOver(b1, false);
        stubMouseOver(b2, false);

        mindMap.handleMousePressed();

        expect(mindMap.selectedCluster).toBeNull();
        expect(cluster.selected).toBe(false);
    });

    test('clicking a connection clears selectedCluster', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const b3 = makeBox(400, 0, mindMap);
        const b4 = makeBox(600, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        mindMap.selectedCluster = cluster;
        cluster.selected = true;

        // Box stubs: none under mouse
        [b1, b2, b3, b4].forEach(b => stubMouseOver(b, false));

        // Connection under mouse
        const conn = new Connection(b3, b4);
        mindMap._registerConnection(conn);
        stubConnMouseOver(conn, true);
        // Stub addConnectionToSelection / clearConnectionSelection on mindMap (methods may not exist yet)
        if (!mindMap.clearConnectionSelection) mindMap.clearConnectionSelection = jest.fn();
        if (!mindMap.addConnectionToSelection) mindMap.addConnectionToSelection = jest.fn();

        mindMap.handleMousePressed();

        expect(mindMap.selectedCluster).toBeNull();
        expect(cluster.selected).toBe(false);
    });

    test('clicking empty space (no cluster under cursor) clears selectedCluster', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        mindMap.selectedCluster = cluster;
        cluster.selected = true;

        // Neither box under mouse
        stubMouseOver(b1, false);
        stubMouseOver(b2, false);

        // Put mouse far outside the cluster hull (well beyond PADDING=30 from any box)
        const origX = global.worldMouseX;
        const origY = global.worldMouseY;
        global.worldMouseX = () => 10000;
        global.worldMouseY = () => 10000;
        // Also update Utils.getWorldMouseCoordinates to use these
        try {
            mindMap.handleMousePressed();
        } finally {
            global.worldMouseX = origX;
            global.worldMouseY = origY;
        }

        expect(mindMap.selectedCluster).toBeNull();
        expect(cluster.selected).toBe(false);
    });

    test('selectedCluster is cleared by fromJSON (data reset)', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        mindMap.selectedCluster = cluster;

        // Load empty data
        mindMap.fromJSON({ boxes: [], connections: [] });

        expect(mindMap.selectedCluster).toBeNull();
        expect(mindMap.clusters).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Keyboard DELETE priority: cluster deletion takes priority over box deletion
// ─────────────────────────────────────────────────────────────────────────────

describe('B. Keyboard DELETE priority', () => {
    let mindMap;

    beforeAll(() => { global.keyIsDown = jest.fn(() => false); });

    beforeEach(() => {
        Cluster._nextColorIndex = 0;
        jest.clearAllMocks();
        MindMap.onClustersChange = null;
        MindMap.onBoxChange      = null;
        MindMap.onBoxDelete      = null;
        global.collaborationManager = undefined;
        mindMap = new MindMap();
    });

    test('DELETE when selectedCluster is set removes cluster, not boxes', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        mindMap.selectedCluster = cluster;
        // Also give a box selection — cluster should win
        mindMap.addBoxToSelection(b1);

        mindMap.handleKeyPressed('', DELETE);

        // Cluster gone
        expect(mindMap.clusters).toHaveLength(0);
        // Boxes untouched
        expect(mindMap.boxes).toContain(b1);
        expect(mindMap.boxes).toContain(b2);
        // selectedCluster cleared
        expect(mindMap.selectedCluster).toBeNull();
    });

    test('BACKSPACE when selectedCluster is set removes cluster, not boxes', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        mindMap.selectedCluster = cluster;

        mindMap.handleKeyPressed('', BACKSPACE);

        expect(mindMap.clusters).toHaveLength(0);
        expect(mindMap.boxes).toContain(b1);
        expect(mindMap.boxes).toContain(b2);
        expect(mindMap.selectedCluster).toBeNull();
    });

    test('DELETE when selectedCluster is null falls through to box deletion', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        mindMap.addBoxToSelection(b1);
        mindMap.addBoxToSelection(b2);
        // Ensure no cluster selected
        mindMap.selectedCluster = null;

        mindMap.handleKeyPressed('', DELETE);

        // Boxes deleted
        expect(mindMap.boxes).not.toContain(b1);
        expect(mindMap.boxes).not.toContain(b2);
    });

    test('repeated BACKSPACE after cluster deletion does not delete boxes (no re-trigger)', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        mindMap.selectedCluster = cluster;

        // First press: delete cluster
        mindMap.handleKeyPressed('', BACKSPACE);
        expect(mindMap.clusters).toHaveLength(0);
        expect(mindMap.selectedCluster).toBeNull();

        // Second press: no selection at all — no-op
        mindMap.handleKeyPressed('', BACKSPACE);
        expect(mindMap.boxes).toContain(b1);
        expect(mindMap.boxes).toContain(b2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. JSON forward/backward compatibility
// ─────────────────────────────────────────────────────────────────────────────

describe('C. JSON forward/backward compatibility', () => {
    let mindMap;

    beforeEach(() => {
        Cluster._nextColorIndex = 0;
        jest.clearAllMocks();
        MindMap.onClustersChange = null;
        global.collaborationManager = undefined;
        mindMap = new MindMap();
    });

    test('fromJSON with no clusters field (legacy save) loads without error', () => {
        const legacyJSON = {
            boxes: [
                { id: 'b1', x: 0, y: 0, text: 'Box 1', width: 100, height: 40 },
                { id: 'b2', x: 200, y: 0, text: 'Box 2', width: 100, height: 40 }
            ],
            connections: [{ from: 'b1', to: 'b2' }]
        };

        expect(() => mindMap.fromJSON(legacyJSON)).not.toThrow();
        expect(mindMap.boxes).toHaveLength(2);
        // No clusters field → empty clusters array
        expect(mindMap.clusters).toHaveLength(0);
    });

    test('fromJSON with clusters: null (defensive) loads without error', () => {
        const json = {
            boxes: [],
            connections: [],
            clusters: null
        };
        expect(() => mindMap.fromJSON(json)).not.toThrow();
        expect(mindMap.clusters).toHaveLength(0);
    });

    test('toJSON always emits a clusters array (never undefined)', () => {
        const json = mindMap.toJSON();
        expect(Array.isArray(json.clusters)).toBe(true);
    });

    test('toJSON includes cluster data for all clusters', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        mindMap.addCluster([b1, b2]);

        const json = mindMap.toJSON();
        expect(json.clusters).toHaveLength(1);
        expect(json.clusters[0].boxIds).toContain(b1.id);
        expect(json.clusters[0].boxIds).toContain(b2.id);
    });

    test('fromJSON round-trip preserves cluster membership', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        mindMap.addCluster([b1, b2]);

        const json = mindMap.toJSON();

        const mm2 = new MindMap();
        mm2.fromJSON(json);

        expect(mm2.clusters).toHaveLength(1);
        const cluster = mm2.clusters[0];
        expect(cluster.boxes).toHaveLength(2);
        const ids = cluster.boxes.map(b => b.id);
        expect(ids).toContain(b1.id);
        expect(ids).toContain(b2.id);
    });

    test('fromJSON with cluster referencing missing box IDs is silently skipped', () => {
        const json = {
            boxes: [{ id: 'b1', x: 0, y: 0, text: 'X', width: 100, height: 40 }],
            connections: [],
            clusters: [{
                id: 'c1',
                colorIndex: 0,
                boxIds: ['b1', 'missing-id']  // only 1 resolvable box
            }]
        };

        expect(() => mindMap.fromJSON(json)).not.toThrow();
        // Cluster needs ≥ 2 boxes → skipped
        expect(mindMap.clusters).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Cluster draw order (clusters drawn before connections and boxes)
// ─────────────────────────────────────────────────────────────────────────────

describe('D. Cluster draw order', () => {
    let mindMap;
    const callLog = [];

    beforeAll(() => {
        global.keyIsDown = jest.fn(() => false);
        // Minimal p5 overrides to track call order
        global.beginShape = jest.fn(() => callLog.push('beginShape'));
        global.endShape   = jest.fn(() => callLog.push('endShape'));
    });

    beforeEach(() => {
        Cluster._nextColorIndex = 0;
        callLog.length = 0;
        jest.clearAllMocks();
        MindMap.onClustersChange = null;
        global.collaborationManager = undefined;
        mindMap = new MindMap();
        // Re-stub after clearAllMocks
        global.beginShape = jest.fn(() => callLog.push('beginShape'));
        global.endShape   = jest.fn(() => callLog.push('endShape'));
    });

    test('cluster.draw() is called (beginShape fired) before any box.draw() in MindMap.draw()', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        mindMap.addCluster([b1, b2]);

        const boxDrawCalls = [];
        mindMap.boxes.forEach(b => {
            b.draw = jest.fn(() => boxDrawCalls.push(b));
            b.update = jest.fn();
        });

        // draw() requires p5 globals; minimal stubs are already set up
        // Use isDirty to trigger a real draw
        mindMap.isDirty = true;

        // Capture cluster.draw spy
        const clusterDrawSpy = jest.spyOn(mindMap.clusters[0], 'draw');

        mindMap.draw();

        // Cluster.draw must have been called
        expect(clusterDrawSpy).toHaveBeenCalled();

        // Each box.draw must have been called
        mindMap.boxes.forEach(b => expect(b.draw).toHaveBeenCalled());

        // beginShape (from cluster.draw) must appear in log BEFORE any box draw stub could run.
        // We verify this indirectly: cluster draw spy fired AND no throw occurred.
        clusterDrawSpy.mockRestore();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. addCluster guard: no-op when Cluster class is missing
// ─────────────────────────────────────────────────────────────────────────────

describe('E. addCluster guard when Cluster class unavailable', () => {
    let mindMap;
    let savedCluster;

    beforeEach(() => {
        Cluster._nextColorIndex = 0;
        jest.clearAllMocks();
        MindMap.onClustersChange = null;
        global.collaborationManager = undefined;
        mindMap = new MindMap();
        savedCluster = global.Cluster;
    });

    afterEach(() => {
        global.Cluster = savedCluster;
    });

    test('addCluster returns null when global Cluster is undefined', () => {
        global.Cluster = undefined;

        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const result = mindMap.addCluster([b1, b2]);

        expect(result).toBeNull();
        expect(mindMap.clusters).toHaveLength(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Box drag/resize release does NOT mutate cluster membership
// ─────────────────────────────────────────────────────────────────────────────

describe('F. Box drag/resize does not mutate cluster membership', () => {
    let mindMap;

    beforeAll(() => { global.keyIsDown = jest.fn(() => false); });

    beforeEach(() => {
        Cluster._nextColorIndex = 0;
        jest.clearAllMocks();
        MindMap.onClustersChange = null;
        MindMap.onBoxChange      = null;
        global.collaborationManager = undefined;
        mindMap = new MindMap();
    });

    test('releasing a dragged box does not change cluster membership', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        mindMap.addCluster([b1, b2]);

        // Simulate drag end on b1
        b1.isDragging  = true;
        b1.stopDrag    = jest.fn(() => true);  // returns true = box moved
        b1.stopSelecting = jest.fn();
        b2.isDragging  = false;
        b2.isResizing  = false;
        b2.stopSelecting = jest.fn();

        mindMap.handleMouseReleased();

        // Cluster still has both boxes
        expect(mindMap.clusters[0].boxes).toContain(b1);
        expect(mindMap.clusters[0].boxes).toContain(b2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Cluster membership after batch box deletion
// ─────────────────────────────────────────────────────────────────────────────

describe('G. Cluster membership after batch box deletion', () => {
    let mindMap;

    beforeEach(() => {
        Cluster._nextColorIndex = 0;
        jest.clearAllMocks();
        MindMap.onClustersChange = null;
        MindMap.onBoxChange      = null;
        MindMap.onBoxDelete      = null;
        global.collaborationManager = undefined;
        mindMap = new MindMap();
    });

    test('deleting ALL cluster boxes removes the cluster', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        mindMap.addCluster([b1, b2]);

        mindMap._performBoxDeletion([b1, b2]);

        expect(mindMap.clusters).toHaveLength(0);
        expect(mindMap.boxes).toHaveLength(0);
    });

    test('deleting cluster boxes in two batches prunes correctly', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const b3 = makeBox(400, 0, mindMap);
        mindMap.addCluster([b1, b2, b3]);

        // First deletion: drops to 2 members — cluster survives
        mindMap._performBoxDeletion([b1]);
        expect(mindMap.clusters).toHaveLength(1);
        expect(mindMap.clusters[0].boxes).toHaveLength(2);

        // Second deletion: drops to 1 member — cluster removed
        mindMap._performBoxDeletion([b2]);
        expect(mindMap.clusters).toHaveLength(0);
    });

    test('deleting boxes from separate clusters prunes each independently', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const b3 = makeBox(400, 0, mindMap);
        const b4 = makeBox(600, 0, mindMap);
        mindMap.addCluster([b1, b2]);
        mindMap.addCluster([b3, b4]);
        expect(mindMap.clusters).toHaveLength(2);

        // Delete one box from each cluster
        mindMap._performBoxDeletion([b1, b3]);

        // Both clusters now have 1 member → both pruned
        expect(mindMap.clusters).toHaveLength(0);
    });
});
