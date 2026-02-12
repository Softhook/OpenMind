/**
 * UIManager.js
 * 
 * Manages all UI elements including buttons, menus, overlays, and user interactions.
 * This module handles:
 * - Button creation and positioning
 * - Menu visibility logic
 * - Keyboard overlay management
 * - Display name input handling
 * - Room join confirmation dialogs
 */

class UIManager {
  constructor() {
    // Button elements
    this.saveButton = null;
    this.loadButton = null;
    this.importTextButton = null;
    this.exportPNGButton = null;
    this.exportPDFButton = null;
    this.exportTextButton = null;
    this.keyboardControlsButton = null;
    this.inviteButton = null;
    this.displayNameInput = null;
    
    // File input elements
    this.fileInput = null;
    this.importTextFileInput = null;
    
    // Menu state
    this.menuIsVisible = false;
    this.menuRightEdge = 600;
    this.suppressMenuUntilMouseExit = false;
    
    // Keyboard overlay
    this.keyboardOverlay = null;
    this.keyboardOverlayContent = null;
    this.keyboardOverlayVisible = false;
    
    // Configuration (will be injected)
    this.config = null;
    this.p5Instance = null;
    this.mindMap = null;
    this.collaborationManager = null;
    
    // Callbacks (will be injected)
    this.callbacks = {
      onLoadFile: null,
      onSaveFile: null,
      onImportText: null,
      onExportPNG: null,
      onExportPDF: null,
      onExportText: null,
      onShareSession: null
    };
  }
  
  /**
   * Initialize the UIManager with dependencies
   * @param {Object} config - Configuration object with UI settings
   * @param {Object} p5Instance - p5.js instance
   * @param {Object} mindMap - MindMap instance
   * @param {Object} collaborationManager - CollaborationManager instance
   * @param {Object} callbacks - Callback functions for UI actions
   */
  initialize(config, p5Instance, mindMap, collaborationManager, callbacks) {
    this.config = config;
    this.p5Instance = p5Instance;
    this.mindMap = mindMap;
    this.collaborationManager = collaborationManager;
    this.callbacks = { ...this.callbacks, ...callbacks };
    
    this.setupButtons();
    this.setupKeyboardOverlay();
  }
  
  /**
   * Creates all UI buttons and input elements
   */
  setupButtons() {
    const p5 = this.p5Instance;
    
    // Load button
    this.loadButton = p5.createButton('Load');
    this.loadButton.position(100, 10);
    this.loadButton.mousePressed(() => this.handleLoadButtonClick());
    
    // Save button
    this.saveButton = p5.createButton('Save');
    this.saveButton.position(150, 10);
    this.saveButton.mousePressed(() => this.handleSaveButtonClick());
    
    // Import text button
    this.importTextButton = p5.createButton('Import Text');
    this.importTextButton.position(200, 10);
    this.importTextButton.mousePressed(() => this.handleImportTextClick());
    
    // Export PNG button
    this.exportPNGButton = p5.createButton('Export PNG');
    this.exportPNGButton.position(300, 10);
    this.exportPNGButton.mousePressed(() => this.handleExportPNGClick());
    
    // Export PDF button
    this.exportPDFButton = p5.createButton('Export PDF');
    this.exportPDFButton.position(400, 10);
    this.exportPDFButton.mousePressed(() => this.handleExportPDFClick());
    
    // Export text button
    this.exportTextButton = p5.createButton('Export Text');
    this.exportTextButton.position(500, 10);
    this.exportTextButton.mousePressed(() => this.handleExportTextClick());
    
    // Keyboard controls button
    this.keyboardControlsButton = p5.createButton('Keyboard Controls');
    this.keyboardControlsButton.position(600, 10);
    this.keyboardControlsButton.mousePressed(() => this.toggleKeyboardOverlay());
    this.keyboardControlsButton.attribute('aria-label', 'Toggle keyboard controls');
    this.keyboardControlsButton.attribute('aria-expanded', 'false');
    
    // Invite/Share button
    this.inviteButton = p5.createButton('Start Collaboration');
    this.inviteButton.position(650, 10);
    this.inviteButton.style('background-color', '#4caf50');
    this.inviteButton.style('color', '#fff');
    this.inviteButton.mousePressed(() => this.handleShareSessionClick());
    
    // Display name input (for collaboration)
    this.displayNameInput = p5.createInput('');
    this.displayNameInput.attribute('placeholder', 'Your Name');
    this.displayNameInput.position(750, 10);
    this.displayNameInput.style('display', 'none');
    this.displayNameInput.style('padding', '5px');
    this.displayNameInput.style('border', '1px solid #4caf50');
    this.displayNameInput.style('border-radius', '3px');
    this.displayNameInput.style('font-size', '14px');
    this.displayNameInput.style('outline', 'none');
    this.displayNameInput.style('transition', 'border-color 0.2s');
    
    // Attach display name input handlers
    this.attachDisplayNameInputHandlers();
    
    // Create hidden file input for loading
    this.fileInput = p5.createFileInput((file) => {
      if (this.callbacks.onLoadFile) {
        this.callbacks.onLoadFile(file);
      }
    });
    this.fileInput.position(-200, -200);
    this.fileInput.attribute('accept', '.json');
    
    // Create hidden file input for importing text
    this.importTextFileInput = p5.createFileInput((file) => {
      if (this.callbacks.onImportText) {
        this.callbacks.onImportText(file);
      }
    });
    this.importTextFileInput.position(-200, -200);
    this.importTextFileInput.attribute('accept', '.txt,.md');
    
    // Initially hide all buttons
    this.hideButtons();
  }
  
