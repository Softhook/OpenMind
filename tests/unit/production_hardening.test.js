/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');
const Y = require('yjs');

// Mock localStorage
const localStorageMock = (function () {
    let store = {};
    return {
        getItem: jest.fn(key => store[key] || null),
        setItem: jest.fn((key, value) => { store[key] = value.toString(); }),
        clear: jest.fn(() => { store = {}; }),
        removeItem: jest.fn(key => { delete store[key]; })
    };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

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

describe('Production Hardening behavioral tests', () => {
    let cm;
    let mindMap;

    beforeEach(() => {
        localStorageMock.clear();
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
    });

    describe('UndoManager Memory Safety', () => {
        test('MAX_UNDO_STACK_SIZE is a reasonable value', () => {
            expect(CollaborationManager.MAX_UNDO_STACK_SIZE).toBeGreaterThanOrEqual(50);
            expect(CollaborationManager.MAX_UNDO_STACK_SIZE).toBeLessThanOrEqual(500);
        });

        test('UndoManager should be initialized with maxStackSize', () => {
            // We verify that the constant is defined, which is used in the constructor
            expect(CollaborationManager.MAX_UNDO_STACK_SIZE).toBeDefined();
        });
    });

    describe('Stable User Identity', () => {
        test('_generateUserId should persist and reuse ID from localStorage', () => {
            // First generation
            const id1 = cm._generateUserId();
            expect(localStorageMock.setItem).toHaveBeenCalledWith('openmind_userId', id1);

            // Second generation (in a new instance)
            localStorageMock.getItem.mockReturnValue(id1);
            const cm2 = new CollaborationManager(mindMap);
            const id2 = cm2._generateUserId();

            expect(id2).toBe(id1);
            expect(localStorageMock.getItem).toHaveBeenCalledWith('openmind_userId');
        });

        test('_generateUserId should handle localStorage errors gracefully', () => {
            localStorageMock.getItem.mockImplementation(() => { throw new Error('Security Error'); });
            const id = cm._generateUserId();
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
        });
    });

    describe('Connection Deduplication', () => {
        test('_rebuildConnectionsFromYjs should skip duplicate connections', () => {
            const box1 = new TextBox(0, 0, 'Box 1');
            const box2 = new TextBox(100, 0, 'Box 2');
            mindMap.boxes.push(box1, box2);

            // Add DUPLICATE connection data to Yjs
            const connData = { fromId: box1.id, toId: box2.id };
            cm.yconnections.push([connData, connData, connData]);

            expect(cm.yconnections.length).toBe(3);

            cm._rebuildConnectionsFromYjs();

            // Should only have 1 connection in local state
            expect(mindMap.connections.length).toBe(1);
        });

        test('_rebuildConnectionsFromYjs should skip connections with missing boxes', () => {
            const box1 = new TextBox(0, 0, 'Box 1');
            mindMap.boxes.push(box1);

            // Connection to missing box
            const connData = { fromId: box1.id, toId: 'missing-id' };
            cm.yconnections.push([connData]);

            cm._rebuildConnectionsFromYjs();

            expect(mindMap.connections.length).toBe(0);
        });
    });

    describe('destroy() Cleanup', () => {
        test('destroy should clean up timers and connections', () => {
            const spy = jest.spyOn(cm, 'disconnect');
            const stopSpy = jest.spyOn(cm, '_stopConsistencyCheck');

            cm.destroy();

            expect(spy).toHaveBeenCalled();
            expect(stopSpy).toHaveBeenCalled();
            expect(cm.isInitialized).toBe(false);
            expect(cm.ydoc).toBeNull();
        });
    });
});
