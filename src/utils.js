/**
 * OpenMind Shared Utilities
 * 
 * This module provides common utility functions used across the application
 * for validation, coordinate transformations, geometry calculations, and 
 * defensive programming helpers.
 */

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Application-wide configuration settings
 * Centralizes all magic numbers and configuration values
 */
const AppConfig = {
  // Zoom settings
  ZOOM: {
    MIN: 0.2,              // Minimum zoom level (20%)
    MAX: 3.0,              // Maximum zoom level (300%)
    STEP: 1.05,            // Zoom factor per scroll step
    DEFAULT: 1.0           // Default zoom level
  },

  // Camera/pan settings
  CAMERA: {
    PAN_MARGIN: 500        // Soft limit margin for panning (pixels)
  },

  // UI dimensions
  UI: {
    TOOLBAR_HEIGHT: 40,
    MENU_TRIGGER_X: 50,
    MENU_TRIGGER_Y: 50,
    BUTTONS_BAND_HEIGHT: 50,
    BUTTON_START_X: 40,
    BUTTON_Y: 10,
    BUTTON_GAP: 5,
    SAVE_INDICATOR_SIZE: 16,
    SAVE_INDICATOR_X: 20,
    SAVE_INDICATOR_Y: 26
  },

  // Export settings
  EXPORT: {
    PADDING: 50,           // Padding around content in exports
    MARGIN: 20             // Page margins for PDF export
  },

  // Autosave settings
  AUTOSAVE: {
    INTERVAL: 30000        // Autosave interval in milliseconds (30 seconds)
  },

  // Visibility handling
  VISIBILITY: {
    DEBOUNCE_MS: 50        // Debounce time for duplicate visibility events
  },

  // Timing constants
  TIMING: {
    RESIZE_DEBOUNCE_MS: 16, // ~60fps debounce for resize
    DOUBLE_CLICK_MS: 300    // Double-click threshold
  },

  // Storage settings
  STORAGE: {
    DEFAULT_KEY: 'openmind_autosave',
    ROOM_KEY_PREFIX: 'openmind_room_'
  }
};

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Checks if a value is a valid finite number
 * @param {*} value - Value to check
 * @returns {boolean} true if valid finite number
 */
function isValidNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value);
}

/**
 * Checks if coordinates are valid (both x and y are finite numbers)
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} true if both coordinates are valid
 */
function areValidCoordinates(x, y) {
  return isValidNumber(x) && isValidNumber(y);
}

/**
 * Checks if a point object has valid coordinates
 * @param {Object} point - Point object with x and y properties
 * @returns {boolean} true if point has valid x and y
 */
function isValidPoint(point) {
  if (!point || typeof point !== 'object') return false;
  return areValidCoordinates(point.x, point.y);
}

/**
 * Checks if a rectangle has valid dimensions
 * @param {number} width - Width value
 * @param {number} height - Height value
 * @returns {boolean} true if both dimensions are valid positive numbers
 */
function areValidDimensions(width, height) {
  return isValidNumber(width) && isValidNumber(height) && width > 0 && height > 0;
}

/**
 * Safely gets a value with a default fallback
 * @param {*} value - The value to check
 * @param {*} defaultValue - Default value if validation fails
 * @param {Function} validator - Optional validation function
 * @returns {*} The value or default
 */
function safeValue(value, defaultValue, validator = null) {
  if (validator) {
    return validator(value) ? value : defaultValue;
  }
  return (value !== null && value !== undefined) ? value : defaultValue;
}

/**
 * Safely gets a number with validation
 * @param {*} value - The value to check
 * @param {number} defaultValue - Default value if not a valid number
 * @returns {number} Valid number or default
 */
function safeNumber(value, defaultValue = 0) {
  return isValidNumber(value) ? value : defaultValue;
}

/**
 * Safely gets a positive number
 * @param {*} value - The value to check
 * @param {number} defaultValue - Default value if not valid
 * @returns {number} Valid positive number or default
 */
