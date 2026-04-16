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

    // Clear the undo stack to focus this test on timeline deletion action only.
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

  test('removeActiveTimeline clears legacy null-id connection when it is the sole timeline', () => {
    mindMap.createTimeline(100, 200);
    const box = new TextBox(20, 20, 'legacy-task');
    mindMap.addBox(box);

    const legacyDate = TimelineMode.toISODateString(
      TimelineMode.dateForDay(2, mindMap.getActiveTimeline().startDate)
    );
    box.timelineDate = legacyDate;
    mindMap.timelineConnections.push(new TimelineConnection(box, mindMap, null));

    cm.undoManager.clear();
    mindMap.removeActiveTimeline();

    expect(mindMap.timelines).toHaveLength(0);
    expect(mindMap.timelineConnections).toHaveLength(0);
    expect(box.timelineDate).toBeNull();
  });

  test('rebuildTimelineConnectionsFromYjs normalizes null timelineId when exactly one timeline exists', () => {
    mindMap.createTimeline(100, 200);
    const box = new TextBox(20, 20, 'legacy-yjs-task');
    mindMap.addBox(box);
    const soleTimeline = mindMap.getActiveTimeline();
    const legacyDate = TimelineMode.toISODateString(
      TimelineMode.dateForDay(4, soleTimeline.startDate)
    );

    cm.ytimelineConnections.push([{ fromId: box.id, date: legacyDate, timelineId: null }]);
    cm._rebuildTimelineConnectionsFromYjs();

    expect(mindMap.timelineConnections).toHaveLength(1);
    expect(mindMap.timelineConnections[0].timelineId).toBe(soleTimeline.id);
    expect(mindMap.timelineConnections[0].timeline).toBe(soleTimeline);
    expect(box.timelineDate).toBe(legacyDate);
  });

  test('combined undo transaction applies ytimeline before normalizing null-id timeline connections', () => {
    // Start in a single-timeline local state. The same undo/redo transaction then
    // restores a two-timeline snapshot plus a legacy null-id timeline connection.
    // The connection rebuild must see the restored two-timeline state, not the stale
    // pre-transaction one-timeline state.
    mindMap.createTimeline(100, 200);
    const box = new TextBox(20, 20, 'combined-undo-task');
    mindMap.addBox(box);

    const tlA = {
      id: 'tl-a',
      x: 10,
      y: 20,
      totalDays: 31,
      startDate: '2024-01-01',
    };
    const tlB = {
      id: 'tl-b',
      x: 250,
      y: 40,
      totalDays: 31,
      startDate: '2024-01-01',
    };
    const legacyDate = '2024-01-05';

    cm._isPerformingUndoRedo = true;
    try {
      cm.ydoc.transact(() => {
        cm.ytimeline.set('active', true);
        cm.ytimeline.set('timelines', [tlA, tlB]);
        cm.ytimeline.set('activeTimelineId', 'tl-b');
        if (cm.ytimelineConnections.length > 0) {
          cm.ytimelineConnections.delete(0, cm.ytimelineConnections.length);
        }
        cm.ytimelineConnections.push([{ fromId: box.id, date: legacyDate, timelineId: null }]);
      }, cm.undoManager);
    } finally {
      cm._isPerformingUndoRedo = false;
    }

    expect(mindMap.timelines).toHaveLength(2);
    expect(mindMap.activeTimelineId).toBe('tl-b');
    expect(mindMap.timelineConnections).toHaveLength(1);
    expect(mindMap.timelineConnections[0].timelineId).toBeNull();
    expect(mindMap.timelineConnections[0].timeline).toBeNull();
    expect(box.timelineDate).toBe(legacyDate);
  });

  test('undo of first-ever createTimeline clears timelines array and leaves no ghost bars', () => {
    // Before ANY timeline creation the ytimeline map has no 'timelines' key.
    // After undo, Yjs deletes that key (reverts to absent). _applyRemoteTimelineActive
    // must therefore clear mindMap.timelines rather than leaving stale data that
    // would cause a second createTimeline to push into a non-empty array.
    mindMap.createTimeline(100, 200);
    const id1 = mindMap.activeTimelineId;
    expect(mindMap.timelines).toHaveLength(1);

    expect(cm.undo()).toBe(true);

    expect(mindMap.timelineActive).toBe(false);
    expect(mindMap.timelines).toHaveLength(0);
    expect(mindMap.activeTimelineId).toBeNull();
    // Interaction state must be cleared
    expect(mindMap.timelineSelected).toBe(false);
    expect(mindMap.selectedTimelineId).toBeNull();

    // Creating a new bar must produce exactly one bar (not two)
    mindMap.createTimeline(50, 50);
    expect(mindMap.timelines).toHaveLength(1);
    expect(mindMap.timelines[0].id).not.toBe(id1);
  });

  test('undo of createTimeline when previous state was empty clears drag state', () => {
    // Scenario: create → delete (ytimeline now has timelines=[]) → create again → undo.
    // After undo ytimeline reverts to timelines=[], timelineActive=false.
    // The timelines block runs and sets timelineActive=false; the pre-early-return
    // cleanup must also run so stale drag/selection state is fully cleared.
    mindMap.createTimeline(10, 10);
    mindMap.removeActiveTimeline();
    // ytimeline now has active=false, timelines=[].  Clear undo stack to isolate next action.
    cm.undoManager.clear();

    mindMap.createTimeline(20, 20);
    expect(mindMap.timelines).toHaveLength(1);
    expect(mindMap.timelineActive).toBe(true);

    // Simulate stale drag/selection state from a prior interaction
    mindMap.timelineSelected = true;
    mindMap.timelineBarDragging = true;
    mindMap.selectedTimelineId = mindMap.activeTimelineId;

    cm.undo();

    expect(mindMap.timelines).toHaveLength(0);
    expect(mindMap.timelineActive).toBe(false);
    // Drag/selection state must have been cleared by the pre-early-return cleanup block
    expect(mindMap.timelineSelected).toBe(false);
    expect(mindMap.selectedTimelineId).toBeNull();
    expect(mindMap.timelineBarDragging).toBe(false);
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
