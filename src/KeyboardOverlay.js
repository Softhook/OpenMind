/**
 * KeyboardOverlay - Keyboard shortcuts help overlay
 *
 * Responsibilities:
 * - Build and style the shortcuts modal
 * - Handle show/hide/toggle with aria updates
 * - Keep sizing responsive to viewport changes
 *
 * Behavior is unchanged; this refactor just centralizes state to a manager
 * instead of scattered globals.
 */

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
    { keys: 'R', description: 'Apply hierarchical layout to selection' },
    { keys: 'Arrow Keys', description: 'Presentation Mode: Navigate between boxes' },
    { keys: 'Space/Right Mouse', description: 'Pan the canvas' },
    { keys: 'Scroll Wheel', description: 'Zoom in and out' },
    { keys: 'F', description: 'Toggle fullscreen view' },
    { keys: 'G', description: 'Toggle grid background (local only)' },
    { keys: '-', description: 'Fit and center the entire map' },
    { keys: '+', description: 'Zoom to selected elements' },
    { keys: 'Cmd/Ctrl + Click', description: 'Open hyperlink in new tab' },
    { keys: 'Cmd/Ctrl + C / V', description: 'Copy or paste text or boxes' },
    { keys: 'Cmd/Ctrl + X', description: 'Cut selected text while editing' },
    { keys: 'Cmd/Ctrl + B', description: 'Bold outline selected text (no reflow)' },
    { keys: 'Cmd/Ctrl + U', description: 'Highlight selected text' },
    { keys: 'Cmd/Ctrl + I', description: 'Italic slant selected text' },
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

// Small helpers shared across methods
function applyStyles(el, styles) {
    Object.entries(styles).forEach(([prop, value]) => {
        el.style(prop, value);
    });
}

class KeyboardOverlayManager {
    constructor() {
        this.overlay = null;
        this.overlayContent = null;
        this.isVisible = false;
        this.overlayClickHandler = null;
        this.overlayContentClickHandler = null;
        this.buttonRef = null;
    }

    setup(options = {}) {
        if (this.overlay) return { overlay: this.overlay, overlayContent: this.overlayContent };

        this.buttonRef = options.keyboardControlsButton || null;

        this.overlay = createDiv();
        this.overlay.id('keyboard-controls-overlay');
        applyStyles(this.overlay, OVERLAY_STYLES);

        if (this.overlay.elt) {
            this.overlayClickHandler = (event) => {
                if (event.target === this.overlay.elt) {
                    this.hide();
                }
            };
            this.overlay.elt.addEventListener('click', this.overlayClickHandler);
        }

        this.overlayContent = createDiv();
        this.overlayContent.parent(this.overlay);
        this.overlayContent.id('keyboard-controls-overlay-content');
        applyStyles(this.overlayContent, CONTENT_STYLES);

        const maxWidth = Math.min(560, window.innerWidth - 48);
        this.overlayContent.style('max-width', maxWidth + 'px');

        if (this.overlayContent.elt) {
            this.overlayContentClickHandler = (event) => {
                event.stopPropagation();
            };
            this.overlayContent.elt.addEventListener('click', this.overlayContentClickHandler);
        }

        this.populate();

        return { overlay: this.overlay, overlayContent: this.overlayContent };
    }