function safePositiveNumber(value, defaultValue = 1) {
  const num = safeNumber(value, defaultValue);
  return num > 0 ? num : defaultValue;
}

/**
 * Clamps a number between min and max values
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(value, min, max) {
  if (!isValidNumber(value)) return min;
  if (!isValidNumber(min)) min = -Infinity;
  if (!isValidNumber(max)) max = Infinity;
  return Math.max(min, Math.min(max, value));
}

/**
 * Gets the current zoom level from the global scope.
 * Returns 1 if zoom is not defined or invalid.
 * @param {number} defaultZoom - Default zoom value if global is invalid
 * @returns {number} Current zoom level
 */
function getCurrentZoom(defaultZoom = 1) {
  if (typeof CameraUtils !== 'undefined') {
    return CameraUtils.zoom;
  }
  if (typeof zoom !== 'undefined' && isValidNumber(zoom) && zoom > 0) {
    return zoom;
  }
  return defaultZoom;
}

/**
 * Gets a zoom factor clamped between min and max bounds.
 * Useful for scaling UI elements that need to remain usable at different zoom levels.
 * @param {number} minFactor - Minimum zoom factor (default: 0.5)
 * @param {number} maxFactor - Maximum zoom factor (default: 2.0)
 * @returns {number} Clamped zoom factor
 */
function getClampedZoomFactor(minFactor = 0.5, maxFactor = 2.0) {
  const currentZoom = getCurrentZoom();
  return Math.max(minFactor, Math.min(maxFactor, currentZoom));
}

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Sanitizes text by normalizing line endings and removing problematic characters
 * @param {*} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeText(text) {
  if (text === null || text === undefined) return '';
  text = String(text);

  // Normalize line endings: convert \r\n and \r to \n
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Remove invisible/control characters except newlines and tabs
  // Keep: \n (0x0A), \t (0x09), and printable characters (0x20+)
  // Remove: C0 controls (0x00-0x08, 0x0B-0x0C, 0x0E-0x1F), DEL (0x7F), C1 controls (0x80-0x9F)
  text = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F\x80-\x9F]/g, '');

  return text;
}

/**
 * Checks if a character is whitespace
 * @param {string} ch - Character to check
 * @returns {boolean} true if whitespace
 */
function isWhitespace(ch) {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r';
}

/**
 * Safely converts any value to a string
 * @param {*} value - Value to convert
 * @returns {string} String representation
 */
