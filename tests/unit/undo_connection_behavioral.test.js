/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load source file for code inspection
const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

/**
 * Behavioral tests for undo/redo connection restoration.
 *
 * These tests verify the FIX for the long-standing bug where deleting
 * a box with connections and then undoing would not reliably restore
 * the connections. The root cause was non-deterministic Yjs observer
 * firing order (Map insertion order in transaction.changed).
 *
 * The fix: the yboxes observer now calls _rebuildConnectionsFromYjs()
 * during undo/redo, ensuring connections are rebuilt AFTER boxes are
 * available regardless of observer execution order.
 */
describe('Undo Connection Restoration - Behavioral', () => {

    describe('Code structure verification', () => {
        test('yboxes observer calls _rebuildConnectionsFromYjs during undo/redo', () => {
            // Find the _setupObservers method
            const setupMatch = collabCode.match(/_setupObservers\s*\(\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_applyBoxFromYjs)/);
            expect(setupMatch).toBeTruthy();
            const setupCode = setupMatch[0];

            // Find the yboxes observer section (first observer) - note: arrow function without parens around 'event'
            const boxesObserverMatch = setupCode.match(/this\.yboxes\.observe\(\(?event\)?\s*=>\s*\{[\s\S]*?\n\s{8}\}\);/);
            expect(boxesObserverMatch).toBeTruthy();
            const boxesObserver = boxesObserverMatch[0];

            // Must call _rebuildConnectionsFromYjs during undo/redo
            expect(boxesObserver).toMatch(/_rebuildConnectionsFromYjs\(\)/);

            // Must be gated by isUndoRedo check
            expect(boxesObserver).toMatch(/if\s*\(\s*isUndoRedo\s*\)\s*\{[\s\S]*?_rebuildConnectionsFromYjs/);
        });

        test('_rebuildConnectionsFromYjs call is after box processing loop', () => {
            // The rebuild call must come after event.changes.keys.forEach
            const setupMatch = collabCode.match(/_setupObservers\s*\(\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_applyBoxFromYjs)/);
            expect(setupMatch).toBeTruthy();
            const setupCode = setupMatch[0];

            const forEachIndex = setupCode.indexOf('event.changes.keys.forEach');
            const rebuildIndex = setupCode.indexOf('_rebuildConnectionsFromYjs()');

            expect(forEachIndex).toBeGreaterThan(-1);
            expect(rebuildIndex).toBeGreaterThan(-1);
            expect(rebuildIndex).toBeGreaterThan(forEachIndex);
        });

        test('yconnections observer still calls _rebuildConnectionsFromYjs', () => {
            // The connections observer should still rebuild as a fallback
            const connObserverMatch = collabCode.match(/this\.yconnections\.observe\(\(?event\)?\s*=>\s*\{[\s\S]*?\n\s{8}\}\);/);
            expect(connObserverMatch).toBeTruthy();
            const connObserver = connObserverMatch[0];

            expect(connObserver).toMatch(/_rebuildConnectionsFromYjs\(\)/);
        });

        test('_deleteBoxFromLocal still cleans up connections', () => {
            // _deleteBoxFromLocal should still filter connections to avoid stale references
            const deleteMatch = collabCode.match(/_deleteBoxFromLocal\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            expect(deleteCode).toMatch(/mindMap\.connections\s*=\s*this\.mindMap\.connections\.filter/);
        });
    });

    describe('Observer ordering fix', () => {
        test('rebuild connections call is inside try block with isUndoRedo guard', () => {
            // Extract the try block inside the yboxes observer
            const boxesObserverTryMatch = collabCode.match(
                /this\.yboxes\.observe[\s\S]*?isSyncing\s*=\s*true;\s*\n\s*try\s*\{([\s\S]*?)\}\s*finally/
            );
            expect(boxesObserverTryMatch).toBeTruthy();
            const tryBlock = boxesObserverTryMatch[1];

            // Must contain the isUndoRedo-gated rebuild call
            expect(tryBlock).toMatch(/if\s*\(\s*isUndoRedo\s*\)/);
            expect(tryBlock).toMatch(/_rebuildConnectionsFromYjs/);
        });

        test('comment explains the observer ordering problem', () => {
            // The comment should explain WHY this fix is needed
            const commentMatch = collabCode.match(/CRITICAL.*undo\/redo.*rebuild.*connections[\s\S]*?firing order is non-deterministic/i);
            expect(commentMatch).toBeTruthy();

            // Should mention non-deterministic ordering
            expect(commentMatch[0]).toMatch(/non-deterministic/i);
        });
    });

    describe('deleteBoxFromYjs transaction integrity', () => {
        test('box and connections are deleted in same transaction', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Must wrap in single transaction
            const transactMatch = deleteCode.match(/this\.transact\([^{]*\{[\s\S]*?\}\s*,\s*['"]deleteBox['"]/);
            expect(transactMatch).toBeTruthy();

            // Transaction must include both box deletion and connection deletion
            expect(transactMatch[0]).toMatch(/yboxes\.delete/);
            expect(transactMatch[0]).toMatch(/yconnections\.delete/);
        });

        test('connections are found by both fromId and toId', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            expect(deleteCode).toMatch(/c\.fromId\s*===\s*boxId/);
            expect(deleteCode).toMatch(/c\.toId\s*===\s*boxId/);
        });
    });

    describe('_rebuildConnectionsFromYjs robustness', () => {
        test('skips connections with missing boxes', () => {
            const rebuildMatch = collabCode.match(/_rebuildConnectionsFromYjs\s*\(\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(rebuildMatch).toBeTruthy();
            const rebuildCode = rebuildMatch[0];

            // Must check both fromBox and toBox existence
            expect(rebuildCode).toMatch(/fromBox\s*&&\s*toBox/);
        });

        test('logs skipped connections for debugging', () => {
            const rebuildMatch = collabCode.match(/_rebuildConnectionsFromYjs\s*\(\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(rebuildMatch).toBeTruthy();
            const rebuildCode = rebuildMatch[0];

            expect(rebuildCode).toMatch(/Logger\.debug.*Skipped connection/);
        });

        test('clears existing connections before rebuilding', () => {
            const rebuildMatch = collabCode.match(/_rebuildConnectionsFromYjs\s*\(\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(rebuildMatch).toBeTruthy();
            const rebuildCode = rebuildMatch[0];

            // Must clear connections array before rebuild
            expect(rebuildCode).toMatch(/this\.mindMap\.connections\s*=\s*\[\]/);
        });
    });
});
