
reflow text boxes based on connections Use an algorithm to 
Text Import

Split input into paragraphs (define what counts as a paragraph: blank-line separated, or single-line breaks).
Create one text-box object per paragraph, each with a unique id and links prevId/nextId (doubly-linked list).
Render boxes in the UI in order; keep logical links separate from visual layout so boxes can be laid out in flow, column, or grid.
Support editing operations that maintain links: split a box into two, merge adjacent boxes, move boxes, and follow links for caret navigation.
Persist as an ordered list or linked structure; support undo/redo and batch ops for large imports.


Whisper Notes
A mode where typing a node produces a tiny sound or whisper.
Examples:
Ideas rustle
Connections click
Clustering thrums like magnets snapping
Very quiet, satisfying foley-like micro-sounds (think Monument Valley).
You could call it ASMR Mode.

 📽️ Time-Lapse Mode
Replay the creation of the map as a sped-up history.
Nodes appear, move, shrink, cluster — looks like watching a thought organism grow.


 Option 1: The Hidden “Thrust Mode”
A secret keyboard shortcut (e.g. T) activates:
a tiny spaceship
gravity pulling toward node clusters
you manoeuvre with left/right/thrust
you collect or “dock” with nodes
you can shoot edges to break links
This is like a developer Easter egg but could become legendary.

Confetti when a cluster closes
When you link enough nodes to form a closed loop, tiny celebratory confetti falls.
Silly but memorable.