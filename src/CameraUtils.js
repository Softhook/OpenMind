/**
 * CameraUtils - Camera State and Management System
 *
 * This module handles the "infinite canvas" camera system, including:
 * - State management (x, y, zoom)
 * - Coordinate transformations (Screen <-> World)
 * - Pan and Zoom operations
 * - Viewport fitting
 *
 * It serves as the single source of truth for camera position,
 * replacing scattered global variables.
 */

const CameraUtils = {
    // Core state
    x: 0,
    y: 0,
    zoom: 1,

    // Pan state
    isPanning: false,
    panStartMouseX: 0,
    panStartMouseY: 0,
    panStartCamX: 0,
    panStartCamY: 0,
    rightPanActive: false,
    suppressNextRightClick: false,


    // ============================================================================
    // COORDINATE TRANSFORMS
    // ============================================================================

    /**
     * Converts world X coordinate to screen space
     * @param {number} worldX - World X coordinate
     * @returns {number} Screen X coordinate
     */
    screenX(worldX) {
        return worldX * this.zoom + this.x;
    },

    /**
     * Converts world Y coordinate to screen space
     * @param {number} worldY - World Y coordinate
     * @returns {number} Screen Y coordinate
     */
    screenY(worldY) {
        return worldY * this.zoom + this.y;
    },

    /**
     * Converts screen X coordinate to world space
     * @param {number} screenX - Screen X coordinate
     * @returns {number} World X coordinate
     */
    worldX(screenX) {
        const safeZoom = this.zoom > 0 ? this.zoom : 1;
        return (screenX - this.x) / safeZoom;
    },

    /**
     * Converts screen Y coordinate to world space
     * @param {number} screenY - Screen Y coordinate
     * @returns {number} World Y coordinate
     */
    worldY(screenY) {
        const safeZoom = this.zoom > 0 ? this.zoom : 1;
        return (screenY - this.y) / safeZoom;
    },


    // ============================================================================
    // STATE MANAGEMENT
    // ============================================================================

    /**
     * Resets camera to default state (0,0 position, 1x zoom)
     */
    reset() {
        this.x = 0;
        this.y = 0;
        this.zoom = 1;
        this.isPanning = false;
        this.rightPanActive = false;
        this.suppressNextRightClick = false;
    },

    /**
     * Centers camera on a world position
     * @param {number} worldX - World X to center on
     * @param {number} worldY - World Y to center on
     * @param {number} viewWidth - Viewport width
     * @param {number} viewHeight - Viewport height
     */
    centerOn(worldX, worldY, viewWidth, viewHeight) {
        this.x = viewWidth / 2 - worldX * this.zoom;
        this.y = viewHeight / 2 - worldY * this.zoom;
    },


    // ============================================================================
    // INTERACTION HANDLERS
    // ============================================================================

    /**
     * Starts a pan operation
     * @param {number} mouseX - Starting mouse X
     * @param {number} mouseY - Starting mouse Y
     * @param {boolean} isRightButton - Whether initiated by right mouse button
     */
    startPan(mouseX, mouseY, isRightButton = false) {
        this.isPanning = true;
        this.panStartMouseX = mouseX;
        this.panStartMouseY = mouseY;
        this.panStartCamX = this.x;
        this.panStartCamY = this.y;
        this.rightPanActive = isRightButton;
    },

    /**
     * Updates camera position during pan
     * @param {number} mouseX - Current mouse X
     * @param {number} mouseY - Current mouse Y
     */
    updatePan(mouseX, mouseY) {
        if (!this.isPanning) return;
        this.x = this.panStartCamX + (mouseX - this.panStartMouseX);
        this.y = this.panStartCamY + (mouseY - this.panStartMouseY);
    },

    /**
     * Ends the current pan operation
     */
    endPan() {
        if (this.rightPanActive) {
            this.suppressNextRightClick = true;
        }
        this.isPanning = false;
        this.rightPanActive = false;
    },

    /**
     * Applies zoom centered on a point
     * @param {number} factor - Zoom factor (> 1 = zoom in)
     * @param {number} centerX - Screen X to zoom around
     * @param {number} centerY - Screen Y to zoom around
     * @param {number} minZoom - Minimum zoom level
     * @param {number} maxZoom - Maximum zoom level
     */
    zoomAt(factor, centerX, centerY, minZoom, maxZoom) {
        // Compute world point under center before zoom
        const wx = this.worldX(centerX);
        const wy = this.worldY(centerY);

        // Apply zoom with constraints
        const newZoom = Math.max(minZoom, Math.min(maxZoom, this.zoom * factor));

        // Adjust camera to keep same world point under center
        this.x = centerX - wx * newZoom;
        this.y = centerY - wy * newZoom;
        this.zoom = newZoom;
    }
};

// Export globally
if (typeof window !== 'undefined') {
    window.CameraUtils = CameraUtils;
}
