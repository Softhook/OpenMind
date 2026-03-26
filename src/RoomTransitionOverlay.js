/**
 * RoomTransitionOverlay - Modern DOM-based overlay for room joining and synchronization
 * Extends BaseOverlay to replace legacy p5.js drawing with CSS-styled components.
 */

class RoomTransitionOverlayUI extends BaseOverlay {
    constructor() {
        super('room-transition');
        this.currentState = null;
        this.data = {};
        this.isInitialized = false;
    }

    /**
     * Specialized show method that takes state and data
     */
    update(state, data = {}) {
        if (!this.isInitialized) {
            this.setup();
            this.isInitialized = true;
        }

        if (state === this.currentState && JSON.stringify(data) === JSON.stringify(this.data)) {
            return;
        }

        this.currentState = state;
        this.data = data;

        if (state) {
            this.show();
        } else {
            this.hide();
        }
    }

    onPopulateHeader(header) {
        if (!this.currentState) return;

        let titleText = 'Collaboration';
        if (this.currentState === 'confirmation') titleText = 'Join Collaboration Room';
        else if (this.currentState === 'incompatible') titleText = 'Update Required';
        else if (this.currentState === 'loading') titleText = 'Loading';
        else titleText = 'Connecting';

        const title = createElement('h2', titleText);
        title.parent(header);

        // Add version info like the old p5 overlay did
        const versionStr = (typeof window !== 'undefined' && window.APP_VERSION) ? window.APP_VERSION.toString() : '1.0.0';
        const appName = (typeof window !== 'undefined' && window.APP_NAME) ? window.APP_NAME : 'OpenMind';
        const subtitle = createElement('p', `${appName} v${versionStr}`);
        subtitle.parent(header);
        subtitle.style('font-size', '10px');
        subtitle.style('opacity', '0.5');
        subtitle.style('margin', '4px 0 0 0');
    }

    onPopulateContent(scrollArea) {
        if (!this.currentState) return;

        const container = createDiv();
        container.parent(scrollArea);
        container.addClass('om-overlay-center');

        if (this.currentState === 'confirmation') {
            this._populateConfirmation(container);
        } else if (this.currentState === 'incompatible') {
            this._populateIncompatible(container);
        } else {
            this._populateLoadingSync(container);
        }
    }

    _populateConfirmation(parent) {
        const icon = createSpan('⚠️');
        icon.parent(parent);
        icon.addClass('om-overlay-icon om-text-warning');

        const mainMsg = createDiv('Joining Collaboration Room');
        mainMsg.parent(parent);
        mainMsg.addClass('om-overlay-main-msg');

        const boxCount = this.data.boxCount || 0;
        const boxText = boxCount === 1 ? '1 box' : `${boxCount} boxes`;
        const subMsg = createDiv(`You currently have ${boxText} on screen.<br>Choose how to join this online room.`);
        subMsg.parent(parent);
        subMsg.addClass('om-overlay-sub-msg');

        // Note: Buttons are usually in the footer for BaseOverlay, 
        // but for this specific "choice" overlay, we'll put them in a group in content
        const btnGroup = createDiv();
        btnGroup.parent(parent);
        btnGroup.addClass('om-btn-group');
        btnGroup.style('margin-top', '30px');

        const syncBtn = createButton('Bring to Room');
        syncBtn.parent(btnGroup);
        syncBtn.addClass('om-btn om-btn-success');
        syncBtn.mousePressed(() => this.data.onSync && this.data.onSync());

        const keepBtn = createButton('Leave Behind and Join');
        keepBtn.parent(btnGroup);
        keepBtn.addClass('om-btn om-btn-danger'); // Red because it clears local work
        keepBtn.mousePressed(() => this.data.onKeep && this.data.onKeep());
    }

    _populateIncompatible(parent) {
        const icon = createSpan('🚫');
        icon.parent(parent);
        icon.addClass('om-overlay-icon om-text-danger');

        const mainMsg = createDiv('Incompatible Version');
        mainMsg.parent(parent);
        mainMsg.addClass('om-overlay-main-msg');

        let msg = 'Please refresh to get the latest version.';
        if (this.data.localVersion && this.data.peerVersion) {
            msg = `Your version (v${this.data.localVersion}) is incompatible with peers (v${this.data.peerVersion}).`;
        }
        const subMsg = createDiv(msg);
        subMsg.parent(parent);
        subMsg.addClass('om-overlay-sub-msg');
    }

    _populateLoadingSync(parent) {
        const spinner = createDiv();
        spinner.parent(parent);
        spinner.addClass('om-spinner');

        let mainText = 'Loading...';
        let subText = 'Please wait while we prepare your map.';

        if (this.currentState === 'connecting') {
            mainText = 'Connecting to server';
            subText = 'Establishing WebSocket connection...';
        } else if (this.currentState === 'server_starting') {
            mainText = 'Server is starting up';
            subText = 'This may take up to a minute on first load...';
        } else if (this.currentState === 'syncing') {
            mainText = 'Synchronizing';
            subText = 'Receiving mind map content from peers...';
        }

        const mainMsg = createDiv(mainText);
        mainMsg.parent(parent);
        mainMsg.addClass('om-overlay-main-msg');

        const subMsg = createDiv(subText);
        subMsg.parent(parent);
        subMsg.addClass('om-overlay-sub-msg');
    }

    onPopulateFooter(footer) {
        if (this.currentState === 'incompatible') {
            const refreshBtn = createButton('Refresh Player');
            refreshBtn.parent(footer);
            refreshBtn.addClass('om-btn om-btn-primary');
            refreshBtn.mousePressed(() => {
                if (typeof window !== 'undefined') window.location.reload();
            });
        }

        if (this.currentState === 'confirmation' || this.currentState === 'incompatible') {
            const cancelBtn = createButton(this.currentState === 'incompatible' ? 'Close Overlay' : 'Cancel');
            cancelBtn.parent(footer);
            cancelBtn.addClass('om-btn om-btn-ghost');
            cancelBtn.mousePressed(() => {
                if (this.data.onCancel) this.data.onCancel();
                this.hide();
            });
        } else if (this.currentState && this.currentState !== 'loading') {
            // Show cancel button for active connection attempts
            const cancelBtn = createButton('Cancel / Go Back');
            cancelBtn.parent(footer);
            cancelBtn.addClass('om-btn om-btn-ghost');
            cancelBtn.mousePressed(() => {
                if (this.data.onCancel) this.data.onCancel();
                this.hide();
            });
        }
    }
}

const roomTransitionOverlayUI = new RoomTransitionOverlayUI();

// Global exposure
if (typeof window !== 'undefined') {
    window.RoomTransitionOverlay = {
        update: (state, data) => roomTransitionOverlayUI.update(state, data),
        hide: () => roomTransitionOverlayUI.update(null)
    };
}
