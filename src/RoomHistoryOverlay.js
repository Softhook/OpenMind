/**
 * RoomHistoryOverlay - UI for displaying and managing recent rooms
 * Extends BaseOverlay for consistent layout and scrollbar styling.
 */

class RoomHistoryOverlayUI extends BaseOverlay {
    constructor() {
        super('room-history');
    }

    onPopulateHeader(header) {
        const title = createElement('h2', 'Recent Rooms');
        title.parent(header);
    }

    onPopulateContent(scrollArea) {
        const history = RoomHistoryManager.getHistory();

        if (history.length === 0) {
            const emptyMsg = createElement('p', 'No recently visited rooms.');
            emptyMsg.parent(scrollArea);
            emptyMsg.addClass('om-hint-text');
        } else {
            const listContainer = createDiv();
            listContainer.parent(scrollArea);
            listContainer.addClass('om-overlay-list');

            history.forEach(item => {
                const row = createDiv();
                row.parent(listContainer);
                row.addClass('om-overlay-row');

                const infoContainer = createDiv();
                infoContainer.parent(row);
                infoContainer.addClass('om-overlay-row-info');

                const nameLabel = createSpan(item.roomName);
                nameLabel.parent(infoContainer);
                nameLabel.addClass('om-overlay-row-name');

                const lastVisitedDate = new Date(item.lastVisited);
                const dateLabel = createSpan(lastVisitedDate.toLocaleDateString());
                dateLabel.parent(infoContainer);
                dateLabel.addClass('om-overlay-row-date');

                const actions = createDiv();
                actions.parent(row);
                actions.addClass('om-overlay-row-actions');

                const joinBtn = createButton('Join');
                joinBtn.parent(actions);
                joinBtn.addClass('om-btn om-btn-primary');

                joinBtn.mousePressed(() => {
                    this.hide();
                    window.location.hash = `room=${item.roomName}${item.serverUrl ? '&server=' + encodeURIComponent(item.serverUrl) : ''}`;
                });

                const removeBtn = createButton('×');
                removeBtn.parent(actions);
                removeBtn.addClass('om-btn om-btn-ghost');

                removeBtn.mousePressed(() => {
                    RoomHistoryManager.removeRoom(item.roomName);
                    this.populate();
                });
            });
        }
    }
}

const roomHistoryOverlayUI = new RoomHistoryOverlayUI();

// Global exposure for UIManager
if (typeof window !== 'undefined') {
    window.RoomHistoryOverlay = {
        setup: (opt) => roomHistoryOverlayUI.setup(opt),
        show: (btn) => roomHistoryOverlayUI.show(btn),
        hide: (btn) => roomHistoryOverlayUI.hide(btn),
        toggle: (btn) => roomHistoryOverlayUI.toggle(btn),
        isVisible: () => roomHistoryOverlayUI.isVisible
    };
}
