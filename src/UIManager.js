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
    this.menuBar = null;
    this.statusIndicator = null;

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

    // Create menu bar container
    this.menuBar = p5.createDiv();
    this.menuBar.id('om-top-menu-bar');
    this.menuBar.addClass('om-menu-bar');

    // Status indicator circle
    this.statusIndicator = p5.createDiv();
    this.statusIndicator.parent(this.menuBar);
    this.statusIndicator.addClass('om-status-indicator');

    // Load button
    this.loadButton = p5.createButton('Load');
    this.loadButton.parent(this.menuBar);
    this.loadButton.addClass('om-btn om-menu-btn');
    this.loadButton.mousePressed(() => this.handleLoadButtonClick());

    // Save button
    this.saveButton = p5.createButton('Save');
    this.saveButton.parent(this.menuBar);
    this.saveButton.addClass('om-btn om-menu-btn');
    this.saveButton.mousePressed(() => this.handleSaveButtonClick());

    // Import text button
    this.importTextButton = p5.createButton('Import Text');
    this.importTextButton.parent(this.menuBar);
    this.importTextButton.addClass('om-btn om-menu-btn');
    this.importTextButton.mousePressed(() => this.handleImportTextClick());

    // Export PNG button
    this.exportPNGButton = p5.createButton('Export PNG');
    this.exportPNGButton.parent(this.menuBar);
    this.exportPNGButton.addClass('om-btn om-menu-btn');
    this.exportPNGButton.mousePressed(() => this.handleExportPNGClick());

    // Export PDF button
    this.exportPDFButton = p5.createButton('Export PDF');
    this.exportPDFButton.parent(this.menuBar);
    this.exportPDFButton.addClass('om-btn om-menu-btn');
    this.exportPDFButton.mousePressed(() => this.handleExportPDFClick());

    // Export text button
    this.exportTextButton = p5.createButton('Export Text');
    this.exportTextButton.parent(this.menuBar);
    this.exportTextButton.addClass('om-btn om-menu-btn');
    this.exportTextButton.mousePressed(() => this.handleExportTextClick());

    // Keyboard controls button
    this.keyboardControlsButton = p5.createButton('Keyboard Controls');
    this.keyboardControlsButton.parent(this.menuBar);
    this.keyboardControlsButton.addClass('om-btn om-menu-btn');
    this.keyboardControlsButton.mousePressed(() => this.toggleKeyboardOverlay());
    this.keyboardControlsButton.attribute('aria-label', 'Toggle keyboard controls');
    this.keyboardControlsButton.attribute('aria-expanded', 'false');

    // Invite/Share button
    this.inviteButton = p5.createButton('Start Collaboration');
    this.inviteButton.parent(this.menuBar);
    this.inviteButton.addClass('om-btn om-menu-btn om-btn-success');
    this.inviteButton.mousePressed(() => this.handleShareSessionClick());

    // Recent Rooms button
    this.recentRoomsButton = p5.createButton('Recent Rooms');
    this.recentRoomsButton.parent(this.menuBar);
    this.recentRoomsButton.addClass('om-btn om-menu-btn');
    this.recentRoomsButton.mousePressed(() => this.toggleRoomHistoryOverlay());
    this.recentRoomsButton.attribute('aria-label', 'Toggle recent rooms list');
    this.recentRoomsButton.attribute('aria-expanded', 'false');

    // Display name input (for collaboration)
    this.displayNameInput = p5.createInput('');
    this.displayNameInput.parent(this.menuBar);
    this.displayNameInput.attribute('placeholder', 'Your Name');
    this.displayNameInput.addClass('om-menu-input');
    // We'll manage display/visibility via collaboration state
    this.displayNameInput.style('display', 'none');

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

    // Initially hide the entire menu bar
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
      // Styling handled by CSS :focus
    };
    input.addEventListener('focus', focusHandler);
    this.eventListenerRefs.push({ element: input, event: 'focus', handler: focusHandler });

    // Blur handler
    const blurHandler = () => {
      // Styling handled by CSS

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
   * Update the status indicator circle based on connection and sync state
   */
  updateStatusIndicator() {
    if (!this.statusIndicator) return;

    // Check connection state
    const activeManager = (typeof collaborationManager !== 'undefined') ? collaborationManager : this.collaborationManager;
    const isCollaborating = activeManager && activeManager.provider && activeManager.roomName;
    const isConnected = activeManager && activeManager.isConnected;

    let statusColor;
    let statusText = '';

    const colors = ColorPalette.UI.SAVE_INDICATOR;

    if (isCollaborating) {
      if (!isConnected) {
        statusColor = ColorPalette.toCSS(colors.unsaved); // Red
        statusText = 'Offline (Reconnecting...)';
      } else {
        // Use global syncStatus from sketch.js
        const currentSyncStatus = (typeof syncStatus !== 'undefined') ? syncStatus : null;
        
        if (currentSyncStatus === null) {
          statusColor = ColorPalette.toCSS(colors.saved); // Green
          statusText = 'All changes saved & synced';
        } else if (currentSyncStatus === 'incompatible' || currentSyncStatus === 'error') {
          statusColor = ColorPalette.toCSS(colors.unsaved); // Red
          statusText = 'Sync Error / Incompatible Version';
        } else {
          // connecting, server_starting, syncing
          statusColor = ColorPalette.toCSS(colors.syncing); // Yellow
          statusText = currentSyncStatus === 'server_starting' ? 'Waking up server...' : 'Syncing...';
        }
      }
    } else {
      // Local Mode
      const isSaved = this.mindMap ? this.mindMap.isSaved : true;
      if (isSaved) {
        statusColor = ColorPalette.toCSS(colors.saved); // Green
        statusText = 'Saved locally';
      } else {
        statusColor = ColorPalette.toCSS(colors.syncing); // Yellow
        statusText = 'Unsaved changes...';
      }
    }

    this.statusIndicator.style('background-color', statusColor);
    this.statusIndicator.attribute('title', statusText);
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
    // Also suppress menu if keyboard overlay or room history are active
    const isAnyOverlayVisible = options.forceHide || 
                               this.isKeyboardOverlayVisible() || 
                               (typeof roomHistoryOverlay !== 'undefined' && roomHistoryOverlay && roomHistoryOverlay.isVisible && roomHistoryOverlay.isVisible());

    if (isAnyOverlayVisible) {
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
    if (this.menuBar) {
      this.menuBar.addClass('om-visible');
    }

    // Refresh status indicator when showing
    this.updateStatusIndicator();

    // Check connection state from global collaborationManager
    const activeManager = (typeof collaborationManager !== 'undefined') ? collaborationManager : this.collaborationManager;
    const isConnected = activeManager && activeManager.isConnected;

    // Update invite button and display name input based on connection state
    if (this.inviteButton) {
      if (isConnected) {
        this.inviteButton.removeClass('om-btn-success');
        this.inviteButton.addClass('om-btn-primary');
        this.inviteButton.html('Copy Room Link');
      } else {
        this.inviteButton.removeClass('om-btn-primary');
        this.inviteButton.addClass('om-btn-success');
        this.inviteButton.html('Start Collaboration');
      }
    }

    if (this.displayNameInput) {
      if (isConnected) {
        this.displayNameInput.style('display', 'inline-block');
      } else {
        this.displayNameInput.style('display', 'none');
      }
    }
  }

  /**
   * Hide all menu buttons
   */
  hideButtons() {
    this.menuIsVisible = false;
    if (this.menuBar) {
      this.menuBar.removeClass('om-visible');
    }
  }

  /**
   * Layout and position all menu buttons
   */
  layoutButtons() {
    // Flexbox manages the internal layout now.
    // We update the menuRightEdge for hover detection in sketch.js manually or here
    if (this.menuBar && this.menuBar.elt) {
      const rect = this.menuBar.elt.getBoundingClientRect();
      this.menuRightEdge = rect.right + 20;
    }
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
    removeIfExists(this.menuBar);

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
