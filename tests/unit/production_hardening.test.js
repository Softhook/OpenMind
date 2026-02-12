/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load source files
const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

// ============================================================================
// P0: UndoManager maxStackSize
// ============================================================================

describe('P0: UndoManager Memory Safety', () => {
    test('MAX_UNDO_STACK_SIZE constant should be defined', () => {
        expect(collabCode).toMatch(/static MAX_UNDO_STACK_SIZE\s*=\s*\d+/);
    });

    test('MAX_UNDO_STACK_SIZE should be a reasonable value (50-500)', () => {
        const match = collabCode.match(/static MAX_UNDO_STACK_SIZE\s*=\s*(\d+)/);
        expect(match).toBeTruthy();
        const value = parseInt(match[1]);
        expect(value).toBeGreaterThanOrEqual(50);
        expect(value).toBeLessThanOrEqual(500);
    });

    test('UndoManager should be initialized with maxStackSize', () => {
        // Find the UndoManager constructor call
        const undoManagerMatch = collabCode.match(
            /new this\.Y\.UndoManager\s*\(\s*\[[^\]]*\]\s*,\s*\{[^}]*\}\s*\)/s
        );
        expect(undoManagerMatch).toBeTruthy();
        const initCode = undoManagerMatch[0];

        // Should include maxStackSize option
        expect(initCode).toMatch(/maxStackSize\s*:\s*CollaborationManager\.MAX_UNDO_STACK_SIZE/);
    });

    test('UndoManager should still have captureTimeout and trackedOrigins', () => {
        const undoManagerMatch = collabCode.match(
            /new this\.Y\.UndoManager\s*\(\s*\[[^\]]*\]\s*,\s*\{[^}]*\}\s*\)/s
        );
        expect(undoManagerMatch).toBeTruthy();
        const initCode = undoManagerMatch[0];

        expect(initCode).toMatch(/captureTimeout\s*:\s*CollaborationManager\.UNDO_CAPTURE_TIMEOUT/);
        expect(initCode).toMatch(/trackedOrigins\s*:\s*new Set\(\)/);
    });
});

// ============================================================================
// P0: Stable User ID Generation
// ============================================================================

