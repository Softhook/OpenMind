/**
 * KeyboardOverlay - Keyboard shortcuts help overlay
 *
 * This module manages the keyboard shortcuts overlay that shows
 * all available shortcuts to the user. It handles creation, styling,
 * content population, and visibility toggling.
 *
 * Key Features:
 * - Modal overlay with semi-transparent backdrop
 * - Responsive sizing based on viewport
 * - Complete list of keyboard shortcuts
 * - Click-outside-to-close behavior
 *
 * Dependencies:
 * - p5.js for DOM element creation (createDiv, createButton, etc.)
 * - Global keyboardOverlay, keyboardOverlayContent, keyboardOverlayVisible variables
 * - Global keyboardControlsButton for aria-expanded state
 *
 * Usage:
 * - Call setupKeyboardControlsOverlay() during app initialization
 * - Call toggleKeyboardControlsOverlay() to show/hide
 * - Call updateKeyboardOverlaySize() on window resize
 */

// ============================================================================
// MODULE STATE
// ============================================================================

// References to overlay elements (set during setup)
let _overlay = null;
let _overlayContent = null;
let _isVisible = false;
let _overlayClickHandler = null;
let _overlayContentClickHandler = null;

// ============================================================================
// KEYBOARD SHORTCUTS DATA
// ============================================================================

/**
 * List of all keyboard shortcuts to display in the overlay.
 * Each item has a keys string and description.
 */
const KEYBOARD_SHORTCUTS = [
    { keys: 'N', description: 'Create new box' },
    { keys: 'C', description: 'Create connection from selected box' },
    { keys: '1 / 2 / 3', description: 'Set box color (Red / Orange / White)' },
    { keys: 'Backspace/Delete', description: 'Delete selected boxes or connections' },
    { keys: 'Space', description: 'Reverse the selected connection' },
    { keys: 'Shift + Click', description: 'Add and remove from selection' },
    { keys: 'A', description: 'Align selected boxes to the left (Shift+A distributes vertically)' },
    { keys: 'S', description: 'Align selected boxes to the bottom (Shift+S distributes horizontally)' },
    { keys: 'D', description: 'Align selected boxes to the right (Shift+D distributes vertically)' },
    { keys: 'W', description: 'Align selected boxes to the top (Shift+W distributes horizontally)' },
    { keys: 'Q', description: 'Align selected boxes to the horizontal centre (Shift+Q distributes horizontally)' },
    { keys: 'E', description: 'Align selected boxes to the vertical centre (Shift+E distributes vertically)' },
    { keys: 'R', description: 'Apply hierarchical layout in place (keep current position)' },
    { keys: 'Arrow Keys', description: 'Navigate between boxes' },
    { keys: 'Space/Right Mouse', description: 'Pan the canvas' },
    { keys: 'Scroll Wheel', description: 'Zoom in and out' },
    { keys: 'F', description: 'Toggle fullscreen view' },
    { keys: '-', description: 'Fit and center the entire map' },
    { keys: '+', description: 'Zoom to selected elements' },
    { keys: 'Cmd/Ctrl + Click', description: 'Open hyperlink in new tab' },
    { keys: 'Cmd/Ctrl + C / V', description: 'Copy or paste text or boxes' },
    { keys: 'Cmd/Ctrl + X', description: 'Cut selected text while editing' },
    { keys: 'Cmd/Ctrl + B', description: 'Highlight selected text' },
    { keys: 'Cmd/Ctrl + Z', description: 'Undo the last change' },
    { keys: 'Cmd/Ctrl + S', description: 'Save the mind map as JSON' },
    { keys: 'Cmd/Ctrl + L', description: 'Load a mind map from file' }
];

// ============================================================================
// STYLE CONSTANTS
// ============================================================================

const OVERLAY_STYLES = {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    padding: '24px',
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '1000',
    boxSizing: 'border-box'
};

