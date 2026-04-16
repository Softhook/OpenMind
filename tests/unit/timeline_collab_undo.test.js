/**
 * @jest-environment jsdom
 */

const Y = require('yjs');

global.Utils = require('../../src/utils');
global.ColorPalette = require('../../src/ColorPalette');

global.textSize = jest.fn();
global.textWidth = jest.fn((str) => str ? str.length * 10 : 50);
global.max = Math.max;
global.min = Math.min;
global.stroke = jest.fn();
global.strokeWeight = jest.fn();
global.fill = jest.fn();
global.rect = jest.fn();
global.push = jest.fn();
global.pop = jest.fn();
global.text = jest.fn();
global.textAlign = jest.fn();
global.translate = jest.fn();
global.cursor = jest.fn();
global.line = jest.fn();
global.circle = jest.fn();
global.noStroke = jest.fn();
global.noFill = jest.fn();
global.lerp = (a, b, t) => a + (b - a) * t;

const TextBox = require('../../src/TextBox');
const Connection = require('../../src/Connection');
const TimelineMode = require('../../src/TimelineMode');
const MindMap = require('../../src/MindMap');
const CollaborationManager = require('../../src/CollaborationManager');

global.TextBox = TextBox;
global.Connection = Connection;
global.TimelineMode = TimelineMode;
global.TimelineConnection = TimelineMode.TimelineConnection;
global.MindMap = MindMap;
global.CollaborationManager = CollaborationManager;

function makeCollab(mindMap) {
  const cm = new CollaborationManager(mindMap);
  cm.Y = Y;
  cm.ydoc = new Y.Doc();
  cm.yboxes = cm.ydoc.getMap('boxes');
  cm.yconnections = cm.ydoc.getArray('connections');
  cm.yclusters = cm.ydoc.getMap('clusters');
  cm.ytimelineConnections = cm.ydoc.getArray('timelineConnections');
  cm.ytimeline = cm.ydoc.getMap('timeline');
  cm.undoManager = new Y.UndoManager(
    [cm.yboxes, cm.yconnections, cm.yclusters, cm.ytimelineConnections, cm.ytimeline],
    { trackedOrigins: new Set([CollaborationManager.TRACKED_ORIGIN]) }
  );
  cm.isInitialized = true;
  cm.isConnected = true;
  cm._setupObservers();
  cm._setupMindMapCallbacks();
  return cm;
}

describe('Timeline collaboration + Yjs undo integration', () => {
  let mindMap;
  let cm;

  beforeEach(() => {
    jest.clearAllMocks();
    mindMap = new MindMap();
    cm = makeCollab(mindMap);
    global.collaborationManager = cm;
  });

  afterEach(() => {
    cm._clearMindMapCallbacks();
    global.collaborationManager = undefined;
  });

  test('removeActiveTimeline is a single undoable action including timeline connections', () => {
    mindMap.createTimeline(100, 200);
    const createdTimelineId = mindMap.activeTimelineId;
    const box = new TextBox(20, 20, 'task');
    mindMap.addBox(box);
    mindMap.addTimelineConnection(box, 3, createdTimelineId);

    // Baseline the undo stack to focus this test on timeline deletion action only.
    cm.undoManager.clear();

    mindMap.removeActiveTimeline();

    expect(mindMap.timelines).toHaveLength(0);
    expect(mindMap.timelineConnections).toHaveLength(0);
    expect(box.timelineDate).toBeNull();
    expect(cm.undoManager.undoStack.length).toBe(1);

    expect(cm.undo()).toBe(true);
    expect(mindMap.timelines).toHaveLength(1);
    expect(mindMap.activeTimelineId).toBe(createdTimelineId);
    expect(mindMap.timelineConnections).toHaveLength(1);
    expect(mindMap.timelineConnections[0].fromBox.id).toBe(box.id);
    expect(mindMap.timelineConnections[0].timelineId).toBe(createdTimelineId);
    const restoredTimeline = mindMap.getTimelineById(createdTimelineId);
    const expectedDate = TimelineMode.toISODateString(
      TimelineMode.dateForDay(3, restoredTimeline.startDate)
    );
    expect(box.timelineDate).toBe(expectedDate);
  });

  test('loadFromJSON syncs multi-timeline state into shared ytimeline map', () => {
    const source = new MindMap();
    source.createTimeline(40, 80);
    source.createTimeline(220, 160);
    const payload = source.toJSON();

    mindMap.fromJSON(payload);

    const sharedTimelines = cm.ytimeline.get('timelines');
    expect(Array.isArray(sharedTimelines)).toBe(true);
    expect(sharedTimelines.length).toBe(2);
    expect(cm.ytimeline.get('active')).toBe(true);
    expect(cm.ytimeline.get('activeTimelineId')).toBe(mindMap.activeTimelineId);
  });
});
