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

describe('Box Deletion with Connections behavioral tests', () => {
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

    test('deleteBoxFromYjs should delete connections in same transaction', () => {
        const box1 = new TextBox(0, 0, 'Box 1');
        const box2 = new TextBox(100, 0, 'Box 2');
        mindMap.boxes.push(box1, box2);

        const conn = new Connection(box1, box2);
        mindMap.connections.push(conn);

        // Initial sync
        cm.ydoc.transact(() => {
            cm.yboxes.set(box1.id, box1.toJSON());
            cm.yboxes.set(box2.id, box2.toJSON());
            cm.yconnections.push([{ fromId: box1.id, toId: box2.id }]);
        });

        expect(cm.yboxes.size).toBe(2);
        expect(cm.yconnections.length).toBe(1);

        // Delete box1
        cm.deleteBoxFromYjs(box1.id);

        // Verify box1 and connection are gone from Yjs
        expect(cm.yboxes.has(box1.id)).toBe(false);
        expect(cm.yboxes.has(box2.id)).toBe(true);
        expect(cm.yconnections.length).toBe(0);

        // Undo deletion
        cm.undo();

        // Verify both box and connection are restored
        expect(cm.yboxes.has(box1.id)).toBe(true);
        expect(cm.yconnections.length).toBe(1);
        expect(cm.yconnections.get(0).fromId).toBe(box1.id);
    });

    test('deleteBoxFromYjs should handle multiple connections to the same box', () => {
        const box1 = new TextBox(0, 0, 'Center');
        const box2 = new TextBox(-100, 0, 'Left');
        const box3 = new TextBox(100, 0, 'Right');
        mindMap.boxes.push(box1, box2, box3);

        mindMap.connections.push(new Connection(box2, box1));
        mindMap.connections.push(new Connection(box1, box3));

        // Initial sync
        cm.ydoc.transact(() => {
            cm.yboxes.set(box1.id, box1.toJSON());
            cm.yboxes.set(box2.id, box2.toJSON());
            cm.yboxes.set(box3.id, box3.toJSON());
            cm.yconnections.push([
                { fromId: box2.id, toId: box1.id },
                { fromId: box1.id, toId: box3.id }
            ]);
        });

        expect(cm.yconnections.length).toBe(2);

        // Delete box1
        cm.deleteBoxFromYjs(box1.id);

        expect(cm.yboxes.has(box1.id)).toBe(false);
        expect(cm.yconnections.length).toBe(0);

        // Undo
        cm.undo();

        expect(cm.yboxes.has(box1.id)).toBe(true);
        expect(cm.yconnections.length).toBe(2);
    });
});
