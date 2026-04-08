/**
 * Tests for dragging connections from the tail (fromBox / non-arrow) end.
 *
 * The feature allows both ends of a connection line to be dragged and
 * reattached to another box — identical behaviour to arrowhead drag but
 * operating on `fromBox` instead of `toBox`.
 */

// Bootstrap global dependencies
global.Utils = require('../../src/utils');
global.ColorPalette = require('../../src/ColorPalette');

// Stub p5.js drawing and interaction functions
global.fill = jest.fn();
global.noFill = jest.fn();
global.stroke = jest.fn();
global.noStroke = jest.fn();
global.strokeWeight = jest.fn();
global.push = jest.fn();
global.pop = jest.fn();
global.beginShape = jest.fn();
global.endShape = jest.fn();
global.vertex = jest.fn();
global.CLOSE = 2;
global.rect = jest.fn();
global.text = jest.fn();
global.textSize = jest.fn();
global.textWidth = jest.fn((s) => (s ? s.length * 10 : 50));
global.textAlign = jest.fn();
global.translate = jest.fn();
global.cursor = jest.fn();
global.line = jest.fn();
global.circle = jest.fn();
global.max = Math.max;
global.min = Math.min;
global.abs = Math.abs;
global.sqrt = Math.sqrt;
global.dist = (x1, y1, x2, y2) => global.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
global.lerp = (a, b, t) => a + (b - a) * t;
global.keyIsDown = jest.fn(() => false);
global.millis = jest.fn(() => 1000);
global.constrain = (val, min, max) => Math.max(min, Math.min(max, val));

global.LEFT_ARROW = 37;
global.RIGHT_ARROW = 39;
global.UP_ARROW = 38;
global.DOWN_ARROW = 40;
global.BACKSPACE = 8;
global.DELETE = 46;
global.ENTER = 13;
global.ESCAPE = 27;

// Mock world mouse coordinate functions used by MindMap
global.worldMouseX = jest.fn(() => 0);
global.worldMouseY = jest.fn(() => 0);

// Load classes
const TextBox = require('../../src/TextBox');
const Connection = require('../../src/Connection');
const Cluster = require('../../src/Cluster');
const MindMap = require('../../src/MindMap');

global.TextBox = TextBox;
global.Connection = Connection;
global.Cluster = Cluster;
global.MindMap = MindMap;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal TextBox stub with controllable mouse-over state. */
function makeBox(x, y, label) {
  const box = new TextBox(x, y, label);
  // Stub getConnectionPoint to return the box centre
  box.getConnectionPoint = jest.fn(() => ({ x, y }));
  box.isMouseOver = jest.fn(() => false);
  box.isMouseOverResizeHandle = jest.fn(() => false);
  box.isMouseOnEdge = jest.fn(() => false);
  box.getConnectorUnderMouse = jest.fn(() => null);
  return box;
}

// ─── Connection unit tests ────────────────────────────────────────────────────

