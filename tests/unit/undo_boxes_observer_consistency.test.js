/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load source files
const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

describe('Boxes Observer Undo Consistency', () => {
    test('boxes observer should handle undo/redo even when isSyncing is true (consistency with connections observer)', () => {
        // Find both observers
        const boxesObserverMatch = collabCode.match(/this\.yboxes\.observe\(\(event\)\s*=>\s*\{[\s\S]*?(?=\n\s{8}\}\);)/);
        const connectionsObserverMatch = collabCode.match(/this\.yconnections\.observe\(\(event\)\s*=>\s*\{[\s\S]*?(?=\n\s{8}\}\);)/);
        
        expect(boxesObserverMatch).toBeTruthy();
        expect(connectionsObserverMatch).toBeTruthy();
        
        const boxesObserverCode = boxesObserverMatch[0];
        const connectionsObserverCode = connectionsObserverMatch[0];
        
        // Both should define isUndoRedo
        expect(boxesObserverCode).toMatch(/const isUndoRedo\s*=\s*event\.transaction\.origin\s*===\s*this\.undoManager/);
        expect(connectionsObserverCode).toMatch(/const isUndoRedo\s*=\s*event\.transaction\.origin\s*===\s*this\.undoManager/);
        
        // CRITICAL: Both observers should allow undo/redo to proceed even when isSyncing is true
        // This ensures that if one observer sets isSyncing=true, the other can still process
        // undo/redo transactions
        
        // Connections observer correctly has the exception
        expect(connectionsObserverCode).toMatch(/if\s*\(\s*this\.isSyncing\s*&&\s*!isUndoRedo\s*\)\s*return/);
        
        // Boxes observer SHOULD ALSO have the exception for consistency
        // This prevents intermittent undo failures when isSyncing is true from another operation
        expect(boxesObserverCode).toMatch(/if\s*\(\s*this\.isSyncing\s*&&\s*!isUndoRedo\s*\)\s*return/);
    });
    
    test('boxes observer should skip non-undo local transactions', () => {
        const boxesObserverMatch = collabCode.match(/this\.yboxes\.observe\(\(event\)\s*=>\s*\{[\s\S]*?(?=\n\s{8}\}\);)/);
        expect(boxesObserverMatch).toBeTruthy();
        const boxesObserverCode = boxesObserverMatch[0];
        
        // Should skip local transactions that are not undo/redo
        expect(boxesObserverCode).toMatch(/if\s*\(\s*event\.transaction\.local\s*&&\s*!isUndoRedo\s*\)\s*return/);
    });
    
    test('both observers should have consistent isSyncing handling', () => {
        const boxesObserverMatch = collabCode.match(/this\.yboxes\.observe\(\(event\)\s*=>\s*\{[\s\S]*?(?=\n\s{8}\}\);)/);
        const connectionsObserverMatch = collabCode.match(/this\.yconnections\.observe\(\(event\)\s*=>\s*\{[\s\S]*?(?=\n\s{8}\}\);)/);
        
        expect(boxesObserverMatch).toBeTruthy();
        expect(connectionsObserverMatch).toBeTruthy();
        
        const boxesObserverCode = boxesObserverMatch[0];
        const connectionsObserverCode = connectionsObserverMatch[0];
        
        // Both should set isSyncing = true in try block
        expect(boxesObserverCode).toMatch(/this\.isSyncing\s*=\s*true/);
        expect(connectionsObserverCode).toMatch(/this\.isSyncing\s*=\s*true/);
        
        // Both should reset isSyncing = false in finally block
        expect(boxesObserverCode).toMatch(/finally\s*\{[\s\S]*?this\.isSyncing\s*=\s*false/);
        expect(connectionsObserverCode).toMatch(/finally\s*\{[\s\S]*?this\.isSyncing\s*=\s*false/);
    });
    
    test('boxes observer should have comment explaining undo/redo handling', () => {
        const boxesObserverMatch = collabCode.match(/this\.yboxes\.observe\(\(event\)\s*=>\s*\{[\s\S]*?(?=\n\s{8}\}\);)/);
        expect(boxesObserverMatch).toBeTruthy();
        const boxesObserverCode = boxesObserverMatch[0];
        
        // Should have a comment explaining the undo/redo handling
        expect(boxesObserverCode).toMatch(/Skip.*sync.*undo.*redo/i);
        expect(boxesObserverCode).toMatch(/Undo.*redo.*local.*origin/i);
    });
});
