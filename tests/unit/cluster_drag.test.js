/**
 * @jest-environment jsdom
 */

const TextBox = require('../../src/TextBox');
const Cluster = require('../../src/Cluster');
const MindMap = require('../../src/MindMap');
const Utils = require('../../src/utils');

// Mock p5.js globals
global.mouseX = 0;
global.mouseY = 0;
global.width = 1000;
global.height = 1000;
global.cursor = jest.fn();
global.keyIsDown = jest.fn(() => false);
global.worldMouseX = jest.fn(() => global.mouseX);
global.worldMouseY = jest.fn(() => global.mouseY);
global.push = jest.fn();
global.pop = jest.fn();
global.fill = jest.fn();
global.stroke = jest.fn();
global.noStroke = jest.fn();
global.strokeWeight = jest.fn();
global.beginShape = jest.fn();
global.endShape = jest.fn();
global.vertex = jest.fn();
global.curveVertex = jest.fn();
global.CLOSE = 1;
global.textSize = jest.fn();
global.textWidth = jest.fn(() => 50);
global.max = Math.max;
global.min = Math.min;
global.lerp = (a, b, t) => a + (b - a) * t;
global.constrain = (n, low, high) => Math.max(Math.min(n, high), low);
global.dist = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

// Mock Utils
global.Utils = Utils;
global.TextBox = TextBox;
global.Cluster = Cluster;
global.MindMap = MindMap;
jest.spyOn(Utils, 'getWorldMouseCoordinates').mockImplementation(() => ({ x: global.mouseX, y: global.mouseY }));

describe('Cluster Dragging', () => {
  let mindMap;
  let box1, box2;
  let cluster;

  beforeEach(() => {
    jest.clearAllMocks();
    mindMap = new MindMap();
    box1 = new TextBox(0, 0, 'Box 1');
    box2 = new TextBox(200, 0, 'Box 2');
    mindMap.addBox(box1);
    mindMap.addBox(box2);
    cluster = mindMap.addCluster([box1, box2]);
    
    // Mock getRemoteEditingState to avoid errors
    TextBox.getRemoteEditingState = jest.fn(() => null);
  });

  test('clicking cluster border only selects the cluster (no box drag yet)', () => {
    // Setup mouse at cluster border
    global.mouseX = 100;
    global.mouseY = -45;
    
    // Act
    mindMap.handleMousePressed();

    // Assert
    expect(mindMap.selectedCluster).toBe(cluster);
    expect(mindMap._potentialClusterDrag).toBe(cluster);
    expect(box1.isDragging).toBe(false);
    expect(box2.isDragging).toBe(false);
    expect(mindMap.selectedBoxes.has(box1)).toBe(false);
  });

  test('dragging cluster past threshold selects and moves all boxes', () => {
    // Start Interaction
    global.mouseX = 100;
    global.mouseY = -45;
    mindMap.handleMousePressed();

    // Move slightly (1px) - still shouldn't trigger
    global.mouseX = 101;
    mindMap.handleMouseDragged();
    expect(box1.isDragging).toBe(false);

    // Drag past 3px threshold
    global.mouseX = 150;
    global.mouseY = 5;
    mindMap.handleMouseDragged();

    // Assert - now it should be dragging
    expect(mindMap.draggingCluster).toBe(cluster);
    expect(box1.isDragging).toBe(true);
    expect(box2.isDragging).toBe(true);
    expect(mindMap.selectedBoxes.has(box1)).toBe(true);
    expect(mindMap.selectedBoxes.has(box2)).toBe(true);

    // Assert positions
    expect(box1.x).toBe(50);
    expect(box1.y).toBe(50);
  });

  test('releasing mouse clears potential and active drag state', () => {
    // Click but don't drag
    global.mouseX = 100;
    global.mouseY = -45;
    mindMap.handleMousePressed();
    expect(mindMap._potentialClusterDrag).toBe(cluster);

    // Act
    mindMap.handleMouseReleased();

    // Assert
    expect(mindMap._potentialClusterDrag).toBe(null);
    expect(mindMap.draggingCluster).toBe(null);
  });

  test('cluster drag is blocked if any box is locked by remote user (triggered on drag start)', () => {
    // Mock box1 as locked
    TextBox.getRemoteEditingState.mockImplementation((id) => {
      if (id === box1.id) return { isEditing: true, userName: 'RemoteUser' };
      return null;
    });
    box1.isLockedByRemoteEdit = jest.fn(() => true);
    box1._showEditingBlockedNotification = jest.fn();

    // Start interaction
    global.mouseX = 100;
    global.mouseY = -45;
    mindMap.handleMousePressed();

    // Drag past threshold
    global.mouseX = 150;
    global.mouseY = 5;
    mindMap.handleMouseDragged();

    // Assert: drag should NOT have started
    expect(box1.isDragging).toBe(false);
    expect(box2.isDragging).toBe(false);
    expect(mindMap.draggingCluster).toBeFalsy();
    expect(box1._showEditingBlockedNotification).toHaveBeenCalled();
  });
});