describe('Connection – tail position methods', () => {
  let box1, box2, conn;

  beforeEach(() => {
    // Place boxes far enough apart that they don't overlap
    box1 = makeBox(0, 0, 'A');
    box1.width = 80; box1.height = 40;
    box2 = makeBox(400, 0, 'B');
    box2.width = 80; box2.height = 40;
    conn = new Connection(box1, box2);
  });

  test('getTailPosition() returns the start (fromBox) endpoint', () => {
    const tail = conn.getTailPosition();
    // getConnectionPoint is stubbed to return the box centre
    expect(tail).not.toBeNull();
    expect(tail.x).toBeDefined();
    expect(tail.y).toBeDefined();
  });

  test('getTailPosition() returns null when boxes overlap', () => {
    // Put boxes at the same position so they overlap
    box2.x = 0;
    box2.y = 0;
    box1.width = 200; box1.height = 200;
    box2.width = 200; box2.height = 200;
    const tail = conn.getTailPosition();
    expect(tail).toBeNull();
  });

  test('isMouseOverTail() returns true when mouse is near start point', () => {
    // Stub getWorldMouseCoordinates to return a point near box1
    const origGetCoords = Utils.getWorldMouseCoordinates;
    Utils.getWorldMouseCoordinates = jest.fn(() => ({ x: 0, y: 0 }));
    Utils.getCurrentZoom = jest.fn(() => 1);

    const result = conn.isMouseOverTail();
    expect(result).toBe(true);

    Utils.getWorldMouseCoordinates = origGetCoords;
  });

  test('isMouseOverTail() returns false when mouse is far from start point', () => {
    const origGetCoords = Utils.getWorldMouseCoordinates;
    Utils.getWorldMouseCoordinates = jest.fn(() => ({ x: 9999, y: 9999 }));
    Utils.getCurrentZoom = jest.fn(() => 1);

    const result = conn.isMouseOverTail();
    expect(result).toBe(false);

    Utils.getWorldMouseCoordinates = origGetCoords;
  });

  test('isMouseOverArrowHead() and isMouseOverTail() target opposite ends', () => {
    const origGetCoords = Utils.getWorldMouseCoordinates;
    Utils.getCurrentZoom = jest.fn(() => 1);

    // Mouse near box1 (tail)
    Utils.getWorldMouseCoordinates = jest.fn(() => ({ x: box1.x, y: box1.y }));
    expect(conn.isMouseOverTail()).toBe(true);
    expect(conn.isMouseOverArrowHead()).toBe(false);

    // Mouse near box2 (arrowhead)
    Utils.getWorldMouseCoordinates = jest.fn(() => ({ x: box2.x, y: box2.y }));
    expect(conn.isMouseOverTail()).toBe(false);
    expect(conn.isMouseOverArrowHead()).toBe(true);

    Utils.getWorldMouseCoordinates = origGetCoords;
  });
});

// ─── MindMap integration tests ───────────────────────────────────────────────

