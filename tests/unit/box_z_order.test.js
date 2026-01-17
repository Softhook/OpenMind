/**
 * Tests for box z-ordering (stacking) behavior
 * Ensures that interacting with boxes brings them to the front
 */

const fs = require('fs');
const path = require('path');

// Read the MindMap source file
const mindMapCode = fs.readFileSync(path.join(__dirname, '../../src/MindMap.js'), 'utf8');

describe('Box Z-Ordering (Stacking)', () => {
  describe('bringBoxToFront method exists', () => {
    test('should have bringBoxToFront method defined', () => {
      expect(mindMapCode).toMatch(/bringBoxToFront\s*\(\s*box\s*\)/);
    });

    test('should check if box exists in array', () => {
      expect(mindMapCode).toMatch(/boxes\.indexOf\s*\(\s*box\s*\)/);
    });

    test('should check if box is already at front', () => {
      expect(mindMapCode).toMatch(/currentIndex\s*===\s*this\.boxes\.length\s*-\s*1/);
    });

    test('should remove box from current position and add to end', () => {
      expect(mindMapCode).toMatch(/boxes\.splice\s*\(\s*currentIndex\s*,\s*1\s*\)/);
      expect(mindMapCode).toMatch(/boxes\.push\s*\(\s*box\s*\)/);
    });

    test('should set isDirty flag', () => {
      expect(mindMapCode).toMatch(/bringBoxToFront[^}]*isDirty\s*=\s*true/s);
    });

    test('should have proper documentation', () => {
      expect(mindMapCode).toMatch(/Brings a box to the front by moving it to the end of the boxes array/);
      expect(mindMapCode).toMatch(/drawn last and appears on top/);
    });
  });

  describe('Integration with click handling', () => {
    test('resize handle click should bring box to front', () => {
      // Check that resize handle click calls bringBoxToFront
      const resizeHandleSection = mindMapCode.match(/Check if clicking on resize handle[\s\S]*?return;/);
      expect(resizeHandleSection).toBeTruthy();
      expect(resizeHandleSection[0]).toMatch(/bringBoxToFront/);
    });

    test('connector dot click should bring box to front', () => {
      // Check that connector dot click calls bringBoxToFront
      const connectorSection = mindMapCode.match(/Check if clicking on a connector dot[\s\S]*?return;/);
      expect(connectorSection).toBeTruthy();
      expect(connectorSection[0]).toMatch(/bringBoxToFront/);
    });

    test('box click should bring box to front', () => {
      // Check that box click calls bringBoxToFront
      const boxClickSection = mindMapCode.match(/Check if clicking inside a box[\s\S]*?return;/);
      expect(boxClickSection).toBeTruthy();
      expect(boxClickSection[0]).toMatch(/bringBoxToFront/);
    });
  });

  describe('Draw order implementation', () => {
    test('boxes should be drawn in array order', () => {
      // Verify that draw() iterates through boxes array in order
      const drawMethod = mindMapCode.match(/draw\s*\(\)\s*\{[\s\S]*?\/\/ Draw boxes[\s\S]*?for\s*\(\s*let\s+box\s+of\s+this\.boxes\s*\)/);
      expect(drawMethod).toBeTruthy();
    });

    test('getTopMostBoxUnderMouse should iterate backwards', () => {
      // Verify that it checks from end to start of array
      expect(mindMapCode).toMatch(/getTopMostBoxUnderMouse[\s\S]*?for\s*\(\s*let\s+i\s*=\s*this\.boxes\.length\s*-\s*1;\s*i\s*>=\s*0;\s*i--\s*\)/s);
    });

    test('should track topBox as last element in draw', () => {
      // The draw method stores the last box as topBox for connection overlay
      expect(mindMapCode).toMatch(/topBox\s*=[\s\S]*?boxes\.length\s*>\s*0[\s\S]*?boxes\[this\.boxes\.length\s*-\s*1\]/s);
    });
  });

  describe('Code quality checks', () => {
    test('should handle null/undefined box gracefully', () => {
      expect(mindMapCode).toMatch(/bringBoxToFront[\s\S]*?if\s*\(\s*!box/s);
    });

    test('should handle empty boxes array', () => {
      expect(mindMapCode).toMatch(/bringBoxToFront[\s\S]*?!this\.boxes/s);
    });

    test('should handle single box array', () => {
      expect(mindMapCode).toMatch(/bringBoxToFront[\s\S]*?boxes\.length\s*<=\s*1/s);
    });

    test('should validate box is in array before reordering', () => {
      expect(mindMapCode).toMatch(/currentIndex\s*===\s*-1/);
    });
  });
});
