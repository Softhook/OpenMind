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

// Load classes
const TextBox = require('../../src/TextBox');
const MindMap = require('../../src/MindMap');
const CollaborationManager = require('../../src/CollaborationManager');

global.TextBox = TextBox;
global.MindMap = MindMap;
global.CollaborationManager = CollaborationManager;

describe('y-indexeddb Migration and Edge Cases behavioral tests', () => {
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
    });

    describe('CollaborationManager.clearIndexedDB()', () => {
        test('should clear data and recreate provider', async () => {
            const mockProvider = {
                name: 'test-db',
                clearData: jest.fn().mockResolvedValue(),
                whenSynced: Promise.resolve(),
                destroy: jest.fn()
            };

            cm.indexeddbProvider = mockProvider;

            // Mock the constructor
            const MockPersistence = jest.fn(() => mockProvider);
            cm.IndexeddbPersistence = MockPersistence;

            // Populate some data
            cm.yboxes.set('b1', {});
            cm.yconnections.push([{}]);

            await cm.clearIndexedDB();

            expect(mockProvider.clearData).toHaveBeenCalled();
            expect(cm.yboxes.size).toBe(0);
            expect(cm.yconnections.length).toBe(0);
            expect(MockPersistence).toHaveBeenCalled();
            expect(cm.indexeddbProvider).toBe(mockProvider);
        });

        test('should handle early return if no provider exists', async () => {
            cm.indexeddbProvider = null;
            await cm.clearIndexedDB();
            // Should not throw
        });
    });

    describe('Undo Granularity and Transactions', () => {
        test('should group box and connection deletion in a single undo step', () => {
            const box1 = new TextBox(0, 0, '1');
            cm.yboxes.set(box1.id, box1.toJSON());
            cm.yconnections.push([{ fromId: box1.id, toId: 'other' }]);
            cm.undoManager.stopCapturing();

            const initialBoxCount = cm.yboxes.size;
            const initialConnCount = cm.yconnections.length;

            // Perform deletion in a single transaction (as MindMap.deleteBox does)
            cm.transact(() => {
                cm.yboxes.delete(box1.id);
                cm.yconnections.delete(0, 1);
            });

            expect(cm.yboxes.size).toBe(initialBoxCount - 1);
            expect(cm.yconnections.length).toBe(initialConnCount - 1);

            // Undo
            cm.undo();

            expect(cm.yboxes.size).toBe(initialBoxCount);
            expect(cm.yconnections.length).toBe(initialConnCount);
        });

        test('should separate distinct user actions into separate undo steps', () => {
            cm.transact(() => { cm.yboxes.set('1', { text: 'A' }); });
            cm.undoManager.stopCapturing();
            cm.transact(() => { cm.yboxes.set('2', { text: 'B' }); });
            cm.undoManager.stopCapturing();

            expect(cm.yboxes.size).toBe(2);

            cm.undo();
            expect(cm.yboxes.size).toBe(1);
            expect(cm.yboxes.has('1')).toBe(true);

            cm.undo();
            expect(cm.yboxes.size).toBe(0);
        });
    });

    describe('IndexedDB Persistence Errors', () => {
        test('should propagate quota exceeded errors', async () => {
            const quotaError = new Error('QuotaExceededError');
            quotaError.name = 'QuotaExceededError';

            cm.indexeddbProvider = {
                clearData: jest.fn().mockRejectedValue(quotaError)
            };

            await expect(cm.clearIndexedDB()).rejects.toThrow('QuotaExceededError');
        });
    });
});
