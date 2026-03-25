/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

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

describe('Drag Lock Protection', () => {
  let mindMap;
  let box1, box2, lockedBox;

  beforeEach(() => {
    mindMap = new MindMap();
    box1 = new TextBox(100, 100, 'Box 1');
    box2 = new TextBox(200, 100, 'Box 2');
    lockedBox = new TextBox(300, 100, 'Locked Box');

    mindMap._registerBox(box1);
    mindMap._registerBox(box2);
    mindMap._registerBox(lockedBox);

    // Mock remote editing state
    TextBox.getRemoteEditingState = jest.fn((id) => {
      if (id === lockedBox.id) {
        return { isEditing: true, userName: 'Remote User' };
      }
      return null;
    });

    // Mock notification
    TextBox.prototype._showEditingBlockedNotification = jest.fn();

    jest.clearAllMocks();
  });

  afterEach(() => {
    TextBox.getRemoteEditingState = null;
  });

  test('Multi-box selection: drag is blocked for all if one box is locked', () => {
    // Select both box1 (unlocked) and lockedBox
    mindMap.addBoxToSelection(box1);
    mindMap.addBoxToSelection(lockedBox);

    // Simulate clicking on the edge of box1 to start a drag
    box1.isMouseOver = jest.fn(() => true);
    box1.isMouseOnEdge = jest.fn(() => true);
    
    // Set mouse coordinates to box1 center
    global.worldMouseX.mockReturnValue(box1.x);
    global.worldMouseY.mockReturnValue(box1.y);

    mindMap.handleMousePressed();

    // Verify: lockedBox blocked the drag
    expect(lockedBox._showEditingBlockedNotification).toHaveBeenCalled();
    expect(box1.isDragging).toBeFalsy();
    expect(lockedBox.isDragging).toBeFalsy();
  });

  test('Cluster dragging: drag is blocked for all members if one member is locked', () => {
    // Create a cluster with box1 and lockedBox
    const cluster = mindMap.addCluster([box1, lockedBox]);
    
    // Simulate mouse dragged on the cluster
    // Threshold is > 3px. Start at (0,0), drag to (10,10)
    mindMap._dragStartWorldX = 0;
    mindMap._dragStartWorldY = 0;
    mindMap._potentialClusterDrag = cluster;

    global.worldMouseX.mockReturnValue(10);
    global.worldMouseY.mockReturnValue(10);

    mindMap.handleMouseDragged();

    // Verify: drag was blocked by lockedBox
    expect(lockedBox._showEditingBlockedNotification).toHaveBeenCalled();
    expect(box1.isDragging).toBeFalsy();
    expect(lockedBox.isDragging).toBeFalsy();
    expect(mindMap.draggingCluster).toBeUndefined();
  });

  test('Connection reattachment: reattachment is blocked if the toBox is locked', () => {
    const conn = new Connection(box1, lockedBox);
    mindMap._registerConnection(conn);

    // Mock mouse over arrowhead
    conn.isMouseOverArrowHead = jest.fn(() => true);
    conn.getArrowHeadPosition = jest.fn(() => ({ x: 300, y: 100 }));

    global.worldMouseX.mockReturnValue(300);
    global.worldMouseY.mockReturnValue(100);

    mindMap.handleMousePressed();

    // Verify: draggingConnection was NOT set because toBox is locked
    expect(mindMap.draggingConnection).toBeNull();
    expect(lockedBox._showEditingBlockedNotification).toHaveBeenCalled();
  });

  test('Multi-selection: drag is blocked if multiple boxes are locked', () => {
    const lockedBox2 = new TextBox(400, 100, 'Locked Box 2');
    mindMap._registerBox(lockedBox2);
    
    // Select box1 and two locked boxes
    mindMap.addBoxToSelection(box1);
    mindMap.addBoxToSelection(lockedBox);
    mindMap.addBoxToSelection(lockedBox2);

    TextBox.getRemoteEditingState.mockImplementation((id) => {
      if (id === lockedBox.id || id === lockedBox2.id) {
        return { isEditing: true, userName: 'Remote User' };
      }
      return null;
    });

    box1.isMouseOver = jest.fn(() => true);
    box1.isMouseOnEdge = jest.fn(() => true);
    
    mindMap.handleMousePressed();

    expect(box1.isDragging).toBeFalsy();
    // Should show notification for the first locked box it finds
    expect(TextBox.prototype._showEditingBlockedNotification).toHaveBeenCalled();
  });

  test('Connection reattachment: drop is blocked if the target box is locked', () => {
    // Start with a connection from box1 to box2
    const conn = new Connection(box1, box2);
    mindMap._registerConnection(conn);

    // Start dragging arrowhead (from box2 to somewhere else)
    mindMap.draggingConnection = { conn, originalTo: box2 };
    
    // Simulate dropping on lockedBox
    lockedBox.isMouseOver = jest.fn(() => true);
    
    // We need to trigger handleMouseReleased
    // But handleMouseReleased in MindMap.js currently DOES NOT have the lock check for dropping!
    // This test will fail if we expect it to be blocked.
    
    mindMap.handleMouseReleased();

    // Verify: conn.toBox remains box2 (unlocked), NOT changed to lockedBox
    expect(conn.toBox).toBe(box2);
    expect(lockedBox._showEditingBlockedNotification).toHaveBeenCalled();
  });

  test('Single box resizing: resizing is blocked if box is locked', () => {
    lockedBox.isMouseOverResizeHandle = jest.fn(() => true);
    
    global.worldMouseX.mockReturnValue(lockedBox.x + lockedBox.width/2);
    global.worldMouseY.mockReturnValue(lockedBox.y + lockedBox.height/2);

    mindMap.handleMousePressed();

    expect(lockedBox.isResizing).toBeFalsy();
    expect(lockedBox._showEditingBlockedNotification).toHaveBeenCalled();
  });

  test('Single box dragging: dragging is blocked if box is locked', () => {
    lockedBox.isMouseOver = jest.fn(() => true);
    lockedBox.isMouseOnEdge = jest.fn(() => true);
    
    global.worldMouseX.mockReturnValue(lockedBox.x);
    global.worldMouseY.mockReturnValue(lockedBox.y);

    mindMap.handleMousePressed();

    expect(lockedBox.isDragging).toBeFalsy();
    expect(lockedBox._showEditingBlockedNotification).toHaveBeenCalled();
  });

  test('Box deletion: deletion is blocked if any selected box is locked', () => {
    // Select box1 and lockedBox
    mindMap.addBoxToSelection(box1);
    mindMap.addBoxToSelection(lockedBox);

    // Simulate pressing Delete key
    const DELETE_KEY_CODE = 46;
    mindMap.handleKeyPressed('Delete', DELETE_KEY_CODE);

    // Verify: boxes were NOT deleted because one was locked
    expect(mindMap.boxes).toContain(box1);
    expect(mindMap.boxes).toContain(lockedBox);
    expect(lockedBox._showEditingBlockedNotification).toHaveBeenCalled();
  });
});
