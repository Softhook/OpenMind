/**
 * @jest-environment jsdom
 */

const Y = require('yjs');
const TextBox = require('../../src/TextBox');
const Connection = require('../../src/Connection');
const MindMap = require('../../src/MindMap');
const CollaborationManager = require('../../src/CollaborationManager');

// provide Utils for TextBox and CollaborationManager
global.Utils = require('../../src/utils');
global.ColorPalette = require('../../src/ColorPalette');

// stub p5 functions
global.textSize = jest.fn();
global.textWidth = jest.fn((str) => str ? str.length * 10 : 50);
global.stroke = jest.fn();
global.strokeWeight = jest.fn();
global.fill = jest.fn();
global.rect = jest.fn();
global.push = jest.fn();
global.pop = jest.fn();
global.translate = jest.fn();
global.rotate = jest.fn();
global.textAlign = jest.fn();
global.text = jest.fn();
global.max = Math.max;
global.min = Math.min;

describe('Undo System Robustness Verification', () => {
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
            trackedOrigins: new Set([CollaborationManager.TRACKED_ORIGIN]),
            captureTimeout: 0 // Disable time-based merging for precise tracking
        });

        cm.isInitialized = true;
        cm.isConnected = true;
        cm._setupObservers();
        cm._setupMindMapCallbacks();
    });

    test('Box deletion should be undoable', () => {
        const box = new TextBox(0, 0, 'To be deleted');
        mindMap.boxes.push(box);
        mindMap.rebuildIndex();

        // 1. Action: Initial sync (untracked)
        cm.ydoc.transact(() => {
            cm.yboxes.set(box.id, box.toJSON());
        }, null);
        
        expect(cm.undoManager.undoStack.length).toBe(0);

        // 2. Action: Move box (tracked)
        box.x = 100;
        cm.syncBoxToYjs(box);
        expect(cm.undoManager.undoStack.length).toBe(1);

        // 3. Action: Delete box (tracked)
        cm.deleteBoxFromYjs(box.id);
        expect(cm.yboxes.has(box.id)).toBe(false);
        expect(cm.undoManager.undoStack.length).toBe(2);

        // 4. Undo deletion
        cm.undo();
        expect(cm.yboxes.has(box.id)).toBe(true);
        expect(cm.yboxes.get(box.id).x).toBe(100);
        expect(cm.undoManager.undoStack.length).toBe(1);

        // 5. Undo movement
        cm.undo();
        expect(cm.yboxes.get(box.id).x).toBe(0);
        expect(cm.undoManager.undoStack.length).toBe(0);
    });

    test('Connection sync should be undoable', () => {
        const box1 = new TextBox(0, 0, 'B1');
        const box2 = new TextBox(100, 0, 'B2');
        mindMap.boxes.push(box1, box2);
        mindMap.rebuildIndex();

        cm.ydoc.transact(() => {
            cm.yboxes.set(box1.id, box1.toJSON());
            cm.yboxes.set(box2.id, box2.toJSON());
        }, null);

        expect(cm.undoManager.undoStack.length).toBe(0);

        // Action: Add connection (tracked via syncConnectionsToYjs)
        const conn = new Connection(box1, box2);
        mindMap.connections.push(conn);
        cm.syncConnectionsToYjs();

        expect(cm.yconnections.length).toBe(1);
        expect(cm.undoManager.undoStack.length).toBe(1);

        // Undo connection
        cm.undo();
        expect(cm.yconnections.length).toBe(0);
        expect(cm.undoManager.undoStack.length).toBe(0);
    });

    test('Thrust health/pushes should NOT be undoable', () => {
        const box = new TextBox(0, 0, 'Physics Test');
        mindMap.boxes.push(box);
        mindMap.rebuildIndex();

        cm.ydoc.transact(() => {
            cm.yboxes.set(box.id, box.toJSON());
        }, null);

        expect(cm.undoManager.undoStack.length).toBe(0);

        // Action: Bullet push (origin: null)
        box.x += 10;
        cm.syncBoxToYjs(box, false, null); 
        
        expect(cm.yboxes.get(box.id).x).toBe(10);
        expect(cm.undoManager.undoStack.length).toBe(0); // Should still be 0

        // Action: Damage (origin: null)
        box.health = 4;
        cm.syncBoxToYjs(box, false, null);
        
        expect(cm.yboxes.get(box.id).health).toBe(4);
        expect(cm.undoManager.undoStack.length).toBe(0); // Should still be 0
    });
});
