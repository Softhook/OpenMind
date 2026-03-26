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
        title.style('margin', '0');
        title.style('font-size', '20px');
        title.style('font-weight', '600');
    }

    onPopulateContent(scrollArea) {
        const history = RoomHistoryManager.getHistory();

        if (history.length === 0) {
            const emptyMsg = createElement('p', 'No recently visited rooms.');
            emptyMsg.parent(scrollArea);
            emptyMsg.style('color', '#666');
            emptyMsg.style('font-size', '14px');
        } else {
            const listContainer = createDiv();
            listContainer.parent(scrollArea);
            listContainer.style('display', 'flex');
            listContainer.style('flex-direction', 'column');
            listContainer.style('gap', '10px');

            history.forEach(item => {
                const row = createDiv();
                row.parent(listContainer);
                row.style('display', 'flex');
                row.style('align-items', 'center');
                row.style('justify-content', 'space-between');
                row.style('padding', '14px 18px');
                row.style('background', '#ffffff');
                row.style('border', '1px solid #edf2f7');
                row.style('border-radius', '10px');
                row.style('transition', 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)');
                row.style('cursor', 'default');

                // Hover effects
                row.elt.onmouseenter = () => {
                    row.style('background', '#f7fafc');
                    row.style('border-color', '#3182ce');
                    row.style('transform', 'translateY(-1px)');
                    row.style('box-shadow', '0 4px 12px rgba(0,0,0,0.05)');
                };
                row.elt.onmouseleave = () => {
                    row.style('background', '#ffffff');
                    row.style('border-color', '#edf2f7');
                    row.style('transform', 'translateY(0)');
                    row.style('box-shadow', 'none');
                };

                const infoContainer = createDiv();
                infoContainer.parent(row);
                infoContainer.style('display', 'flex');
                infoContainer.style('align-items', 'baseline');
                infoContainer.style('flex', '1');
                infoContainer.style('margin-right', '16px');
                infoContainer.style('overflow', 'hidden');
                infoContainer.style('gap', '12px');

                const nameLabel = createSpan(item.roomName);
                nameLabel.parent(infoContainer);
                nameLabel.style('font-weight', '600');
                nameLabel.style('font-size', '15px');
                nameLabel.style('color', '#2d3748');
                nameLabel.style('white-space', 'nowrap');
                nameLabel.style('overflow', 'hidden');
                nameLabel.style('text-overflow', 'ellipsis');
                nameLabel.style('flex', '1');

                const lastVisitedDate = new Date(item.lastVisited);
                const dateLabel = createSpan(lastVisitedDate.toLocaleDateString());
                dateLabel.parent(infoContainer);
                dateLabel.style('font-size', '12px');
                dateLabel.style('color', '#a0aec0');
                dateLabel.style('white-space', 'nowrap');

                const actions = createDiv();
                actions.parent(row);
                actions.style('display', 'flex');
                actions.style('gap', '10px');

                const joinBtn = createButton('Join');
                joinBtn.parent(actions);
                joinBtn.style('padding', '8px 16px');
                joinBtn.style('font-size', '13px');
                joinBtn.style('font-weight', '600');
                joinBtn.style('cursor', 'pointer');
                joinBtn.style('background', '#3182ce');
                joinBtn.style('color', 'white');
                joinBtn.style('border', 'none');
                joinBtn.style('border-radius', '6px');
                joinBtn.style('transition', 'background 0.2s');
                joinBtn.elt.onmouseenter = () => joinBtn.style('background', '#2b6cb0');
                joinBtn.elt.onmouseleave = () => joinBtn.style('background', '#3182ce');

                joinBtn.mousePressed(() => {
                    this.hide();
                    window.location.hash = `room=${item.roomName}${item.serverUrl ? '&server=' + encodeURIComponent(item.serverUrl) : ''}`;
                });

                const removeBtn = createButton('×');
                removeBtn.parent(actions);
                removeBtn.style('padding', '4px 8px');
                removeBtn.style('font-size', '20px');
                removeBtn.style('cursor', 'pointer');
                removeBtn.style('background', 'none');
                removeBtn.style('border', 'none');
                removeBtn.style('color', '#cbd5e0');
                removeBtn.style('line-height', '1');
                removeBtn.style('transition', 'color 0.2s');
                removeBtn.elt.onmouseenter = () => removeBtn.style('color', '#e53e3e');
                removeBtn.elt.onmouseleave = () => removeBtn.style('color', '#cbd5e0');

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
