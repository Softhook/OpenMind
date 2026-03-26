/**
 * KeyboardOverlay - Keyboard shortcuts help overlay
 * Extends BaseOverlay for consistent layout and scrollbar styling.
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

class KeyboardOverlayManager extends BaseOverlay {
    constructor() {
        super('keyboard-controls');
    }

    onPopulateHeader(header) {
        const title = createElement('h2', 'Open Mind <span style="font-size: 0.6em; color: grey;">Christian Nold, 2025</span>');
        title.parent(header);
    }

    onPopulateContent(scrollArea) {
        const hint = createElement('p');
        hint.html('Timed autosaves to browser. Box hierarchy: <span style="color: red;">Red</span> > <span style="color: orange;">Orange</span> > White');
        hint.parent(scrollArea);
        hint.addClass('om-hint-text');

        for (const item of KEYBOARD_SHORTCUTS) {
            const row = createDiv();
            row.parent(scrollArea);
            row.addClass('om-shortcut-row');

            const keyLabel = createSpan(item.keys);
            keyLabel.parent(row);
            keyLabel.addClass('om-shortcut-keys');

            const description = createSpan(item.description);
            description.parent(row);
            description.addClass('om-shortcut-desc');
        }
    }

    // Optional override for specific button color if needed, 
    // but BaseOverlay uses ColorPalette.BASE.SUCCESS (Green) by default now.
}

const keyboardOverlayManager = new KeyboardOverlayManager();

// Backward-compatibility wrappers
if (typeof window !== 'undefined') {
    window.KeyboardOverlay = {
        setup: (opt) => keyboardOverlayManager.setup(opt),
        populate: () => keyboardOverlayManager.populate(),
        show: (btn) => keyboardOverlayManager.show(btn),
        hide: (btn) => keyboardOverlayManager.hide(btn),
        toggle: (btn) => keyboardOverlayManager.toggle(btn),
        updateSize: () => {}, // No longer needed as BaseOverlay is responsive
        isVisible: () => keyboardOverlayManager.isVisible,
        getOverlay: () => keyboardOverlayManager.overlay,
        getOverlayContent: () => keyboardOverlayManager.overlayContent,
        SHORTCUTS: KEYBOARD_SHORTCUTS
    };
}