  /**
   * Attach event handlers to display name input
   */
  attachDisplayNameInputHandlers() {
    if (!this.displayNameInput) return;
    
    const input = this.displayNameInput.elt;
    
    // Focus handler
    input.addEventListener('focus', () => {
      this.displayNameInput.style('border-color', '#2196f3');
    });
    
    // Blur handler
    input.addEventListener('blur', () => {
      this.displayNameInput.style('border-color', '#4caf50');
      
      // Update display name in collaboration manager
      if (this.collaborationManager && this.collaborationManager.isConnected) {
        const displayName = this.displayNameInput.value().trim();
        if (displayName && this.collaborationManager.setDisplayName) {
          this.collaborationManager.setDisplayName(displayName);
        }
      }
      
      // Request menu hide after blur
      this.suppressMenuUntilMouseExit = true;
    });
    
    // Input handler for real-time updates
    input.addEventListener('input', () => {
      if (this.collaborationManager && this.collaborationManager.isConnected) {
        const displayName = this.displayNameInput.value().trim();
        if (displayName && this.collaborationManager.setDisplayName) {
          this.collaborationManager.setDisplayName(displayName);
        }
      }
    });
  }
  
  /**
   * Setup keyboard controls overlay
   */
  setupKeyboardOverlay() {
    if (typeof KeyboardOverlay !== 'undefined' && KeyboardOverlay.setup) {
      const result = KeyboardOverlay.setup({ keyboardControlsButton: this.keyboardControlsButton });
      this.keyboardOverlay = result.overlay;
      this.keyboardOverlayContent = result.overlayContent;
    }
  }
  
  /**
   * Toggle keyboard controls overlay visibility
   */
  toggleKeyboardOverlay() {
    if (typeof KeyboardOverlay !== 'undefined' && KeyboardOverlay.toggle) {
      KeyboardOverlay.toggle(this.keyboardControlsButton);
      this.keyboardOverlayVisible = !this.keyboardOverlayVisible;
      
      if (this.keyboardControlsButton) {
        this.keyboardControlsButton.attribute('aria-expanded', 
          this.keyboardOverlayVisible ? 'true' : 'false');
      }
    }
  }
  
  /**
   * Show keyboard controls overlay
   */
  showKeyboardOverlay() {
    if (this.keyboardOverlay && this.keyboardOverlay.style) {
      this.keyboardOverlay.style.display = 'block';
      this.keyboardOverlayVisible = true;
    }
  }
  
  /**
   * Hide keyboard controls overlay
   */
  hideKeyboardOverlay() {
    if (this.keyboardOverlay && this.keyboardOverlay.style) {
      this.keyboardOverlay.style.display = 'none';
      this.keyboardOverlayVisible = false;
    }
  }
  
