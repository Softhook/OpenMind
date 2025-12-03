
reflow text boxes based on connections Use an algorithm to make a logical structured layout based on the connections 

Selecting a few boxes and then using 'a' line should try and horizontally or vertically align the edges of all the boxes 

pressing s key make all the selected boxes an average same width


detect hyperlinks or local file links - colour them blue and clicking on them opens the link in another window

Text Import

Split input into paragraphs (define what counts as a paragraph: blank-line separated, or single-line breaks).
Create one text-box object per paragraph, each with a unique id and links prevId/nextId (doubly-linked list).
Render boxes in the UI in order; keep logical links separate from visual layout so boxes can be laid out in flow, column, or grid.
Support editing operations that maintain links: split a box into two, merge adjacent boxes, move boxes, and follow links for caret navigation.
Persist as an ordered list or linked structure; support undo/redo and batch ops for large imports.
