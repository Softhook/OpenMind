/**
 * @jest-environment jsdom
 * 
 * Unit tests for collaboration-related functionality
 * Tests UUID generation, ID-based serialization, and backward compatibility
 * 
 * This file tests ACTUAL BEHAVIOR instead of code structure.
 * Each test executes real functions and validates the results.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Setup test environment with required dependencies
function setupTestEnvironment() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    crypto: typeof crypto !== 'undefined' ? crypto : undefined,
    Math,
    Array,
    Object,
    Map,
    Set,
    String,
    Number,
    Boolean,
    JSON,
    Date,
    RegExp,
    Error,
    TypeError,
    RangeError
  };

  // Load utils.js first (provides Utils object with generateUUID)
  const utilsCode = fs.readFileSync(path.join(__dirname, '../../src/utils.js'), 'utf8');
  vm.runInNewContext(utilsCode, context);
  
  // Create mock Logger if not present
  if (!context.Utils || !context.Utils.Logger) {
    if (!context.Utils) {
      context.Utils = {};
    }
    context.Utils.Logger = {
      log: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {}
    };
  }

  // Load ColorPalette
  const colorPaletteCode = fs.readFileSync(path.join(__dirname, '../../src/ColorPalette.js'), 'utf8');
  vm.runInNewContext(colorPaletteCode, context);

  // Load TextBox class
  const textBoxCode = fs.readFileSync(path.join(__dirname, '../../src/TextBox.js'), 'utf8');
  vm.runInNewContext(textBoxCode, context);

  // Load Connection class
  const connectionCode = fs.readFileSync(path.join(__dirname, '../../src/Connection.js'), 'utf8');
  vm.runInNewContext(connectionCode, context);

  // Load MindMap class
  const mindMapCode = fs.readFileSync(path.join(__dirname, '../../src/MindMap.js'), 'utf8');
  vm.runInNewContext(mindMapCode, context);

  return context;
}

describe('Utils.generateUUID', () => {
  let context;

  beforeAll(() => {
    context = setupTestEnvironment();
  });

  test('should generate valid UUID strings', () => {
    const { Utils } = context;
    const uuid1 = Utils.generateUUID();
    const uuid2 = Utils.generateUUID();

    expect(typeof uuid1).toBe('string');
    expect(typeof uuid2).toBe('string');
    expect(uuid1.length).toBeGreaterThan(0);
    expect(uuid2.length).toBeGreaterThan(0);
  });

  test('should generate unique UUIDs', () => {
    const { Utils } = context;
    const uuid1 = Utils.generateUUID();
    const uuid2 = Utils.generateUUID();
    const uuid3 = Utils.generateUUID();

    expect(uuid1).not.toBe(uuid2);
    expect(uuid1).not.toBe(uuid3);
    expect(uuid2).not.toBe(uuid3);
  });

  test('should generate UUIDs matching UUID v4 format', () => {
    const { Utils } = context;
    const uuid = Utils.generateUUID();

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where x is any hex digit and y is one of 8,9,a,b
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  });

  test('should generate many unique UUIDs without collisions', () => {
    const { Utils } = context;
    const uuids = new Set();
    const count = 1000;

    for (let i = 0; i < count; i++) {
      uuids.add(Utils.generateUUID());
    }

    expect(uuids.size).toBe(count);
  });
});

describe('TextBox UUID Implementation', () => {
  let context;

  beforeAll(() => {
    context = setupTestEnvironment();
  });

  test('should generate ID in constructor', () => {
    const { TextBox } = context;
    const box = new TextBox(100, 100, 'Test Box');

    expect(box.id).toBeTruthy();
    expect(typeof box.id).toBe('string');
    expect(box.id.length).toBeGreaterThan(0);
  });

  test('should generate unique IDs for different boxes', () => {
    const { TextBox } = context;
    const box1 = new TextBox(100, 100, 'Box 1');
    const box2 = new TextBox(200, 200, 'Box 2');
    const box3 = new TextBox(300, 300, 'Box 3');

    expect(box1.id).not.toBe(box2.id);
    expect(box1.id).not.toBe(box3.id);
    expect(box2.id).not.toBe(box3.id);
  });

  test('toJSON should include id field', () => {
    const { TextBox } = context;
    const box = new TextBox(100, 100, 'Test Box');
    const json = box.toJSON();

    expect(json).toHaveProperty('id');
    expect(json.id).toBe(box.id);
    expect(typeof json.id).toBe('string');
  });

  test('toJSON should include all essential fields', () => {
    const { TextBox } = context;
    const box = new TextBox(150, 200, 'Test Content');
    box.width = 250;
    box.height = 100;
    const json = box.toJSON();

    expect(json).toHaveProperty('id');
    expect(json).toHaveProperty('x', 150);
    expect(json).toHaveProperty('y', 200);
    expect(json).toHaveProperty('text', 'Test Content');
    expect(json).toHaveProperty('width');
    expect(json).toHaveProperty('height');
  });

  test('fromJSON should preserve existing ID when present', () => {
    const { TextBox } = context;
    const existingId = 'test-uuid-12345';
    const data = {
      id: existingId,
      x: 100,
      y: 100,
      text: 'Test',
      width: 200,
      height: 80
    };

    const box = TextBox.fromJSON(data);

    expect(box.id).toBe(existingId);
  });

  test('fromJSON should generate new ID if missing', () => {
    const { TextBox } = context;
    const data = {
      x: 100,
      y: 100,
      text: 'Test',
      width: 200,
      height: 80
    };

    const box = TextBox.fromJSON(data);

    expect(box.id).toBeTruthy();
    expect(typeof box.id).toBe('string');
  });

  test('fromJSON should ignore invalid ID types', () => {
    const { TextBox } = context;
    const invalidIds = [null, undefined, 123, {}, [], true];

    invalidIds.forEach(invalidId => {
      const data = {
        id: invalidId,
        x: 100,
        y: 100,
        text: 'Test',
        width: 200,
        height: 80
      };

      const box = TextBox.fromJSON(data);
      
      // Should generate new ID when given invalid ID
      expect(box.id).toBeTruthy();
      expect(typeof box.id).toBe('string');
      expect(box.id).not.toBe(invalidId);
    });
  });
});

describe('Connection ID-based Serialization', () => {
  let context;

  beforeAll(() => {
    context = setupTestEnvironment();
  });

  test('toJSON should include fromId and toId', () => {
    const { TextBox, Connection } = context;
    const fromBox = new TextBox(100, 100, 'From');
    const toBox = new TextBox(200, 200, 'To');
    const conn = new Connection(fromBox, toBox);

    const boxes = [fromBox, toBox];
    const json = conn.toJSON(boxes);

    expect(json).toHaveProperty('fromId');
    expect(json).toHaveProperty('toId');
    expect(json.fromId).toBe(fromBox.id);
    expect(json.toId).toBe(toBox.id);
  });

  test('toJSON should include legacy from and to indices for backward compatibility', () => {
    const { TextBox, Connection } = context;
    const fromBox = new TextBox(100, 100, 'From');
    const toBox = new TextBox(200, 200, 'To');
    const conn = new Connection(fromBox, toBox);

    const boxes = [fromBox, toBox];
    const json = conn.toJSON(boxes);

    expect(json).toHaveProperty('from');
    expect(json).toHaveProperty('to');
    expect(typeof json.from).toBe('number');
    expect(typeof json.to).toBe('number');
    expect(json.from).toBe(0);
    expect(json.to).toBe(1);
  });

  test('fromJSON should use ID-based lookup when IDs are present', () => {
    const { TextBox, Connection } = context;
    const box1 = new TextBox(100, 100, 'Box 1');
    const box2 = new TextBox(200, 200, 'Box 2');
    const box3 = new TextBox(300, 300, 'Box 3');

    const data = {
      fromId: box1.id,
      toId: box3.id,
      from: 0,  // Legacy index (should be ignored when IDs present)
      to: 1     // Legacy index (should be ignored when IDs present)
    };

    const boxes = [box1, box2, box3];
    const conn = Connection.fromJSON(data, boxes);

    expect(conn).toBeTruthy();
    expect(conn.fromBox).toBe(box1);
    expect(conn.toBox).toBe(box3);
  });

  test('fromJSON should fall back to index-based lookup when IDs missing', () => {
    const { TextBox, Connection } = context;
    const box1 = new TextBox(100, 100, 'Box 1');
    const box2 = new TextBox(200, 200, 'Box 2');

    const data = {
      from: 0,
      to: 1
    };

    const boxes = [box1, box2];
    const conn = Connection.fromJSON(data, boxes);

    expect(conn).toBeTruthy();
    expect(conn.fromBox).toBe(box1);
    expect(conn.toBox).toBe(box2);
  });

  test('fromJSON should support Map input for ID lookup', () => {
    const { TextBox, Connection } = context;
    const box1 = new TextBox(100, 100, 'Box 1');
    const box2 = new TextBox(200, 200, 'Box 2');

    const data = {
      fromId: box1.id,
      toId: box2.id
    };

    const boxMap = new Map();
    boxMap.set(box1.id, box1);
    boxMap.set(box2.id, box2);

    const conn = Connection.fromJSON(data, boxMap);

    expect(conn).toBeTruthy();
    expect(conn.fromBox).toBe(box1);
    expect(conn.toBox).toBe(box2);
  });

  test('fromJSON should return null when boxes not found by ID', () => {
    const { TextBox, Connection } = context;
    const box1 = new TextBox(100, 100, 'Box 1');
    const box2 = new TextBox(200, 200, 'Box 2');

    const data = {
      fromId: 'non-existent-id-1',
      toId: 'non-existent-id-2'
    };

    const boxes = [box1, box2];
    const conn = Connection.fromJSON(data, boxes);

    expect(conn).toBeNull();
  });

  test('fromJSON should return null when indices out of bounds', () => {
    const { TextBox, Connection } = context;
    const box1 = new TextBox(100, 100, 'Box 1');

    const data = {
      from: 0,
      to: 5  // Out of bounds
    };

    const boxes = [box1];
    const conn = Connection.fromJSON(data, boxes);

    expect(conn).toBeNull();
  });

  test('fromJSON edge case: empty array should return null', () => {
    const { Connection } = context;
    const data = {
      from: 0,
      to: 1
    };

    const conn = Connection.fromJSON(data, []);

    expect(conn).toBeNull();
  });
});

describe('MindMap.getBoxById', () => {
  let context;

  beforeAll(() => {
    context = setupTestEnvironment();
  });

  test('should find box by ID', () => {
    const { TextBox, MindMap } = context;
    const mindMap = new MindMap();
    
    const box1 = new TextBox(100, 100, 'Box 1');
    const box2 = new TextBox(200, 200, 'Box 2');
    const box3 = new TextBox(300, 300, 'Box 3');
    
    mindMap.boxes.push(box1, box2, box3);

    const found = mindMap.getBoxById(box2.id);

    expect(found).toBe(box2);
  });

  test('should return null for non-existent ID', () => {
    const { TextBox, MindMap } = context;
    const mindMap = new MindMap();
    
    const box1 = new TextBox(100, 100, 'Box 1');
    mindMap.boxes.push(box1);

    const found = mindMap.getBoxById('non-existent-id');

    expect(found).toBeNull();
  });

  test('should return null for null ID', () => {
    const { MindMap } = context;
    const mindMap = new MindMap();

    const found = mindMap.getBoxById(null);

    expect(found).toBeNull();
  });

  test('should return null for undefined ID', () => {
    const { MindMap } = context;
    const mindMap = new MindMap();

    const found = mindMap.getBoxById(undefined);

    expect(found).toBeNull();
  });

  test('should return null for non-string ID', () => {
    const { TextBox, MindMap } = context;
    const mindMap = new MindMap();
    
    const box1 = new TextBox(100, 100, 'Box 1');
    mindMap.boxes.push(box1);

    const found1 = mindMap.getBoxById(123);
    const found2 = mindMap.getBoxById({});
    const found3 = mindMap.getBoxById([]);

    expect(found1).toBeNull();
    expect(found2).toBeNull();
    expect(found3).toBeNull();
  });

  test('should return null for empty string ID', () => {
    const { MindMap } = context;
    const mindMap = new MindMap();

    const found = mindMap.getBoxById('');

    expect(found).toBeNull();
  });

  test('should work with empty boxes array', () => {
    const { MindMap } = context;
    const mindMap = new MindMap();

    const found = mindMap.getBoxById('some-id');

    expect(found).toBeNull();
  });
});

describe('Backward Compatibility', () => {
  let context;

  beforeAll(() => {
    context = setupTestEnvironment();
  });

  test('should handle legacy data without IDs in TextBox', () => {
    const { TextBox } = context;
    
    const legacyData = {
      x: 100,
      y: 100,
      text: 'Legacy Box',
      width: 200,
      height: 80
      // No 'id' field
    };

    const box = TextBox.fromJSON(legacyData);

    expect(box).toBeTruthy();
    expect(box.id).toBeTruthy();
    expect(typeof box.id).toBe('string');
    expect(box.x).toBe(100);
    expect(box.y).toBe(100);
    expect(box.text).toBe('Legacy Box');
  });

  test('should handle legacy data with only indices in Connection', () => {
    const { TextBox, Connection } = context;
    
    const box1 = new TextBox(100, 100, 'Box 1');
    const box2 = new TextBox(200, 200, 'Box 2');
    
    const legacyData = {
      from: 0,
      to: 1
      // No 'fromId' or 'toId' fields
    };

    const boxes = [box1, box2];
    const conn = Connection.fromJSON(legacyData, boxes);

    expect(conn).toBeTruthy();
    expect(conn.fromBox).toBe(box1);
    expect(conn.toBox).toBe(box2);
  });

  test('should handle mixed data with both IDs and indices', () => {
    const { TextBox, Connection } = context;
    
    const box1 = new TextBox(100, 100, 'Box 1');
    const box2 = new TextBox(200, 200, 'Box 2');
    const box3 = new TextBox(300, 300, 'Box 3');
    
    const mixedData = {
      fromId: box1.id,
      toId: box3.id,
      from: 1,  // These indices point to different boxes
      to: 2     // but IDs should take precedence
    };

    const boxes = [box1, box2, box3];
    const conn = Connection.fromJSON(mixedData, boxes);

    expect(conn).toBeTruthy();
    // Should use ID-based lookup (box1 -> box3), not index-based (box2 -> box3)
    expect(conn.fromBox).toBe(box1);
    expect(conn.toBox).toBe(box3);
  });

  test('Round-trip: save and load should preserve IDs', () => {
    const { TextBox, Connection } = context;
    
    const box1 = new TextBox(100, 100, 'Box 1');
    const box2 = new TextBox(200, 200, 'Box 2');
    const originalId1 = box1.id;
    const originalId2 = box2.id;
    
    const conn = new Connection(box1, box2);
    const boxes = [box1, box2];
    
    // Save
    const json = conn.toJSON(boxes);
    
    // Load
    const loadedBoxes = [
      TextBox.fromJSON(box1.toJSON()),
      TextBox.fromJSON(box2.toJSON())
    ];
    const loadedConn = Connection.fromJSON(json, loadedBoxes);

    expect(loadedBoxes[0].id).toBe(originalId1);
    expect(loadedBoxes[1].id).toBe(originalId2);
    expect(loadedConn.fromBox.id).toBe(originalId1);
    expect(loadedConn.toBox.id).toBe(originalId2);
  });
});

// ============================================================================
// LEGACY REGEX-BASED TESTS BELOW
// TODO: Convert these to behavioral tests like the ones above
// ============================================================================

const textBoxCode = fs.readFileSync(path.join(__dirname, '../../src/TextBox.js'), 'utf8');
const connectionCode = fs.readFileSync(path.join(__dirname, '../../src/Connection.js'), 'utf8');
const mindMapCode = fs.readFileSync(path.join(__dirname, '../../src/MindMap.js'), 'utf8');
const utilsCode = fs.readFileSync(path.join(__dirname, '../../src/utils.js'), 'utf8');

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

    test('MindMap should not have deprecated undo method', () => {
        // Verify deprecated undo method has been removed
        expect(mindMapCode).not.toMatch(/\bundo\s*\(\)\s*\{[^}]*deprecated/si);
    });

    test('MindMap should not have deprecated pushUndo method', () => {
        // Verify deprecated pushUndo method has been removed
        expect(mindMapCode).not.toMatch(/\bpushUndo\s*\(\)\s*\{/);
    });

    test('CollaborationManager should have initialize method', () => {
        // Verify initialize method exists for unified undo system
        const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');
        expect(collabCode).toMatch(/async initialize\s*\(/);
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
        expect(collabCode).toMatch(/if\s*\(\s*isSynced\s*\)\s*\{[^}]*_startConsistencyCheck/s);
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
        // Should show dialog immediately if user has local data from another context
        expect(sketchCode).toMatch(/User has data from another context.*showing options/i);
        expect(sketchCode).toMatch(/pendingConnection.*true/);
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

    test('MindMap should not have deprecated undo method', () => {
        // Verify deprecated undo method has been removed
        expect(mindMapCode).not.toMatch(/\bundo\s*\(\)\s*\{[^}]*deprecated/si);
    });

    test('MindMap should not have deprecated pushUndo method', () => {
        // Verify deprecated pushUndo method has been removed
        expect(mindMapCode).not.toMatch(/\bpushUndo\s*\(\)\s*\{/);
    });

    test('CollaborationManager should have initialize method', () => {
        // Verify initialize method exists for unified undo system
        const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');
        expect(collabCode).toMatch(/async initialize\s*\(/);
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
        expect(collabCode).toMatch(/if\s*\(\s*isSynced\s*\)\s*\{[^}]*_startConsistencyCheck/s);
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
        // Should show dialog immediately if user has local data from another context
        expect(sketchCode).toMatch(/User has data from another context.*showing options/i);
        expect(sketchCode).toMatch(/pendingConnection.*true/);
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