const CONTENT_STYLES = {
    background: '#ffffff',
    padding: '24px 32px',
    borderRadius: '8px',
    maxWidth: '520px',
    width: 'auto',
    display: 'inline-block',
    maxHeight: 'calc(100vh - 48px)',
    overflowY: 'auto',
    color: '#222222',
    boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
    boxSizing: 'border-box',
    fontFamily: 'sans-serif',
    fontSize: '13px'
};

// ============================================================================
// SETUP FUNCTIONS
// ============================================================================

/**
 * Sets up the keyboard controls overlay.
 * Creates the overlay container, content panel, and populates with shortcuts.
 * @param {Object} options - Optional config with keyboardControlsButton reference
 */
function setupKeyboardControlsOverlay(options = {}) {
    if (_overlay) return; // Already set up

    // Store reference to button for aria updates
    const buttonRef = options.keyboardControlsButton || null;

    // Create overlay container
    _overlay = createDiv();
    _overlay.id('keyboard-controls-overlay');

    // Apply overlay styles
    Object.entries(OVERLAY_STYLES).forEach(([prop, value]) => {
        _overlay.style(prop, value);
    });

    // Click handler for closing when clicking backdrop
    if (_overlay.elt) {
        _overlayClickHandler = (event) => {
            if (event.target === _overlay.elt) {
                hideKeyboardControlsOverlay(buttonRef);
            }
        };
        _overlay.elt.addEventListener('click', _overlayClickHandler);
    }

    // Create content panel
    _overlayContent = createDiv();
    _overlayContent.parent(_overlay);
    _overlayContent.id('keyboard-controls-overlay-content');

    // Apply content styles
    Object.entries(CONTENT_STYLES).forEach(([prop, value]) => {
        _overlayContent.style(prop, value);
    });

    // Responsive width based on viewport
    const maxWidth = Math.min(560, window.innerWidth - 48);
    _overlayContent.style('max-width', maxWidth + 'px');

    // Stop propagation when clicking inside content
    if (_overlayContent.elt) {
        _overlayContentClickHandler = (event) => {
            event.stopPropagation();
        };
        _overlayContent.elt.addEventListener('click', _overlayContentClickHandler);
    }

    // Populate with shortcuts
    populateKeyboardControlsOverlay();

    // Return references for external use
    return {
        overlay: _overlay,
        overlayContent: _overlayContent
    };
}

/**
 * Populates the overlay content with keyboard shortcuts.
 */
function populateKeyboardControlsOverlay() {
    if (!_overlayContent) return;

    _overlayContent.html('');

    // Title
    const title = createElement('h2', 'Open Mind    <span style="font-size: 0.6em; color: grey;">Christian Nold, 2025</span>');
    title.parent(_overlayContent);
    title.style('margin', '0 0 12px 0');
    title.style('font-size', '20px');
    title.style('font-weight', '600');

    // Hint
    const hint = createElement('p');
    hint.html('Timed autosaves to browser. Box hierarchy: <span style="color: red;">Red</span> > <span style="color: orange;">Orange</span> > White');
    hint.parent(_overlayContent);
    hint.style('margin', '0 0 18px 0');
    hint.style('font-size', '13px');
    hint.style('color', '#555555');

    // Shortcuts list
    for (const item of KEYBOARD_SHORTCUTS) {
        const row = createDiv();
        row.parent(_overlayContent);
        row.style('display', 'flex');
        row.style('align-items', 'flex-start');
        row.style('gap', '24px');
        row.style('margin-bottom', '8px');
        row.style('font-size', '13px');

        const keyLabel = createSpan(item.keys);
        keyLabel.parent(row);
        keyLabel.style('font-family', 'monospace');
        keyLabel.style('font-weight', '600');
        keyLabel.style('flex', '0 0 120px');
        keyLabel.style('min-width', '100px');
        keyLabel.style('white-space', 'nowrap');
        keyLabel.style('font-size', '13px');
        keyLabel.style('text-align', 'right');

        const description = createSpan(item.description);
        description.parent(row);
        description.style('flex', '1');
        description.style('min-width', '0');
        description.style('font-size', '13px');
    }

    // Close button
    const closeButton = createButton('Close');
    closeButton.parent(_overlayContent);
    closeButton.style('margin-top', '20px');
    closeButton.style('align-self', 'flex-end');
    closeButton.style('padding', '6px 14px');
    closeButton.style('font-size', '14px');
    closeButton.style('cursor', 'pointer');
    closeButton.mousePressed(() => hideKeyboardControlsOverlay());
}

