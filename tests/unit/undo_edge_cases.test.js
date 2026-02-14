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

describe('Undo System Edge Cases behavioral tests', () => {
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

    describe('Concurrent Editing Protection', () => {
        test('_applyBoxFromYjs should not overwrite text during active editing', () => {
            const box = new TextBox(0, 0, 'Initial');
            mindMap.boxes.push(box);
            mindMap.rebuildIndex();

            box.isEditing = true;
            box.text = 'Modified';

            // Remote update arrives
            const remoteData = { id: box.id, text: 'Remote Update' };
            cm._applyBoxFromYjs(box.id, remoteData, false, false); // forceApply = false

            // Text should remain 'Modified'
            expect(box.text).toBe('Modified');
        });

        test('_applyBoxFromYjs should force apply during undo/redo', () => {
            const box = new TextBox(0, 0, 'Initial');
            mindMap.boxes.push(box);
            mindMap.rebuildIndex();

            box.isEditing = true;
            box.text = 'Modified';

            // Remote update arrives with forceApply = true
            const remoteData = { id: box.id, text: 'Forced Update' };
            cm._applyBoxFromYjs(box.id, remoteData, false, true); // forceApply = true

            // Text should be overwritten
            expect(box.text).toBe('Forced Update');
        });
    });

    describe('Undo/Redo with Open Group', () => {
        test('undo() should close text edit group', () => {
            const box = new TextBox(0, 0, 'Start');
            mindMap.boxes.push(box);
            mindMap.rebuildIndex();

            // Ensure something is on the undo stack
            cm.transact(() => {
                cm.yboxes.set(box.id, box.toJSON());
            });
            cm.undoManager.stopCapturing();

            // Start editing
            box.isEditing = true;
            box.text = 'Edited';
            cm.syncBoxToYjs(box);

            expect(cm.isTextEditUndoGroupOpen).toBe(true);

            // Undo - should first close group (flushing 'Edited' to Yjs) then undo
            // Action 1: Start
            // Action 2: Edited (flushed in undo -> _closeTextEditUndoGroup)
            // undo() will undo Action 2, leaving it at 'Start'
            cm.undo();

            expect(cm.isTextEditUndoGroupOpen).toBe(false);
            expect(cm.yboxes.get(box.id).text).toBe('Start');
        });
    });

    describe('Flag Synchronization', () => {
        test('should set and clear _isPerformingUndoRedo during undo', () => {
            // Put something on stack
            cm.transact(() => { cm.yboxes.set('a', { text: 'hi' }); });
            cm.undoManager.stopCapturing();

            // Execute undo
            cm.undo();

            // Flag should be false now (cleared in finally)
            expect(cm._isPerformingUndoRedo).toBe(false);
        });

        test('yboxes observer should return early if isSyncing is true and not undo/redo', () => {
            const box = new TextBox(0, 0, 'Test');
            mindMap.boxes.push(box);
            mindMap.rebuildIndex();

            cm.isSyncing = true;

            // Emit a change that would normally be applied
            cm.ydoc.transact(() => {
                cm.yboxes.set(box.id, { ...box.toJSON(), x: 500 });
            });

            // Since isSyncing was true and this wasn't an undo/redo, it should have been skipped
            expect(box.targetX).not.toBe(500);

            cm.isSyncing = false;
        });
    });

    describe('Rapid Switching', () => {
        test('syncBoxToYjs should clear old timer when switching boxes', () => {
            const box1 = new TextBox(0, 0, 'B1');
            const box2 = new TextBox(100, 0, 'B2');
            mindMap.boxes.push(box1, box2);
            mindMap.rebuildIndex();

            box1.isEditing = true;
            cm.syncBoxToYjs(box1);
            expect(cm.textSyncTimers.has(box1.id)).toBe(true);

            box2.isEditing = true;
            cm.syncBoxToYjs(box2);

            // box1 timer should be gone (flushed/cleared)
            expect(cm.textSyncTimers.has(box1.id)).toBe(false);
        });
    });
});
