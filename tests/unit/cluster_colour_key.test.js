/**
 * @jest-environment jsdom
 *
 * Tests that pressing number keys 1-9 when a cluster is selected changes the
 * cluster's colorIndex to the matching predefined palette entry.
 *
 * Also verifies that the existing box-colour shortcut (keys 1-3) still works
 * when no cluster is selected.
 */

const Y = require('yjs');

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
global.sqrt         = Math.sqrt;
global.dist         = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
global.lerp         = (a, b, t) => a + (b - a) * t;
global.keyIsDown    = jest.fn(() => false);
global.millis       = jest.fn(() => 1000);
global.constrain    = (val, lo, hi) => Math.max(lo, Math.min(hi, val));
global.BACKSPACE    = 8;
global.DELETE       = 46;
global.LEFT_ARROW   = 37;
global.RIGHT_ARROW  = 39;
global.UP_ARROW     = 38;
global.DOWN_ARROW   = 40;
global.ENTER        = 13;
global.ESCAPE       = 27;
global.worldMouseX  = () => 0;
global.worldMouseY  = () => 0;

// ── class loading ─────────────────────────────────────────────────────────────
const Cluster              = require('../../src/Cluster');
const TextBox              = require('../../src/TextBox');
const Connection           = require('../../src/Connection');
const MindMap              = require('../../src/MindMap');
const CollaborationManager = require('../../src/CollaborationManager');

global.Cluster              = Cluster;
global.TextBox              = TextBox;
global.Connection           = Connection;
global.MindMap              = MindMap;
global.CollaborationManager = CollaborationManager;

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCollab(mindMap) {
  const cm = new CollaborationManager(mindMap);
  cm.Y = Y;
  cm.ydoc         = new Y.Doc();
  cm.yboxes       = cm.ydoc.getMap('boxes');
  cm.yconnections = cm.ydoc.getArray('connections');
  cm.yclusters    = cm.ydoc.getMap('clusters');
  cm.undoManager  = new Y.UndoManager(
    [cm.yboxes, cm.yconnections, cm.yclusters],
    { trackedOrigins: new Set([CollaborationManager.TRACKED_ORIGIN]) }
  );
  cm.isInitialized = true;
  cm.isConnected   = true;
  cm._setupObservers();
  cm._setupMindMapCallbacks();
  return cm;
}

function makeBox(x, y, mm) {
  const box = new TextBox(x, y, 'test');
  box.x = x; box.y = y;
  box.width = 150; box.height = 40;
  mm._registerBox(box);
  return box;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('Cluster colour key shortcuts (1-9)', () => {
  let mindMap, cm;

  beforeEach(() => {
    Cluster._nextColorIndex = 0;
    jest.clearAllMocks();
    MindMap.onClustersChange = null;
    mindMap = new MindMap();
    cm = makeCollab(mindMap);
    global.collaborationManager = cm;
  });

  afterEach(() => {
    cm._clearMindMapCallbacks();
    MindMap.onClustersChange = null;
    global.collaborationManager = undefined;
  });

  test('pressing key "1" sets colorIndex to 0 on the selected cluster', () => {
    const b1 = makeBox(0,   0, mindMap);
    const b2 = makeBox(200, 0, mindMap);
    const cluster = mindMap.addCluster([b1, b2]);
    cluster.colorIndex = 3; // start on a different colour
    mindMap.selectedCluster = cluster;
    cluster.selected = true;

    mindMap.handleKeyPressed('1', 49);

    expect(cluster.colorIndex).toBe(0);
  });

  test('pressing key "2" sets colorIndex to 1 on the selected cluster', () => {
    const b1 = makeBox(0,   0, mindMap);
    const b2 = makeBox(200, 0, mindMap);
    const cluster = mindMap.addCluster([b1, b2]);
    mindMap.selectedCluster = cluster;

    mindMap.handleKeyPressed('2', 50);

    expect(cluster.colorIndex).toBe(1);
  });

  test('pressing key "6" sets colorIndex to 5 on the selected cluster', () => {
    const b1 = makeBox(0,   0, mindMap);
    const b2 = makeBox(200, 0, mindMap);
    const cluster = mindMap.addCluster([b1, b2]);
    mindMap.selectedCluster = cluster;

    mindMap.handleKeyPressed('6', 54);

    expect(cluster.colorIndex).toBe(5);
  });

  test('key index wraps around when key > number of palette entries (key "9" with 6 fills)', () => {
    const fills = ColorPalette.CLUSTER.FILLS;
    const b1 = makeBox(0,   0, mindMap);
    const b2 = makeBox(200, 0, mindMap);
    const cluster = mindMap.addCluster([b1, b2]);
    mindMap.selectedCluster = cluster;

    mindMap.handleKeyPressed('9', 57);

    expect(cluster.colorIndex).toBe((9 - 1) % fills.length);
  });

  test('colour change is written to yclusters (collab sync)', () => {
    const b1 = makeBox(0,   0, mindMap);
    const b2 = makeBox(200, 0, mindMap);
    const cluster = mindMap.addCluster([b1, b2]);
    mindMap.selectedCluster = cluster;

    mindMap.handleKeyPressed('3', 51);

    const stored = cm.yclusters.get(cluster.id);
    expect(stored).toBeDefined();
    expect(stored.colorIndex).toBe(2);
  });

  test('colour change is undoable via the UndoManager', () => {
    const b1 = makeBox(0,   0, mindMap);
    const b2 = makeBox(200, 0, mindMap);
    const cluster = mindMap.addCluster([b1, b2]);
    const originalIndex = cluster.colorIndex;
    cm.undoManager.clear();

    mindMap.selectedCluster = cluster;
    mindMap.handleKeyPressed('4', 52);
    expect(cluster.colorIndex).toBe(3);

    cm.undo();

    // After undo the cluster should have the original colorIndex restored
    expect(mindMap.clusters[0].colorIndex).toBe(originalIndex);
  });

  test('number keys do NOT change cluster colour when a modifier is held', () => {
    const b1 = makeBox(0,   0, mindMap);
    const b2 = makeBox(200, 0, mindMap);
    const cluster = mindMap.addCluster([b1, b2]);
    cluster.colorIndex = 0;
    mindMap.selectedCluster = cluster;

    global.keyIsDown = jest.fn((code) => code === 91); // Meta/Cmd held
    mindMap.handleKeyPressed('2', 50);
    global.keyIsDown = jest.fn(() => false);

    expect(cluster.colorIndex).toBe(0); // unchanged
  });

  test('number key 1-3 still changes box colour when NO cluster is selected', () => {
    const b1 = makeBox(0, 0, mindMap);
    b1.setBackgroundByKey = jest.fn();
    mindMap.selectedBox = b1;
    mindMap.selectedCluster = null;

    mindMap.handleKeyPressed('1', 49);

    expect(b1.setBackgroundByKey).toHaveBeenCalledWith('red');
  });

  test('number keys 4-9 do nothing for box colour when no cluster is selected', () => {
    const b1 = makeBox(0, 0, mindMap);
    b1.setBackgroundByKey = jest.fn();
    mindMap.selectedBox = b1;
    mindMap.selectedCluster = null;

    mindMap.handleKeyPressed('7', 55);

    expect(b1.setBackgroundByKey).not.toHaveBeenCalled();
  });
});
