/**
 * Unit tests for utility functions
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Create a sandbox context with browser-like globals
const sandbox = {
  window: {
    matchMedia: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    })),
    innerWidth: 1024,
    innerHeight: 768,
  },
  console: console,
};

// Load and run utils.js in the sandbox
const utilsCode = fs.readFileSync(path.join(__dirname, '../../src/utils.js'), 'utf8');
const script = new vm.Script(utilsCode);
script.runInNewContext(sandbox);

// Extract the functions from sandbox.window.OpenMindUtils (where utils.js exports them)
const Utils = sandbox.window.OpenMindUtils;
const {
  isValidNumber,
  areValidCoordinates,
  isValidPoint,
  areValidDimensions,
  safeValue,
  safeNumber,
  safePositiveNumber,
  clamp,
  sanitizeText,
  isWhitespace,
  distance,
  distanceSquared,
  isPointInRect,
  safeForEach,
  safeFilter,
  deepClone,
  validateColor,
  AppConfig,
} = Utils;

describe('Validation Utilities', () => {
  describe('isValidNumber', () => {
    test('should return true for valid numbers', () => {
      expect(isValidNumber(0)).toBe(true);
      expect(isValidNumber(42)).toBe(true);
      expect(isValidNumber(-42)).toBe(true);
      expect(isValidNumber(3.14)).toBe(true);
      expect(isValidNumber(0.001)).toBe(true);
    });

    test('should return false for non-numbers', () => {
      expect(isValidNumber(null)).toBe(false);
      expect(isValidNumber(undefined)).toBe(false);
      expect(isValidNumber('42')).toBe(false);
      expect(isValidNumber({})).toBe(false);
      expect(isValidNumber([])).toBe(false);
    });

    test('should return false for special number values', () => {
      expect(isValidNumber(NaN)).toBe(false);
      expect(isValidNumber(Infinity)).toBe(false);
      expect(isValidNumber(-Infinity)).toBe(false);
    });
  });

  describe('areValidCoordinates', () => {
    test('should return true for valid coordinate pairs', () => {
      expect(areValidCoordinates(0, 0)).toBe(true);
      expect(areValidCoordinates(100, 200)).toBe(true);
      expect(areValidCoordinates(-50, 75.5)).toBe(true);
    });

    test('should return false if either coordinate is invalid', () => {
      expect(areValidCoordinates(NaN, 0)).toBe(false);
      expect(areValidCoordinates(0, NaN)).toBe(false);
      expect(areValidCoordinates(Infinity, 100)).toBe(false);
      expect(areValidCoordinates(null, 0)).toBe(false);
    });
  });

  describe('isValidPoint', () => {
    test('should return true for valid point objects', () => {
      expect(isValidPoint({ x: 0, y: 0 })).toBe(true);
      expect(isValidPoint({ x: 100, y: -50 })).toBe(true);
    });

    test('should return false for invalid point objects', () => {
      expect(isValidPoint(null)).toBe(false);
      expect(isValidPoint(undefined)).toBe(false);
      expect(isValidPoint({})).toBe(false);
      expect(isValidPoint({ x: 0 })).toBe(false);
      expect(isValidPoint({ y: 0 })).toBe(false);
      expect(isValidPoint({ x: NaN, y: 0 })).toBe(false);
    });
  });
});

describe('Safe Value Utilities', () => {
  describe('safeValue', () => {
    test('should return value if valid', () => {
      expect(safeValue(42, 0)).toBe(42);
      expect(safeValue('hello', 'default')).toBe('hello');
      expect(safeValue(false, true)).toBe(false);
    });

    test('should return default for null/undefined', () => {
      expect(safeValue(null, 'default')).toBe('default');
      expect(safeValue(undefined, 'default')).toBe('default');
    });

    test('should use validator function if provided', () => {
      const isPositive = (v) => typeof v === 'number' && v > 0;
      expect(safeValue(5, 1, isPositive)).toBe(5);
      expect(safeValue(-5, 1, isPositive)).toBe(1);
      expect(safeValue('not a number', 1, isPositive)).toBe(1);
    });
  });

  describe('safeNumber', () => {
    test('should return number if valid', () => {
      expect(safeNumber(42, 0)).toBe(42);
      expect(safeNumber(3.14, 0)).toBe(3.14);
    });

    test('should return default for invalid numbers', () => {
      expect(safeNumber(NaN, 0)).toBe(0);
      expect(safeNumber(Infinity, 0)).toBe(0);
      expect(safeNumber(null, 0)).toBe(0);
      expect(safeNumber('42', 0)).toBe(0);
    });
  });

  describe('safePositiveNumber', () => {
    test('should return positive number if valid', () => {
      expect(safePositiveNumber(42, 1)).toBe(42);
      expect(safePositiveNumber(0.5, 1)).toBe(0.5);
    });

    test('should return default for non-positive or invalid', () => {
      expect(safePositiveNumber(0, 1)).toBe(1);
      expect(safePositiveNumber(-5, 1)).toBe(1);
      expect(safePositiveNumber(NaN, 1)).toBe(1);
    });
  });

  describe('clamp', () => {
    test('should clamp values within range', () => {
      expect(clamp(50, 0, 100)).toBe(50);
      expect(clamp(-10, 0, 100)).toBe(0);
      expect(clamp(150, 0, 100)).toBe(100);
    });

    test('should handle edge cases', () => {
      expect(clamp(NaN, 0, 100)).toBe(0);
    });
  });
});

describe('Geometry Utilities', () => {
  describe('distance', () => {
    test('should calculate distance correctly', () => {
      expect(distance(0, 0, 3, 4)).toBe(5);
      expect(distance(0, 0, 0, 0)).toBe(0);
      expect(distance(1, 1, 4, 5)).toBe(5);
    });

    test('should return Infinity for invalid coordinates', () => {
      expect(distance(NaN, 0, 3, 4)).toBe(Infinity);
      expect(distance(0, 0, NaN, 4)).toBe(Infinity);
    });
  });

  describe('distanceSquared', () => {
    test('should calculate squared distance correctly', () => {
      expect(distanceSquared(0, 0, 3, 4)).toBe(25);
      expect(distanceSquared(0, 0, 0, 0)).toBe(0);
    });

    test('should return Infinity for invalid coordinates', () => {
      expect(distanceSquared(NaN, 0, 3, 4)).toBe(Infinity);
    });
  });

  describe('isPointInRect', () => {
    test('should detect point inside rectangle', () => {
      expect(isPointInRect(50, 50, 50, 50, 100, 100)).toBe(true);
      expect(isPointInRect(0, 0, 50, 50, 100, 100)).toBe(true);
    });

    test('should detect point outside rectangle', () => {
      expect(isPointInRect(200, 50, 50, 50, 100, 100)).toBe(false);
      expect(isPointInRect(-50, 50, 50, 50, 100, 100)).toBe(false);
    });

    test('should return false for invalid inputs', () => {
      expect(isPointInRect(NaN, 50, 50, 50, 100, 100)).toBe(false);
      expect(isPointInRect(50, 50, 50, 50, -100, 100)).toBe(false);
    });
  });
});

describe('String Utilities', () => {
  describe('sanitizeText', () => {
    test('should normalize line endings', () => {
      expect(sanitizeText('hello\r\nworld')).toBe('hello\nworld');
      expect(sanitizeText('hello\rworld')).toBe('hello\nworld');
    });

    test('should handle null/undefined', () => {
      expect(sanitizeText(null)).toBe('');
      expect(sanitizeText(undefined)).toBe('');
    });

    test('should preserve valid text', () => {
      expect(sanitizeText('hello world')).toBe('hello world');
      expect(sanitizeText('line1\nline2')).toBe('line1\nline2');
    });
  });

  describe('isWhitespace', () => {
    test('should identify whitespace characters', () => {
      expect(isWhitespace(' ')).toBe(true);
      expect(isWhitespace('\n')).toBe(true);
      expect(isWhitespace('\t')).toBe(true);
      expect(isWhitespace('\r')).toBe(true);
    });

    test('should return false for non-whitespace', () => {
      expect(isWhitespace('a')).toBe(false);
      expect(isWhitespace('1')).toBe(false);
      expect(isWhitespace('')).toBe(false);
    });
  });
});

describe('Array Utilities', () => {
  describe('safeForEach', () => {
    test('should iterate over valid elements', () => {
      const results = [];
      safeForEach([1, 2, 3], (item) => results.push(item));
      expect(results).toEqual([1, 2, 3]);
    });

    test('should skip null/undefined elements', () => {
      const results = [];
      safeForEach([1, null, 2, undefined, 3], (item) => results.push(item));
      expect(results).toEqual([1, 2, 3]);
    });

    test('should handle non-array input', () => {
      const results = [];
      safeForEach(null, (item) => results.push(item));
      expect(results).toEqual([]);
    });
  });

  describe('safeFilter', () => {
    test('should filter valid elements', () => {
      const result = safeFilter([1, 2, 3, 4, 5], (x) => x > 2);
      expect(result).toEqual([3, 4, 5]);
    });

    test('should skip null/undefined elements', () => {
      const result = safeFilter([1, null, 2, undefined, 3], (x) => x > 1);
      expect(result).toEqual([2, 3]);
    });
  });

  describe('deepClone', () => {
    test('should create a deep copy', () => {
      const original = { a: 1, b: { c: 2 } };
      const clone = deepClone(original);

      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone.b).not.toBe(original.b);
    });

    test('should handle null/undefined', () => {
      expect(deepClone(null)).toBe(null);
      expect(deepClone(undefined)).toBe(undefined);
    });
  });
});

describe('Color Utilities', () => {
  describe('validateColor', () => {
    test('should validate and normalize color objects', () => {
      const color = validateColor({ r: 100, g: 150, b: 200 });
      expect(color.r).toBe(100);
      expect(color.g).toBe(150);
      expect(color.b).toBe(200);
    });

    test('should clamp out-of-range values', () => {
      const color = validateColor({ r: 300, g: -50, b: 100 });
      expect(color.r).toBe(255);
      expect(color.g).toBe(0);
      expect(color.b).toBe(100);
    });

    test('should return default for invalid input', () => {
      const color = validateColor(null);
      expect(color.r).toBe(255);
      expect(color.g).toBe(255);
      expect(color.b).toBe(255);
    });
  });
});

describe('AppConfig', () => {
  test('should have zoom settings', () => {
    expect(AppConfig.ZOOM.MIN).toBe(0.2);
    expect(AppConfig.ZOOM.MAX).toBe(3.0);
    expect(AppConfig.ZOOM.DEFAULT).toBe(1.0);
  });

  test('should have UI settings', () => {
    expect(AppConfig.UI.TOOLBAR_HEIGHT).toBe(40);
    expect(typeof AppConfig.UI.SAVE_INDICATOR_SIZE).toBe('number');
  });

  test('should have autosave interval', () => {
    expect(AppConfig.AUTOSAVE.INTERVAL).toBe(30000);
  });
});

describe('applyFill and applyStroke color helpers', () => {
  let mockFill, mockStroke, mockStrokeWeight;
  let testSandbox, applyFill, applyStroke;
  
  beforeEach(() => {
    // Create a fresh sandbox for each test with mocked p5.js functions
    mockFill = jest.fn();
    mockStroke = jest.fn();
    mockStrokeWeight = jest.fn();
    
    testSandbox = {
      window: {
        matchMedia: jest.fn().mockImplementation(query => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
        })),
        innerWidth: 1024,
        innerHeight: 768,
      },
      console: console,
      fill: mockFill,
      stroke: mockStroke,
      strokeWeight: mockStrokeWeight,
    };
    
    // Load utils in fresh context
    const script = new vm.Script(utilsCode);
    script.runInNewContext(testSandbox);
    
    // Extract the helper functions
    applyFill = testSandbox.window.OpenMindUtils.applyFill;
    applyStroke = testSandbox.window.OpenMindUtils.applyStroke;
  });
  
  describe('applyFill', () => {
    test('should handle RGB color object without alpha', () => {
      const color = { r: 100, g: 150, b: 255 };
      applyFill(color);
      
      expect(mockFill).toHaveBeenCalledWith(100, 150, 255);
    });
    
    test('should handle RGBA color object with alpha', () => {
      const color = { r: 100, g: 150, b: 255, a: 128 };
      applyFill(color);
      
      expect(mockFill).toHaveBeenCalledWith(100, 150, 255, 128);
    });
    
    test('should handle grayscale number', () => {
      applyFill(200);
      
      expect(mockFill).toHaveBeenCalledWith(200);
    });
    
    test('should handle alpha = 0', () => {
      const color = { r: 100, g: 150, b: 255, a: 0 };
      applyFill(color);
      
      expect(mockFill).toHaveBeenCalledWith(100, 150, 255, 0);
    });
    
    test('should handle alpha = 255', () => {
      const color = { r: 100, g: 150, b: 255, a: 255 };
      applyFill(color);
      
      expect(mockFill).toHaveBeenCalledWith(100, 150, 255, 255);
    });
    
    test('should handle null color gracefully', () => {
      applyFill(null);
      
      expect(mockFill).not.toHaveBeenCalled();
    });
    
    test('should handle undefined color gracefully', () => {
      applyFill(undefined);
      
      expect(mockFill).not.toHaveBeenCalled();
    });
    
    test('should validate and clamp color values using validateColor', () => {
      const color = { r: 300, g: -50, b: 150 }; // Out of bounds values
      applyFill(color);
      
      // validateColor should clamp to 0-255
      expect(mockFill).toHaveBeenCalledWith(255, 0, 150);
    });
  });
  
  describe('applyStroke', () => {
    test('should handle RGB color object without alpha', () => {
      const color = { r: 100, g: 150, b: 255 };
      applyStroke(color, 2);
      
      expect(mockStroke).toHaveBeenCalledWith(100, 150, 255);
      expect(mockStrokeWeight).toHaveBeenCalledWith(2);
    });
    
    test('should handle RGBA color object with alpha', () => {
      const color = { r: 100, g: 150, b: 255, a: 128 };
      applyStroke(color, 3);
      
      expect(mockStroke).toHaveBeenCalledWith(100, 150, 255, 128);
      expect(mockStrokeWeight).toHaveBeenCalledWith(3);
    });
    
    test('should handle grayscale number', () => {
      applyStroke(200, 1);
      
      expect(mockStroke).toHaveBeenCalledWith(200);
      expect(mockStrokeWeight).toHaveBeenCalledWith(1);
    });
    
    test('should use default weight of 1', () => {
      const color = { r: 100, g: 150, b: 255 };
      applyStroke(color);
      
      expect(mockStrokeWeight).toHaveBeenCalledWith(1);
    });
    
    test('should handle null color gracefully', () => {
      applyStroke(null, 2);
      
      expect(mockStroke).not.toHaveBeenCalled();
      // When color is null, function returns early so strokeWeight is not called
      expect(mockStrokeWeight).not.toHaveBeenCalled();
    });
    
    test('should validate and clamp color values using validateColor', () => {
      const color = { r: 300, g: -50, b: 150 }; // Out of bounds values
      applyStroke(color, 2);
      
      // validateColor should clamp to 0-255
      expect(mockStroke).toHaveBeenCalledWith(255, 0, 150);
    });
  });
});
