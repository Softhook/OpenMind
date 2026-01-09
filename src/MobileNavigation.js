/**
 * MobileNavigation - Touch-friendly navigation overlay for mobile devices
 *
 * This module provides mobile-optimized navigation controls for the mind map,
 * featuring touch-friendly up/down buttons for traversing boxes.
 *
 * Key Features:
 * - Touch device detection (touch events, coarse pointer, screen size)
 * - Floating navigation buttons with touch feedback
 * - Orientation-responsive positioning
 * - Visual feedback on touch/click interactions
 *
 * Dependencies:
 * - p5.js for UI element creation (createDiv, createButton)
 * - MindMap instance for navigation operations
 * - sketch.js global variables (mindMap, mobileNavOverlay, etc.)
 *
 * Usage:
 * - Automatically shown on touch devices
 * - Can be manually shown/hidden via showMobileNavOverlay/hideMobileNavOverlay
 */

// ============================================================================
// MOBILE NAVIGATION STATE
// ============================================================================

// These variables are managed by sketch.js but referenced here
// let mobileNavOverlay, mobileNavUpButton, mobileNavDownButton, isTouchDevice;

// ============================================================================
// MOBILE NAVIGATION: DEVICE DETECTION
// ============================================================================

/**
 * Detects if the current device supports touch events or has a mobile-sized screen.
 * Uses multiple detection methods for broad compatibility.
 *
 * @returns {boolean} true if touch is supported or mobile-sized screen
 */
function detectTouchDevice() {
    // Check for touch event support
    const hasTouchEvents = (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0
    );

    // Check for coarse pointer (touch screens, stylus)
    const hasCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    // Check for mobile-sized viewport
    const isMobileSize = window.innerWidth <= 768 || window.innerHeight <= 500;

    return hasTouchEvents || hasCoarsePointer || isMobileSize;
}

// ============================================================================
// MOBILE NAVIGATION: SETUP
// ============================================================================

/**
 * Sets up the mobile navigation overlay with up/down buttons.
 * Creates a floating overlay in the bottom-left corner with navigation buttons.
 *
 * Requires global variables:
 * - mobileNavOverlay, mobileNavUpButton, mobileNavDownButton, isTouchDevice
 * - addTrackedEventListener (from sketch.js)
 */
function setupMobileNavigation() {
    try {
        isTouchDevice = detectTouchDevice();

        // Create overlay container
        mobileNavOverlay = createDiv();
        mobileNavOverlay.id('mobile-nav-overlay');
        _applyMobileNavOverlayStyles(mobileNavOverlay, isTouchDevice);

        // Button configuration
        const buttonStyle = _getMobileNavButtonStyles();

        // Create Up button
        mobileNavUpButton = createButton('▲');
        mobileNavUpButton.parent(mobileNavOverlay);
        mobileNavUpButton.id('mobile-nav-up');
        applyButtonStyles(mobileNavUpButton, buttonStyle);
        mobileNavUpButton.attribute('aria-label', 'Navigate to previous box');

        // Create Down button
        mobileNavDownButton = createButton('▼');
        mobileNavDownButton.parent(mobileNavOverlay);
        mobileNavDownButton.id('mobile-nav-down');
        applyButtonStyles(mobileNavDownButton, buttonStyle);
        mobileNavDownButton.attribute('aria-label', 'Navigate to next box');

        // Add touch event handlers
        setupMobileNavButtonEvents(mobileNavUpButton, 'up');
        setupMobileNavButtonEvents(mobileNavDownButton, 'down');

        // Handle orientation/resize changes
        addTrackedEventListener(window, 'resize', updateMobileNavPosition);
        addTrackedEventListener(window, 'orientationchange', updateMobileNavPosition);

        // Initial position update
        updateMobileNavPosition();

    } catch (e) {
        console.warn('Failed to setup mobile navigation:', e);
    }
}

/**
 * Applies styles to the mobile nav overlay container.
 * @private
 */
function _applyMobileNavOverlayStyles(overlay, isVisible) {
    overlay.style('position', 'fixed');
    overlay.style('bottom', '20px');
    overlay.style('left', '20px');
    overlay.style('display', 'flex');
    overlay.style('flex-direction', 'column');
    overlay.style('gap', '10px');
    overlay.style('z-index', '999');
    overlay.style('pointer-events', 'auto');
    overlay.style('opacity', isVisible ? '1' : '0');
    overlay.style('visibility', isVisible ? 'visible' : 'hidden');
    overlay.style('transition', 'opacity 0.3s ease');
}

/**
 * Returns the button style configuration.
 * @private
 */
