/**
 * MobileNavigation - Touch-friendly navigation overlay for mobile devices
 *
 * Responsibilities:
 * - Detect touch-friendly environments
 * - Build and style floating navigation buttons
 * - Wire navigation handlers without altering behavior
 *
 * This refactor keeps the public API the same while centralizing state in
 * a small manager to avoid scattered globals.
 */

// ============================================================================
// HELPERS
// ============================================================================

function _applyStyles(target, styles) {
    if (!target || !target.style) return;
    for (const [key, value] of Object.entries(styles)) {
        target.style(key, value);
    }
}

class MobileNavigationManager {
    constructor() {
        this.overlay = null;
        this.upButton = null;
        this.downButton = null;
        this.isTouchDevice = false;
    }

    detectTouchDevice() {
        const hasTouchEvents = (
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0 ||
            navigator.msMaxTouchPoints > 0
        );

        const hasCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const isMobileSize = window.innerWidth <= 768 || window.innerHeight <= 500;

        return hasTouchEvents || hasCoarsePointer || isMobileSize;
    }

    setup() {
        try {
            this.isTouchDevice = this.detectTouchDevice();

            if (!this.overlay) {
                this.overlay = createDiv();
                this.overlay.id('mobile-nav-overlay');
            }
            this._applyOverlayStyles(this.isTouchDevice);

            const buttonStyle = this._getButtonStyles();

            if (!this.upButton) {
                this.upButton = createButton('▲');
                this.upButton.parent(this.overlay);
                this.upButton.id('mobile-nav-up');
                this.upButton.attribute('aria-label', 'Navigate to previous box');
                this.setupButtonEvents(this.upButton, 'up');
            }

            if (!this.downButton) {
                this.downButton = createButton('▼');
                this.downButton.parent(this.overlay);
                this.downButton.id('mobile-nav-down');
                this.downButton.attribute('aria-label', 'Navigate to next box');
                this.setupButtonEvents(this.downButton, 'down');
            }

            this.applyButtonStyles(this.upButton, buttonStyle);
            this.applyButtonStyles(this.downButton, buttonStyle);

            this._syncGlobals();

            addTrackedEventListener(window, 'resize', () => this.updatePosition());
            addTrackedEventListener(window, 'orientationchange', () => this.updatePosition());

            this.updatePosition();
        } catch (e) {
            console.warn('Failed to setup mobile navigation:', e);
        }
    }

    applyButtonStyles(button, styles) {
        _applyStyles(button, styles);
    }

    setupButtonEvents(button, direction) {
        if (!button || !button.elt) return;

        const navigateAction = () => {
            if (!mindMap) return;
            if (direction === 'up') {
                mindMap.navigateBoxes(UP_ARROW);
            } else if (direction === 'down') {
                mindMap.navigateBoxes(DOWN_ARROW);
            }
        };

        const activeColor = ColorPalette.MOBILE.ACTIVE;
        const normalColor = ColorPalette.MOBILE.NORMAL;

        const handleTouchStart = (e) => {
            e.preventDefault();
            e.stopPropagation();
            button.style('backgroundColor', activeColor);
            button.style('transform', 'scale(0.95)');
        };

        const handleTouchEnd = (e) => {
            e.preventDefault();
            e.stopPropagation();
            button.style('backgroundColor', normalColor);
            button.style('transform', 'scale(1)');
            navigateAction();
        };

        const handleMouseDown = () => {
            button.style('backgroundColor', activeColor);
            button.style('transform', 'scale(0.95)');
        };

        const handleMouseUp = () => {
            button.style('backgroundColor', normalColor);
            button.style('transform', 'scale(1)');
        };

        button.mousePressed(navigateAction);

        addTrackedEventListener(button.elt, 'touchstart', handleTouchStart, { passive: false });
        addTrackedEventListener(button.elt, 'touchend', handleTouchEnd, { passive: false });
        addTrackedEventListener(button.elt, 'touchcancel', handleTouchEnd, { passive: false });

        addTrackedEventListener(button.elt, 'mousedown', handleMouseDown);
        addTrackedEventListener(button.elt, 'mouseup', handleMouseUp);
        addTrackedEventListener(button.elt, 'mouseleave', handleMouseUp);

        button.style('transition', 'background-color 0.15s ease, transform 0.15s ease');
    }

