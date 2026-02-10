/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load source files
const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

describe('Connection Undo System', () => {
    describe('Box Deletion with Connections', () => {
        test('deleteBoxFromYjs should delete connections in same transaction', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Must access yconnections to delete associated connections
            expect(deleteCode).toMatch(/this\.yconnections/);
            
            // Must find connections involving the deleted box (check both directions)
            expect(deleteCode).toMatch(/c\.fromId\s*===\s*boxId/);
            expect(deleteCode).toMatch(/c\.toId\s*===\s*boxId/);
            
            // Must delete connections in the same transaction as the box
            // This ensures undo restores both box and connections together
            const transactMatch = deleteCode.match(/this\.transact\([^{]*\{[\s\S]*?\}\s*,\s*['"]deleteBox['"]/);
            expect(transactMatch).toBeTruthy();
            
            // Within the transaction, must delete from yconnections
            expect(transactMatch[0]).toMatch(/yconnections\.delete/);
        });

        test('deleteBoxFromYjs should handle descending index deletion', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Must sort indices in descending order to avoid index shifting issues
            expect(deleteCode).toMatch(/sort.*\(a,\s*b\)\s*=>\s*b\s*-\s*a/);
        });

        test('deleteBoxFromYjs should delete both fromId and toId connections', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Must check both directions (box as source and as target)
            expect(deleteCode).toMatch(/c\.fromId\s*===\s*boxId/);
            expect(deleteCode).toMatch(/c\.toId\s*===\s*boxId/);
        });

        test('deleteBoxFromYjs should include connection deletion in fallback case', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Should have fallback case (else branch)
            const fallbackMatch = deleteCode.match(/else\s*\{[\s\S]*?Fallback[\s\S]*?\n\s{12}\}/);
            expect(fallbackMatch).toBeTruthy();
            
            // Fallback should also delete connections
            expect(fallbackMatch[0]).toMatch(/yconnections/);
            expect(fallbackMatch[0]).toMatch(/c\.fromId\s*===\s*boxId/);
            expect(fallbackMatch[0]).toMatch(/c\.toId\s*===\s*boxId/);
        });

        test('deleteBoxFromYjs should log connection deletion count', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Should log how many connections were deleted for debugging
            expect(deleteCode).toMatch(/Logger\.debug.*[Dd]eleted.*connections?/);
        });
    });

    describe('Documentation', () => {
        test('deleteBoxFromYjs should document connection deletion in comment', () => {
            const deleteMatch = collabCode.match(/deleteBoxFromYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
            expect(deleteMatch).toBeTruthy();
            const deleteCode = deleteMatch[0];

            // Should have CRITICAL comment explaining why connections are deleted in same transaction
            expect(deleteCode).toMatch(/CRITICAL.*connections.*transaction/i);
            expect(deleteCode).toMatch(/undo.*restore.*box.*connections/i);
        });

        test('deleteBoxFromYjs JSDoc should mention connections', () => {
            const jsdocMatch = collabCode.match(/\/\*\*[\s\S]*?Removes a box from Yjs[\s\S]*?\*\/\s*deleteBoxFromYjs/);
            expect(jsdocMatch).toBeTruthy();
            
            // JSDoc should mention that it handles connections
            expect(jsdocMatch[0]).toMatch(/connection/i);
        });
    });
});