function _getMobileNavButtonStyles() {
    const buttonSize = 56;
    return {
        width: buttonSize + 'px',
        height: buttonSize + 'px',
        borderRadius: '50%',
        border: '2px solid rgba(100, 100, 100, 0.5)',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
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

// ============================================================================
// MOBILE NAVIGATION: BUTTON STYLING
// ============================================================================

/**
 * Applies styles to a p5.js button element.
 *
 * @param {Object} button - p5.js button element
 * @param {Object} styles - Style object with CSS properties
 */
function applyButtonStyles(button, styles) {
    if (!button || !button.style) return;
    for (const [key, value] of Object.entries(styles)) {
        button.style(key, value);
    }
}

// ============================================================================
// MOBILE NAVIGATION: EVENT HANDLING
// ============================================================================

/**
 * Sets up touch and mouse event handlers for mobile navigation buttons.
 * Provides visual feedback and triggers navigation actions.
 *
 * @param {Object} button - p5.js button element
 * @param {string} direction - 'up' or 'down'
 */
function setupMobileNavButtonEvents(button, direction) {
    if (!button || !button.elt) return;

    // Navigation action
    const navigateAction = () => {
        if (!mindMap) return;

        if (direction === 'up') {
            mindMap.navigateBoxes(UP_ARROW);
        } else if (direction === 'down') {
            mindMap.navigateBoxes(DOWN_ARROW);
        }
    };

    // Visual feedback colors
    const activeColor = 'rgba(100, 150, 255, 0.9)';
    const normalColor = 'rgba(255, 255, 255, 0.9)';

    // Touch handlers
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

    // Mouse handlers (for desktop testing)
    const handleMouseDown = () => {
        button.style('backgroundColor', activeColor);
        button.style('transform', 'scale(0.95)');
    };

    const handleMouseUp = () => {
        button.style('backgroundColor', normalColor);
        button.style('transform', 'scale(1)');
    };

    // p5.js click handler
    button.mousePressed(navigateAction);

    // Touch events
    addTrackedEventListener(button.elt, 'touchstart', handleTouchStart, { passive: false });
    addTrackedEventListener(button.elt, 'touchend', handleTouchEnd, { passive: false });
    addTrackedEventListener(button.elt, 'touchcancel', handleTouchEnd, { passive: false });

    // Mouse events
    addTrackedEventListener(button.elt, 'mousedown', handleMouseDown);
    addTrackedEventListener(button.elt, 'mouseup', handleMouseUp);
    addTrackedEventListener(button.elt, 'mouseleave', handleMouseUp);

    // Smooth transition
    button.style('transition', 'background-color 0.15s ease, transform 0.15s ease');
}

// ============================================================================
// MOBILE NAVIGATION: POSITIONING
// ============================================================================

/**
 * Updates mobile navigation position based on screen orientation and size.
 * Adjusts button sizes for smaller screens.
 */
function updateMobileNavPosition() {
    if (!mobileNavOverlay) return;

    try {
        // Check if should show based on current screen size
        const shouldShow = detectTouchDevice();
        mobileNavOverlay.style('opacity', shouldShow ? '1' : '0');
        mobileNavOverlay.style('visibility', shouldShow ? 'visible' : 'hidden');

        // Position in bottom-left with safe margins
        mobileNavOverlay.style('bottom', '20px');
        mobileNavOverlay.style('left', '20px');

        // Adjust button size for smaller screens
        const screenMin = Math.min(window.innerWidth, window.innerHeight);
        const buttonSize = screenMin < 400 ? 48 : 56;

        if (mobileNavUpButton) {
            mobileNavUpButton.style('width', buttonSize + 'px');
            mobileNavUpButton.style('height', buttonSize + 'px');
        }
        if (mobileNavDownButton) {
            mobileNavDownButton.style('width', buttonSize + 'px');
            mobileNavDownButton.style('height', buttonSize + 'px');
        }
    } catch (e) {
        console.warn('Failed to update mobile nav position:', e);
    }
}

// ============================================================================
// MOBILE NAVIGATION: VISIBILITY
// ============================================================================

/**
 * Shows the mobile navigation overlay.
 */
function showMobileNavOverlay() {
    if (!mobileNavOverlay) return;
    mobileNavOverlay.style('opacity', '1');
    mobileNavOverlay.style('visibility', 'visible');
}

/**
 * Hides the mobile navigation overlay.
 */
function hideMobileNavOverlay() {
    if (!mobileNavOverlay) return;
    mobileNavOverlay.style('opacity', '0');
    mobileNavOverlay.style('visibility', 'hidden');
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export to global scope for use by sketch.js
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