// ============================================================================
// VISIBILITY FUNCTIONS
// ============================================================================

/**
 * Shows the keyboard controls overlay.
 * @param {Object} buttonRef - Optional reference to keyboard button for aria updates
 */
function showKeyboardControlsOverlay(buttonRef) {
    if (!_overlay) return;

    _overlay.style('display', 'flex');

    // Recompute sizing for current viewport
    try {
        updateKeyboardOverlaySize();
    } catch (_) { }

    _isVisible = true;

    // Update aria state on button
    if (buttonRef && buttonRef.attribute) {
        buttonRef.attribute('aria-expanded', 'true');
    }
}

/**
 * Hides the keyboard controls overlay.
 * @param {Object} buttonRef - Optional reference to keyboard button for aria updates
 */
function hideKeyboardControlsOverlay(buttonRef) {
    if (!_overlay) return;

    _overlay.style('display', 'none');
    _isVisible = false;

    // Update aria state on button
    if (buttonRef && buttonRef.attribute) {
        buttonRef.attribute('aria-expanded', 'false');
    }
}

/**
 * Toggles the keyboard controls overlay visibility.
 * @param {Object} buttonRef - Optional reference to keyboard button for aria updates
 */
function toggleKeyboardControlsOverlay(buttonRef) {
    if (_isVisible) {
        hideKeyboardControlsOverlay(buttonRef);
    } else {
        showKeyboardControlsOverlay(buttonRef);
    }
}

/**
 * Updates overlay content size to fit current viewport.
 * Should be called on window resize.
 */
function updateKeyboardOverlaySize() {
    if (!_overlayContent) return;

    try {
        // Max width responsive to viewport
        const maxWidth = Math.min(900, Math.max(220, window.innerWidth - 48));
        _overlayContent.style('max-width', maxWidth + 'px');
        _overlayContent.style('width', 'auto');
        _overlayContent.style('min-width', '0');

        // Max height responsive to viewport
        const minHeight = 120;
        const maxHeight = Math.max(minHeight, window.innerHeight - 48);
        _overlayContent.style('max-height', maxHeight + 'px');
    } catch (e) {
        // Ignore errors
    }
}

/**
 * Returns whether the overlay is currently visible.
 * @returns {boolean}
 */
function isKeyboardOverlayVisible() {
    return _isVisible;
}

/**
 * Gets reference to the overlay element.
 * Useful for external updates.
 * @returns {Object|null} p5.Element or null
 */
function getKeyboardOverlay() {
    return _overlay;
}

/**
 * Gets reference to the overlay content element.
 * @returns {Object|null} p5.Element or null
 */
function getKeyboardOverlayContent() {
    return _overlayContent;
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof window !== 'undefined') {
    window.KeyboardOverlay = {
        setup: setupKeyboardControlsOverlay,
        populate: populateKeyboardControlsOverlay,
        show: showKeyboardControlsOverlay,
        hide: hideKeyboardControlsOverlay,
        toggle: toggleKeyboardControlsOverlay,
        updateSize: updateKeyboardOverlaySize,
        isVisible: isKeyboardOverlayVisible,
        getOverlay: getKeyboardOverlay,
        getOverlayContent: getKeyboardOverlayContent,
        SHORTCUTS: KEYBOARD_SHORTCUTS
    };
}
