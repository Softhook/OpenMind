/**
 * ColorPalette.js
 * 
 * Consolidated color constants for the entire application.
 * All color definitions are centralized here to ensure consistency and make it easy
 * to maintain and update the visual theme.
 * 
 * Standard Format:
 * Every color is defined as an RGBA object: { r, g, b, a }
 * - r, g, b: 0-255
 * - a: 0-255 (defaults to 255 if not specified in helpers)
 */

class ColorPalette {
  // ============================================================================
  // SEMANTIC COLORS (Base Palette)
  // ============================================================================

  static BASE = {
    PRIMARY: { r: 60, g: 120, b: 255, a: 255 },   // Modern Blue
    SUCCESS: { r: 76, g: 175, b: 80, a: 255 },    // Material Green
    DANGER: { r: 244, g: 67, b: 54, a: 255 },     // Material Red
    WARNING: { r: 255, g: 193, b: 7, a: 255 },    // Material Amber
    INFO: { r: 0, g: 188, b: 212, a: 255 },       // Cyan
    WHITE: { r: 255, g: 255, b: 255, a: 255 },
    BLACK: { r: 0, g: 0, b: 0, a: 255 },
    GRAY_LIGHT: { r: 240, g: 240, b: 240, a: 255 },
    GRAY_MEDIUM: { r: 150, g: 150, b: 150, a: 255 },
    GRAY_DARK: { r: 80, g: 80, b: 80, a: 255 }
  };

  // ============================================================================
  // BOX BACKGROUND COLORS
  // ============================================================================

  /**
   * Color palette for box backgrounds
   * These can be cycled through with keyboard shortcuts (1, 2, 3)
   */
  static BOX_BACKGROUNDS = [
    { key: 'white', color: ColorPalette.BASE.WHITE },
    { key: 'orange', color: { r: 255, g: 200, b: 140, a: 255 } },
    { key: 'red', color: { r: 255, g: 140, b: 140, a: 255 } }
  ];

  // ============================================================================
  // TEXTBOX COLORS
  // ============================================================================

  static TEXTBOX = {
    SELECTION_OUTLINE: ColorPalette.BASE.PRIMARY,
    LINK_TEXT: { r: 0, g: 100, b: 220, a: 255 },
    CURSOR: { r: 0, g: 0, b: 255, a: 255 },
    SELECTION_HIGHLIGHT: { r: 255, g: 100, b: 100, a: 100 },
    DIM_OVERLAY: { r: 255, g: 255, b: 255, a: 150 },
    DEFAULT_HIGHLIGHT: { r: 255, g: 255, b: 0, a: 180 },
    SHADOW: { r: 0, g: 0, b: 0, a: 20 }
  };

  // ============================================================================
  // TEXTBOX STROKE WEIGHTS
  // ============================================================================

  static TEXTBOX_STROKES = {
    HOVER: 100,
    EDITING: 120,
    NORMAL: 100
  };

  // ============================================================================
  // CONNECTION COLORS
  // ============================================================================

  static CONNECTION = {
    NORMAL: ColorPalette.BASE.GRAY_DARK,
    SELECTED: { r: 100, g: 150, b: 255, a: 255 },
    PREVIEW_LINE: { r: 100, g: 100, b: 255, a: 255 },
    CONNECTOR_DOT: { r: 100, g: 150, b: 255, a: 255 }
  };

  // ============================================================================
  // UI COLORS
  // ============================================================================

  static UI = {
    BACKGROUND: ColorPalette.BASE.GRAY_LIGHT,
    SELECTION_RECT: {
      fill: { r: 100, g: 150, b: 255, a: 50 },
      stroke: { r: 100, g: 150, b: 255, a: 255 }
    },
    SAVE_INDICATOR: {
      saved: ColorPalette.BASE.SUCCESS,
      unsaved: ColorPalette.BASE.DANGER,
      syncing: ColorPalette.BASE.WARNING
    },
    LOADING_OVERLAY: {
      bg: { r: 0, g: 0, b: 0, a: 160 },
      text: ColorPalette.BASE.WHITE,
      spinner: ColorPalette.BASE.WHITE
    }
  };

