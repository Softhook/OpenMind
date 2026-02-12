/**
 * ColorPalette.js
 * 
 * Consolidated color constants for the entire application.
 * All color definitions are centralized here to ensure consistency and make it easy
 * to maintain and update the visual theme.
 * 
 * Color Format: { r, g, b } or { r, g, b, a } where values are 0-255
 */

class ColorPalette {
  // ============================================================================
  // BOX BACKGROUND COLORS
  // ============================================================================
  
  /**
   * Color palette for box backgrounds
   * These can be cycled through with keyboard shortcuts (1, 2, 3)
   */
  static BOX_BACKGROUNDS = [
    { key: 'white', color: { r: 255, g: 255, b: 255 } },
    { key: 'orange', color: { r: 255, g: 200, b: 140 } },
    { key: 'red', color: { r: 255, g: 140, b: 140 } }
  ];
  
  // ============================================================================
  // TEXTBOX COLORS
  // ============================================================================
  
  static TEXTBOX = {
    SELECTION_OUTLINE: { r: 60, g: 120, b: 255 },
    LINK_TEXT: { r: 0, g: 100, b: 220 },
    CURSOR: { r: 0, g: 0, b: 255 },
    SELECTION_HIGHLIGHT: { r: 255, g: 100, b: 100, a: 100 },
    DIM_OVERLAY: { r: 255, g: 255, b: 255, a: 150 },
    DEFAULT_HIGHLIGHT: { r: 255, g: 255, b: 0, a: 180 },
    SHADOW: { r: 0, g: 0, b: 0, a: 20 }  // Subtle shadow/dim effect
  };
  
  // Stroke weights for different TextBox states
  static TEXTBOX_STROKES = {
    HOVER: 100,
    EDITING: 120,
    NORMAL: 100
  };
  
  // ============================================================================
  // CONNECTION COLORS
  // ============================================================================
  
  static CONNECTION = {
    NORMAL: 80,                            // Gray for normal connection state
    SELECTED: { r: 100, g: 150, b: 255 },  // Blue for selected connection
    PREVIEW_LINE: { r: 100, g: 100, b: 255 },  // Blue line when creating connection
    CONNECTOR_DOT: { r: 100, g: 150, b: 255 }   // Blue dot at connection endpoints
  };
  
  // ============================================================================
  // UI COLORS
  // ============================================================================
  
  static UI = {
    BACKGROUND: 240,  // Light gray background
    SELECTION_RECT: { 
      fill: { r: 100, g: 150, b: 255, a: 50 }, 
      stroke: { r: 100, g: 150, b: 255 } 
    },
    SAVE_INDICATOR: {
      saved: { r: 76, g: 175, b: 80 },      // Green
      unsaved: { r: 244, g: 67, b: 54 },    // Red
      syncing: { r: 255, g: 193, b: 7 }     // Yellow/Amber
    },
    LOADING_OVERLAY: { 
      bg: { r: 0, g: 0, b: 0, a: 160 }, 
      text: 255, 
      spinner: 255 
    }
  };
  
  // ============================================================================
  // GRID COLORS
  // ============================================================================
  
  static GRID = {
    LINE: { r: 210, g: 210, b: 210 },  // Light gray grid lines
    ORIGIN: { r: 220, g: 60, b: 60 }   // Red origin marker
  };
  
  // ============================================================================
  // MOBILE NAVIGATION COLORS
  // ============================================================================
  
  static MOBILE = {
    ACTIVE: 'rgba(100, 150, 255, 0.9)',
    NORMAL: 'rgba(255, 255, 255, 0.9)',
    BACKGROUND: 'rgba(255, 255, 255, 0.9)'
  };
  
  // ============================================================================
  // COLLABORATION / USER COLORS
  // ============================================================================
  
  /**
   * Default color palette for user cursors and selections in collaborative mode
   * These are hex color strings for user avatars/cursors
   */
  static USER_COLORS = [
    '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
    '#2196f3', '#00bcd4', '#009688', '#4caf50',
    '#8bc34a', '#ff9800', '#ff5722', '#795548'
  ];
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  /**
   * Get the box background color palette
   * @returns {Array} Array of color palette objects with {key, color}
   */
  static getBoxBackgroundPalette() {
    return ColorPalette.BOX_BACKGROUNDS;
  }
  
  /**
   * Pick a random user color for collaboration
   * @returns {string} Hex color string
   */
  static pickRandomUserColor() {
    const colors = ColorPalette.USER_COLORS;
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ColorPalette;
}
