/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// provide Utils for TextBox and CollaborationManager
global.Utils = require('../../src/utils');

// provide ColorPalette
global.ColorPalette = require('../../src/ColorPalette');

// stub p5 functions
global.textSize = jest.fn();
global.textWidth = jest.fn((str) => str ? str.length * 10 : 50);
global.max = Math.max;
global.min = Math.min;
global.abs = Math.abs;
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
global.dist = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
global.lerp = (a, b, t) => a + (b - a) * t;
global.millis = jest.fn(() => 1000);
global.constrain = (val, min, max) => Math.max(min, Math.min(max, val));

// Load classes
const TextBox = require('../../src/TextBox');
const CollaborationManager = require('../../src/CollaborationManager');

global.TextBox = TextBox;
global.CollaborationManager = CollaborationManager;

describe('TextBox Edit Blocking behavioral tests', () => {
    let cm;

    beforeEach(() => {
        // Mock awareness
        const awareness = {
            clientID: 1,
            states: new Map(),
            getStates() { return this.states; },
            on: jest.fn(),
            off: jest.fn(),
            setLocalState: jest.fn(),
            getLocalState() { return { user: { name: 'Local User' } }; }
        };

        cm = new CollaborationManager({ boxes: [], connections: [] });
        cm.awareness = awareness;

        // TextBox relies on the statics set by CollaborationManager
        // which usually happens in cm.initialize() -> cm._setupMindMapCallbacks()
        TextBox.getRemoteEditingState = (boxId) => cm._getRemoteEditingState(boxId);
        TextBox.onEditingStateChange = (boxId) => {
            if (cm.awareness) {
                cm.awareness.setLocalState({
                    ...cm.awareness.getLocalState(),
                    editingBoxId: boxId
                });
            }
        };
    });

    afterEach(() => {
        TextBox.getRemoteEditingState = null;
        TextBox.onEditingStateChange = null;
    });

    test('should prevent editing if a remote user is already editing the box', () => {
        const box = new TextBox(100, 100, 'Test');

        // Mock remote user editing this box
        cm.awareness.states.set(2, {
            user: { name: 'Remote User', color: '#ff0000' },
            editingBoxId: box.id
        });

        const canEdit = box.startEditing(100, 100);

        expect(canEdit).toBe(false);
        expect(box.isEditing).toBe(false);
    });

    test('should allow editing if no remote user is editing the box', () => {
        const box = new TextBox(100, 100, 'Test');

        // Remote user is editing DIFFERENT box
        cm.awareness.states.set(2, {
            user: { name: 'Remote User', color: '#ff0000' },
            editingBoxId: 'other-box'
        });

        const canEdit = box.startEditing(100, 100);

        expect(canEdit).toBe(true);
        expect(box.isEditing).toBe(true);
    });

    test('should prevent dragging if box is locked by remote edit', () => {
        const box = new TextBox(100, 100, 'Test');

        cm.awareness.states.set(2, {
            user: { name: 'Remote User' },
            editingBoxId: box.id
        });

        const canDrag = box.startDrag(105, 105);
        expect(canDrag).toBe(false);
        expect(box.isDragging).toBeFalsy();
    });

    test('should prevent resizing if box is locked by remote edit', () => {
        const box = new TextBox(100, 100, 'Test');

        cm.awareness.states.set(2, {
            user: { name: 'Remote User' },
            editingBoxId: box.id
        });

        const canResize = box.startResize(box.x + box.w, box.y + box.h);
        expect(canResize).toBe(false);
        expect(box.isResizing).toBeFalsy();
    });

    test('should broadcast editing state when starting/stopping edit', () => {
        const box = new TextBox(100, 100, 'Test');

        box.startEditing(100, 100);
        expect(cm.awareness.setLocalState).toHaveBeenCalledWith(expect.objectContaining({
            editingBoxId: box.id
        }));

        box.stopEditing();
        expect(cm.awareness.setLocalState).toHaveBeenCalledWith(expect.objectContaining({
            editingBoxId: null
        }));
    });
});