describe('MindMap – tail drag (draggingEnd: from)', () => {
  let mindMap, box1, box2, box3;

  beforeEach(() => {
    mindMap = new MindMap();
    box1 = makeBox(0, 0, 'A');
    box2 = makeBox(400, 0, 'B');
    box3 = makeBox(200, 300, 'C');

    mindMap._registerBox(box1);
    mindMap._registerBox(box2);
    mindMap._registerBox(box3);

    // Stub notifications
    TextBox.prototype._showEditingBlockedNotification = jest.fn();
    TextBox.getRemoteEditingState = jest.fn(() => null);

    jest.clearAllMocks();
  });

  afterEach(() => {
    TextBox.getRemoteEditingState = null;
  });

  test('handleMousePressed sets draggingEnd:"from" when mouse is over tail', () => {
    const conn = new Connection(box1, box2);
    mindMap._registerConnection(conn);

    // Stub tail hover on this connection
    conn.isMouseOverArrowHead = jest.fn(() => false);
    conn.isMouseOverTail = jest.fn(() => true);

    mindMap.handleMousePressed();

    expect(mindMap.draggingConnection).not.toBeNull();
    expect(mindMap.draggingConnection.conn).toBe(conn);
    expect(mindMap.draggingConnection.draggingEnd).toBe('from');
    expect(mindMap.draggingConnection.originalFrom).toBe(box1);
    expect(mindMap.draggingConnection.originalTo).toBe(box2);
  });

  test('handleMousePressed sets draggingEnd:"to" when mouse is over arrowhead', () => {
    const conn = new Connection(box1, box2);
    mindMap._registerConnection(conn);

    conn.isMouseOverArrowHead = jest.fn(() => true);
    conn.getArrowHeadPosition = jest.fn(() => ({ x: 400, y: 0 }));
    conn.isMouseOverTail = jest.fn(() => false);

    mindMap.handleMousePressed();

    expect(mindMap.draggingConnection).not.toBeNull();
    expect(mindMap.draggingConnection.draggingEnd).toBe('to');
  });

  test('handleMouseReleased with draggingEnd:"from" updates fromBox when dropped on another box', () => {
    const conn = new Connection(box1, box2);
    mindMap._registerConnection(conn);

    // Simulate tail drag in progress
    mindMap.draggingConnection = { conn, originalFrom: box1, originalTo: box2, draggingEnd: 'from' };

    // Drop on box3
    box3.isMouseOver = jest.fn(() => true);

    mindMap.handleMouseReleased();

    expect(conn.fromBox).toBe(box3);
    expect(conn.toBox).toBe(box2); // toBox unchanged
    expect(mindMap.draggingConnection).toBeNull();
  });

  test('handleMouseReleased with draggingEnd:"from" reverts when dropped nowhere', () => {
    const conn = new Connection(box1, box2);
    mindMap._registerConnection(conn);

    mindMap.draggingConnection = { conn, originalFrom: box1, originalTo: box2, draggingEnd: 'from' };

    // No box under mouse
    box1.isMouseOver = jest.fn(() => false);
    box2.isMouseOver = jest.fn(() => false);
    box3.isMouseOver = jest.fn(() => false);

    mindMap.handleMouseReleased();

    expect(conn.fromBox).toBe(box1); // reverted
    expect(mindMap.draggingConnection).toBeNull();
  });

  test('handleMouseReleased with draggingEnd:"from" reverts when dropped on toBox (same end)', () => {
    const conn = new Connection(box1, box2);
    mindMap._registerConnection(conn);

    mindMap.draggingConnection = { conn, originalFrom: box1, originalTo: box2, draggingEnd: 'from' };

    // Dropped on toBox — not allowed (would create a self-loop direction)
    box2.isMouseOver = jest.fn(() => true);

    mindMap.handleMouseReleased();

    // droppedOn === conn.toBox, so no change is applied
    expect(conn.fromBox).toBe(box1); // reverted to originalFrom
    expect(mindMap.draggingConnection).toBeNull();
  });

  test('handleMouseReleased with draggingEnd:"from" blocked if dropped box is locked', () => {
    const conn = new Connection(box1, box2);
    mindMap._registerConnection(conn);

    const lockedBox = makeBox(600, 0, 'Locked');
    mindMap._registerBox(lockedBox);

    lockedBox.isLockedByRemoteEdit = jest.fn(() => true);
    lockedBox._showEditingBlockedNotification = jest.fn();
    TextBox.getRemoteEditingState = jest.fn(() => ({ isEditing: true, userName: 'Remote User' }));

    mindMap.draggingConnection = { conn, originalFrom: box1, originalTo: box2, draggingEnd: 'from' };
    lockedBox.isMouseOver = jest.fn(() => true);

    mindMap.handleMouseReleased();

    expect(conn.fromBox).toBe(box1); // not changed to locked box
    expect(lockedBox._showEditingBlockedNotification).toHaveBeenCalled();
  });

  test('handleMouseReleased with draggingEnd:"from" prevents duplicate connections', () => {
    const conn = new Connection(box1, box2);
    // Pre-existing connection: box3 → box2 (same destination)
    const existingConn = new Connection(box3, box2);
    mindMap._registerConnection(conn);
    mindMap._registerConnection(existingConn);

    mindMap.draggingConnection = { conn, originalFrom: box1, originalTo: box2, draggingEnd: 'from' };

    // Drop on box3 — would create a duplicate (box3→box2 already exists)
    box3.isMouseOver = jest.fn(() => true);

    mindMap.handleMouseReleased();

    // conn.fromBox stays as originalFrom (reverted) because duplicate was detected
    expect(conn.fromBox).toBe(box1);
    expect(mindMap.draggingConnection).toBeNull();
  });
});
