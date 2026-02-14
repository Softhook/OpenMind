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

describe('Undo Identity & Text Integrity behavioral tests', () => {
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

    test('should defer text sync when isSyncing is true (loop prevention)', () => {
        const box = new TextBox(0, 0, 'Initial');
        mindMap.boxes.push(box);
        mindMap.rebuildIndex();
        cm.ydoc.transact(() => {
            cm.yboxes.set(box.id, box.toJSON());
        });

        // Setup a pending timer manually
        cm.textSyncTimers.set(box.id, setTimeout(() => { }, 10000));

        // Simulate being in an observer (isSyncing = true)
        cm.isSyncing = true;

        // This flush should be deferred
        cm._flushPendingTextSyncs(box.id);

        expect(cm._deferredFlushes && cm._deferredFlushes.has(box.id)).toBe(true);
        expect(cm.textSyncTimers.has(box.id)).toBe(false); // Timer cleared
    });

    test('should batch deferred flushes in a single transaction', (done) => {
        const box1 = new TextBox(0, 0, 'Text 1');
        const box2 = new TextBox(100, 0, 'Text 2');
        mindMap.boxes.push(box1, box2);
        mindMap.rebuildIndex();

        cm.ydoc.transact(() => {
            cm.yboxes.set(box1.id, box1.toJSON());
            cm.yboxes.set(box2.id, box2.toJSON());
        });

        // Set timers manually to bypass isSyncing guard in syncBoxToYjs
        cm.textSyncTimers.set(box1.id, setTimeout(() => { }, 10000));
        cm.textSyncTimers.set(box2.id, setTimeout(() => { }, 10000));

        cm.isSyncing = true;
        box1.text = 'Updated 1';
        box2.text = 'Updated 2';
        cm._flushPendingTextSyncs(box1.id);
        cm._flushPendingTextSyncs(box2.id);

        expect(cm._deferredFlushes.size).toBe(2);

        cm.isSyncing = false;

        // Trigger observer to process deferred by simulating an undo/redo origin
        cm._isPerformingUndoRedo = true;
        cm.ydoc.transact(() => { cm.yboxes.set('dummy', { text: 'hi' }); }, cm.undoManager);
        cm._isPerformingUndoRedo = false;

        // Final state check
        setTimeout(() => {
            try {
                expect(cm.yboxes.get(box1.id).text).toBe('Updated 1');
                expect(cm.yboxes.get(box2.id).text).toBe('Updated 2');
                done();
            } catch (e) {
                done(e);
            }
        }, 50);
    });
});
