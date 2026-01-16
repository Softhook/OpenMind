/**
 * CameraUtils - Camera State and Management System
 *
 * This module handles the "infinite canvas" camera system, including:
 * - State management (x, y, zoom)
 * - Coordinate transformations (Screen <-> World)
 * - Pan and Zoom operations
 * - Viewport fitting
 *
 * Behavior is unchanged; implementation now uses a small class to centralize
 * state and reuse internal helpers.
 */

class CameraManager {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.zoom = 1;

        this.isPanning = false;
        this.panStartMouseX = 0;
        this.panStartMouseY = 0;
        this.panStartCamX = 0;
        this.panStartCamY = 0;
        this.rightPanActive = false;
        this.suppressNextRightClick = false;
    }

    // -------------------------------------------------------------------------
    // Coordinate transforms
    // -------------------------------------------------------------------------
    screenX(worldX) {
        return worldX * this.zoom + this.x;
    }

    screenY(worldY) {
        return worldY * this.zoom + this.y;
    }

    worldX(screenX) {
        const safeZoom = this._safeZoom();
        return (screenX - this.x) / safeZoom;
    }

    worldY(screenY) {
        const safeZoom = this._safeZoom();
        return (screenY - this.y) / safeZoom;
    }

    // -------------------------------------------------------------------------
    // State management
    // -------------------------------------------------------------------------
    reset() {
        this.x = 0;
        this.y = 0;
        this.zoom = 1;
        this.isPanning = false;
        this.rightPanActive = false;
        this.suppressNextRightClick = false;
    }

    centerOn(worldX, worldY, viewWidth, viewHeight) {
        this.x = viewWidth / 2 - worldX * this.zoom;
        this.y = viewHeight / 2 - worldY * this.zoom;
    }

    // -------------------------------------------------------------------------
    // Interaction handlers
    // -------------------------------------------------------------------------
    startPan(mouseX, mouseY, isRightButton = false) {
        this.isPanning = true;
        this.panStartMouseX = mouseX;
        this.panStartMouseY = mouseY;
        this.panStartCamX = this.x;
        this.panStartCamY = this.y;
        this.rightPanActive = isRightButton;
    }

    updatePan(mouseX, mouseY) {
        if (!this.isPanning) return;
        this.x = this.panStartCamX + (mouseX - this.panStartMouseX);
        this.y = this.panStartCamY + (mouseY - this.panStartMouseY);
    }

    endPan() {
        if (this.rightPanActive) {
            this.suppressNextRightClick = true;
        }
        this.isPanning = false;
        this.rightPanActive = false;
    }

    zoomAt(factor, centerX, centerY, minZoom, maxZoom) {
        const wx = this.worldX(centerX);
        const wy = this.worldY(centerY);

        const newZoom = Math.max(minZoom, Math.min(maxZoom, this.zoom * factor));

        this.x = centerX - wx * newZoom;
        this.y = centerY - wy * newZoom;
        this.zoom = newZoom;
    }

    // -------------------------------------------------------------------------
    // Viewport culling
    // -------------------------------------------------------------------------
    isBoxVisible(box, viewportWidth, viewportHeight, margin = 200) {
        if (!box || box.x == null || box.y == null || box.width == null || box.height == null) {
            return false;
        }

        const worldLeft = this.worldX(0) - margin;
        const worldRight = this.worldX(viewportWidth) + margin;
        const worldTop = this.worldY(0) - margin;
        const worldBottom = this.worldY(viewportHeight) + margin;

        const boxLeft = box.x - box.width / 2;
        const boxRight = box.x + box.width / 2;
        const boxTop = box.y - box.height / 2;
        const boxBottom = box.y + box.height / 2;

        return !(boxRight < worldLeft || boxLeft > worldRight || boxBottom < worldTop || boxTop > worldBottom);
    }

    isConnectionVisible(conn, viewportWidth, viewportHeight, margin = 200) {
        if (!conn || !conn.fromBox || !conn.toBox) {
            return false;
        }

        return this.isBoxVisible(conn.fromBox, viewportWidth, viewportHeight, margin) ||
               this.isBoxVisible(conn.toBox, viewportWidth, viewportHeight, margin);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------
    _safeZoom() {
        return this.zoom > 0 ? this.zoom : 1;
    }
}

const CameraUtils = new CameraManager();

if (typeof window !== 'undefined') {
    window.CameraUtils = CameraUtils;
}
