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
  // CLUSTER COLORS
  // ============================================================================

  /**
   * Soft pastel fill colors for visual grouping clusters.
   * Clusters cycle through these colors as they are created.
   */
  static CLUSTER = {
    FILLS: [
      { r: 173, g: 216, b: 230, a: 80 }, // light blue
      { r: 144, g: 238, b: 144, a: 80 }, // light green
      { r: 255, g: 255, b: 153, a: 80 }, // light yellow
      { r: 255, g: 182, b: 193, a: 80 }, // light pink
      { r: 221, g: 160, b: 221, a: 80 }, // plum
      { r: 255, g: 218, b: 185, a: 80 }  // peach
    ],
    SELECTED_STROKE: { r: 100, g: 150, b: 255, a: 200 },
    DRAG_ADD_STROKE: { r: 60, g: 200, b: 80, a: 230 },
    DRAG_REMOVE_STROKE: { r: 220, g: 80, b: 60, a: 230 }
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
  // TIMELINE COLORS
  // ============================================================================

  /**
   * Timeline bar styling with semantic color meanings.
   * Uses Material Design yellow (WARNING) for today and blue (PRIMARY) for regular days.
   * Text contrast is automatically handled via ColorPalette.getContrastColor().
   */
  static TIMELINE = {
    BAR_BACKGROUND: { r: 211, g: 211, b: 211, a: 255 },
    BAR_BORDER: { r: 60, g: 80, b: 140, a: 180 },
    
    // Day cell colors - maintains visual hierarchy
    TODAY_FILL: ColorPalette.BASE.WARNING,           // Bright yellow (255, 193, 7)
    TODAY_STROKE: { r: 200, g: 165, b: 0, a: 255 },
    TODAY_TEXT: ColorPalette.BASE.BLACK,             // Black text on bright yellow
    
    DAY_FILL: ColorPalette.BASE.PRIMARY,             // Blue (60, 120, 255)
    DAY_STROKE: { r: 125, g: 225, b: 255, a: 255 },
    DAY_TEXT: ColorPalette.BASE.WHITE,               // White text on blue
    
    WEEKDAY_FILL: { r: 88, g: 106, b: 168, a: 205 },
    WEEKDAY_STROKE: { r: 118, g: 140, b: 205, a: 210 },
    WEEKDAY_TEXT: { r: 225, g: 235, b: 255, a: 220 },
    
    WEEKEND_FILL: { r: 58, g: 70, b: 118, a: 190 },
    WEEKEND_STROKE: { r: 82, g: 98, b: 155, a: 180 },
    WEEKEND_TEXT: { r: 225, g: 235, b: 255, a: 220 },
    
    // Text and labels
    MONTH_LABEL: { r: 180, g: 200, b: 255, a: 220 },
    WEEK_NUMBER: { r: 140, g: 160, b: 220, a: 180 },
    
    // Interactive elements
    RESIZE_HANDLE_BG: { r: 80, g: 120, b: 200, a: 200 },
    RESIZE_HANDLE_DOT: { r: 180, g: 210, b: 255, a: 220 },
    
    SELECTION_RING: { r: 100, g: 180, b: 255, a: 220 },
    SELECTION_RING_WEIGHT: 2,
    
    // Connection preview on drag
    SNAP_HIGHLIGHT: { r: 100, g: 200, b: 255, a: 255 },
    SNAP_DOT: { r: 100, g: 200, b: 255, a: 220 },
    
    // Date badge pills on boxes
    BADGE_TODAY: ColorPalette.BASE.WARNING,
    BADGE_FUTURE: ColorPalette.BASE.PRIMARY,
    BADGE_PAST: { r: 200, g: 60, b: 60, a: 210 },
    BADGE_SELECTED: { r: 255, g: 140, b: 0, a: 210 },
    BADGE_TEXT: ColorPalette.BASE.WHITE,
    
    // Connection arrows
    CONNECTION_LINE: { r: 80, g: 100, b: 160, a: 255 },
    CONNECTION_ARROW: { r: 80, g: 100, b: 160, a: 255 }
  };

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Determines appropriate text color based on background brightness.
   * Uses luminance formula: 0.299*R + 0.587*G + 0.114*B
   * Returns black text for bright backgrounds (luminance > 150),
   * white text for dark backgrounds (luminance ≤ 150).
   * 
   * @param {Object} backgroundColor - RGBA color object
   * @returns {Object} RGBA color object (either WHITE or BLACK)
   */
  static getContrastColor(backgroundColor) {
    if (!backgroundColor || typeof backgroundColor !== 'object') {
      return ColorPalette.BASE.BLACK;
    }
    const r = backgroundColor.r ?? 0;
    const g = backgroundColor.g ?? 0;
    const b = backgroundColor.b ?? 0;
    // Standard luminance formula
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 150 ? ColorPalette.BASE.BLACK : ColorPalette.BASE.WHITE;
  }

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

    const r = color.r ?? 0;
    const g = color.g ?? 0;
    const b = color.b ?? 0;
    const a = color.a != null ? color.a / 255 : 1;

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
