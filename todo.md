the arrow keys move the focus between the orange and red boxes

keyboard shortcuts
f for toggle fullscreen
CMD + S for saving and CMD + L for loading

When copying text into the application you need to sanitize it to remove strange characters or hidden characters. 

It'd be nice if the boxes shrank automatically to the minimum size needed horizontally when there is  only a single line of text

add a dashed line connection

reflow text boxes based on connections

Center a loaded file after load 

Selecting a few boxes and then using 'a' line should try and horizontally or vertically align the edges of all the boxes 

pressing s key make all the selected boxes the same width of possible

While typing or coppying text in once is get over 10 words then do the line break


detect hyperlinks or local file links - colour them blue and clicking on them opens the link in another window



Try and get the bold working :

This is a p5.js mind map software. I would like to add Bold selecting text using CMD + B. The thing that is challenging is making it work when the bold text stretches across multiple lines. Try and use invisible ** markdown for the Bold formating. Think hard about this

Key considerations:
1. Store bold markers (**) invisibly in the text
2. Parse and render bold segments during drawing
3. Handle wrapping where bold text spans multiple lines
4. Ensure cursor position accounts for invisible markers
5. Make selection and editing work naturally
Here's my approach:
* Keep **bold** markers in the actual text string
* During rendering, parse and hide markers while applying bold font
* Track marker positions to adjust cursor/selection positions
* Handle line wrapping by continuing bold state across wrapped lines


Text Import

Split input into paragraphs (define what counts as a paragraph: blank-line separated, or single-line breaks).
Create one text-box object per paragraph, each with a unique id and links prevId/nextId (doubly-linked list).
Render boxes in the UI in order; keep logical links separate from visual layout so boxes can be laid out in flow, column, or grid.
Support editing operations that maintain links: split a box into two, merge adjacent boxes, move boxes, and follow links for caret navigation.
Persist as an ordered list or linked structure; support undo/redo and batch ops for large imports.
