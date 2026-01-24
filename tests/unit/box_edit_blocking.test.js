/**
 * Unit tests for box edit blocking functionality
 * Tests that boxes are properly blocked when being edited by remote users
 */

const fs = require('fs');
const path = require('path');

// Read the source files for structural verification
const textBoxCode = fs.readFileSync(path.join(__dirname, '../../src/TextBox.js'), 'utf8');
const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');
const utilsCode = fs.readFileSync(path.join(__dirname, '../../src/utils.js'), 'utf8');

describe('TextBox Edit Blocking - Code Structure', () => {
    test('TextBox should have getRemoteEditingState static callback', () => {
        // Verify the static callback exists for checking remote editing state
        expect(textBoxCode).toMatch(/static\s+getRemoteEditingState\s*=/);
    });

    test('TextBox.getRemoteEditingState should be documented', () => {
        // Verify documentation for the callback
        expect(textBoxCode).toMatch(/Callback.*check.*box.*edited.*remote user/i);
    });

    test('startEditing should check for remote editing state', () => {
        // Verify startEditing checks the callback before allowing editing
        expect(textBoxCode).toMatch(/startEditing[^{]*\{[\s\S]*?getRemoteEditingState/);
        expect(textBoxCode).toMatch(/startEditing[^{]*\{[\s\S]*?remoteState.*isEditing/);
    });

    test('startEditing should return boolean indicating success', () => {
        // Verify startEditing returns true/false
        expect(textBoxCode).toMatch(/startEditing[^{]*\{[\s\S]*?return\s+false/);
        expect(textBoxCode).toMatch(/startEditing[^{]*\{[\s\S]*?return\s+true/);
    });

    test('startSelecting should check for remote editing state', () => {
        // Verify startSelecting also checks the callback
        expect(textBoxCode).toMatch(/startSelecting[^{]*\{[\s\S]*?getRemoteEditingState/);
        expect(textBoxCode).toMatch(/startSelecting[^{]*\{[\s\S]*?remoteState.*isEditing/);
    });

    test('startSelecting should return boolean indicating success', () => {
        // Verify startSelecting returns true/false
        expect(textBoxCode).toMatch(/startSelecting[^{]*\{[\s\S]*?return\s+false/);
        expect(textBoxCode).toMatch(/startSelecting[^{]*\{[\s\S]*?return\s+true/);
    });

    test('handleClick should respect startEditing return value', () => {
        // Verify handleClick checks the return value
        expect(textBoxCode).toMatch(/editStarted\s*=\s*this\.startEditing/);
        expect(textBoxCode).toMatch(/if\s*\(\s*editStarted\s*\)/);
    });

    test('double-click should check for remote editing state', () => {
        // Verify double-click word selection also checks remote state
        expect(textBoxCode).toMatch(/isDouble[^}]*\{[\s\S]*?getRemoteEditingState/);
    });

    test('TextBox should have _showEditingBlockedNotification method', () => {
        // Verify notification method exists
        expect(textBoxCode).toMatch(/_showEditingBlockedNotification\s*\(/);
    });

    test('_showEditingBlockedNotification should show user name', () => {
        // Verify it uses the user name from remote state
        expect(textBoxCode).toMatch(/_showEditingBlockedNotification[^}]*\{[\s\S]*?userName/);
        expect(textBoxCode).toMatch(/_showEditingBlockedNotification[^}]*\{[\s\S]*?currently editing/i);
    });
});

describe('CollaborationManager Edit Blocking Support', () => {
    test('CollaborationManager should set TextBox.getRemoteEditingState callback', () => {
        // Verify the callback is set during initialization
        expect(collabCode).toMatch(/TextBox\.getRemoteEditingState\s*=/);
    });

    test('CollaborationManager should clear TextBox.getRemoteEditingState on cleanup', () => {
        // Verify the callback is cleared on disconnect
        expect(collabCode).toMatch(/_clearMindMapCallbacks[\s\S]*?TextBox\.getRemoteEditingState\s*=\s*null/);
    });

    test('CollaborationManager should have _getRemoteEditingState method', () => {
        // Verify the method exists
        expect(collabCode).toMatch(/_getRemoteEditingState\s*\(/);
    });

    test('_getRemoteEditingState should check awareness states', () => {
        // Verify it queries awareness for remote users
        expect(collabCode).toMatch(/_getRemoteEditingState[^}]*\{[\s\S]*?awareness.*getStates/);
    });

    test('_getRemoteEditingState should skip local user', () => {
        // Verify it skips checking the local user's state
        expect(collabCode).toMatch(/_getRemoteEditingState[^}]*\{[\s\S]*?awareness\.clientID/);
        expect(collabCode).toMatch(/_getRemoteEditingState[^}]*\{[\s\S]*?continue/);
    });

    test('_getRemoteEditingState should check editingBoxId', () => {
        // Verify it checks which box each remote user is editing
        expect(collabCode).toMatch(/_getRemoteEditingState[^}]*\{[\s\S]*?editingBoxId\s*===\s*boxId/);
    });

    test('_getRemoteEditingState should return user info when found', () => {
        // Verify it returns user name and color
        expect(collabCode).toMatch(/_getRemoteEditingState[^}]*\{[\s\S]*?isEditing:\s*true/);
        expect(collabCode).toMatch(/_getRemoteEditingState[^}]*\{[\s\S]*?userName/);
        expect(collabCode).toMatch(/_getRemoteEditingState[^}]*\{[\s\S]*?userColor/);
    });

    test('_getRemoteEditingState should return null when not being edited remotely', () => {
        // Verify it returns null if no remote user is editing the box
        expect(collabCode).toMatch(/_getRemoteEditingState[^}]*\{[\s\S]*?return\s+null/);
    });

    test('_getRemoteEditingState should validate inputs', () => {
        // Verify it handles null/undefined boxId and warns on empty string
        expect(collabCode).toMatch(/_getRemoteEditingState[^}]*\{[\s\S]*?boxId === null/);
        expect(collabCode).toMatch(/_getRemoteEditingState[^}]*\{[\s\S]*?boxId === ''/);
        expect(collabCode).toMatch(/_getRemoteEditingState[^}]*\{[\s\S]*?console\.warn/);
    });
});

describe('User Notification System', () => {
    test('Utils should have showNotification function', () => {
        // Verify notification function exists
        expect(utilsCode).toMatch(/function\s+showNotification\s*\(/);
    });

    test('showNotification should accept message and type parameters', () => {
        // Verify function signature
        expect(utilsCode).toMatch(/function\s+showNotification\s*\(\s*message\s*,\s*type/);
    });

    test('showNotification should create DOM element', () => {
        // Verify it creates notification elements
        expect(utilsCode).toMatch(/showNotification[^}]*\{[\s\S]*?createElement/);
        expect(utilsCode).toMatch(/showNotification[^}]*\{[\s\S]*?notification/);
    });

    test('showNotification should handle different types', () => {
        // Verify it supports info, warning, error types
        expect(utilsCode).toMatch(/showNotification[^}]*\{[\s\S]*?info.*warning.*error/s);
    });

    test('showNotification should be exported in Utils', () => {
        // Verify it's in the exports
        expect(utilsCode).toMatch(/showNotification[,\s]/);
    });
});

describe('Integration Tests - Runtime Behavior', () => {
    // Helper function to set up test environment
    function setupTestEnvironment() {
        // Load modules
        require('../../src/utils');
        global.Utils = (typeof window !== 'undefined' && (window.OpenMindUtils || window.Utils))
            ? (window.OpenMindUtils || window.Utils)
            : {};
        
        // Stub p5 functions
        global.textSize = jest.fn();
        global.textWidth = jest.fn(() => 10);
        global.max = Math.max;
        global.min = Math.min;
        global.abs = Math.abs;
        global.millis = jest.fn(() => 1000);
        global.constrain = (val, min, max) => Math.max(min, Math.min(max, val));
        
        return require('../../src/TextBox');
    }

    beforeEach(() => {
        // Clear any existing mocks
        jest.clearAllMocks();
        
        // Reset global state
        global.TextBox = undefined;
        global.MindMap = undefined;
        global.Utils = undefined;
        global.CollaborationManager = undefined;
    });

    test('TextBox blocks editing when remote user is editing', () => {
        const TextBox = setupTestEnvironment();

        // Mock getRemoteEditingState to indicate remote editing
        TextBox.getRemoteEditingState = jest.fn((boxId) => ({
            isEditing: true,
            userName: 'Remote User',
            userColor: '#ff0000'
        }));

        const box = new TextBox(100, 100, 'Test Box');
        
        // Mock the notification method
        box._showEditingBlockedNotification = jest.fn();

        // Try to start editing
        const result = box.startEditing(100, 100);

        // Verify editing was blocked
        expect(result).toBe(false);
        expect(box.isEditing).toBe(false);
        expect(TextBox.getRemoteEditingState).toHaveBeenCalledWith(box.id);
        expect(box._showEditingBlockedNotification).toHaveBeenCalled();
    });

    test('TextBox allows editing when no remote user is editing', () => {
        const TextBox = setupTestEnvironment();

        // Mock getRemoteEditingState to indicate no remote editing
        TextBox.getRemoteEditingState = jest.fn(() => null);

        const box = new TextBox(100, 100, 'Test Box');

        // Try to start editing
        const result = box.startEditing(100, 100);

        // Verify editing was allowed
        expect(result).toBe(true);
        expect(box.isEditing).toBe(true);
        expect(TextBox.getRemoteEditingState).toHaveBeenCalledWith(box.id);
    });

    test('TextBox blocks selecting when remote user is editing', () => {
        const TextBox = setupTestEnvironment();

        // Mock getRemoteEditingState to indicate remote editing
        TextBox.getRemoteEditingState = jest.fn(() => ({
            isEditing: true,
            userName: 'Remote User',
            userColor: '#ff0000'
        }));

        const box = new TextBox(100, 100, 'Test Box');

        // Try to start selecting
        const result = box.startSelecting(100, 100);

        // Verify selecting was blocked
        expect(result).toBe(false);
        expect(box.isEditing).toBe(false);
        expect(box.isSelecting).toBe(false);
    });

    test('CollaborationManager._getRemoteEditingState returns null when box not being edited', () => {
        // Load CollaborationManager
        require('../../src/CollaborationManager');
        const CollaborationManager = (typeof window !== 'undefined' && window.CollaborationManager)
            ? window.CollaborationManager
            : global.CollaborationManager;

        const cm = new CollaborationManager();
        
        // Mock awareness with no remote users
        cm.awareness = {
            clientID: 123,
            getStates: () => new Map([
                [123, { user: { name: 'Local User', id: 'local-1' }, editingBoxId: null }]
            ])
        };

        const result = cm._getRemoteEditingState('box-123');
        expect(result).toBeNull();
    });

    test('CollaborationManager._getRemoteEditingState returns user info when box is being edited', () => {
        // Load CollaborationManager
        const CollaborationManager = require('../../src/CollaborationManager');

        const cm = new CollaborationManager();
        
        // Mock awareness with remote user editing a box
        cm.awareness = {
            clientID: 123,
            getStates: () => new Map([
                [123, { user: { name: 'Local User', id: 'local-1' }, editingBoxId: null }],
                [456, { user: { name: 'Remote User', id: 'remote-1', color: '#ff0000' }, editingBoxId: 'box-123' }]
            ])
        };

        const result = cm._getRemoteEditingState('box-123');
        expect(result).not.toBeNull();
        expect(result.isEditing).toBe(true);
        expect(result.userName).toBe('Remote User');
        expect(result.userColor).toBe('#ff0000');
    });

    test('CollaborationManager._getRemoteEditingState skips local user', () => {
        // Load CollaborationManager
        const CollaborationManager = require('../../src/CollaborationManager');

        const cm = new CollaborationManager();
        
        // Mock awareness where only local user is editing
        cm.awareness = {
            clientID: 123,
            getStates: () => new Map([
                [123, { user: { name: 'Local User', id: 'local-1' }, editingBoxId: 'box-123' }]
            ])
        };

        // Should return null because only local user is editing
        const result = cm._getRemoteEditingState('box-123');
        expect(result).toBeNull();
    });
});

describe('Edge Cases', () => {
    // Helper function to set up test environment
    function setupTestEnvironment() {
        require('../../src/utils');
        global.Utils = (typeof window !== 'undefined' && (window.OpenMindUtils || window.Utils))
            ? (window.OpenMindUtils || window.Utils)
            : {};
        
        global.textSize = jest.fn();
        global.textWidth = jest.fn(() => 10);
        global.max = Math.max;
        global.min = Math.min;
        global.abs = Math.abs;
        global.millis = jest.fn(() => 1000);
        global.constrain = (val, min, max) => Math.max(min, Math.min(max, val));
        
        return require('../../src/TextBox');
    }

    test('TextBox startEditing handles missing getRemoteEditingState callback gracefully', () => {
        const TextBox = setupTestEnvironment();

        // Ensure callback is not set
        TextBox.getRemoteEditingState = null;

        const box = new TextBox(100, 100, 'Test Box');
        
        // Should allow editing when callback is not set
        const result = box.startEditing(100, 100);
        expect(result).toBe(true);
        expect(box.isEditing).toBe(true);
    });

    test('CollaborationManager._getRemoteEditingState handles null boxId', () => {
        const CollaborationManager = require('../../src/CollaborationManager');

        const cm = new CollaborationManager();
        cm.awareness = {
            clientID: 123,
            getStates: () => new Map()
        };

        // Should return null for null/undefined boxId
        expect(cm._getRemoteEditingState(null)).toBeNull();
        expect(cm._getRemoteEditingState(undefined)).toBeNull();
        expect(cm._getRemoteEditingState('')).toBeNull();
    });

    test('CollaborationManager._getRemoteEditingState handles missing awareness', () => {
        const CollaborationManager = require('../../src/CollaborationManager');

        const cm = new CollaborationManager();
        cm.awareness = null;

        // Should return null when awareness is not available
        const result = cm._getRemoteEditingState('box-123');
        expect(result).toBeNull();
    });
});