  /**
   * Update menu visibility based on mouse position
   * @param {number} mouseX - Current mouse X position
   * @param {number} mouseY - Current mouse Y position
   */
  updateMenuVisibility(mouseX, mouseY) {
    const MENU_TRIGGER_X = this.config.UI.MENU_TRIGGER_X || 50;
    const MENU_TRIGGER_Y = this.config.UI.MENU_TRIGGER_Y || 50;
    const BUTTONS_BAND_HEIGHT = this.config.UI.BUTTONS_BAND_HEIGHT || 50;
    
    const inTriggerZone = mouseX < MENU_TRIGGER_X && mouseY < MENU_TRIGGER_Y;
    const inButtonsBand = mouseY < BUTTONS_BAND_HEIGHT;
    
    // Check if display name input has focus
    const inputHasFocus = this.displayNameInput && 
      document.activeElement === this.displayNameInput.elt;
    
    if (inTriggerZone || inButtonsBand || inputHasFocus) {
      if (this.suppressMenuUntilMouseExit) {
        // Don't auto-show menu until cursor exits the band
        if (!inButtonsBand) {
          this.suppressMenuUntilMouseExit = false;
        }
      } else {
        this.showButtons();
      }
    } else {
      this.hideButtons();
      this.suppressMenuUntilMouseExit = false;
    }
  }
  
  /**
   * Show all menu buttons
   */
  showButtons() {
    this.menuIsVisible = true;
    
    if (this.loadButton) this.loadButton.style('display', 'inline-block');
    if (this.saveButton) this.saveButton.style('display', 'inline-block');
    if (this.importTextButton) this.importTextButton.style('display', 'inline-block');
    if (this.exportPNGButton) this.exportPNGButton.style('display', 'inline-block');
    if (this.exportPDFButton) this.exportPDFButton.style('display', 'inline-block');
    if (this.exportTextButton) this.exportTextButton.style('display', 'inline-block');
    if (this.keyboardControlsButton) this.keyboardControlsButton.style('display', 'inline-block');
    if (this.inviteButton) this.inviteButton.style('display', 'inline-block');
    
    // Show display name input only if connected to collaboration
    if (this.displayNameInput && this.collaborationManager && 
        this.collaborationManager.isConnected) {
      this.displayNameInput.style('display', 'inline-block');
    }
  }
  
  /**
   * Hide all menu buttons
   */
  hideButtons() {
    this.menuIsVisible = false;
    
    if (this.loadButton) this.loadButton.style('display', 'none');
    if (this.saveButton) this.saveButton.style('display', 'none');
    if (this.importTextButton) this.importTextButton.style('display', 'none');
    if (this.exportPNGButton) this.exportPNGButton.style('display', 'none');
    if (this.exportPDFButton) this.exportPDFButton.style('display', 'none');
    if (this.exportTextButton) this.exportTextButton.style('display', 'none');
    if (this.keyboardControlsButton) this.keyboardControlsButton.style('display', 'none');
    if (this.inviteButton) this.inviteButton.style('display', 'none');
    if (this.displayNameInput) this.displayNameInput.style('display', 'none');
  }
  
