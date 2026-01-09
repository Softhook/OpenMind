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
        // Should check that indices are within array bounds
        expect(connectionCode).toMatch(/data\.from\s*>=\s*0\s*&&\s*data\.to\s*>=\s*0/);
        expect(connectionCode).toMatch(/data\.from\s*<\s*boxes\.length\s*&&\s*data\.to\s*<\s*boxes\.length/);
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
        expect(connectionCode).toMatch(/console\.warn\s*\(\s*['"]Invalid connection data/);
    });

    test('Connection.fromJSON should log warning for missing boxes', () => {
        expect(connectionCode).toMatch(/console\.warn\s*\(\s*['"]Referenced boxes do not exist/);
    });

    test('TextBox.fromJSON should handle invalid input data', () => {
        expect(textBoxCode).toMatch(/if\s*\(!data\s*\|\|\s*typeof\s*data\s*!==\s*['"]object['"]\)/);
        expect(textBoxCode).toMatch(/console\.warn\s*\(\s*['"]Invalid box data/);
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

    test('connect should accept shouldShareLocalData parameter', () => {
        // Should have shouldShareLocalData parameter with default false
        expect(collabCode).toMatch(/async connect\s*\([^)]*shouldShareLocalData\s*=\s*false/);
    });

    test('connect should store shouldShareLocalData flag', () => {
        // Should store the flag for use in sync handler
        expect(collabCode).toMatch(/this\.shouldShareLocalData\s*=\s*shouldShareLocalData/);
    });

    test('constructor should initialize shouldShareLocalData to false', () => {
        // Should initialize the flag in constructor
        expect(collabCode).toMatch(/this\.shouldShareLocalData\s*=\s*false/);
    });

    test('should have _clearLocalData method', () => {
        // Should have method to clear local boxes and connections
        expect(collabCode).toMatch(/_clearLocalData\s*\(\s*\)\s*\{/);
    });

    test('_clearLocalData should clear boxes and connections', () => {
        // Should clear both arrays
        expect(collabCode).toMatch(/_clearLocalData[\s\S]*?this\.mindMap\.boxes\s*=\s*\[\]/);
        expect(collabCode).toMatch(/_clearLocalData[\s\S]*?this\.mindMap\.connections\s*=\s*\[\]/);
    });

    test('_clearLocalData should clear selections', () => {
        // Should clear selected box and connection
        expect(collabCode).toMatch(/_clearLocalData[\s\S]*?this\.mindMap\.selectedBox\s*=\s*null/);
        expect(collabCode).toMatch(/_clearLocalData[\s\S]*?this\.mindMap\.selectedConnection\s*=\s*null/);
    });

    test('_clearLocalData should log the operation', () => {
        // Should log when clearing data
        expect(collabCode).toMatch(/_clearLocalData[\s\S]*?console\.log.*Clearing local data/);
    });

    test('_clearLocalData should have error handling', () => {
        // Should wrap operations in try-catch
        expect(collabCode).toMatch(/_clearLocalData[\s\S]*?try\s*\{/);
        expect(collabCode).toMatch(/_clearLocalData[\s\S]*?catch\s*\(/);
        // Should log errors
        expect(collabCode).toMatch(/console\.error.*Failed to clear local data/);
    });

    test('sync handler should check shouldShareLocalData flag', () => {
        // Should check the flag when deciding to share or clear data
        expect(collabCode).toMatch(/if\s*\([^)]*this\.shouldShareLocalData/);
    });

    test('sync handler should clear local data when joining empty room', () => {
        // When room is empty and NOT sharing, should clear local data
        expect(collabCode).toMatch(/yjsEmpty.*&&.*localHasData.*&&.*!this\.shouldShareLocalData/s);
        expect(collabCode).toMatch(/Joining empty room.*clearing local data/);
        expect(collabCode).toMatch(/_clearLocalData\(\)/);
    });

    test('sync handler should clear then rebuild when joining room with data', () => {
        // When room has data and NOT sharing, should clear then rebuild
        expect(collabCode).toMatch(/!yjsEmpty.*&&.*!this\.shouldShareLocalData/s);
        expect(collabCode).toMatch(/Joining room with data.*clearing local data then syncing/);
    });

    test('sync handler should seed room when starting collaboration', () => {
        // When room is empty and sharing, should seed with local data
        expect(collabCode).toMatch(/yjsEmpty.*&&.*localHasData.*&&.*this\.shouldShareLocalData/s);
        expect(collabCode).toMatch(/Starting collaboration.*sharing local data/);
        expect(collabCode).toMatch(/_syncLocalToYjs\(\)/);
    });
});

describe('Sketch.js Integration for Local Data Management', () => {
    const sketchCode = fs.readFileSync(path.join(__dirname, '../../src/sketch.js'), 'utf8');

    test('initializeCollaboration should accept shouldShareLocalData parameter', () => {
        // Should have parameter with default false
        expect(sketchCode).toMatch(/async function initializeCollaboration\s*\([^)]*shouldShareLocalData\s*=\s*false/);
    });

    test('initializeCollaboration should pass flag to connect', () => {
        // Should pass the flag to collaborationManager.connect
        expect(sketchCode).toMatch(/collaborationManager\.connect\s*\([^)]*shouldShareLocalData/);
    });

    test('initializeCollaboration should log the flag value', () => {
        // Should log whether sharing local data
        expect(sketchCode).toMatch(/console\.log.*shouldShareLocalData/);
    });

    test('shareSession should use URL parameter for mode', () => {
        // Should use URL parameter mode=start instead of global flag
        expect(sketchCode).toMatch(/window\.location\.hash\s*=\s*`room=\$\{room\}&mode=start`/);
    });

    test('parseRoomFromHash should return room info object', () => {
        // Should return object with room and isStarting properties
        expect(sketchCode).toMatch(/function parseRoomFromHash\s*\(\s*\)\s*\{/);
        expect(sketchCode).toMatch(/room:.*isStarting/s);
    });

    test('parseRoomFromHash should check mode parameter', () => {
        // Should check if mode=start in URL
        expect(sketchCode).toMatch(/params\.get\s*\(\s*['"]mode['"]\s*\)\s*===\s*['"]start['"]/);
    });

    test('handleUrlChange should use roomInfo.isStarting', () => {
        // Should extract isStarting from roomInfo object
        expect(sketchCode).toMatch(/roomInfo\s*\?\s*roomInfo\.isStarting/);
    });

    test('setup should use roomInfo.isStarting for initialization', () => {
        // When joining from URL at startup, should use flag from URL
        expect(sketchCode).toMatch(/roomInfo\s*\?\s*roomInfo\.isStarting/);
    });
});
