/**
 * BaseOverlay - Base class for modal overlays in the application
 * 
 * Provides a standardized layout with:
 * - Full-screen dimmed background
 * - Centered content card with sticky header and footer
 * - Scrollable middle area with custom scrollbars
 * - Shared styling and visibility management
 */

class BaseOverlay {
    constructor(id) {
        this.id = id;
        this.overlay = null;
        this.overlayContent = null;
        this.scrollArea = null;
        this.isVisible = false;
        this.buttonRef = null;
    }

    /**
     * Ensure the overlay CSS is loaded
     */
    _ensureStylesLoaded() {
        if (!document.getElementById('om-overlay-styles-link')) {
            const link = createElement('link');
            link.attribute('id', 'om-overlay-styles-link');
            link.attribute('rel', 'stylesheet');
            link.attribute('type', 'text/css');
            link.attribute('href', 'src/overlays.css');
            link.parent(document.head);
        }
    }

    /**
     * Synchronize ColorPalette values to CSS variables
     */
    static syncTheme() {
        if (typeof ColorPalette === 'undefined') return;
        
        const root = document.documentElement;
        const colors = {
            '--om-color-primary': ColorPalette.toCSS(ColorPalette.BASE.PRIMARY),
            '--om-color-success': ColorPalette.toCSS(ColorPalette.BASE.SUCCESS),
            '--om-color-danger': ColorPalette.toCSS(ColorPalette.BASE.DANGER),
            '--om-overlay-bg': `rgba(0, 0, 0, 0.55)`, // Default dim
            '--om-overlay-content-bg': ColorPalette.toCSS(ColorPalette.BASE.WHITE),
            '--om-overlay-text': ColorPalette.toCSS(ColorPalette.BASE.BLACK)
        };

        Object.entries(colors).forEach(([prop, val]) => {
            root.style.setProperty(prop, val);
        });
    }

    /**
     * Initialize the overlay structure
     */
    setup(options = {}) {
        if (this.overlay) return { overlay: this.overlay, overlayContent: this.overlayContent };

        this._ensureStylesLoaded();
        BaseOverlay.syncTheme();
        this.buttonRef = options.buttonRef || null;

        // 1. Create main overlay
        this.overlay = createDiv();
        this.overlay.id(`${this.id}-overlay`);
        this.overlay.addClass('om-overlay');

        // Close on background click
        this.overlay.elt.addEventListener('click', (event) => {
            if (event.target === this.overlay.elt) {
                this.hide();
            }
        });

        // 2. Create content card
        this.overlayContent = createDiv();
        this.overlayContent.parent(this.overlay);
        this.overlayContent.id(`${this.id}-content`);
        this.overlayContent.addClass('om-overlay-content');
        
        this.overlayContent.elt.addEventListener('click', (e) => e.stopPropagation());

        return { overlay: this.overlay, overlayContent: this.overlayContent };
    }

    /**
     * Populate the overlay with content (Header, ScrollArea, Footer)
     */
    populate() {
        if (!this.overlayContent) return;
        this.overlayContent.html('');

        // 1. Header (Sticky)
        const header = createDiv();
        header.parent(this.overlayContent);
        header.addClass('om-overlay-header');
        this.onPopulateHeader(header);

        // 2. Scrollable Middle
        this.scrollArea = createDiv();
        this.scrollArea.parent(this.overlayContent);
        this.scrollArea.addClass('om-overlay-scroll-area');
        this.onPopulateContent(this.scrollArea);

        // 3. Footer (Sticky)
        const footer = createDiv();
        footer.parent(this.overlayContent);
        footer.addClass('om-overlay-footer');
        this.onPopulateFooter(footer);

        // Add default Close button if Footer population doesn't handle it
        if (footer.elt.children.length === 0) {
            this._addDefaultCloseButton(footer);
        }
    }

    _addDefaultCloseButton(parent) {
        const closeBtn = createButton('Close');
        closeBtn.parent(parent);
        closeBtn.addClass('om-btn om-btn-success');
        closeBtn.mousePressed(() => this.hide());
    }

    // Lifecycle hooks for subclasses
    onPopulateHeader(header) {}
    onPopulateContent(scrollArea) {}
    onPopulateFooter(footer) {}

    show(buttonRef) {
        if (!this.overlay) this.setup({ buttonRef });
        this.populate();
        this.overlay.addClass('om-visible');
        this.isVisible = true;
        const btn = buttonRef || this.buttonRef;
        if (btn && btn.attribute) btn.attribute('aria-expanded', 'true');
    }

    hide(buttonRef) {
        if (!this.overlay) return;
        this.overlay.removeClass('om-visible');
        this.isVisible = false;
        const btn = buttonRef || this.buttonRef;
        if (btn && btn.attribute) btn.attribute('aria-expanded', 'false');
    }

    toggle(buttonRef) {
        if (this.isVisible) {
            this.hide(buttonRef);
        } else {
            this.show(buttonRef);
        }
    }
}

// Global exposure
if (typeof window !== 'undefined') {
    window.BaseOverlay = BaseOverlay;
}
