/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load source files
const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

describe('Undo System Reliability', () => {
    describe('Timer Synchronization', () => {
        test('_resetTextEditUndoTimer should always clear and reset timer', () => {
            // Should NOT have the 100ms skip optimization that caused premature closure
            expect(collabCode).not.toMatch(/timeSinceLastReset\s*<\s*100/);
            
            // Should always clear the timer before setting a new one
            expect(collabCode).toMatch(/_resetTextEditUndoTimer.*clearTimeout.*this\.textEditUndoTimer/s);
        });
        
        test('_resetTextEditUndoTimer should set new timeout every time', () => {
            // Should always create a new timeout
            expect(collabCode).toMatch(/_resetTextEditUndoTimer.*setTimeout/s);
        });
    });

    describe('Pending Sync Flushing', () => {
        test('should have _flushPendingTextSyncs method', () => {
            expect(collabCode).toMatch(/_flushPendingTextSyncs\s*\(/);
        });
        
        test('_flushPendingTextSyncs should clear timers', () => {
            const flushMatch = collabCode.match(/_flushPendingTextSyncs[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_[a-z]|\n\s{4}[a-z][a-zA-Z]*\s*\()/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];
            
            // Should clear timeout
            expect(flushCode).toMatch(/clearTimeout/);
            // Should delete from map
            expect(flushCode).toMatch(/textSyncTimers\.delete/);
        });
        
        test('_flushPendingTextSyncs should immediately sync the box', () => {
            const flushMatch = collabCode.match(/_flushPendingTextSyncs[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_[a-z]|\n\s{4}[a-z][a-zA-Z]*\s*\()/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];
            
            // Should call transact with undoManager origin
            expect(flushCode).toMatch(/this\.ydoc\.transact\(/);
            expect(flushCode).toMatch(/this\.undoManager\)/);
        });
        
        test('_flushPendingTextSyncs should validate box still exists', () => {
            const flushMatch = collabCode.match(/_flushPendingTextSyncs[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_[a-z]|\n\s{4}[a-z][a-zA-Z]*\s*\()/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];
            
            // Should check if box exists before syncing
            expect(flushCode).toMatch(/if\s*\(\s*box\s*\)/);
            expect(flushCode).toMatch(/getBoxById/);
        });
    });

    describe('Text Edit Undo Group Closure', () => {
        test('_closeTextEditUndoGroup should flush pending syncs before closing', () => {
            // Find the _closeTextEditUndoGroup method
            const closeMatch = collabCode.match(/_closeTextEditUndoGroup\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(closeMatch).toBeTruthy();
            const closeCode = closeMatch[0];
            
            // Should call _flushPendingTextSyncs before stopCapturing
            expect(closeCode).toMatch(/_flushPendingTextSyncs/);
            const flushIndex = closeCode.indexOf('_flushPendingTextSyncs');
            const stopCapturingIndex = closeCode.indexOf('stopCapturing');
            expect(flushIndex).toBeLessThan(stopCapturingIndex);
        });
        
        test('_closeTextEditUndoGroup should flush for currentEditingBoxId', () => {
            // Find the _closeTextEditUndoGroup method
            const closeMatch = collabCode.match(/_closeTextEditUndoGroup\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(closeMatch).toBeTruthy();
            const closeCode = closeMatch[0];
            
            // Should flush the current editing box's pending syncs
            expect(closeCode).toMatch(/if\s*\(\s*this\.currentEditingBoxId\s*\)/);
            expect(closeCode).toMatch(/_flushPendingTextSyncs\(\s*this\.currentEditingBoxId\s*\)/);
        });
    });

    describe('Box Switching Safety', () => {
        test('syncBoxToYjs should flush previous box when switching', () => {
            // Find the syncBoxToYjs method
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];
            
            // When switching boxes (currentEditingBoxId !== box.id)
            expect(syncCode).toMatch(/if\s*\(\s*this\.currentEditingBoxId.*this\.currentEditingBoxId\s*!==\s*box\.id\s*\)/);
            
            // Should flush the previous box's pending syncs
            expect(syncCode).toMatch(/_flushPendingTextSyncs\(\s*this\.currentEditingBoxId\s*\)/);
        });
        
        test('syncBoxToYjs should flush before closing undo group when switching', () => {
            // Find the syncBoxToYjs method
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];
            
            // Should have both flush and close
            expect(syncCode).toMatch(/_flushPendingTextSyncs\(\s*this\.currentEditingBoxId\s*\)/);
            expect(syncCode).toMatch(/_closeTextEditUndoGroup/);
            
            // Flush should come before close
            const flushIndex = syncCode.indexOf('_flushPendingTextSyncs(this.currentEditingBoxId)');
            const closeIndex = syncCode.indexOf('_closeTextEditUndoGroup()');
            expect(flushIndex).toBeGreaterThan(-1);
            expect(closeIndex).toBeGreaterThan(-1);
            expect(flushIndex).toBeLessThan(closeIndex);
        });
    });

    describe('Stale Box Reference Prevention', () => {
        test('debounced text sync should check currentEditingBoxId still matches', () => {
            // Find the syncBoxToYjs method
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];
            
            // Should verify currentEditingBoxId matches boxId before syncing
            expect(syncCode).toMatch(/this\.currentEditingBoxId\s*===\s*boxId/);
        });
        
        test('debounced text sync should validate box still exists', () => {
            // Find the syncBoxToYjs method
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];
            
            // Should get box by ID and check it exists
            expect(syncCode).toMatch(/getBoxById\(\s*boxId\s*\)/);
            expect(syncCode).toMatch(/if\s*\(\s*currentBox/);
        });
    });

    describe('Transaction Origin Consistency', () => {
        test('text sync should use undoManager as transaction origin', () => {
            // Find _flushPendingTextSyncs method which does the immediate sync
            const flushMatch = collabCode.match(/_flushPendingTextSyncs\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];
            
            // transact calls should use this.undoManager as origin
            expect(flushCode).toMatch(/this\.ydoc\.transact\(/);
            expect(flushCode).toMatch(/,\s*this\.undoManager\s*\)/);
        });
        
        test('transact helper should close text edit undo group first', () => {
            const transactMatch = collabCode.match(/transact\s*\(\s*callback[\s\S]*?\n\s{4}\}/);
            expect(transactMatch).toBeTruthy();
            const transactCode = transactMatch[0];
            
            // Should close any open text editing undo group
            expect(transactCode).toMatch(/if\s*\(\s*this\.isTextEditUndoGroupOpen\s*\)/);
            expect(transactCode).toMatch(/_closeTextEditUndoGroup/);
        });
    });

    describe('Documentation and Comments', () => {
        test('should document the flush mechanism', () => {
            // _flushPendingTextSyncs should have JSDoc
            expect(collabCode).toMatch(/\/\*\*[\s\S]*?@private[\s\S]*?_flushPendingTextSyncs/);
        });
        
        test('should have comment explaining critical flush in _closeTextEditUndoGroup', () => {
            // Find the _closeTextEditUndoGroup method
            const closeMatch = collabCode.match(/_closeTextEditUndoGroup\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(closeMatch).toBeTruthy();
            const closeCode = closeMatch[0];
            
            // Should have a CRITICAL comment explaining why flush is needed
            expect(closeCode).toMatch(/CRITICAL.*flush/i);
        });
        
        test('should document box switching safety in syncBoxToYjs', () => {
            // Find the syncBoxToYjs method
            const syncMatch = collabCode.match(/syncBoxToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];
            
            // Should explain why we flush when switching boxes
            expect(syncCode).toMatch(/flush.*previous.*box|previous.*box.*flush/i);
        });
    });
});

describe('Undo System Integration', () => {
    describe('Timer Coordination', () => {
        test('TEXT_SYNC_DEBOUNCE should be less than TEXT_UNDO_GROUP_TIMEOUT', () => {
            const debounceMatch = collabCode.match(/TEXT_SYNC_DEBOUNCE\s*=\s*(\d+)/);
            const timeoutMatch = collabCode.match(/TEXT_UNDO_GROUP_TIMEOUT\s*=\s*(\d+)/);
            
            expect(debounceMatch).toBeTruthy();
            expect(timeoutMatch).toBeTruthy();
            
            const debounce = parseInt(debounceMatch[1]);
            const timeout = parseInt(timeoutMatch[1]);
            
            // Debounce should be less than timeout to ensure sync happens before group closes
            expect(debounce).toBeLessThan(timeout);
        });
    });

    describe('Delete Box Safety', () => {
        test('deleteBoxFromYjs should close text editing undo group for deleted box', () => {
            // Find the deleteBoxFromYjs method
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];
            
            // Should check if deleting currently edited box
            expect(deleteCode).toMatch(/if\s*\(\s*this\.currentEditingBoxId\s*===\s*boxId/);
            // Should close the undo group (which includes flush)
            expect(deleteCode).toMatch(/_closeTextEditUndoGroup/);
        });
        
        test('deleteBoxFromYjs should clear pending text sync timer', () => {
            // Find the deleteBoxFromYjs method
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];
            
            // Should clear the timer
            expect(deleteCode).toMatch(/clearTimeout/);
            // Should remove from map
            expect(deleteCode).toMatch(/textSyncTimers\.delete/);
        });
    });
});
