/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');
const Y = require('yjs');

// provide Utils for TextBox and CollaborationManager
global.Utils = require('../../src/utils');

// provide ColorPalette
global.ColorPalette = require('../../src/ColorPalette');

// stub p5 functions
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
global.lerp = (a, b, t) => a + (b - a) * t;

// Load classes
const TextBox = require('../../src/TextBox');
const Connection = require('../../src/Connection');
const MindMap = require('../../src/MindMap');
const CollaborationManager = require('../../src/CollaborationManager');

global.TextBox = TextBox;
global.Connection = Connection;
global.MindMap = MindMap;
global.CollaborationManager = CollaborationManager;

describe('Connection Visual Restoration behavioral tests', () => {
    let cm;
    let mindMap;

    beforeEach(() => {
        mindMap = new MindMap();
        cm = new CollaborationManager(mindMap);

        cm.Y = Y;
        cm.ydoc = new Y.Doc();
        cm.yboxes = cm.ydoc.getMap('boxes');
        cm.yconnections = cm.ydoc.getArray('connections');
        // Initialize UndoManager correctly
        cm.undoManager = new Y.UndoManager([cm.yboxes, cm.yconnections], {
            trackedOrigins: new Set([CollaborationManager.TRACKED_ORIGIN])
        });

        cm.isInitialized = true;
        cm.isConnected = true;
        cm._setupObservers();
        cm._setupMindMapCallbacks();
    });

    test('connections observer should not skip during undo even if isSyncing is true', () => {
        const box1 = new TextBox(0, 0, '1');
        const box2 = new TextBox(100, 0, '2');
        mindMap.boxes.push(box1, box2);
        mindMap.rebuildIndex();

        // 1. Initial state: no connections
        cm.transact(() => {
            cm.yboxes.set(box1.id, box1.toJSON());
            cm.yboxes.set(box2.id, box2.toJSON());
        });
        cm.undoManager.stopCapturing();

        // 2. Add a connection via MindMap
        mindMap.addConnection(box1, box2);
        cm.undoManager.stopCapturing();

        expect(mindMap.connections.length).toBe(1);

        // 3. Simulate isSyncing = true (e.g. from boxes observer)
        cm.isSyncing = true;

        // 4. Perform undo
        // The yconnections observer MUST NOT return early, because this is an undo
        cm.undo();

        // 5. Verify connection is removed in mindMap
        expect(mindMap.connections.length).toBe(0);

        cm.isSyncing = false;
    });

    test('connections observer should skip remote updates if isSyncing is true', () => {
        const box1 = new TextBox(0, 0, '1');
        const box2 = new TextBox(100, 0, '2');
        mindMap.boxes.push(box1, box2);
        mindMap.rebuildIndex();

        cm.isSyncing = true;

        // Simulate remote update
        cm.ydoc.transact(() => {
            cm.yconnections.push([{ fromId: box1.id, toId: box2.id }]);
        });

        // Should NOT have rebuilt connections because isSyncing was true and NOT undo/redo
        expect(mindMap.connections.length).toBe(0);

        cm.isSyncing = false;
    });

    test('_rebuildConnectionsFromYjs should only restore connections for valid box pairs', () => {
        const box1 = new TextBox(0, 0, '1');
        mindMap.boxes.push(box1);
        mindMap.rebuildIndex();

        // Connection to a missing box
        cm.ydoc.transact(() => {
            cm.yconnections.push([{ fromId: box1.id, toId: 'missing' }]);
        });

        cm._rebuildConnectionsFromYjs();

        // Should have skipped the invalid connection
        expect(mindMap.connections.length).toBe(0);
    });
});
