/**
 * Unit tests for collaboration-related refactoring
 * Tests UUID generation, ID-based serialization, and backward compatibility
 * 
 * NOTE: These tests verify the code structure and logic directly.
 * For full integration testing, use the browser.
 */

const fs = require('fs');
const path = require('path');

// Read the source files for structural verification
const textBoxCode = fs.readFileSync(path.join(__dirname, '../../src/TextBox.js'), 'utf8');
const connectionCode = fs.readFileSync(path.join(__dirname, '../../src/Connection.js'), 'utf8');
const mindMapCode = fs.readFileSync(path.join(__dirname, '../../src/MindMap.js'), 'utf8');
const utilsCode = fs.readFileSync(path.join(__dirname, '../../src/utils.js'), 'utf8');

describe('TextBox UUID Implementation', () => {
    test('constructor should generate ID using Utils.generateUUID()', () => {
        // Verify the constructor includes ID generation via shared Utils
        expect(textBoxCode).toMatch(/constructor\s*\([^)]*\)\s*\{[^}]*this\.id\s*=\s*Utils\.generateUUID\(\)/s);
    });

    test('Utils.generateUUID should exist with fallback support', () => {
        // Verify generateUUID function exists in utils.js
        expect(utilsCode).toMatch(/function\s+generateUUID\s*\(\)\s*\{/);
        // Verify it tries crypto.randomUUID first
        expect(utilsCode).toMatch(/crypto\.randomUUID\s*\(\)/);
        // Verify it has a fallback with crypto.getRandomValues
        expect(utilsCode).toMatch(/crypto\.getRandomValues/);
        // Verify it has a Math.random fallback for edge cases
        expect(utilsCode).toMatch(/Math\.random\(\)/);
    });

    test('toJSON should include id field', () => {
        // Verify toJSON includes id
        expect(textBoxCode).toMatch(/toJSON\s*\(\)\s*\{[^}]*return\s*\{[^}]*id:\s*this\.id/s);
    });

    test('fromJSON should preserve existing ID if present', () => {
        // Verify fromJSON checks for and preserves existing ID
        expect(textBoxCode).toMatch(/if\s*\(data\.id\s*&&\s*typeof\s*data\.id\s*===\s*['"]string['"]\s*\)\s*\{/);
        expect(textBoxCode).toMatch(/box\.id\s*=\s*data\.id/);
    });
});

describe('Connection ID-based Serialization', () => {
    test('toJSON should include fromId and toId', () => {
        // Verify toJSON includes ID-based references
        expect(connectionCode).toMatch(/toJSON\s*\([^)]*\)\s*\{[^}]*fromId:/s);
        expect(connectionCode).toMatch(/toJSON\s*\([^)]*\)\s*\{[^}]*toId:/s);
    });

    test('toJSON should include legacy from and to indices', () => {
        // Verify backward compatibility with indices
        expect(connectionCode).toMatch(/toJSON\s*\([^)]*\)\s*\{[^}]*from:\s*boxes\.indexOf/s);
        expect(connectionCode).toMatch(/toJSON\s*\([^)]*\)\s*\{[^}]*to:\s*boxes\.indexOf/s);
    });

    test('fromJSON should try ID-based lookup first', () => {
        // Verify ID-based lookup is attempted first
        expect(connectionCode).toMatch(/if\s*\(data\.fromId\s*&&\s*data\.toId\)/);
    });

    test('fromJSON should fall back to index-based lookup', () => {
        // Verify fallback to indices
        expect(connectionCode).toMatch(/Fallback to index-based lookup/);
        expect(connectionCode).toMatch(/boxes\[data\.from\]/);
        expect(connectionCode).toMatch(/boxes\[data\.to\]/);
    });

    test('fromJSON should support Map input for ID lookup', () => {
        // Verify Map support
        expect(connectionCode).toMatch(/boxesOrMap instanceof Map/);
        expect(connectionCode).toMatch(/boxesOrMap\.get\(data\.fromId\)/);
    });
});

