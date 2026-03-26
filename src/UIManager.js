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
    this.recentRoomsButton = null;
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

    // Debounce timers
    this.displayNameDebounceTimer = null;

    // Event listener tracking for cleanup
    this.eventListenerRefs = [];

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
    this.setupRoomHistoryOverlay();

    // Layout buttons after creation to prevent overlap
    // Use setTimeout to ensure DOM elements are fully created
    setTimeout(() => {
      this.layoutButtons();
    }, 0);
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
    this.inviteButton.style('background-color', ColorPalette.toCSS(ColorPalette.BASE.SUCCESS));
    this.inviteButton.style('color', ColorPalette.toCSS(ColorPalette.BASE.WHITE));
    this.inviteButton.mousePressed(() => this.handleShareSessionClick());

    // Recent Rooms button
    this.recentRoomsButton = p5.createButton('Recent Rooms');
    this.recentRoomsButton.position(700, 10);
    this.recentRoomsButton.mousePressed(() => this.toggleRoomHistoryOverlay());
    this.recentRoomsButton.attribute('aria-label', 'Toggle recent rooms list');
    this.recentRoomsButton.attribute('aria-expanded', 'false');

    // Display name input (for collaboration)
    this.displayNameInput = p5.createInput('');
    this.displayNameInput.attribute('placeholder', 'Your Name');
    this.displayNameInput.position(750, 10);
    this.displayNameInput.style('display', 'none');
    this.displayNameInput.style('padding', '5px');
    this.displayNameInput.style('border', `1px solid ${ColorPalette.toCSS(ColorPalette.BASE.SUCCESS)}`);
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
    // this.fileInput.style('display', 'none'); // Removed to ensure programmatic click works
    this.fileInput.attribute('accept', '.json');

    // Create hidden file input for importing text
    this.importTextFileInput = p5.createFileInput((file) => {
      if (this.callbacks.onImportText) {
        this.callbacks.onImportText(file);
      }
    });
    this.importTextFileInput.position(-200, -200);
    // this.importTextFileInput.style('display', 'none'); // Removed to ensure programmatic click works
    this.importTextFileInput.attribute('accept', '.txt,.md,.text');

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
    const focusHandler = () => {
      this.displayNameInput.style('border-color', ColorPalette.toCSS(ColorPalette.BASE.PRIMARY));
    };
    input.addEventListener('focus', focusHandler);
    this.eventListenerRefs.push({ element: input, event: 'focus', handler: focusHandler });

    // Blur handler
    const blurHandler = () => {
      this.displayNameInput.style('border-color', ColorPalette.toCSS(ColorPalette.BASE.SUCCESS));

      // Clear any pending debounced update
      clearTimeout(this.displayNameDebounceTimer);

      // Update display name in collaboration manager (use setUserName)
      // Use global collaborationManager as it can be recreated when switching rooms
      const activeManager = (typeof collaborationManager !== 'undefined') ? collaborationManager : this.collaborationManager;
      if (activeManager && activeManager.isConnected) {
        const displayName = this.displayNameInput.value().trim();
        if (displayName && typeof activeManager.setUserName === 'function') {
          activeManager.setUserName(displayName);
        }
      }

      // Hide menu immediately on blur
      this.hideButtons();
      this.suppressMenuUntilMouseExit = true;
    };
    input.addEventListener('blur', blurHandler);
    this.eventListenerRefs.push({ element: input, event: 'blur', handler: blurHandler });

    // Stop all keyboard events from reaching the mindmap while input is focused
    const keydownHandler = (e) => {
      e.stopPropagation(); // Prevent mindmap from receiving key events
      if (e.key === 'Enter') {
        input.blur(); // Blur will trigger the blur handler which hides menu
      } else if (e.key === 'Escape') {
        // Cancel editing on Escape
        this.displayNameInput.value('');
        input.blur();
      }
    };
    input.addEventListener('keydown', keydownHandler);
    this.eventListenerRefs.push({ element: input, event: 'keydown', handler: keydownHandler });

    // Also stop keyup and keypress to be thorough
    const stopProp = (e) => e.stopPropagation();
    input.addEventListener('keyup', stopProp);
    this.eventListenerRefs.push({ element: input, event: 'keyup', handler: stopProp });
    input.addEventListener('keypress', stopProp);
    this.eventListenerRefs.push({ element: input, event: 'keypress', handler: stopProp });

    // Input handler for real-time updates (debounced)
    const inputHandler = () => {
      // Use global collaborationManager as it can be recreated when switching rooms
      const activeManager = (typeof collaborationManager !== 'undefined') ? collaborationManager : this.collaborationManager;
      if (activeManager && activeManager.isConnected) {
        // Debounce to avoid spamming network on rapid typing
        clearTimeout(this.displayNameDebounceTimer);
        this.displayNameDebounceTimer = setTimeout(() => {
          const displayName = this.displayNameInput.value().trim();
          if (displayName && typeof activeManager.setUserName === 'function') {
            activeManager.setUserName(displayName);
          }
        }, 300); // 300ms debounce
      }
    };
    input.addEventListener('input', inputHandler);
    this.eventListenerRefs.push({ element: input, event: 'input', handler: inputHandler });
  }

  /**
   * Setup room history overlay
   */
  setupRoomHistoryOverlay() {
    console.log('UIManager: Setting up Room History Overlay');
    const overlay = window.RoomHistoryOverlay;
    if (overlay && typeof overlay.setup === 'function') {
      overlay.setup({ recentRoomsButton: this.recentRoomsButton });
      console.log('UIManager: Room History Overlay setup complete');
    } else {
      console.warn('UIManager: RoomHistoryOverlay not available during setup');
    }
  }

  /**
   * Toggle room history overlay visibility
   */
  toggleRoomHistoryOverlay() {
    console.log('UIManager: Toggling Room History Overlay');
    const overlay = window.RoomHistoryOverlay;
    console.log('UIManager: RoomHistoryOverlay check:', { 
      'window.RoomHistoryOverlay': !!overlay,
      'hasToggle': overlay && typeof overlay.toggle === 'function'
    });
    
    if (overlay && overlay.toggle) {
      overlay.toggle();
    } else {
      console.warn('UIManager: RoomHistoryOverlay not available even on window');
    }
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
      // Sync state from KeyboardOverlay
      this.keyboardOverlayVisible = KeyboardOverlay.isVisible ? KeyboardOverlay.isVisible() : !this.keyboardOverlayVisible;

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
    // Prefer using KeyboardOverlay helper if available
    if (typeof KeyboardOverlay !== 'undefined' && KeyboardOverlay.show) {
      KeyboardOverlay.show(this.keyboardControlsButton);
    } else if (this.keyboardOverlay && typeof this.keyboardOverlay.style === 'function') {
      // Fallback to directly styling the p5.Element
      this.keyboardOverlay.style('display', 'block');
    }

    this.keyboardOverlayVisible = true;

    if (this.keyboardControlsButton) {
      this.keyboardControlsButton.attribute('aria-expanded', 'true');
    }
  }

  /**
   * Hide keyboard controls overlay
   */
  hideKeyboardOverlay() {
    // Prefer using KeyboardOverlay helper if available
    if (typeof KeyboardOverlay !== 'undefined' && KeyboardOverlay.hide) {
      KeyboardOverlay.hide(this.keyboardControlsButton);
    } else if (this.keyboardOverlay && typeof this.keyboardOverlay.style === 'function') {
      // Fallback to directly styling the p5.Element
      this.keyboardOverlay.style('display', 'none');
    }

    this.keyboardOverlayVisible = false;

    if (this.keyboardControlsButton) {
      this.keyboardControlsButton.attribute('aria-expanded', 'false');
    }
  }

  /**
   * Update menu visibility based on mouse position and overlay state
   * @param {number} mouseX - Current mouse X position
   * @param {number} mouseY - Current mouse Y position
   * @param {Object} options - Additional options
   * @param {boolean} options.forceHide - Force hide buttons (for overlays)
   */
  updateMenuVisibility(mouseX, mouseY, options = {}) {
    // Validate mouse coordinates
    if (typeof mouseX !== 'number' || !isFinite(mouseX)) mouseX = 0;
    if (typeof mouseY !== 'number' || !isFinite(mouseY)) mouseY = 0;

    // Force hide buttons when overlays are showing (room confirmation, sync status, etc.)
    if (options.forceHide) {
      this.hideButtons();
      return;
    }

    const MENU_TRIGGER_X = this.config?.UI?.MENU_TRIGGER_X || 50;
    const MENU_TRIGGER_Y = this.config?.UI?.MENU_TRIGGER_Y || 50;
    const BUTTONS_BAND_HEIGHT = this.config?.UI?.BUTTONS_BAND_HEIGHT || 50;

    const inTriggerZone = mouseX < MENU_TRIGGER_X && mouseY < MENU_TRIGGER_Y;
    const inButtonsBand = mouseY < BUTTONS_BAND_HEIGHT;

    // Check if display name input has focus
    const inputHasFocus = this.displayNameInput &&
      document.activeElement === this.displayNameInput.elt;

    if (this.suppressMenuUntilMouseExit) {
      // While suppressed, keep menu hidden unless the input has focus
      if (inputHasFocus) {
        this.showButtons();
      } else {
        this.hideButtons();
      }

      // Only clear suppression once the cursor leaves both trigger and band
      if (!inTriggerZone && !inButtonsBand) {
        this.suppressMenuUntilMouseExit = false;
      }
    } else {
      if (inTriggerZone || inButtonsBand || inputHasFocus) {
        this.showButtons();
      } else {
        this.hideButtons();
      }
    }
  }

  /**
   * Show all menu buttons
   */
  /**
   * Show all menu buttons
   */
  showButtons() {
    this.menuIsVisible = true;

    // Check connection state from global collaborationManager (not cached reference)
    // This is important because collaborationManager can be recreated when switching rooms
    const activeManager = (typeof collaborationManager !== 'undefined') ? collaborationManager : this.collaborationManager;
    const isConnected = activeManager && activeManager.isConnected;

    // Always show these buttons
    if (this.loadButton) this.loadButton.style('display', 'inline-block');
    if (this.saveButton) this.saveButton.style('display', 'inline-block');
    if (this.importTextButton) this.importTextButton.style('display', 'inline-block');
    if (this.exportPNGButton) this.exportPNGButton.style('display', 'inline-block');
    if (this.exportPDFButton) this.exportPDFButton.style('display', 'inline-block');
    if (this.exportTextButton) this.exportTextButton.style('display', 'inline-block');
    if (this.keyboardControlsButton) this.keyboardControlsButton.style('display', 'inline-block');
    if (this.recentRoomsButton) this.recentRoomsButton.style('display', 'inline-block');

    // Always show invite button (text changes based on connection state)
    if (this.inviteButton) {
      this.inviteButton.style('display', 'inline-block');
      if (isConnected) {
        this.inviteButton.style('background-color', ColorPalette.toCSS(ColorPalette.BASE.PRIMARY)); // Blue for share
        this.inviteButton.html('Copy Room Link');
      } else {
        this.inviteButton.style('background-color', ColorPalette.toCSS(ColorPalette.BASE.SUCCESS)); // Green for start
        this.inviteButton.html('Start Collaboration');
      }
    }

    // Show display name input only when connected
    if (this.displayNameInput) {
      if (isConnected) {
        this.displayNameInput.style('display', 'inline-block');
        this.displayNameInput.style('visibility', 'visible');
      } else {
        this.displayNameInput.style('display', 'none');
        this.displayNameInput.style('visibility', 'hidden');
      }
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
    if (this.recentRoomsButton) this.recentRoomsButton.style('display', 'none');
    if (this.inviteButton) this.inviteButton.style('display', 'none');
    if (this.displayNameInput) this.displayNameInput.style('display', 'none');
  }

  /**
   * Layout and position all menu buttons
   */
  layoutButtons() {
    // Guard against uninitialized state
    if (!this.loadButton || !this.saveButton) {
      console.warn('layoutButtons called before initialization complete');
      return;
    }

    const startX = this.config?.UI?.BUTTON_START_X || 40;
    const buttonY = this.config?.UI?.BUTTON_Y || 10;
    const buttonGap = this.config?.UI?.BUTTON_GAP || 5;

    let x = startX;

    // Check if we're connected to collaboration
    // Use global collaborationManager (not cached reference) as it can be recreated when switching rooms
    const activeManager = (typeof collaborationManager !== 'undefined') ? collaborationManager : this.collaborationManager;
    const isConnected = activeManager && activeManager.isConnected;

    // Store original display states to restore after measurement
    const originalStates = new Map();

    // Temporarily show buttons for measurement (but keep them hidden visually)
    const buttonsToLayout = [
      this.loadButton,
      this.saveButton,
      this.importTextButton,
      this.exportPNGButton,
      this.exportPDFButton,
      this.exportTextButton,
      this.keyboardControlsButton,
      this.recentRoomsButton,
      this.inviteButton // Always include invite button (text/color change based on state)
    ];

    // Make visible for measurement with correct p5.js API
    buttonsToLayout.forEach(btn => {
      if (btn && btn.elt) {
        originalStates.set(btn, {
          display: btn.elt.style.display,
          visibility: btn.elt.style.visibility
        });
        btn.style('visibility', 'hidden');
        btn.style('display', 'inline-block');
      }
    });

    // Helper to position a button and advance x
    const positionButton = (button) => {
      if (button && button.elt) {
        button.position(x, buttonY);
        const width = button.elt.offsetWidth || 80; // Fallback width
        x += width + buttonGap;
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
    positionButton(this.recentRoomsButton);

    // Handle invite button and display name input based on connection state
    if (isConnected) {
      // When connected: change button to "Copy Room Link" and show display name input
      if (this.inviteButton) {
        this.inviteButton.style('background-color', ColorPalette.toCSS(ColorPalette.BASE.PRIMARY)); // Blue for share action
        this.inviteButton.html('Copy Room Link');
        positionButton(this.inviteButton);
      }

      if (this.displayNameInput) {
        const inputWidth = 120;

        this.displayNameInput.style('width', `${inputWidth}px`);
        this.displayNameInput.style('display', 'inline-block');
        this.displayNameInput.style('visibility', 'visible'); // Ensure visible

        // Get button height for vertical centering
        let buttonHeight = 30;
        if (this.loadButton && this.loadButton.elt) {
          buttonHeight = this.loadButton.elt.offsetHeight;
        }

        const inputHeight = this.displayNameInput.elt ?
          this.displayNameInput.elt.offsetHeight : 30;
        const yNudge = Math.floor((buttonHeight - inputHeight) / 2);

        this.displayNameInput.position(x, buttonY + yNudge);
        x += inputWidth + buttonGap;

        // Pre-populate with current username if available
        // Use global collaborationManager as it can be recreated when switching rooms
        const managerForUsername = (typeof collaborationManager !== 'undefined') ? collaborationManager : this.collaborationManager;
        if (managerForUsername &&
          typeof managerForUsername.getUserName === 'function') {
          const currentName = managerForUsername.getUserName();
          if (currentName && this.displayNameInput.value() !== currentName) {
            this.displayNameInput.value(currentName);
          }
        }
      }
    } else {
      // When not connected: show "Start Collaboration" button, hide display name input
      if (this.inviteButton) {
        this.inviteButton.style('background-color', ColorPalette.toCSS(ColorPalette.BASE.SUCCESS)); // Green for start action
        this.inviteButton.html('Start Collaboration');
        positionButton(this.inviteButton);
      }

      if (this.displayNameInput) {
        this.displayNameInput.style('display', 'none');
        this.displayNameInput.style('visibility', 'hidden');
      }
    }

    // Restore visibility - show if menu is visible, hide if not
    buttonsToLayout.forEach(btn => {
      if (btn && btn.elt) {
        btn.style('visibility', 'visible');
        // Restore display state based on whether menu should be shown
        if (!this.menuIsVisible) {
          btn.style('display', 'none');
        }
      }
    });

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
      // Get current room name if in collaboration mode (use roomName property)
      let filename = 'mindmap.json';
      if (this.collaborationManager && this.collaborationManager.roomName) {
        filename = `mindmap_${this.collaborationManager.roomName}.json`;
      }
      // Set filename before saving
      if (typeof this.mindMap.setLastUsedFilename === 'function') {
        this.mindMap.setLastUsedFilename(filename);
      }
      this.mindMap.save();
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
    // Always read from the live KeyboardOverlay state so that direct calls to
    // KeyboardOverlayManager.hide() (e.g. the overlay's own close button) are
    // reflected here without needing to go through uiManager.hideKeyboardOverlay().
    if (typeof KeyboardOverlay !== 'undefined' && typeof KeyboardOverlay.isVisible === 'function') {
      const live = KeyboardOverlay.isVisible();
      this.keyboardOverlayVisible = live; // keep cached flag in sync
      return live;
    }
    return this.keyboardOverlayVisible;
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  /**
   * Handle window resize - reposition buttons
   */
  handleResize() {
    // Reposition buttons when window is resized
    if (this.loadButton && this.saveButton) {
      this.layoutButtons();
    }
  }

  /**
   * Update button state based on collaboration status
   * Should be called when collaboration connection state changes
   */
  updateCollaborationState() {
    this.layoutButtons();
  }

  /**
   * Clean up all UI elements
   */
  cleanup() {
    // Clear any pending timers
    clearTimeout(this.displayNameDebounceTimer);

    // Remove event listeners safely
    this.eventListenerRefs.forEach(({ element, event, handler }) => {
      try {
        // Check if element still exists and has removeEventListener
        if (element && typeof element.removeEventListener === 'function') {
          element.removeEventListener(event, handler);
        }
      } catch (e) {
        console.warn('Error removing event listener:', e);
      }
    });
    this.eventListenerRefs = [];

    // Helper to safely remove p5 elements
    const removeIfExists = (btn) => {
      try {
        if (btn && typeof btn.remove === 'function') {
          btn.remove();
        }
      } catch (e) {
        console.warn('Error removing button:', e);
      }
    };

    // Remove all buttons
    removeIfExists(this.loadButton);
    removeIfExists(this.saveButton);
    removeIfExists(this.importTextButton);
    removeIfExists(this.exportPNGButton);
    removeIfExists(this.exportPDFButton);
    removeIfExists(this.exportTextButton);
    removeIfExists(this.keyboardControlsButton);
    removeIfExists(this.recentRoomsButton);
    removeIfExists(this.inviteButton);
    removeIfExists(this.displayNameInput);
    removeIfExists(this.fileInput);
    removeIfExists(this.importTextFileInput);

    // Clean up keyboard overlay
    if (this.keyboardOverlay) {
      removeIfExists(this.keyboardOverlay);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIManager;
}

// Expose globally for browser usage
if (typeof window !== 'undefined') {
  window.UIManager = UIManager;
}
