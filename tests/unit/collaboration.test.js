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

describe('Collaboration System Behavioral tests', () => {
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

    describe('UUID and Serialization', () => {
        test('Utils.generateUUID should produce valid UUIDs', () => {
            const uuid = Utils.generateUUID();
            expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        });

        test('TextBox should have a stable ID', () => {
            const box = new TextBox(100, 100, 'Test');
            expect(box.id).toBeTruthy();
            const id = box.id;
            const data = box.toJSON();
            expect(data.id).toBe(id);

            const box2 = TextBox.fromJSON(data);
            expect(box2.id).toBe(id);
        });

        test('Connection should use ID-based serialization', () => {
            const box1 = new TextBox(0, 0, '1');
            const box2 = new TextBox(100, 0, '2');
            const conn = new Connection(box1, box2);

            const data = conn.toJSON([box1, box2]);
            expect(data.fromId).toBe(box1.id);
            expect(data.toId).toBe(box2.id);

            const conn2 = Connection.fromJSON(data, [box1, box2]);
            expect(conn2.fromBox).toBe(box1);
            expect(conn2.toBox).toBe(box2);
        });
    });

    describe('Remote Synchronization', () => {
        test('should apply remote box position updates', () => {
            const box = new TextBox(0, 0, 'hi');
            mindMap.addBox(box);

            const remoteData = { id: box.id, x: 120, y: 220 };
            cm._applyBoxFromYjs(box.id, remoteData, false, true);

            expect(box.targetX).toBe(120);
            expect(box.targetY).toBe(220);

            // Update box to move toward target
            for (let i = 0; i < 60; i++) {
                box.update();
            }
            expect(Math.abs(box.x - 120)).toBeLessThan(1);
            expect(Math.abs(box.y - 220)).toBeLessThan(1);
        });

        test('should snap positions when requested', () => {
            const box = new TextBox(0, 0, 'hi');
            mindMap.addBox(box);

            const remoteData = { id: box.id, x: 200, y: 300 };
            cm._applyBoxFromYjs(box.id, remoteData, true, true);

            expect(box.x).toBe(200);
            expect(box.y).toBe(300);
        });

        test('should clear styles when omitted in remote payload', () => {
            const box = new TextBox(0, 0, 'hi');
            box.boldRanges = [{ start: 0, end: 1 }];
            mindMap.addBox(box);

            const remoteData = { id: box.id, boldRanges: null };
            cm._applyBoxFromYjs(box.id, remoteData, false, true);

            expect(box.boldRanges).toEqual([]);
        });
    });
});
