/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load source files
const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

describe('Undo System Edge Cases - Multi-User Scenarios', () => {
    describe('Concurrent Editing Protection', () => {
        test('_applyBoxFromYjs should not overwrite text during active editing', () => {
            // Critical: Remote updates should not overwrite local text while user is typing
            expect(collabCode).toMatch(/if\s*\(\s*typeof\s+data\.text\s*===\s*['"]string['"]\s*&&\s*!box\.isEditing\s*\)/);
        });

        test('_applyBoxFromYjs should have forceApply for undo/redo', () => {
            // When undo/redo fires, we need to force-apply even if editing
            expect(collabCode).toMatch(/forceApply/);
            expect(collabCode).toMatch(/typeof\s+data\.text\s*===\s*['"]string['"]\s*&&\s*forceApply/);
        });

        test('should protect highlights during editing', () => {
            // Highlights should not be overwritten during editing
            expect(collabCode).toMatch(/Array\.isArray\(data\.highlights\)\s*&&\s*\(\s*forceApply\s*\|\|\s*!box\.isEditing\s*\)/);
        });

        test('should protect bold/italic ranges during editing', () => {
            // Style ranges should not be overwritten during editing
            expect(collabCode).toMatch(/Array\.isArray\(data\.boldRanges\)\s*&&\s*\(\s*forceApply\s*\|\|\s*!box\.isEditing\s*\)/);
        });
    });

    describe('Undo During Active Editing', () => {
        test('undo() should close text edit group before undoing', () => {
            const undoMatch = collabCode.match(/undo\s*\(\s*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(undoMatch).toBeTruthy();
            const undoCode = undoMatch[0];

            // Must close text editing group before performing undo
            expect(undoCode).toMatch(/if\s*\(\s*this\.isTextEditUndoGroupOpen\s*\)/);
            expect(undoCode).toMatch(/_closeTextEditUndoGroup/);

            // Close should come before undoManager.undo()
            const closeIndex = undoCode.indexOf('_closeTextEditUndoGroup');
            const undoIndex = undoCode.indexOf('undoManager.undo()');
            expect(closeIndex).toBeLessThan(undoIndex);
        });

        test('redo() should close text edit group before redoing', () => {
            const redoMatch = collabCode.match(/redo\s*\(\s*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(redoMatch).toBeTruthy();
            const redoCode = redoMatch[0];

            // Must close text editing group before performing redo
            expect(redoCode).toMatch(/if\s*\(\s*this\.isTextEditUndoGroupOpen\s*\)/);
            expect(redoCode).toMatch(/_closeTextEditUndoGroup/);
        });
    });

    describe('Box Deletion Edge Cases', () => {
        test('deleteBoxFromYjs should close undo group if deleting currently edited box', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Must check if deleting currently edited box
            expect(deleteCode).toMatch(/if\s*\(\s*this\.currentEditingBoxId\s*===\s*boxId/);
            // Must close undo group and clear currentEditingBoxId
            expect(deleteCode).toMatch(/_closeTextEditUndoGroup/);
            expect(deleteCode).toMatch(/this\.currentEditingBoxId\s*=\s*null/);
        });

        test('deleteBoxFromYjs should clear pending text sync timer', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Must clear the pending timer to prevent stale sync
            expect(deleteCode).toMatch(/textSyncTimers\.get\(\s*boxId\s*\)/);
            expect(deleteCode).toMatch(/clearTimeout/);
            expect(deleteCode).toMatch(/textSyncTimers\.delete/);
        });
    });

    describe('Synchronization Flag Protection', () => {
        test('should have isSyncing flag to prevent feedback loops', () => {
            // Must have isSyncing flag in constructor
            expect(collabCode).toMatch(/this\.isSyncing\s*=\s*false/);
        });

        test('yboxes observer should check isSyncing flag', () => {
            const observerMatch = collabCode.match(/yboxes\.observe\([^{]*\{[\s\S]*?\n\s{4}\}\);/);
            expect(observerMatch).toBeTruthy();
            const observerCode = observerMatch[0];

            // Must check isSyncing to prevent feedback loops
            expect(observerCode).toMatch(/if\s*\(\s*this\.isSyncing\s*\)/);
        });

        test('should set isSyncing during observer execution', () => {
            const observerMatch = collabCode.match(/yboxes\.observe\([^{]*\{[\s\S]*?\n\s{4}\}\);/);
            expect(observerMatch).toBeTruthy();
            const observerCode = observerMatch[0];

            // Must set isSyncing = true before processing
            expect(observerCode).toMatch(/this\.isSyncing\s*=\s*true/);
            // Must reset isSyncing = false in finally block
            expect(observerCode).toMatch(/finally[\s\S]*this\.isSyncing\s*=\s*false/);
        });
    });

    describe('Undo/Redo Performance Flag', () => {
        test('should have _isPerformingUndoRedo flag', () => {
            // Must track when undo/redo is in progress
            expect(collabCode).toMatch(/this\._isPerformingUndoRedo\s*=\s*false/);
        });

        test('undo() should set and clear _isPerformingUndoRedo', () => {
            const undoMatch = collabCode.match(/undo\s*\(\s*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(undoMatch).toBeTruthy();
            const undoCode = undoMatch[0];

            // Must set flag before undo
            expect(undoCode).toMatch(/this\._isPerformingUndoRedo\s*=\s*true/);
            // Must clear flag in finally block
            expect(undoCode).toMatch(/finally[\s\S]*this\._isPerformingUndoRedo\s*=\s*false/);
        });

        test('redo() should set and clear _isPerformingUndoRedo', () => {
            const redoMatch = collabCode.match(/redo\s*\(\s*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(redoMatch).toBeTruthy();
            const redoCode = redoMatch[0];

            // Must set flag before redo
            expect(redoCode).toMatch(/this\._isPerformingUndoRedo\s*=\s*true/);
            // Must clear flag in finally block
            expect(redoCode).toMatch(/finally[\s\S]*this\._isPerformingUndoRedo\s*=\s*false/);
        });
    });
});

describe('Undo System Edge Cases - Timing Scenarios', () => {
    describe('Empty Text Edit Protection', () => {
        test('_boxDataEquals should compare text for changes', () => {
            // Must properly detect when text has changed (including to/from empty)
            const equalsMatch = collabCode.match(/_boxDataEquals\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(equalsMatch).toBeTruthy();
        });

        test('_flushPendingTextSyncs should check if data changed before syncing', () => {
            const flushMatch = collabCode.match(/_flushPendingTextSyncs\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];

            // Should check if data actually changed
            expect(flushCode).toMatch(/_boxDataEquals/);
            expect(flushCode).toMatch(/if\s*\(\s*!.*_boxDataEquals/);
        });
    });

    describe('Rapid Box Switching (< 300ms)', () => {
        test('syncBoxToYjs should handle very rapid box switches', () => {
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // When switching boxes, must flush previous box IMMEDIATELY
            // This handles switches faster than the 300ms debounce
            expect(syncCode).toMatch(/_flushPendingTextSyncs\(\s*this\.currentEditingBoxId\s*\)/);

            // Must happen in the box switching condition
            const switchMatch = syncCode.match(/if\s*\(\s*this\.currentEditingBoxId.*!==\s*box\.id\s*\)[\s\S]*?\}/);
            expect(switchMatch).toBeTruthy();
            expect(switchMatch[0]).toMatch(/_flushPendingTextSyncs/);
        });

        test('syncBoxToYjs should clear existing timer when rapidly typing in same box', () => {
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // Must clear existing timer before setting new one
            expect(syncCode).toMatch(/existingTimer\s*=\s*this\.textSyncTimers\.get\(\s*boxId\s*\)/);
            expect(syncCode).toMatch(/if\s*\(\s*existingTimer\s*\)/);
            expect(syncCode).toMatch(/clearTimeout\(\s*existingTimer\s*\)/);
        });
    });

    describe('Debounce Timer Validation', () => {
        test('debounced callback should validate currentEditingBoxId matches', () => {
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // Debounced callback must verify box is still the one being edited
            expect(syncCode).toMatch(/this\.currentEditingBoxId\s*===\s*boxId/);
        });

        test('debounced callback should get fresh box reference', () => {
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // Must get fresh box by ID, not use stale reference
            expect(syncCode).toMatch(/getBoxById\(\s*boxId\s*\)/);
        });

        test('debounced callback should validate box still exists', () => {
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // Must check if currentBox exists before syncing
            expect(syncCode).toMatch(/if\s*\(\s*currentBox/);
        });
    });

    describe('Transaction Origin Consistency', () => {
        test('all text syncs should use undoManager as transaction origin', () => {
            // _flushPendingTextSyncs must use undoManager origin
            const flushMatch = collabCode.match(/_flushPendingTextSyncs\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];

            expect(flushCode).toMatch(/this\.ydoc\.transact\(/);
            expect(flushCode).toMatch(/,\s*this\.undoManager\s*\)/);
        });

        test('transact helper should use undoManager origin', () => {
            const transactMatch = collabCode.match(/transact\s*\(\s*callback[\s\S]*?\n\s{4}\}/);
            expect(transactMatch).toBeTruthy();
            const transactCode = transactMatch[0];

            // Should call ydoc.transact with undoManager as origin
            expect(transactCode).toMatch(/this\.ydoc\.transact\(\s*callback\s*,\s*this\.undoManager\s*\)/);
        });
    });

    describe('Stop Editing Edge Case', () => {
        test('syncBoxToYjs should close undo group when editing stops', () => {
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // When box.isEditing becomes false, must close the group
            // This is in the section after "if (box.isEditing)"
            const afterEditingSection = syncCode.split('if (box.isEditing)')[1];
            expect(afterEditingSection).toMatch(/if\s*\(\s*this\.isTextEditUndoGroupOpen\s*\)/);
            expect(afterEditingSection).toMatch(/_closeTextEditUndoGroup/);
        });
    });
});

describe('Undo System Edge Cases - Robustness', () => {
    describe('Remote Deletion Protection', () => {
        test('_deleteBoxFromLocal should clear pending text sync timer', () => {
            const deleteMatch = collabCode.match(/_deleteBoxFromLocal\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Must clear pending timer to prevent stale sync
            expect(deleteCode).toMatch(/textSyncTimers\.get\(\s*boxId\s*\)/);
            expect(deleteCode).toMatch(/clearTimeout/);
            expect(deleteCode).toMatch(/textSyncTimers\.delete/);
        });

        test('_deleteBoxFromLocal should close undo group if box was being edited', () => {
            const deleteMatch = collabCode.match(/_deleteBoxFromLocal\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Must close undo group if deleting currently edited box
            expect(deleteCode).toMatch(/if\s*\(\s*this\.currentEditingBoxId\s*===\s*boxId/);
            expect(deleteCode).toMatch(/_closeTextEditUndoGroup/);
            expect(deleteCode).toMatch(/this\.currentEditingBoxId\s*=\s*null/);
        });
    });

    describe('Null/Undefined Safety', () => {
        test('syncBoxToYjs should validate required objects', () => {
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // Must check all required objects exist
            expect(syncCode).toMatch(/if\s*\(\s*!this\.yboxes\s*\|\|/);
            expect(syncCode).toMatch(/!box\s*\|\|/);
            expect(syncCode).toMatch(/!box\.id\s*\|\|/);
        });

        test('_flushPendingTextSyncs should validate mindMap and yboxes', () => {
            const flushMatch = collabCode.match(/_flushPendingTextSyncs\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];

            // Must validate all required objects before syncing
            expect(flushCode).toMatch(/this\.mindMap/);
            expect(flushCode).toMatch(/this\.yboxes/);
            expect(flushCode).toMatch(/this\.ydoc/);
            expect(flushCode).toMatch(/this\.undoManager/);
        });

        test('_flushPendingTextSyncs should check isSyncing to prevent re-entrancy', () => {
            const flushMatch = collabCode.match(/_flushPendingTextSyncs\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];

            // Must check isSyncing flag to prevent re-entrant calls
            expect(flushCode).toMatch(/!this\.isSyncing/);
        });

        test('deleteBoxFromYjs should validate yboxes and boxId', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Must validate required parameters
            expect(deleteCode).toMatch(/if\s*\(\s*!this\.yboxes/);
            expect(deleteCode).toMatch(/!boxId/);
        });
    });

    describe('Early Return Protection', () => {
        test('syncBoxToYjs should return early if isSyncing', () => {
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // Must check isSyncing flag to prevent feedback loops
            expect(syncCode).toMatch(/this\.isSyncing.*return/);
        });

        test('deleteBoxFromYjs should return early if isSyncing', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Must check isSyncing flag
            expect(deleteCode).toMatch(/this\.isSyncing.*return/);
        });

        test('undo() should return early if no undoManager', () => {
            const undoMatch = collabCode.match(/undo\s*\(\s*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(undoMatch).toBeTruthy();
            const undoCode = undoMatch[0];

            // Must validate undoManager exists
            expect(undoCode).toMatch(/if\s*\(\s*!this\.undoManager\s*\)/);
        });

        test('undo() should return early if undoStack is empty', () => {
            const undoMatch = collabCode.match(/undo\s*\(\s*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(undoMatch).toBeTruthy();
            const undoCode = undoMatch[0];

            // Must check if there's something to undo
            expect(undoCode).toMatch(/this\.undoManager\.undoStack\.length\s*===\s*0/);
        });
    });

    describe('Redraw Triggering', () => {
        test('undo() should mark mindMap as dirty', () => {
            const undoMatch = collabCode.match(/undo\s*\(\s*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(undoMatch).toBeTruthy();
            const undoCode = undoMatch[0];

            // Must trigger redraw after undo
            expect(undoCode).toMatch(/this\.mindMap\.isDirty\s*=\s*true/);
        });

        test('redo() should mark mindMap as dirty', () => {
            const redoMatch = collabCode.match(/redo\s*\(\s*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(redoMatch).toBeTruthy();
            const redoCode = redoMatch[0];

            // Must trigger redraw after redo
            expect(redoCode).toMatch(/this\.mindMap\.isDirty\s*=\s*true/);
        });
    });
});

describe('Undo System Documentation', () => {
    describe('Critical Comments', () => {
        test('should document why flush is critical in _closeTextEditUndoGroup', () => {
            const closeMatch = collabCode.match(/_closeTextEditUndoGroup\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(closeMatch).toBeTruthy();
            const closeCode = closeMatch[0];

            // Must have CRITICAL comment explaining flush
            expect(closeCode).toMatch(/CRITICAL/i);
            expect(closeCode).toMatch(/flush/i);
        });

        test('should document box switching protection in syncBoxToYjs', () => {
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // Should explain why we flush when switching boxes
            expect(syncCode).toMatch(/prevent.*mix/i);
        });

        test('should document remote edit protection in _applyBoxFromYjs', () => {
            // Should explain why we check isEditing before applying remote text
            expect(collabCode).toMatch(/IMPORTANT.*Don't overwrite text while user is actively editing/);
        });
    });
});
