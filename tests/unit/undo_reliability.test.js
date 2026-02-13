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

describe('Undo Reliability behavioral tests', () => {
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
            trackedOrigins: new Set()
        });
        cm.undoManager.trackedOrigins.add(cm.undoManager);

        cm.isInitialized = true;
        cm.isConnected = true;
        cm._setupObservers();
        cm._setupMindMapCallbacks();
    });

    describe('Text Edit Undo Grouping', () => {
        test('_closeTextEditUndoGroup should flush pending text syncs', () => {
            const box = new TextBox(0, 0, 'Original');
            mindMap.boxes.push(box);
            cm.ydoc.transact(() => {
                cm.yboxes.set(box.id, box.toJSON());
            });

            // Simulate typing
            box.isEditing = true;
            box.text = 'Modified';
            cm.currentEditingBoxId = box.id;
            cm.isTextEditUndoGroupOpen = true;

            // Should have a timer set by syncBoxToYjs
            cm.syncBoxToYjs(box);
            expect(cm.textSyncTimers.has(box.id)).toBe(true);

            // Close group
            cm._closeTextEditUndoGroup();

            expect(cm.isTextEditUndoGroupOpen).toBe(false);
            expect(cm.textSyncTimers.has(box.id)).toBe(false); // Should be flushed/cleared
            expect(cm.yboxes.get(box.id).text).toBe('Modified');
        });

        test('syncBoxToYjs should flush previous box when switching', () => {
            const box1 = new TextBox(0, 0, 'Box 1');
            const box2 = new TextBox(100, 0, 'Box 2');
            mindMap.boxes.push(box1, box2);
            cm.ydoc.transact(() => {
                cm.yboxes.set(box1.id, box1.toJSON());
                cm.yboxes.set(box2.id, box2.toJSON());
            });

            // Edit box1
            box1.isEditing = true;
            box1.text = 'Changed 1';
            cm.syncBoxToYjs(box1);
            expect(cm.currentEditingBoxId).toBe(box1.id);
            expect(cm.textSyncTimers.has(box1.id)).toBe(true);

            // Switch to box2
            box2.isEditing = true;
            box2.text = 'Changed 2';
            cm.syncBoxToYjs(box2);

            // Box 1 should have been flushed
            expect(cm.textSyncTimers.has(box1.id)).toBe(false);
            expect(cm.yboxes.get(box1.id).text).toBe('Changed 1');

            // Box 2 should now be the editing box
            expect(cm.currentEditingBoxId).toBe(box2.id);
        });
    });

    describe('Delete Box Safety', () => {
        test('deleteBoxFromYjs should close text editing undo group', () => {
            const box = new TextBox(0, 0, 'Box 1');
            mindMap.boxes.push(box);
            cm.ydoc.transact(() => {
                cm.yboxes.set(box.id, box.toJSON());
            });

            // Start editing
            cm.currentEditingBoxId = box.id;
            cm.isTextEditUndoGroupOpen = true;

            // Delete box
            cm.deleteBoxFromYjs(box.id);

            expect(cm.isTextEditUndoGroupOpen).toBe(false);
            expect(cm.currentEditingBoxId).toBeNull();
            expect(cm.yboxes.has(box.id)).toBe(false);
        });
    });
});
