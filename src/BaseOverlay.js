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
     * Common styles for all overlays
     */
    static STYLES = {
        OVERLAY: {
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
            zIndex: '2000',
            boxSizing: 'border-box'
        },
        CONTENT: {
            background: '#ffffff',
            padding: '0',
            borderRadius: '16px',
            maxWidth: '540px',
            width: '92%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '200px',
            maxHeight: 'calc(100vh - 100px)',
            color: '#1a1a1a',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.45)',
            boxSizing: 'border-box',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.1)'
        }
    };

    /**
     * Helper to apply styles to a p5 element
     */
    _applyStyles(el, styles) {
        if (!el || !styles) return;
        Object.entries(styles).forEach(([prop, value]) => {
            el.style(prop, value);
        });
    }

    /**
     * Initialize the overlay structure
     */
    setup(options = {}) {
        if (this.overlay) return { overlay: this.overlay, overlayContent: this.overlayContent };

        this.buttonRef = options.buttonRef || null;

        // 1. Create main overlay
        this.overlay = createDiv();
        this.overlay.id(`${this.id}-overlay`);
        this._applyStyles(this.overlay, BaseOverlay.STYLES.OVERLAY);

        // Close on background click
        this.overlay.elt.addEventListener('click', (event) => {
            if (event.target === this.overlay.elt) {
                this.hide();
            }
        });

        // 2. Add custom scrollbar styling if not already present
        if (!document.getElementById('base-overlay-styles')) {
            const style = createElement('style');
            style.id('base-overlay-styles');
            style.html(`
                .overlay-scroll-area::-webkit-scrollbar {
                    width: 10px;
                }
                .overlay-scroll-area::-webkit-scrollbar-track {
                    background: transparent;
                }
                .overlay-scroll-area::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 10px;
                    border: 2px solid white;
                }
                .overlay-scroll-area::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 0, 0, 0.35);
                }
            `);
            style.parent(document.head);
        }

        // 3. Create content card
        this.overlayContent = createDiv();
        this.overlayContent.parent(this.overlay);
        this.overlayContent.id(`${this.id}-content`);
        
        // Late style check for ColorPalette
        const contentStyles = { ...BaseOverlay.STYLES.CONTENT };
        if (typeof ColorPalette !== 'undefined' && ColorPalette.toCSS) {
            contentStyles.background = ColorPalette.toCSS(ColorPalette.BASE.WHITE);
            contentStyles.color = ColorPalette.toCSS(ColorPalette.BASE.BLACK);
        }
        this._applyStyles(this.overlayContent, contentStyles);

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
        header.style('padding', '24px 32px 16px 32px');
        header.style('border-bottom', '1px solid #eee');
        this.onPopulateHeader(header);

        // 2. Scrollable Middle
        this.scrollArea = createDiv();
        this.scrollArea.parent(this.overlayContent);
        this.scrollArea.addClass('overlay-scroll-area');
        this.scrollArea.style('flex', '1');
        this.scrollArea.style('overflow-y', 'auto');
        this.scrollArea.style('padding', '16px 32px');
        this.scrollArea.style('min-height', '100px');
        this.scrollArea.style('margin-right', '4px');
        this.onPopulateContent(this.scrollArea);

        // 3. Footer (Sticky)
        const footer = createDiv();
        footer.parent(this.overlayContent);
        footer.style('padding', '16px 32px 24px 32px');
        footer.style('border-top', '1px solid #eee');
        footer.style('display', 'flex');
        footer.style('justify-content', 'flex-end');
        this.onPopulateFooter(footer);

        // Add default Close button if Footer population doesn't handle it
        if (footer.elt.children.length === 0) {
            this._addDefaultCloseButton(footer);
        }
    }

    _addDefaultCloseButton(parent) {
        const closeBtn = createButton('Close');
        closeBtn.parent(parent);
        closeBtn.style('padding', '10px 24px');
        closeBtn.style('font-size', '14px');
        closeBtn.style('font-weight', '600');
        closeBtn.style('cursor', 'pointer');
        
        const successColor = (typeof ColorPalette !== 'undefined' && ColorPalette.BASE.SUCCESS) 
            ? ColorPalette.toCSS(ColorPalette.BASE.SUCCESS) 
            : '#38a169';
            
        closeBtn.style('background', successColor);
        closeBtn.style('color', 'white');
        closeBtn.style('border', 'none');
        closeBtn.style('border-radius', '6px');
        closeBtn.style('transition', 'all 0.2s');
        closeBtn.style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)');
        
        closeBtn.elt.onmouseenter = () => {
            closeBtn.style('opacity', '0.9');
            closeBtn.style('transform', 'translateY(-1px)');
            closeBtn.style('box-shadow', '0 4px 8px rgba(0,0,0,0.15)');
        };
        closeBtn.elt.onmouseleave = () => {
            closeBtn.style('opacity', '1');
            closeBtn.style('transform', 'translateY(0)');
            closeBtn.style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)');
        };
        
        closeBtn.mousePressed(() => this.hide());
    }

    // Lifecycle hooks for subclasses
    onPopulateHeader(header) {}
    onPopulateContent(scrollArea) {}
    onPopulateFooter(footer) {}

    show(buttonRef) {
        if (!this.overlay) this.setup({ buttonRef });
        this.populate();
        this.overlay.style('display', 'flex');
        this.isVisible = true;
        const btn = buttonRef || this.buttonRef;
        if (btn && btn.attribute) btn.attribute('aria-expanded', 'true');
    }

    hide(buttonRef) {
        if (!this.overlay) return;
        this.overlay.style('display', 'none');
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