function safeString(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

// ============================================================================
// MOUSE COORDINATE UTILITIES
// ============================================================================

/**
 * Gets the current mouse coordinates in world space.
 * World space accounts for camera panning and zoom transformations.
 * Falls back to screen space if worldMouseX/worldMouseY functions are not available.
 * @returns {{x: number, y: number}} Mouse coordinates in world space
 */
function getWorldMouseCoordinates() {
  const x = typeof worldMouseX === 'function' ? worldMouseX() :
    (typeof mouseX !== 'undefined' ? mouseX : 0);
  const y = typeof worldMouseY === 'function' ? worldMouseY() :
    (typeof mouseY !== 'undefined' ? mouseY : 0);
  return { x, y };
}

/**
 * Gets the current mouse coordinates in screen space (pixels on canvas).
 * Does NOT account for camera transformations.
 * @returns {{x: number, y: number}} Mouse coordinates in screen space
 */
function getMouseCoordinates() {
  const x = typeof mouseX !== 'undefined' ? mouseX : 0;
  const y = typeof mouseY !== 'undefined' ? mouseY : 0;
  return { x, y };
}

/**
 * Converts a world X coordinate to screen space.
 * Screen space = world space * zoom + camera offset
 *
 * @param {number} worldX - X coordinate in world space
 * @returns {number} X coordinate in screen space (pixels)
 */
function screenX(worldX) {
  if (typeof CameraUtils !== 'undefined') {
    return CameraUtils.screenX(worldX);
  }
  const z = typeof zoom !== 'undefined' ? zoom : 1;
  const cx = typeof camX !== 'undefined' ? camX : 0;
  return worldX * z + cx;
}

/**
 * Converts a world Y coordinate to screen space.
 * Screen space = world space * zoom + camera offset
 *
 * @param {number} worldY - Y coordinate in world space
 * @returns {number} Y coordinate in screen space (pixels)
 */
function screenY(worldY) {
  if (typeof CameraUtils !== 'undefined') {
    return CameraUtils.screenY(worldY);
  }
  const z = typeof zoom !== 'undefined' ? zoom : 1;
  const cy = typeof camY !== 'undefined' ? camY : 0;
  return worldY * z + cy;
}

/**
 * Converts world coordinates to screen coordinates.
 *
 * @param {number} worldX - X in world space
 * @param {number} worldY - Y in world space
 * @returns {{x: number, y: number}} Coordinates in screen space
 */
function worldToScreen(worldX, worldY) {
  return {
    x: screenX(worldX),
    y: screenY(worldY)
  };
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Structured logging utility with filtering and categorization.
 * Provides consistent logging format across the application with the ability
 * to enable/disable specific categories.
 */
const Logger = {
  // Log categories that can be independently enabled/disabled
  categories: {
    COLLAB: true,      // Collaboration/sync related logs
    STATE: true,       // State management logs
    UI: false,         // UI interaction logs (verbose, usually disabled)
    NETWORK: true,     // Network/connection logs
    ERROR: true,       // Error logs (always recommended)
    DEBUG: false       // Debug logs (verbose, disabled in production)
  },

  /**
   * Logs a message with a category prefix
   * @param {string} category - Category name (e.g., 'COLLAB', 'STATE')
   * @param {...any} args - Arguments to log
   */
  log(category, ...args) {
    if (this.categories[category]) {
      console.log(`[${category}]`, ...args);
    }
  },

  /**
   * Logs a collaboration-related message
   * @param {...any} args - Arguments to log
   */
  collab(...args) {
    this.log('COLLAB', ...args);
  },

  /**
   * Logs a state management message
   * @param {...any} args - Arguments to log
   */
  state(...args) {
    this.log('STATE', ...args);
  },

  /**
   * Logs a UI interaction message
   * @param {...any} args - Arguments to log
   */
  ui(...args) {
    this.log('UI', ...args);
  },

  /**
   * Logs a network/connection message
   * @param {...any} args - Arguments to log
   */
  network(...args) {
    this.log('NETWORK', ...args);
  },

  /**
   * Logs an error (always shown regardless of category settings)
   * @param {...any} args - Arguments to log
   */
  error(...args) {
    console.error('[ERROR]', ...args);
  },

  /**
   * Logs a debug message (useful for development)
   * @param {...any} args - Arguments to log
   */
  debug(...args) {
    this.log('DEBUG', ...args);
  },

  /**
   * Enables a logging category
   * @param {string} category - Category to enable
   */
  enable(category) {
    if (category in this.categories) {
      this.categories[category] = true;
    }
  },

  /**
   * Disables a logging category
   * @param {string} category - Category to disable
   */
  disable(category) {
    if (category in this.categories) {
      this.categories[category] = false;
    }
  },

  /**
   * Enables all logging categories
   */
  enableAll() {
    for (const category in this.categories) {
      this.categories[category] = true;
    }
  },

  /**
   * Disables all logging categories except ERROR
   */
  disableAll() {
    for (const category in this.categories) {
      this.categories[category] = (category === 'ERROR');
    }
  }
};

// ============================================================================
// RENDERING UTILITIES
// ============================================================================

/**
 * Applies stroke styling to the current p5.js context.
 * Handles both grayscale and RGB color values.
 * @param {number|Object} color - Grayscale value (0-255) or RGB object {r, g, b}
 * @param {number} weight - Stroke weight in pixels
 */
function applyStroke(color, weight = 1) {
  if (typeof color === 'number') {
    stroke(color);
  } else if (color && typeof color === 'object') {
    if (color.a !== undefined) {
      stroke(color.r, color.g, color.b, color.a);
    } else {
      stroke(color.r, color.g, color.b);
    }
  }
  strokeWeight(weight);
}

/**
 * Applies fill styling to the current p5.js context.
 * Handles both grayscale and RGB/RGBA color values.
 * @param {number|Object} color - Grayscale value (0-255) or RGB object {r, g, b} or RGBA object {r, g, b, a}
 */
function applyFill(color) {
  if (typeof color === 'number') {
    fill(color);
  } else if (color && typeof color === 'object') {
    if (color.a !== undefined) {
      fill(color.r, color.g, color.b, color.a);
    } else {
      fill(color.r, color.g, color.b);
    }
  }
}

// ============================================================================
// GEOMETRY UTILITIES  
// ============================================================================

/**
 * Calculates the distance between two points
 * @param {number} x1 - First point X
 * @param {number} y1 - First point Y
 * @param {number} x2 - Second point X
 * @param {number} y2 - Second point Y
 * @returns {number} Distance between points, or Infinity if invalid
 */
function distance(x1, y1, x2, y2) {
  if (!areValidCoordinates(x1, y1) || !areValidCoordinates(x2, y2)) {
    return Infinity;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates the squared distance between two points (faster than distance)
 * @param {number} x1 - First point X
 * @param {number} y1 - First point Y
 * @param {number} x2 - Second point X
 * @param {number} y2 - Second point Y
 * @returns {number} Squared distance, or Infinity if invalid
 */
function distanceSquared(x1, y1, x2, y2) {
  if (!areValidCoordinates(x1, y1) || !areValidCoordinates(x2, y2)) {
    return Infinity;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/**
 * Calculates the distance from a point to a line segment
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {number} x1 - Segment start X
 * @param {number} y1 - Segment start Y
 * @param {number} x2 - Segment end X
 * @param {number} y2 - Segment end Y
 * @returns {number} Distance to segment, or Infinity if invalid
 */
function distanceToSegment(px, py, x1, y1, x2, y2) {
  if (!areValidCoordinates(px, py) || !areValidCoordinates(x1, y1) || !areValidCoordinates(x2, y2)) {
    return Infinity;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0 || !isFinite(lengthSquared)) {
    // Line segment is a point
    return distance(px, py, x1, y1);
  }

  // Calculate projection parameter t
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;

  if (!isValidNumber(t)) {
    return Infinity;
  }

  t = clamp(t, 0, 1);

  // Find closest point on segment
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  if (!areValidCoordinates(closestX, closestY)) {
    return Infinity;
  }

  return distance(px, py, closestX, closestY);
}

/**
 * Checks if a point is inside a rectangle (defined by center and dimensions)
 * @param {number} px - Point X
 * @param {number} py - Point Y
 * @param {number} cx - Rectangle center X
 * @param {number} cy - Rectangle center Y
 * @param {number} width - Rectangle width
 * @param {number} height - Rectangle height
 * @returns {boolean} true if point is inside rectangle
 */
function isPointInRect(px, py, cx, cy, width, height) {
  if (!areValidCoordinates(px, py) || !areValidCoordinates(cx, cy)) {
    return false;
  }
  if (!areValidDimensions(width, height)) {
    return false;
  }

  const halfW = width / 2;
  const halfH = height / 2;

  return px >= cx - halfW && px <= cx + halfW &&
    py >= cy - halfH && py <= cy + halfH;
}

/**
 * Checks if two rectangles overlap (defined by corners)
 * @param {number} r1x1 - First rect left
 * @param {number} r1y1 - First rect top
 * @param {number} r1x2 - First rect right
 * @param {number} r1y2 - First rect bottom
 * @param {number} r2x1 - Second rect left
 * @param {number} r2y1 - Second rect top
 * @param {number} r2x2 - Second rect right
 * @param {number} r2y2 - Second rect bottom
 * @returns {boolean} true if rectangles overlap
 */
function rectanglesOverlap(r1x1, r1y1, r1x2, r1y2, r2x1, r2y1, r2x2, r2y2) {
  // Normalize coordinates
  const left1 = Math.min(r1x1, r1x2);
  const right1 = Math.max(r1x1, r1x2);
  const top1 = Math.min(r1y1, r1y2);
  const bottom1 = Math.max(r1y1, r1y2);

  const left2 = Math.min(r2x1, r2x2);
  const right2 = Math.max(r2x1, r2x2);
  const top2 = Math.min(r2y1, r2y2);
  const bottom2 = Math.max(r2y1, r2y2);

  // Check for no overlap
  return !(right1 < left2 || left1 > right2 || bottom1 < top2 || top1 > bottom2);
}

/**
 * Checks if a line segment intersects a rectangle
 * @param {number} x1 - Segment start X
 * @param {number} y1 - Segment start Y
 * @param {number} x2 - Segment end X
 * @param {number} y2 - Segment end Y
 * @param {number} rx1 - Rectangle corner 1 X
 * @param {number} ry1 - Rectangle corner 1 Y
 * @param {number} rx2 - Rectangle corner 2 X
 * @param {number} ry2 - Rectangle corner 2 Y
 * @returns {boolean} true if segment intersects rectangle
 */
function segmentIntersectsRect(x1, y1, x2, y2, rx1, ry1, rx2, ry2) {
  // Normalize rect coordinates
  const minRx = Math.min(rx1, rx2);
  const maxRx = Math.max(rx1, rx2);
  const minRy = Math.min(ry1, ry2);
  const maxRy = Math.max(ry1, ry2);

  // Quick bounding-box early-out
  const segMinX = Math.min(x1, x2);
  const segMaxX = Math.max(x1, x2);
  const segMinY = Math.min(y1, y2);
  const segMaxY = Math.max(y1, y2);

  if (segMaxX < minRx || segMinX > maxRx || segMaxY < minRy || segMinY > maxRy) {
    return false;
  }

  // Quick check: any endpoint inside rect
  if ((x1 >= minRx && x1 <= maxRx && y1 >= minRy && y1 <= maxRy) ||
    (x2 >= minRx && x2 <= maxRx && y2 >= minRy && y2 <= maxRy)) {
    return true;
  }

  // Helper: orientation of three points
  function orient(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }

  // Helper: check if two segments intersect
  function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const o1 = orient(ax, ay, bx, by, cx, cy);
    const o2 = orient(ax, ay, bx, by, dx, dy);
    const o3 = orient(cx, cy, dx, dy, ax, ay);
    const o4 = orient(cx, cy, dx, dy, bx, by);

    // Collinear overlap cases
    if ((o1 === 0 && Math.min(ax, bx) <= cx && cx <= Math.max(ax, bx) &&
      Math.min(ay, by) <= cy && cy <= Math.max(ay, by)) ||
      (o2 === 0 && Math.min(ax, bx) <= dx && dx <= Math.max(ax, bx) &&
        Math.min(ay, by) <= dy && dy <= Math.max(ay, by)) ||
      (o3 === 0 && Math.min(cx, dx) <= ax && ax <= Math.max(cx, dx) &&
        Math.min(cy, dy) <= ay && ay <= Math.max(cy, dy)) ||
      (o4 === 0 && Math.min(cx, dx) <= bx && bx <= Math.max(cx, dx) &&
        Math.min(cy, dy) <= by && by <= Math.max(cy, dy))) {
      return true;
    }

    return (o1 * o2 < 0) && (o3 * o4 < 0);
  }

  // Check against rectangle edges
  if (segmentsIntersect(x1, y1, x2, y2, minRx, minRy, minRx, maxRy)) return true; // left
  if (segmentsIntersect(x1, y1, x2, y2, maxRx, minRy, maxRx, maxRy)) return true; // right
  if (segmentsIntersect(x1, y1, x2, y2, minRx, minRy, maxRx, minRy)) return true; // top
  if (segmentsIntersect(x1, y1, x2, y2, minRx, maxRy, maxRx, maxRy)) return true; // bottom

  return false;
}

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Validates and normalizes a color object
 * @param {Object} color - Color object with r, g, b (and optional a) properties
 * @param {Object} defaultColor - Default color if validation fails
 * @returns {Object} Valid color object
 */
function validateColor(color, defaultColor = { r: 255, g: 255, b: 255 }) {
  if (!color || typeof color !== 'object') {
    return { ...defaultColor };
  }

  return {
    r: clamp(safeNumber(color.r, defaultColor.r), 0, 255),
    g: clamp(safeNumber(color.g, defaultColor.g), 0, 255),
    b: clamp(safeNumber(color.b, defaultColor.b), 0, 255),
    a: color.a !== undefined ? clamp(safeNumber(color.a, 255), 0, 255) : undefined
  };
}

/**
 * Creates an RGBA color string from a color object
 * @param {Object} color - Color object with r, g, b, a properties
 * @returns {string} CSS rgba string
 */
function colorToRGBA(color) {
  const c = validateColor(color);
  const alpha = c.a !== undefined ? c.a / 255 : 1;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

// ============================================================================
// ARRAY AND OBJECT UTILITIES
// ============================================================================

/**
 * Safely iterates over an array, skipping null/undefined elements
 * @param {Array} array - Array to iterate
 * @param {Function} callback - Callback function (element, index)
 */
function safeForEach(array, callback) {
  if (!Array.isArray(array)) return;
  for (let i = 0; i < array.length; i++) {
    if (array[i] !== null && array[i] !== undefined) {
      try {
        callback(array[i], i);
      } catch (e) {
        console.warn('safeForEach callback error:', e);
      }
    }
  }
}

/**
 * Safely filters an array, handling null/undefined elements
 * @param {Array} array - Array to filter
 * @param {Function} predicate - Filter predicate function
 * @returns {Array} Filtered array
 */
function safeFilter(array, predicate) {
  if (!Array.isArray(array)) return [];
  return array.filter((item, index) => {
    if (item === null || item === undefined) return false;
    try {
      return predicate(item, index);
    } catch (e) {
      console.warn('safeFilter predicate error:', e);
      return false;
    }
  });
}

/**
 * Safely maps an array, handling null/undefined elements
 * @param {Array} array - Array to map
 * @param {Function} transform - Transform function
 * @returns {Array} Mapped array
 */
function safeMap(array, transform) {
  if (!Array.isArray(array)) return [];
  const result = [];
  for (let i = 0; i < array.length; i++) {
    if (array[i] !== null && array[i] !== undefined) {
      try {
        result.push(transform(array[i], i));
      } catch (e) {
        console.warn('safeMap transform error:', e);
      }
    }
  }
  return result;
}

/**
 * Deep clones a simple object using JSON serialization.
 * 
 * LIMITATIONS:
 * - Does not handle functions (they will be omitted)
 * - Does not handle Date objects (they become strings)
 * - Does not handle RegExp (they become empty objects)
 * - Does not handle undefined values (they will be omitted)
 * - Does not handle circular references (will throw an error)
 * - Does not handle Map, Set, or other special objects
 * 
 * This is suitable for cloning plain data objects like JSON-serializable state.
 * 
 * @param {Object} obj - Object to clone (should be JSON-serializable)
 * @returns {Object} Cloned object, or original if cloning fails
 */
function deepClone(obj) {
  if (obj === null || obj === undefined) return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    console.warn('deepClone failed (object may contain circular references or non-serializable values):', e);
    return obj;
  }
}

// ============================================================================
// UUID GENERATION
// ============================================================================

/**
 * Generates a unique identifier (UUID v4)
 * Uses crypto.randomUUID() when available, falls back to manual generation
 * for older browsers (Safari < 15.4) or non-HTTPS contexts
 * @returns {string} UUID string
 */
function generateUUID() {
  // Use native crypto.randomUUID if available (Safari 15.4+, HTTPS required)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Fall through to manual generation
    }
  }

  // Fallback: generate UUID v4 manually
  // Uses crypto.getRandomValues if available, otherwise Math.random
  const getRandomValues = (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? (arr) => crypto.getRandomValues(arr)
    : (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; };

  const bytes = new Uint8Array(16);
  getRandomValues(bytes);

  // Set version (4) and variant (RFC 4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant RFC 4122

  // Convert to hex string with dashes
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ============================================================================
// USER NOTIFICATION UTILITIES
// ============================================================================

/**
 * Shows a temporary notification message to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of notification ('info', 'warning', 'error')
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showNotification(message, type = 'info', duration = 3000) {
  // Validate type parameter to prevent potential security issues
  const validTypes = ['info', 'warning', 'error'];
  type = validTypes.includes(type) ? type : 'info';
  
  // Create notification element if it doesn't exist
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    container.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      z-index: 10000;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  
  // Set styles based on type
  const colors = {
    info: { bg: '#2196F3', text: '#fff' },
    warning: { bg: '#FF9800', text: '#fff' },
    error: { bg: '#f44336', text: '#fff' }
  };
  const color = colors[type] || colors.info;
  
  notification.style.cssText = `
    background-color: ${color.bg};
    color: ${color.text};
    padding: 12px 20px;
    border-radius: 4px;
    margin-bottom: 10px;
    font-size: 14px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    opacity: 0;
    transition: opacity 0.3s ease;
    pointer-events: auto;
    max-width: 300px;
  `;
  
  notification.textContent = message;
  container.appendChild(notification);

  // Fade in
  setTimeout(() => {
    notification.style.opacity = '1';
  }, 10);

  // Auto-remove after specified duration
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, duration);
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Safely executes a function with error handling
 * @param {Function} fn - Function to execute
 * @param {*} defaultValue - Default value if function throws
 * @param {string} context - Context string for error logging
 * @returns {*} Function result or default value
 */
function safeExecute(fn, defaultValue = null, context = '') {
  try {
    return fn();
  } catch (e) {
    if (context) {
      console.warn(`Error in ${context}:`, e);
    }
    return defaultValue;
  }
}

/**
 * Wraps a function to catch and log errors
 * @param {Function} fn - Function to wrap
 * @param {string} context - Context string for error logging
 * @returns {Function} Wrapped function
 */
function wrapWithErrorHandler(fn, context = '') {
  return function (...args) {
    try {
      return fn.apply(this, args);
    } catch (e) {
      console.error(`Error in ${context}:`, e);
      return undefined;
    }
  };
}

// ============================================================================
// EXPORT (for module systems, or attach to window for browser)
// ============================================================================

// Make utilities available globally for browser use via a single namespace
if (typeof window !== 'undefined') {
  // Attach all utilities to a single OpenMindUtils namespace to avoid global pollution
  window.OpenMindUtils = {
    // Configuration
    AppConfig,

    // Validation
    isValidNumber,
    areValidCoordinates,
    isValidPoint,
    areValidDimensions,
    safeValue,
    safeNumber,
    safePositiveNumber,
    clamp,
    getCurrentZoom,
    getClampedZoomFactor,

    // String
    sanitizeText,
    isWhitespace,
    safeString,

    // Mouse coordinates and camera transforms
    getWorldMouseCoordinates,
    getMouseCoordinates,
    screenX,
    screenY,
    worldToScreen,

    // Logging
    Logger,

    // Rendering
    applyStroke,
    applyFill,

    // Geometry
    distance,
    distanceSquared,
    distanceToSegment,
    isPointInRect,
    rectanglesOverlap,
    segmentIntersectsRect,

    // Color
    validateColor,
    colorToRGBA,

    // Array/Object
    safeForEach,
    safeFilter,
    safeMap,
    deepClone,

    // UUID
    generateUUID,

    // User notifications
    showNotification,

    // Error handling
    safeExecute,
    wrapWithErrorHandler
  };

  // Also expose commonly used utilities via simpler aliases for backward compatibility
  window.AppConfig = AppConfig;
  window.Utils = window.OpenMindUtils;
}