  // ============================================================================
  // GRID COLORS
  // ============================================================================

  static GRID = {
    LINE: { r: 210, g: 210, b: 210, a: 255 },
    ORIGIN: { r: 220, g: 60, b: 60, a: 255 }
  };

  // ============================================================================
  // MOBILE NAVIGATION COLORS
  // ============================================================================

  static MOBILE = {
    ACTIVE: { r: 100, g: 150, b: 255, a: 230 },   // Equivalent to 0.9 alpha
    NORMAL: { r: 255, g: 255, b: 255, a: 230 },
    BACKGROUND: { r: 255, g: 255, b: 255, a: 230 }
  };

  // ============================================================================
  // COLLABORATION / USER COLORS
  // ============================================================================

  /**
   * Default color palette for user cursors and selections in collaborative mode
   * Standardized as RGBA objects
   */
  static USER_COLORS = [
    { r: 233, g: 30, b: 99, a: 255 },   // #e91e63
    { r: 156, g: 39, b: 176, a: 255 },  // #9c27b0
    { r: 103, g: 58, b: 183, a: 255 },  // #673ab7
    { r: 63, g: 81, b: 181, a: 255 },   // #3f51b5
    { r: 33, g: 150, b: 243, a: 255 },  // #2196f3
    { r: 0, g: 188, b: 212, a: 255 },   // #00bcd4
    { r: 0, g: 150, b: 136, a: 255 },   // #009688
    { r: 76, g: 175, b: 80, a: 255 },   // #4caf50
    { r: 139, g: 195, b: 74, a: 255 },  // #8bc34a
    { r: 255, g: 152, b: 0, a: 255 },   // #ff9800
    { r: 255, g: 87, b: 34, a: 255 },   // #ff5722
    { r: 121, g: 85, b: 72, a: 255 }    // #795548
  ];

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Converts a color object to a CSS rgba string
   * @param {Object|number} color - RGBA object or grayscale number
   * @returns {string} CSS rgba string
   */
  static toCSS(color) {
    if (typeof color === 'number') {
      return `rgba(${color}, ${color}, ${color}, 1)`;
    }
    if (typeof color === 'string') return color;
    if (!color) return 'rgba(0, 0, 0, 1)';

    const r = color.r !== undefined ? color.r : 0;
    const g = color.g !== undefined ? color.g : 0;
    const b = color.b !== undefined ? color.b : 0;
    const a = color.a !== undefined ? color.a / 255 : 1;

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  /**
   * Converts a color object to a Hex string (#RRGGBB)
   * @param {Object} color - RGBA object
   * @returns {string} Hex string
   */
  static toHex(color) {
    if (typeof color === 'string' && color.startsWith('#')) return color;
    if (!color || typeof color !== 'object') return '#000000';

    const r = Math.round(color.r || 0).toString(16).padStart(2, '0');
    const g = Math.round(color.g || 0).toString(16).padStart(2, '0');
    const b = Math.round(color.b || 0).toString(16).padStart(2, '0');

    return `#${r}${g}${b}`;
  }

  /**
   * Get the box background color palette
   * @returns {Array} Array of color palette objects with {key, color}
   */
  static getBoxBackgroundPalette() {
    return ColorPalette.BOX_BACKGROUNDS;
  }

  /**
   * Pick a random user color for collaboration
   * @param {boolean} asString - If true, returns hex string (for backward compatibility)
   * @returns {Object|string} RGBA object or Hex string
   */
  static pickRandomUserColor(asString = false) {
    if (!Array.isArray(ColorPalette.USER_COLORS) || ColorPalette.USER_COLORS.length === 0) {
      console.warn('USER_COLORS is invalid or empty');
      const fallback = { r: 136, g: 136, b: 136, a: 255 };
      return asString ? ColorPalette.toHex(fallback) : fallback;
    }
    const colors = ColorPalette.USER_COLORS;
    const color = colors[Math.floor(Math.random() * colors.length)];
    return asString ? ColorPalette.toHex(color) : color;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ColorPalette;
}

// Global exposure for browser environments without module support
if (typeof window !== 'undefined') {
  window.ColorPalette = ColorPalette;
}