    updatePosition() {
        if (!this.overlay) return;

        try {
            const shouldShow = this.detectTouchDevice();
            this.overlay.style('opacity', shouldShow ? '1' : '0');
            this.overlay.style('visibility', shouldShow ? 'visible' : 'hidden');

            this.overlay.style('bottom', '20px');
            this.overlay.style('left', '20px');

            const screenMin = Math.min(window.innerWidth, window.innerHeight);
            const buttonSize = screenMin < 400 ? 48 : 56;

            if (this.upButton) {
                this.upButton.style('width', buttonSize + 'px');
                this.upButton.style('height', buttonSize + 'px');
            }
            if (this.downButton) {
                this.downButton.style('width', buttonSize + 'px');
                this.downButton.style('height', buttonSize + 'px');
            }
        } catch (e) {
            console.warn('Failed to update mobile nav position:', e);
        }
    }

    show() {
        if (!this.overlay) return;
        this.overlay.style('opacity', '1');
        this.overlay.style('visibility', 'visible');
    }

    hide() {
        if (!this.overlay) return;
        this.overlay.style('opacity', '0');
        this.overlay.style('visibility', 'hidden');
    }

    _applyOverlayStyles(isVisible) {
        _applyStyles(this.overlay, {
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            zIndex: '999',
            pointerEvents: 'auto',
            opacity: isVisible ? '1' : '0',
            visibility: isVisible ? 'visible' : 'hidden',
            transition: 'opacity 0.3s ease'
        });
    }

    _getButtonStyles() {
        const buttonSize = 56;
        return {
            width: buttonSize + 'px',
            height: buttonSize + 'px',
            borderRadius: '50%',
            border: '2px solid rgba(100, 100, 100, 0.5)',
            backgroundColor: ColorPalette.MOBILE.BACKGROUND,
            color: '#333',
            fontSize: '24px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchAction: 'manipulation'
        };
    }

    _syncGlobals() {
        try {
            // Keep legacy globals in sync for existing references
            if (typeof mobileNavOverlay !== 'undefined') mobileNavOverlay = this.overlay;
            if (typeof mobileNavUpButton !== 'undefined') mobileNavUpButton = this.upButton;
            if (typeof mobileNavDownButton !== 'undefined') mobileNavDownButton = this.downButton;
            if (typeof isTouchDevice !== 'undefined') isTouchDevice = this.isTouchDevice;
        } catch (_) {
            // If globals are not declared, silently ignore
        }
    }
}

const mobileNavigationManager = new MobileNavigationManager();

function detectTouchDevice() {
    return mobileNavigationManager.detectTouchDevice();
}

function setupMobileNavigation() {
    return mobileNavigationManager.setup();
}

function applyButtonStyles(button, styles) {
    return mobileNavigationManager.applyButtonStyles(button, styles);
}

function setupMobileNavButtonEvents(button, direction) {
    return mobileNavigationManager.setupButtonEvents(button, direction);
}

function updateMobileNavPosition() {
    return mobileNavigationManager.updatePosition();
}

function showMobileNavOverlay() {
    return mobileNavigationManager.show();
}

function hideMobileNavOverlay() {
    return mobileNavigationManager.hide();
}

if (typeof window !== 'undefined') {
    window.MobileNavigation = {
        detectTouchDevice,
        setupMobileNavigation,
        applyButtonStyles,
        setupMobileNavButtonEvents,
        updateMobileNavPosition,
        showMobileNavOverlay,
        hideMobileNavOverlay
    };
}
