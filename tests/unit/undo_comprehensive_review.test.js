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

describe('Advanced Collaboration & Formatting behavioral tests', () => {
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

    describe('Text Formatting Synchronization', () => {
        test('should sync bold and italic ranges', () => {
            const box = new TextBox(0, 0, 'Formatted Text');
            mindMap.boxes.push(box);
            cm.ydoc.transact(() => {
                cm.yboxes.set(box.id, box.toJSON());
            });

            // Apply formatting
            box.boldRanges = [{ start: 0, end: 5 }];
            box.italicRanges = [{ start: 5, end: 10 }];

            // Sync
            cm.syncBoxToYjs(box);

            const data = cm.yboxes.get(box.id);
            expect(data.boldRanges).toEqual([{ start: 0, end: 5 }]);
            expect(data.italicRanges).toEqual([{ start: 5, end: 10 }]);
        });

        test('should sync highlights with color', () => {
            const box = new TextBox(0, 0, 'Highlighted');
            mindMap.boxes.push(box);
            cm.ydoc.transact(() => {
                cm.yboxes.set(box.id, box.toJSON());
            });

            box.highlights = [{ start: 0, end: 5, color: [255, 0, 0] }];
            cm.syncBoxToYjs(box);

            const data = cm.yboxes.get(box.id);
            expect(data.highlights).toEqual([{ start: 0, end: 5, color: [255, 0, 0] }]);
        });
    });

    describe('Alignment Synchronization', () => {
        test('should sync multiple boxes after alignment', () => {
            const box1 = new TextBox(0, 0, 'B1');
            const box2 = new TextBox(0, 100, 'B2');
            mindMap.boxes.push(box1, box2);

            cm.ydoc.transact(() => {
                cm.yboxes.set(box1.id, box1.toJSON());
                cm.yboxes.set(box2.id, box2.toJSON());
            });

            // Simulate left alignment (x = 50 for both)
            box1.x = 50;
            box2.x = 50;

            // MindMap would typically call onBoxChange for each
            cm.syncBoxToYjs(box1);
            cm.syncBoxToYjs(box2);

            expect(cm.yboxes.get(box1.id).x).toBe(50);
            expect(cm.yboxes.get(box2.id).x).toBe(50);
        });
    });

    describe('State Transitions & Loops', () => {
        test('should prevent feedback loops using isSyncing flag', () => {
            const box = new TextBox(0, 0, 'Loop Test');
            mindMap.boxes.push(box);

            const syncSpy = jest.spyOn(cm, 'syncBoxToYjs');

            // Simulate remote update
            cm.isSyncing = true;
            cm._applyBoxFromYjs(box.id, { x: 100, y: 100 }, false, true);
            cm.isSyncing = false;

            // Should NOT have triggered a local->remote sync back
            // (Note: _applyBoxFromYjs might trigger MindMap.onBoxChange, 
            // but CollaborationManager should ignore it if isSyncing is true)
            expect(syncSpy).not.toHaveBeenCalled();
            syncSpy.mockRestore();
        });
    });
});