describe('P0: Stable User Identity', () => {
    test('_generateUserId should attempt to read from localStorage first', () => {
        const methodMatch = collabCode.match(
            /_generateUserId\s*\(\s*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_[a-z]|\n\s{4}[a-z][a-zA-Z]*\s*\()/
        );
        expect(methodMatch).toBeTruthy();
        const methodCode = methodMatch[0];

        // Should read from localStorage
        expect(methodCode).toMatch(/localStorage\.getItem\s*\(\s*['"]openmind_userId['"]\s*\)/);
    });

    test('_generateUserId should use crypto.randomUUID when available', () => {
        const methodMatch = collabCode.match(
            /_generateUserId\s*\(\s*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_[a-z]|\n\s{4}[a-z][a-zA-Z]*\s*\()/
        );
        expect(methodMatch).toBeTruthy();
        const methodCode = methodMatch[0];

        // Should check for crypto.randomUUID
        expect(methodCode).toMatch(/crypto\.randomUUID/);
    });

    test('_generateUserId should have Math.random fallback', () => {
        const methodMatch = collabCode.match(
            /_generateUserId\s*\(\s*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_[a-z]|\n\s{4}[a-z][a-zA-Z]*\s*\()/
        );
        expect(methodMatch).toBeTruthy();
        const methodCode = methodMatch[0];

        // Should still have Math.random fallback
        expect(methodCode).toMatch(/Math\.random\(\)/);
    });

    test('_generateUserId should persist new ID to localStorage', () => {
        const methodMatch = collabCode.match(
            /_generateUserId\s*\(\s*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_[a-z]|\n\s{4}[a-z][a-zA-Z]*\s*\()/
        );
        expect(methodMatch).toBeTruthy();
        const methodCode = methodMatch[0];

        // Should save to localStorage
        expect(methodCode).toMatch(/localStorage\.setItem\s*\(\s*['"]openmind_userId['"]/);
    });

    test('_generateUserId should handle localStorage errors gracefully', () => {
        const methodMatch = collabCode.match(
            /_generateUserId\s*\(\s*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_[a-z]|\n\s{4}[a-z][a-zA-Z]*\s*\()/
        );
        expect(methodMatch).toBeTruthy();
        const methodCode = methodMatch[0];

        // Should wrap localStorage operations in try/catch
        // Count the number of catch blocks (should be at least 2: read + write)
        const catchCount = (methodCode.match(/catch\s*\(/g) || []).length;
        expect(catchCount).toBeGreaterThanOrEqual(2);
    });

    test('localStorage read should come before generation', () => {
        const methodMatch = collabCode.match(
            /_generateUserId\s*\(\s*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_[a-z]|\n\s{4}[a-z][a-zA-Z]*\s*\()/
        );
        expect(methodMatch).toBeTruthy();
        const methodCode = methodMatch[0];

        const getItemIndex = methodCode.indexOf('localStorage.getItem');
        const randomUUIDIndex = methodCode.indexOf('crypto.randomUUID');
        expect(getItemIndex).toBeGreaterThan(-1);
        expect(randomUUIDIndex).toBeGreaterThan(-1);
        expect(getItemIndex).toBeLessThan(randomUUIDIndex);
    });
});

// ============================================================================
// P1: Connection Duplicate Prevention
// ============================================================================

describe('P1: Connection Deduplication', () => {
    test('_rebuildConnectionsFromYjs should track seen connection pairs', () => {
        const rebuildMatch = collabCode.match(
            /_rebuildConnectionsFromYjs\s*\(\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/
        );
        expect(rebuildMatch).toBeTruthy();
        const rebuildCode = rebuildMatch[0];

        // Should have a Set for tracking seen connections
        expect(rebuildCode).toMatch(/new Set\(\)/);
        expect(rebuildCode).toMatch(/seen/);
    });

    test('_rebuildConnectionsFromYjs should create connection key from fromId and toId', () => {
        const rebuildMatch = collabCode.match(
            /_rebuildConnectionsFromYjs\s*\(\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/
        );
        expect(rebuildMatch).toBeTruthy();
        const rebuildCode = rebuildMatch[0];

        // Should create a key combining fromId and toId
        expect(rebuildCode).toMatch(/data\.fromId/);
        expect(rebuildCode).toMatch(/data\.toId/);
        expect(rebuildCode).toMatch(/seen\.has\(/);
    });

    test('_rebuildConnectionsFromYjs should skip duplicate connections', () => {
        const rebuildMatch = collabCode.match(
            /_rebuildConnectionsFromYjs\s*\(\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/
        );
        expect(rebuildMatch).toBeTruthy();
        const rebuildCode = rebuildMatch[0];

        // Should have continue to skip duplicates
        expect(rebuildCode).toMatch(/if\s*\(\s*seen\.has\([^)]*\)\s*\)/);
        expect(rebuildCode).toMatch(/duplicateCount/);
        expect(rebuildCode).toMatch(/continue/);
    });

    test('_rebuildConnectionsFromYjs should log deduplicated count', () => {
        const rebuildMatch = collabCode.match(
            /_rebuildConnectionsFromYjs\s*\(\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/
        );
        expect(rebuildMatch).toBeTruthy();
        const rebuildCode = rebuildMatch[0];

        // Should log when duplicates are found
        expect(rebuildCode).toMatch(/duplicateCount\s*>\s*0/);
        expect(rebuildCode).toMatch(/Deduplicated/i);
    });
});

// ============================================================================
// P1: destroy() Defense-in-Depth
// ============================================================================

describe('P1: destroy() Cleanup Robustness', () => {
    test('destroy should call _stopConsistencyCheck explicitly', () => {
        const destroyMatch = collabCode.match(
            /destroy\s*\(\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/
        );
        expect(destroyMatch).toBeTruthy();
        const destroyCode = destroyMatch[0];

        // Should explicitly stop consistency check
        expect(destroyCode).toMatch(/_stopConsistencyCheck\(\)/);
    });

    test('destroy should stop consistency check after disconnect', () => {
        const destroyMatch = collabCode.match(
            /destroy\s*\(\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/
        );
        expect(destroyMatch).toBeTruthy();
        const destroyCode = destroyMatch[0];

        // _stopConsistencyCheck should appear after this.disconnect()
        const disconnectIndex = destroyCode.indexOf('this.disconnect()');
        const stopCheckIndex = destroyCode.indexOf('_stopConsistencyCheck()');
        expect(disconnectIndex).toBeGreaterThan(-1);
        expect(stopCheckIndex).toBeGreaterThan(-1);
        expect(stopCheckIndex).toBeGreaterThan(disconnectIndex);
    });

    test('disconnect should also stop consistency check (double coverage)', () => {
        const disconnectMatch = collabCode.match(
            /disconnect\s*\(\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/
        );
        expect(disconnectMatch).toBeTruthy();
        const disconnectCode = disconnectMatch[0];

        expect(disconnectCode).toMatch(/_stopConsistencyCheck\(\)/);
    });
});