    populate() {
        if (!this.overlayContent) return;

        this.overlayContent.html('');

        const title = createElement('h2', 'Open Mind    <span style="font-size: 0.6em; color: grey;">Christian Nold, 2025</span>');
        title.parent(this.overlayContent);
        title.style('margin', '0 0 12px 0');
        title.style('font-size', '20px');
        title.style('font-weight', '600');

        const hint = createElement('p');
        hint.html('Timed autosaves to browser. Box hierarchy: <span style="color: red;">Red</span> > <span style="color: orange;">Orange</span> > White');
        hint.parent(this.overlayContent);
        hint.style('margin', '0 0 18px 0');
        hint.style('font-size', '13px');
        hint.style('color', '#555555');

        for (const item of KEYBOARD_SHORTCUTS) {
            const row = createDiv();
            row.parent(this.overlayContent);
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

        const closeButton = createButton('Close');
        closeButton.parent(this.overlayContent);
        closeButton.style('margin-top', '20px');
        closeButton.style('align-self', 'flex-end');
        closeButton.style('padding', '6px 14px');
        closeButton.style('font-size', '14px');
        closeButton.style('cursor', 'pointer');
        closeButton.mousePressed(() => this.hide());
    }

    show(buttonRef) {
        if (!this.overlay) return;

        this.overlay.style('display', 'flex');
        try {
            this.updateSize();
        } catch (_) { /* ignore */ }

        this.isVisible = true;
        this.updateAria(buttonRef || this.buttonRef, true);
    }

    hide(buttonRef) {
        if (!this.overlay) return;

        this.overlay.style('display', 'none');
        this.isVisible = false;
        this.updateAria(buttonRef || this.buttonRef, false);
    }

    toggle(buttonRef) {
        if (this.isVisible) {
            this.hide(buttonRef);
        } else {
            this.show(buttonRef);
        }
    }

    updateSize() {
        if (!this.overlayContent) return;

        const maxWidth = Math.min(900, Math.max(220, window.innerWidth - 48));
        this.overlayContent.style('max-width', maxWidth + 'px');
        this.overlayContent.style('width', 'auto');
        this.overlayContent.style('min-width', '0');

        const minHeight = 120;
        const maxHeight = Math.max(minHeight, window.innerHeight - 48);
        this.overlayContent.style('max-height', maxHeight + 'px');
    }

    updateAria(button, expanded) {
        if (button && button.attribute) {
            button.attribute('aria-expanded', expanded ? 'true' : 'false');
        }
    }

    getOverlay() {
        return this.overlay;
    }

    getOverlayContent() {
        return this.overlayContent;
    }

    /**
     * Cleanup method to remove event listeners and prevent memory leaks
     */
    cleanup() {
        // Remove event listeners
        if (this.overlay && this.overlay.elt && this.overlayClickHandler) {
            this.overlay.elt.removeEventListener('click', this.overlayClickHandler);
            this.overlayClickHandler = null;
        }
        
        if (this.overlayContent && this.overlayContent.elt && this.overlayContentClickHandler) {
            this.overlayContent.elt.removeEventListener('click', this.overlayContentClickHandler);
            this.overlayContentClickHandler = null;
        }
        
        // Remove DOM elements
        if (this.overlay && this.overlay.remove) {
            this.overlay.remove();
        }
        
        // Reset state
        this.overlay = null;
        this.overlayContent = null;
        this.isVisible = false;
        this.buttonRef = null;
    }
}

const keyboardOverlayManager = new KeyboardOverlayManager();

// Backward-compatible globals expected elsewhere in the app
function setupKeyboardControlsOverlay(options = {}) {
    return keyboardOverlayManager.setup(options);
}

function populateKeyboardControlsOverlay() {
    return keyboardOverlayManager.populate();
}

function showKeyboardControlsOverlay(buttonRef) {
    return keyboardOverlayManager.show(buttonRef);
}

function hideKeyboardControlsOverlay(buttonRef) {
    return keyboardOverlayManager.hide(buttonRef);
}

function toggleKeyboardControlsOverlay(buttonRef) {
    return keyboardOverlayManager.toggle(buttonRef);
}

function updateKeyboardOverlaySize() {
    return keyboardOverlayManager.updateSize();
}

function isKeyboardOverlayVisible() {
    return keyboardOverlayManager.isVisible;
}

function getKeyboardOverlay() {
    return keyboardOverlayManager.getOverlay();
}

function getKeyboardOverlayContent() {
    return keyboardOverlayManager.getOverlayContent();
}

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