  /**
   * Layout and position all menu buttons
   */
  layoutButtons() {
    const startX = this.config.UI.BUTTON_START_X || 40;
    const buttonY = this.config.UI.BUTTON_Y || 10;
    const buttonGap = this.config.UI.BUTTON_GAP || 5;
    
    let x = startX;
    
    // Helper to position a button and advance x
    const positionButton = (button) => {
      if (button && button.elt) {
        button.position(x, buttonY);
        x += button.elt.offsetWidth + buttonGap;
      }
    };
    
    // Position all buttons in order
    positionButton(this.loadButton);
    positionButton(this.saveButton);
    positionButton(this.importTextButton);
    positionButton(this.exportPNGButton);
    positionButton(this.exportPDFButton);
    positionButton(this.exportTextButton);
    positionButton(this.keyboardControlsButton);
    
    // Style and position invite button
    if (this.inviteButton) {
      const isConnected = this.collaborationManager && this.collaborationManager.isConnected;
      
      if (isConnected) {
        this.inviteButton.style('background-color', '#2196f3');
        this.inviteButton.html('Share Link');
      } else {
        this.inviteButton.style('background-color', '#4caf50');
        this.inviteButton.html('Start Collaboration');
      }
      
      positionButton(this.inviteButton);
    }
    
    // Position display name input (only when collaboration is active)
    if (this.displayNameInput && this.collaborationManager && 
        this.collaborationManager.isConnected) {
      const inputWidth = 120;
      const leftGap = buttonGap * 2;
      
      this.displayNameInput.style('width', `${inputWidth}px`);
      this.displayNameInput.style('display', 'inline-block');
      
      // Get button height for vertical centering
      let buttonHeight = 30;
      if (this.inviteButton && this.inviteButton.elt) {
        buttonHeight = this.inviteButton.elt.offsetHeight;
      }
      
      const inputHeight = this.displayNameInput.elt ? 
        this.displayNameInput.elt.offsetHeight : 30;
      const yNudge = Math.floor((buttonHeight - inputHeight) / 2);
      
      this.displayNameInput.position(x + leftGap, buttonY + yNudge);
      x += inputWidth + leftGap + buttonGap;
    }
    
    // Update menu right edge for hover detection
    this.menuRightEdge = x + 10;
  }
  
  // ==========================================================================
  // Button Click Handlers
  // ==========================================================================
  
  handleLoadButtonClick() {
    if (this.callbacks.onLoadFile) {
      // Trigger the file input click
      if (this.fileInput && this.fileInput.elt) {
        this.fileInput.elt.click();
      }
    }
  }
  
  handleSaveButtonClick() {
    if (this.mindMap && this.mindMap.save) {
      // Get current room name if in collaboration mode
      let filename = 'mindmap.json';
      if (this.collaborationManager && this.collaborationManager.currentRoomName) {
        filename = `mindmap_${this.collaborationManager.currentRoomName}.json`;
      }
      this.mindMap.save(filename);
    }
  }
  
  handleImportTextClick() {
    if (this.callbacks.onImportText) {
      // Trigger the file input click
      if (this.importTextFileInput && this.importTextFileInput.elt) {
        this.importTextFileInput.elt.click();
      }
    }
  }
  
  handleExportPNGClick() {
    if (this.callbacks.onExportPNG) {
      this.callbacks.onExportPNG();
    }
  }
  
  handleExportPDFClick() {
    if (this.callbacks.onExportPDF) {
      this.callbacks.onExportPDF();
    }
  }
  
  handleExportTextClick() {
    if (this.callbacks.onExportText) {
      this.callbacks.onExportText();
    }
  }
  
  handleShareSessionClick() {
    if (this.callbacks.onShareSession) {
      this.callbacks.onShareSession();
    }
  }
  
  // ==========================================================================
  // Getters
  // ==========================================================================
  
  isMenuVisible() {
    return this.menuIsVisible;
  }
  
  getMenuRightEdge() {
    return this.menuRightEdge;
  }
  
  isKeyboardOverlayVisible() {
    return this.keyboardOverlayVisible;
  }
  
  // ==========================================================================
  // Cleanup
  // ==========================================================================
  
  /**
   * Clean up all UI elements
   */
  cleanup() {
    // Remove all buttons
    if (this.loadButton) this.loadButton.remove();
    if (this.saveButton) this.saveButton.remove();
    if (this.importTextButton) this.importTextButton.remove();
    if (this.exportPNGButton) this.exportPNGButton.remove();
    if (this.exportPDFButton) this.exportPDFButton.remove();
    if (this.exportTextButton) this.exportTextButton.remove();
    if (this.keyboardControlsButton) this.keyboardControlsButton.remove();
    if (this.inviteButton) this.inviteButton.remove();
    if (this.displayNameInput) this.displayNameInput.remove();
    if (this.fileInput) this.fileInput.remove();
    if (this.importTextFileInput) this.importTextFileInput.remove();
    
    // Clean up keyboard overlay
    if (this.keyboardOverlay && this.keyboardOverlay.remove) {
      this.keyboardOverlay.remove();
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIManager;
}