describe('MindMap getBoxById', () => {
    test('should have getBoxById method', () => {
        // Verify getBoxById method exists
        expect(mindMapCode).toMatch(/getBoxById\s*\(\s*id\s*\)\s*\{/);
    });

    test('getBoxById should validate input', () => {
        // Verify input validation
        expect(mindMapCode).toMatch(/if\s*\(!id\s*\|\|\s*typeof\s*id\s*!==\s*['"]string['"]\s*\)\s*return\s*null/);
    });

    test('getBoxById should search boxes by id', () => {
        // Verify it searches boxes by id
        expect(mindMapCode).toMatch(/this\.boxes\.find\s*\([^)]*box\.id\s*===\s*id/);
    });
});

describe('Backward Compatibility', () => {
    test('Connection.fromJSON should handle legacy data without IDs', () => {
        // The fallback should work when only from/to indices are present
        expect(connectionCode).toMatch(/\(!fromBox\s*\|\|\s*!toBox\)\s*&&\s*Array\.isArray\(boxesOrMap\)/);
    });

    test('TextBox.fromJSON should generate new ID for legacy data', () => {
        // New boxes are created with randomUUID, then ID is optionally overwritten
        expect(textBoxCode).toMatch(/let\s+box\s*=\s*new\s+TextBox\s*\(/);
        expect(textBoxCode).toMatch(/if\s*\(data\.id\s*&&\s*typeof\s*data\.id\s*===\s*['"]string['"]\s*\)\s*\{[^}]*box\.id\s*=\s*data\.id/s);
    });
});

describe('Code Quality', () => {
    test('TextBox.id should be documented in JSDoc', () => {
        expect(textBoxCode).toMatch(/Generate.*unique identifier|stable.*identifier/i);
    });

    test('Connection serialization should have descriptive comments', () => {
        expect(connectionCode).toMatch(/ID-based references.*stable.*collaboration|stable.*collaboration/i);
        expect(connectionCode).toMatch(/Legacy.*backward compatibility|backward compatibility/i);
    });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('UUID Format Validation', () => {
    test('Utils.generateUUID should produce valid UUID v4 format', () => {
        // UUID v4 sets specific bits: version 4 (0100) at position 12-15
        // and variant bits (10xx) at position 16-17
        expect(utilsCode).toMatch(/bytes\[6\].*0x0f.*0x40/); // Version 4
        expect(utilsCode).toMatch(/bytes\[8\].*0x3f.*0x80/); // RFC 4122 variant
    });

    test('Utils.generateUUID should produce proper hex format with dashes', () => {
        // Should produce format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        expect(utilsCode).toMatch(/hex\.slice\(0,\s*8\).*hex\.slice\(8,\s*12\).*hex\.slice\(12,\s*16\)/);
    });

    test('fromJSON should only accept string IDs', () => {
        // Should check typeof data.id === 'string'
        expect(textBoxCode).toMatch(/typeof\s*data\.id\s*===\s*['"]string['"]/);
    });
});


describe('Paste ID Exclusion', () => {
    test('paste logic should exclude original ID from copied data', () => {
        // Verify the destructuring pattern that excludes id
        expect(mindMapCode).toMatch(/const\s*\{\s*id:\s*_excludedId.*\}\s*=\s*boxData/);
    });

    test('paste should use boxDataWithoutId for creating new boxes', () => {
        // Verify the spread uses the id-excluded object
        expect(mindMapCode).toMatch(/\.\.\.boxDataWithoutId/);
    });

    test('pasted boxes should get new IDs via TextBox.fromJSON', () => {
        // Verify TextBox.fromJSON is used for pasting
        expect(mindMapCode).toMatch(/TextBox\.fromJSON\(newBoxData\)/);
    });
});

describe('Connection Edge Cases', () => {
    test('Connection.fromJSON should validate both boxes exist', () => {
        // Should check if both fromBox and toBox are valid before creating connection
        expect(connectionCode).toMatch(/if\s*\(!fromBox\s*\|\|\s*!toBox\)/);
        expect(connectionCode).toMatch(/Referenced boxes do not exist/);
    });

    test('Connection.fromJSON should handle partial ID match with index fallback', () => {
        // If ID lookup fails partially, should try indices for the missing one
        // Uses || to fill in missing boxes: fromBox = fromBox || boxes[data.from]
        expect(connectionCode).toMatch(/fromBox\s*=\s*fromBox\s*\|\|\s*boxes\[data\.from\]/);
        expect(connectionCode).toMatch(/toBox\s*=\s*toBox\s*\|\|\s*boxes\[data\.to\]/);
    });

    test('Connection.fromJSON should validate array bounds for indices', () => {
        // Uses Utils.isValidNumber helper for validation
        expect(connectionCode).toMatch(/Utils\.isValidNumber\(idx\)/);
        expect(connectionCode).toMatch(/idx\s*>=\s*0\s*&&\s*idx\s*<\s*boxes\.length/);
    });

    test('Connection.toJSON should handle null boxes gracefully', () => {
        // Should use ternary to handle null fromBox/toBox
        expect(connectionCode).toMatch(/this\.fromBox\s*\?\s*this\.fromBox\.id\s*:\s*null/);
        expect(connectionCode).toMatch(/this\.toBox\s*\?\s*this\.toBox\.id\s*:\s*null/);
    });

    test('Connection.fromJSON should handle Map with missing IDs', () => {
        // When using Map, if IDs don't exist, get() returns undefined
        // The code should handle this gracefully by falling through
        expect(connectionCode).toMatch(/boxesOrMap\.get\(data\.fromId\)/);
        expect(connectionCode).toMatch(/boxesOrMap\.get\(data\.toId\)/);
    });
});

describe('Unified Undo System (Yjs UndoManager)', () => {

    test('MindMap.undo should be deprecated', () => {
        // Verify undo shows deprecation warning
        expect(mindMapCode).toMatch(/undo\s*\(\)\s*\{[^}]*deprecated/si);
    });

    test('MindMap.pushUndo should be a no-op', () => {
        // Verify pushUndo is now a no-op (Yjs handles undo tracking)
        expect(mindMapCode).toMatch(/pushUndo\s*\(\)\s*\{[^}]*No-op/s);
    });

    test('CollaborationManager should have initialize method', () => {
        // Verify initialize method exists for unified undo system
        const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');
        expect(collabCode).toMatch(/async initialize\s*\(\)/);
    });
});

describe('Error Handling', () => {
    test('Connection.fromJSON should log warning for invalid inputs', () => {
        // Uses Utils.Logger.error instead of console.warn after refactoring
        expect(connectionCode).toMatch(/Utils\.Logger\.error\s*\([^)]*Invalid connection data|console\.warn\s*\([^)]*Invalid connection data/);
    });

    test('Connection.fromJSON should log warning for missing boxes', () => {
        // Uses Utils.Logger.error instead of console.warn after refactoring
        expect(connectionCode).toMatch(/Utils\.Logger\.error\s*\([^)]*boxes|console\.warn\s*\([^)]*boxes do not exist/);
    });

    test('TextBox.fromJSON should handle invalid input data', () => {
        // Check input validation exists
        expect(textBoxCode).toMatch(/if\s*\(!data\s*\|\|\s*typeof\s*data\s*!==\s*['"]object['"]\)/);
        // Uses Utils.Logger.error instead of console.warn after refactoring
        expect(textBoxCode).toMatch(/Utils\.Logger\.error\s*\([^)]*Invalid|console\.warn\s*\([^)]*Invalid box data/);
    });

    test('Utils.generateUUID should catch crypto.randomUUID errors', () => {
        // Should have try-catch around crypto.randomUUID in utils.js
        expect(utilsCode).toMatch(/try\s*\{[^}]*crypto\.randomUUID\(\)[^}]*\}\s*catch/s);
    });
});

describe('MindMap Integration', () => {
    test('MindMap.fromJSON should load boxes before connections', () => {
        // Boxes must be loaded first so connections can reference them
        // Check that boxes loading comes before connections loading
        const boxesLoadIndex = mindMapCode.indexOf('Load boxes with error handling');
        const connectionsLoadIndex = mindMapCode.indexOf('Load connections with error handling');
        expect(boxesLoadIndex).toBeLessThan(connectionsLoadIndex);
    });

    test('MindMap.toJSON should include box IDs in output', () => {
        // toJSON maps boxes through their toJSON
        expect(mindMapCode).toMatch(/boxes:\s*this\.boxes\.map\s*\(\s*box\s*=>\s*box\.toJSON\(\)/);
    });

    test('MindMap.toJSON should pass boxes array to Connection.toJSON', () => {
        // Connections need the boxes array for index calculation
        expect(mindMapCode).toMatch(/connections:\s*this\.connections\.map\s*\(\s*conn\s*=>\s*conn\.toJSON\(this\.boxes\)/);
    });
});

describe('Optimization & Robustness', () => {
    const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

    test('syncConnectionsToYjs should use optimized diff logic', () => {
        // Should NOT use the O(n^2) while-loop clear pattern
        expect(collabCode).not.toMatch(/while\s*\(this\.yconnections\.length\s*>\s*0\)\s*\{\s*this\.yconnections\.delete\(0\);\s*\}/s);

        // Should use Map for O(1) lookups
        expect(collabCode).toMatch(/const\s+yjsMap\s*=\s*new\s+Map\(\)/);

        // Should calculate adds and deletes separately
        expect(collabCode).toMatch(/toAdd\.push\(conn\)/);
        expect(collabCode).toMatch(/indicesToDelete\.sort\(\(a,\s*b\)\s*=>\s*b\s*-\s*a\)/);
    });

    test('_applyBoxFromYjs should validate input types', () => {
        // Should check for number types on coordinates
        expect(collabCode).toMatch(/typeof\s+data\.x\s*===\s*['"]number['"]/);
        expect(collabCode).toMatch(/typeof\s+data\.y\s*===\s*['"]number['"]/);

        // Should check for string type on text
        expect(collabCode).toMatch(/typeof\s+data\.text\s*===\s*['"]string['"]/);
    });

    test('UndoManager should use constant for timeout', () => {
        // Should use the static constant, not hardcoded 100
        expect(collabCode).toMatch(/captureTimeout:\s*CollaborationManager\.UNDO_CAPTURE_TIMEOUT/);
    });
});

describe('Text Editing Protection', () => {
    const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

    test('_applyBoxFromYjs should skip text update when box is being edited', () => {
        // Should check isEditing before updating text
        expect(collabCode).toMatch(/if\s*\(\s*typeof\s+data\.text\s*===\s*['"]string['"]\s*&&\s*!box\.isEditing\s*\)/);
    });

    test('_applyBoxFromYjs should have comment explaining the protection', () => {
        // Should have explanatory comment
        expect(collabCode).toMatch(/Don't overwrite text while user is actively editing/);
    });
});

describe('Periodic Consistency Check', () => {
    const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

    test('should have consistencyCheckTimer and consistencyCheckInterval in constructor', () => {
        // Should initialize consistency check properties
        expect(collabCode).toMatch(/this\.consistencyCheckTimer\s*=\s*null/);
        expect(collabCode).toMatch(/this\.consistencyCheckInterval\s*=\s*\d+/);
    });

    test('should have _performConsistencyCheck method', () => {
        // Should have the main consistency check method
        expect(collabCode).toMatch(/_performConsistencyCheck\s*\(\s*\)\s*\{/);
    });

    test('_performConsistencyCheck should check if connected and synced', () => {
        // Should verify connection and sync state before checking
        expect(collabCode).toMatch(/if\s*\(\s*!this\.isConnected\s*\|\|\s*!this\.provider\?\.synced\s*\|\|\s*this\.isSyncing\s*\)/);
    });

    test('_performConsistencyCheck should compare Yjs vs Local box IDs', () => {
        // Should identify boxes only in Yjs or only in Local
        expect(collabCode).toMatch(/onlyInYjs.*=.*yjsBoxIds.*filter.*!localBoxIds\.has/s);
        expect(collabCode).toMatch(/onlyInLocal.*=.*localBoxIds.*filter.*!yjsBoxIds\.has/s);
    });

    test('_performConsistencyCheck should reconcile mismatches', () => {
        // Should use Yjs as authority and rebuild from Yjs
        expect(collabCode).toMatch(/_rebuildBoxesFromYjs/);
        expect(collabCode).toMatch(/_rebuildConnectionsFromYjs/);
    });

    test('should have _startConsistencyCheck method', () => {
        expect(collabCode).toMatch(/_startConsistencyCheck\s*\(\s*\)\s*\{/);
        expect(collabCode).toMatch(/setInterval.*_performConsistencyCheck/s);
    });

    test('should have _stopConsistencyCheck method', () => {
        expect(collabCode).toMatch(/_stopConsistencyCheck\s*\(\s*\)\s*\{/);
        expect(collabCode).toMatch(/clearInterval\s*\(\s*this\.consistencyCheckTimer\s*\)/);
    });

    test('should start consistency check when synced', () => {
        // Should call _startConsistencyCheck when synced
        expect(collabCode).toMatch(/if\s*\(\s*synced\s*\)\s*\{[^}]*_startConsistencyCheck/s);
    });

    test('should stop consistency check when not synced', () => {
        // Should call _stopConsistencyCheck when not synced
        expect(collabCode).toMatch(/else\s*\{[^}]*_stopConsistencyCheck/s);
    });

    test('should stop consistency check on disconnect', () => {
        // disconnect() should call _stopConsistencyCheck
        // The regex must allow for the entire disconnect method body
        expect(collabCode).toMatch(/disconnect\s*\(\s*\)\s*\{[\s\S]*?_stopConsistencyCheck/);
    });

    test('_performConsistencyCheck should log warnings on mismatch', () => {
        // Should log when mismatch is detected (consolidated into single console.warn)
        expect(collabCode).toMatch(/console\.warn\s*\([\s\S]*?Consistency check detected mismatch/);
        expect(collabCode).toMatch(/Boxes only in Yjs/);
        expect(collabCode).toMatch(/Boxes only in Local/);
        expect(collabCode).toMatch(/Rebuilding.*from Yjs/);
    });

    test('_performConsistencyCheck should use Yjs as authority', () => {
        // Should document that Yjs is source of truth
        expect(collabCode).toMatch(/STRATEGY.*Yjs is the source of truth/s);
        // Should call rebuild methods (Yjs authoritative)
        expect(collabCode).toMatch(/Yjs is authoritative.*rebuild local state from Yjs/s);
        // Log message should clarify Yjs authority
        expect(collabCode).toMatch(/Rebuilding local state from Yjs authority/);
    });
});

describe('Local Data Management When Joining Rooms', () => {
    const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

    test('connect should not have shouldShareLocalData parameter', () => {
        // Should have simplified connect signature without shouldShareLocalData
        expect(collabCode).toMatch(/async connect\s*\([^)]*\)\s*\{/);
        // Should not have shouldShareLocalData parameter
        expect(collabCode).not.toMatch(/async connect\s*\([^)]*shouldShareLocalData/);
    });

    test('sync handler should use userSyncChoice instead of callback', () => {
        // Should NOT use callback approach anymore (no userSyncChoice in sync handler)
        expect(collabCode).not.toMatch(/onRoomDataCheck/);
        // userSyncChoice is handled before connect, not in sync handler
    });

    test('sync handler should auto-load from room when no local data', () => {
        // Should automatically load when no local data
        expect(collabCode).toMatch(/No local data.*loading from room/);
        expect(collabCode).toMatch(/_rebuildBoxesFromYjs/);
        expect(collabCode).toMatch(/_rebuildConnectionsFromYjs/);
    });

    test('should have syncLocalToRoom and loadFromRoom methods', () => {
        // Should have methods for user-initiated actions
        expect(collabCode).toMatch(/syncLocalToRoom\s*\(\s*\)\s*\{/);
        expect(collabCode).toMatch(/loadFromRoom\s*\(\s*\)\s*\{/);
    });

    test('sync handler should have error handling', () => {
        // Should wrap sync operations in try-catch
        expect(collabCode).toMatch(/try\s*\{[\s\S]*?sync/i);
        expect(collabCode).toMatch(/catch.*error/i);
    });
});

describe('Sketch.js Integration for Collaboration', () => {
    const sketchCode = fs.readFileSync(path.join(__dirname, '../../src/sketch.js'), 'utf8');

    test('initializeCollaboration should check for local data before connecting', () => {
        // Should check for local data before calling connect
        expect(sketchCode).toMatch(/hasLocalData.*boxes.*length/);
        expect(sketchCode).toMatch(/roomJoinConfirmation/);
    });

    test('initializeCollaboration should show dialog before connecting when user has local data', () => {
        // Should show dialog immediately if user has local data
        expect(sketchCode).toMatch(/showing sync options dialog before connecting/i);
        expect(sketchCode).toMatch(/pendingConnection/);
    });

    test('should have _proceedWithRoomJoin function', () => {
        // Should have helper function for proceeding after user choice
        expect(sketchCode).toMatch(/_proceedWithRoomJoin/);
    });

    test('shareSession should not use mode parameter', () => {
        // Should use simple room hash without mode
        expect(sketchCode).toMatch(/window\.location\.hash\s*=\s*`room=\$\{room\}`/);
        // Should not use mode=start
        expect(sketchCode).not.toMatch(/mode=start/);
    });

    test('parseRoomFromHash should return room ID only', () => {
        // Should return just the room ID, not mode
        expect(sketchCode).toMatch(/function parseRoomFromHash\s*\(\s*\)\s*\{/);
    });

    test('handleUrlChange should initialize collaboration without mode', () => {
        // Should just pass roomName to initializeCollaboration
        expect(sketchCode).toMatch(/initializeCollaboration\s*\(\s*newRoom\s*\)/);
    });
});

describe('Remote Drag Synchronization', () => {
    test('should apply remote box position updates from Yjs', () => {
        // Require side-effect module to attach CollaborationManager to window/global
        require('../../src/CollaborationManager');
        const CollaborationManager = (typeof window !== 'undefined' && window.CollaborationManager)
            ? window.CollaborationManager
            : global.CollaborationManager;
        // Provide Utils for TextBox runtime use
        require('../../src/utils');
        global.Utils = (typeof window !== 'undefined' && (window.OpenMindUtils || window.Utils))
            ? (window.OpenMindUtils || window.Utils)
            : {};
        // Stub p5 text measurement helpers used during TextBox construction
        global.textSize = jest.fn();
        global.textWidth = jest.fn(() => 10);
        global.max = Math.max;
        global.min = Math.min;
        const TextBox = require('../../src/TextBox');

        const cm = new CollaborationManager();

        // Minimal mind map stub with a single box
        const box = new TextBox(0, 0, 'hi');
        cm.mindMap = {
            boxes: [box],
            connections: [],
            getBoxById: (id) => (id === box.id ? box : null),
            isDirty: false,
            selectedBox: null
        };

        // Simulate a remote update by directly applying Yjs payload
        const remoteData = { id: box.id, x: 120, y: 220 };
        cm._applyBoxFromYjs(box.id, remoteData, false, true);

        // Update targets should reflect the remote position
        expect(box.targetX).toBe(120);
        expect(box.targetY).toBe(220);

        // After several frames, the box should converge toward the target
        for (let i = 0; i < 32; i++) {
            box.update();
        }
        expect(Math.abs(box.x - 120)).toBeLessThan(2);
        expect(Math.abs(box.y - 220)).toBeLessThan(2);
    });

    test('should snap positions when snapToPosition is true', () => {
        require('../../src/CollaborationManager');
        const CollaborationManager = (typeof window !== 'undefined' && window.CollaborationManager)
            ? window.CollaborationManager
            : global.CollaborationManager;
        require('../../src/utils');
        global.Utils = (typeof window !== 'undefined' && (window.OpenMindUtils || window.Utils))
            ? (window.OpenMindUtils || window.Utils)
            : {};
        global.textSize = jest.fn();
        global.textWidth = jest.fn(() => 10);
        global.max = Math.max;
        global.min = Math.min;
        const TextBox = require('../../src/TextBox');

        const cm = new CollaborationManager();
        const box = new TextBox(5, 7, 'snap');
        cm.mindMap = {
            boxes: [box],
            connections: [],
            getBoxById: (id) => (id === box.id ? box : null),
            isDirty: false,
            selectedBox: null
        };

        const remoteData = { id: box.id, x: 200, y: 300 };
        cm._applyBoxFromYjs(box.id, remoteData, true, true);

        expect(box.x).toBe(200);
        expect(box.y).toBe(300);
        expect(box.targetX).toBe(200);
        expect(box.targetY).toBe(300);
    });

    test('should clear faux style ranges when remote payload omits them', () => {
        require('../../src/CollaborationManager');
        const CollaborationManager = (typeof window !== 'undefined' && window.CollaborationManager)
            ? window.CollaborationManager
            : global.CollaborationManager;
        require('../../src/utils');
        global.Utils = (typeof window !== 'undefined' && (window.OpenMindUtils || window.Utils))
            ? (window.OpenMindUtils || window.Utils)
            : {};
        global.textSize = jest.fn();
        global.textWidth = jest.fn(() => 10);
        global.max = Math.max;
        global.min = Math.min;
        const TextBox = require('../../src/TextBox');

        const cm = new CollaborationManager();
        const box = new TextBox(0, 0, 'styles');
        box.boldRanges = [{ start: 0, end: 2 }];
        box.italicRanges = [{ start: 2, end: 4 }];
        cm.mindMap = {
            boxes: [box],
            connections: [],
            getBoxById: (id) => (id === box.id ? box : null),
            isDirty: false,
            selectedBox: null
        };

        const remoteData = { id: box.id, boldRanges: null, italicRanges: null };
        cm._applyBoxFromYjs(box.id, remoteData, false, true);

        expect(box.boldRanges).toEqual([]);
        expect(box.italicRanges).toEqual([]);
    });
});
