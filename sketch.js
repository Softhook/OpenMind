let mindMap;
let newBoxButton;
let saveButton;
let loadButton;
let fileInput;
let exportPNGButton;
let exportPDFButton;
let menuIsVisible = false;
let fullScreenButton;
let alignButton;
let menuRightEdge = 600; // Updated after layout to cover hover band width

function setup() {
  createCanvas(windowWidth, windowHeight);
  
  mindMap = new MindMap();
  
  // Create initial boxes as examples
  mindMap.addBox(new TextBox(300, 200, "Main Idea"));
  mindMap.addBox(new TextBox(500, 300, "Sub Topic 1"));
  mindMap.addBox(new TextBox(500, 100, "Sub Topic 2"));
  
  // Create UI buttons
  newBoxButton = createButton('New Box');
  newBoxButton.position(10, 10);
  newBoxButton.mousePressed(createNewBox);
  
  saveButton = createButton('Save');
  saveButton.position(100, 10);
  saveButton.mousePressed(() => mindMap.save());
  
  loadButton = createButton('Load');
  loadButton.position(160, 10);
  loadButton.mousePressed(triggerFileLoad);
  
  exportPNGButton = createButton('Export PNG');
  exportPNGButton.position(220, 10);
  exportPNGButton.mousePressed(exportPNG);
  
  exportPDFButton = createButton('Export PDF');
  exportPDFButton.position(330, 10);
  exportPDFButton.mousePressed(exportPDF);
  
  fullScreenButton = createButton('Full Screen');
  fullScreenButton.position(430, 10);
  fullScreenButton.mousePressed(toggleFullScreen);

  alignButton = createButton('Align');
  alignButton.position(520, 10);
  alignButton.mousePressed(() => {
    try { mindMap && mindMap.alignBoxes(12); } catch (e) { console.error('Align failed:', e); }
  });
  
  // Create hidden file input for loading
  fileInput = createFileInput(handleFileLoad);
  fileInput.position(-200, -200); // Hide it off-screen
  fileInput.style('display', 'none');

  // Lay out buttons neatly left-to-right in requested order
  layoutMenuButtons();

  // Hide menu buttons initially
  hideMenuButtons();
}

function draw() {
  background(240);
  updateMenuVisibility();
  
  if (mindMap) {
    try {
      mindMap.draw();
    } catch (e) {
      console.error('Error drawing mindmap:', e);
    }
    // Update mouse cursor based on hover context
    try {
      updateCursorForHover();
    } catch (e) {
      // Non-fatal
    }
  }
}

// Set mouse cursor based on what the user is hovering over
function updateCursorForHover() {
  if (!mindMap || !mindMap.boxes) { cursor('default'); return; }
  const validMouse = Number.isFinite(mouseX) && Number.isFinite(mouseY);
  if (!validMouse) { cursor('default'); return; }

  // Check top-most first
  for (let i = mindMap.boxes.length - 1; i >= 0; i--) {
    const box = mindMap.boxes[i];
    if (!box) continue;
    if (!box.isMouseOver()) continue;

    if (box.isMouseOverResizeHandle && box.isMouseOverResizeHandle()) {
      cursor('nwse-resize');
      return;
    }
    if (box.getConnectorUnderMouse && box.getConnectorUnderMouse()) {
      cursor('crosshair');
      return;
    }
    if (box.isMouseOnEdge && box.isMouseOnEdge()) {
      cursor('move');
      return;
    }
    // Inside center area
    cursor('text');
    return;
  }
  cursor('default');
}

// Show or hide the top-left menu based on cursor position
function updateMenuVisibility() {
  // Define a small top-left trigger zone and a band covering the buttons area
  const triggerX = 50;
  const triggerY = 50;
  // Buttons span from x=10 to menuRightEdge (computed after layout)
  const buttonsRightEdge = menuRightEdge;
  const buttonsBandHeight = 50; // top row height

  const validMouse = Number.isFinite(mouseX) && Number.isFinite(mouseY);
  const inTrigger = validMouse && mouseX >= 0 && mouseY >= 0 && mouseX <= triggerX && mouseY <= triggerY;
  const inButtonsBand = validMouse && mouseY >= 0 && mouseY <= buttonsBandHeight && mouseX >= 0 && mouseX <= buttonsRightEdge;
  const shouldShow = inTrigger || inButtonsBand;

  if (shouldShow !== menuIsVisible) {
    if (shouldShow) showMenuButtons(); else hideMenuButtons();
    menuIsVisible = shouldShow;
  }
}

function showMenuButtons() {
  newBoxButton.style('display', 'inline-block');
  saveButton.style('display', 'inline-block');
  loadButton.style('display', 'inline-block');
  exportPNGButton.style('display', 'inline-block');
  exportPDFButton.style('display', 'inline-block');
  fullScreenButton.style('display', 'inline-block');
  alignButton.style('display', 'inline-block');
}

function hideMenuButtons() {
  newBoxButton.style('display', 'none');
  saveButton.style('display', 'none');
  loadButton.style('display', 'none');
  exportPNGButton.style('display', 'none');
  exportPDFButton.style('display', 'none');
  fullScreenButton.style('display', 'none');
  alignButton.style('display', 'none');
}

// Arrange buttons: Load, Save, Export PNG, Export PDF, Full Screen, then New Box
function layoutMenuButtons() {
  const startX = 10;
  const y = 10;
  const gap = 10;

  // Ensure buttons are displayed to get proper widths
  loadButton.style('display', 'inline-block');
  saveButton.style('display', 'inline-block');
  exportPNGButton.style('display', 'inline-block');
  exportPDFButton.style('display', 'inline-block');
  fullScreenButton.style('display', 'inline-block');
  alignButton.style('display', 'inline-block');
  newBoxButton.style('display', 'inline-block');

  const w = (el) => (el && el.elt && el.elt.offsetWidth) ? el.elt.offsetWidth : 100;

  let x = startX;
  loadButton.position(x, y); x += w(loadButton) + gap;
  saveButton.position(x, y); x += w(saveButton) + gap;
  exportPNGButton.position(x, y); x += w(exportPNGButton) + gap;
  exportPDFButton.position(x, y); x += w(exportPDFButton) + gap;
  fullScreenButton.position(x, y); x += w(fullScreenButton) + gap;
  alignButton.position(x, y); x += w(alignButton) + gap;
  newBoxButton.position(x, y); x += w(newBoxButton) + gap;

  // Update the hover band to cover to the right of the last button
  menuRightEdge = x + 10;
}

function mousePressed() {
  // Prevent interaction with canvas when clicking on UI buttons
  if (mouseY > 40 && mindMap) {
    try {
      mindMap.handleMousePressed();
    } catch (e) {
      console.error('Error handling mouse press:', e);
    }
  }
}

function mouseReleased() {
  if (mindMap) {
    try {
      mindMap.handleMouseReleased();
    } catch (e) {
      console.error('Error handling mouse release:', e);
    }
  }
}

function mouseDragged() {
  if (mindMap) {
    try {
      mindMap.handleMouseDragged();
    } catch (e) {
      console.error('Error handling mouse drag:', e);
    }
  }
}

function keyPressed() {
  if (mindMap) {
    try {
      mindMap.handleKeyPressed(key, keyCode);
    } catch (e) {
      console.error('Error handling key press:', e);
    }
  }
  
  // Prevent default behavior for backspace
  if (keyCode === BACKSPACE) {
    return false;
  }
  // Prevent default behavior for forward delete
  if (keyCode === DELETE) {
    return false;
  }
  
  // Prevent default behavior for arrow keys when editing
  if (mindMap && mindMap.selectedBox && mindMap.selectedBox.isEditing) {
    if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW || 
        keyCode === UP_ARROW || keyCode === DOWN_ARROW) {
      return false;
    }
  }
  
  // Prevent default behavior for CMD+A/C/V/X when editing
  if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17))) {
    if (key === 'a' || key === 'A' || key === 'c' || key === 'C' || key === 'v' || key === 'V' || key === 'x' || key === 'X') {
      return false;
    }
  }

  // Global shortcut: N key to create a new box when not editing text
  if (mindMap && (!mindMap.selectedBox || !mindMap.selectedBox.isEditing)) {
    const hasModifier = keyIsDown(91) || keyIsDown(93) || keyIsDown(17) || keyIsDown(18); // CMD/CTRL/ALT
    if (!hasModifier && (key === 'n' || key === 'N')) {
      createNewBox();
      return false;
    }
  }
}

function mouseClicked(event) {
  // Handle right click (context menu)
  if (event && event.button === 2 && mindMap) {
    try {
      if (mindMap.handleRightClick()) {
        return false; // Prevent context menu
      }
    } catch (e) {
      console.error('Error handling right click:', e);
    }
  }
}

// Prevent default context menu
document.addEventListener('contextmenu', event => event.preventDefault());

function createNewBox() {
  // Ensure mindMap exists
  if (!mindMap) {
    console.error('MindMap not initialized');
    return;
  }
  // Prefer creating the box at the current cursor position inside the canvas content area
  const toolbarHeight = 40; // top UI bar height used elsewhere
  const pad = 60;           // minimal margin from edges
  let x = mouseX;
  let y = mouseY;

  const validMouse = Number.isFinite(x) && Number.isFinite(y);
  const insideCanvas = validMouse && x >= 0 && x <= width && y >= 0 && y <= height;
  const insideContent = insideCanvas && y > toolbarHeight;

  if (!insideContent) {
    // Fallback to center if cursor isn't in the drawable area
    x = width / 2;
    y = max(height / 2, toolbarHeight + pad);
  }

  // Constrain within safe margins
  x = constrain(x, pad, max(pad, width - pad));
  y = constrain(y, toolbarHeight + pad, max(toolbarHeight + pad, height - pad));

  mindMap.addBox(new TextBox(x, y, ""));
}

function triggerFileLoad() {
  // Trigger the hidden file input
  fileInput.elt.click();
}

function handleFileLoad(file) {
  if (!file) {
    console.error('No file provided');
    return;
  }
  
  if (file.type === 'application' || file.name.endsWith('.json')) {
    try {
      // Validate file.data exists
      if (!file.data) {
        console.error('File data is empty or invalid');
        return;
      }
      
      // If data is a string, try to parse it
      let data = file.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          console.error('Failed to parse JSON:', e);
          return;
        }
      }
      
      mindMap.load(data);
    } catch (e) {
      console.error('Failed to load file:', e);
      alert('Failed to load file. The file may be corrupted or invalid.');
    }
  } else {
    console.error('Please load a JSON file');
    alert('Please load a JSON file');
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function exportPNG() {
  try {
    // Validate canvas dimensions
    if (!width || !height || width <= 0 || height <= 0) {
      throw new Error('Canvas not properly initialized');
    }
    
    // Save the current canvas as PNG
    saveCanvas('mindmap', 'png');
  } catch (e) {
    console.error('Failed to export PNG:', e);
    alert('Failed to export PNG. Please try again.');
  }
}

function exportPDF() {
  try {
    // Validate dependencies
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF library not loaded');
    }
    
    // Validate mindMap and its data
    if (!mindMap || !mindMap.boxes || !mindMap.connections) {
      throw new Error('MindMap not properly initialized');
    }
    
    // Validate canvas dimensions
    if (!width || !height || width <= 0 || height <= 0) {
      throw new Error('Invalid canvas dimensions');
    }
    
    // Create PDF using jsPDF
    const { jsPDF } = window.jspdf;
    
    // Create PDF with landscape orientation
    const pdf = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: 'a4'
    });
    
    // Get PDF dimensions
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    // Calculate scaling to fit canvas to page with margins
    const margin = 20;
    const scale = Math.min(
      (pageWidth - 2 * margin) / width,
      (pageHeight - 2 * margin) / height
    );
    
    // Validate scale
    if (!isFinite(scale) || scale <= 0 || isNaN(scale)) {
      throw new Error('Invalid scaling calculation');
    }
    
    // Calculate offset to center the content
    const offsetX = (pageWidth - width * scale) / 2;
    const offsetY = (pageHeight - height * scale) / 2;
    
    // Helper function to transform coordinates
    function tx(x) { return offsetX + x * scale; }
    function ty(y) { return offsetY + y * scale; }
    function ts(s) { return s * scale; }
    
    // Draw connections first (behind boxes)
    pdf.setLineWidth(ts(2));
    for (let conn of mindMap.connections) {
      if (!conn || !conn.fromBox || !conn.toBox) continue;
      
      let start = conn.fromBox.getConnectionPoint(conn.toBox);
      let end = conn.toBox.getConnectionPoint(conn.fromBox);
      
      // Validate connection points
      if (!start || !end || isNaN(start.x) || isNaN(start.y) || isNaN(end.x) || isNaN(end.y)) {
        continue;
      }
      
      // Set color
      if (conn.selected) {
        pdf.setDrawColor(100, 150, 255);
        pdf.setFillColor(100, 150, 255);
        pdf.setLineWidth(ts(3));
      } else {
        pdf.setDrawColor(80, 80, 80);
        pdf.setFillColor(80, 80, 80);
        pdf.setLineWidth(ts(2));
      }
      
      // Draw line
      pdf.line(tx(start.x), ty(start.y), tx(end.x), ty(end.y));
      
      // Draw arrow head
      let angle = Math.atan2(end.y - start.y, end.x - start.x);
      
      // Validate angle
      if (isNaN(angle)) continue;
      
      let arrowSize = ts(10);
      
      let x1 = tx(end.x);
      let y1 = ty(end.y);
      let x2 = x1 - arrowSize * Math.cos(angle - Math.PI / 6);
      let y2 = y1 - arrowSize * Math.sin(angle - Math.PI / 6);
      let x3 = x1 - arrowSize * Math.cos(angle + Math.PI / 6);
      let y3 = y1 - arrowSize * Math.sin(angle + Math.PI / 6);
      
      pdf.triangle(x1, y1, x2, y2, x3, y3, 'F');
    }
    
    // Draw boxes
    pdf.setLineWidth(ts(1));
    for (let box of mindMap.boxes) {
      if (!box) continue;
      
      // Validate box properties
      if (box.x == null || box.y == null || box.width == null || box.height == null ||
          isNaN(box.x) || isNaN(box.y) || isNaN(box.width) || isNaN(box.height)) {
        continue;
      }
      
      let boxX = tx(box.x - box.width / 2);
      let boxY = ty(box.y - box.height / 2);
      let boxW = ts(box.width);
      let boxH = ts(box.height);
      
      // Set colors based on state
      if (box.isEditing) {
        pdf.setFillColor(255, 255, 200);
        pdf.setDrawColor(100, 100, 255);
        pdf.setLineWidth(ts(2));
      } else {
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(100, 100, 100);
        pdf.setLineWidth(ts(1));
      }
      
      // Draw rounded rectangle
      pdf.roundedRect(boxX, boxY, boxW, boxH, ts(box.cornerRadius), ts(box.cornerRadius), 'FD');
      
      // Draw text
      pdf.setFontSize(ts(box.fontSize));
      pdf.setTextColor(0, 0, 0);
      
      let wrappedLines = getWrappedLines(box);
      let lineHeight = ts(box.fontSize * 1.5);
      // Top-anchored text in PDF: start at box top + padding
      let startY = ty(box.y - box.height / 2) + ts(box.padding) + lineHeight * 0.7;
      let textX = tx(box.x - box.width / 2 + box.padding);
      
      for (let i = 0; i < wrappedLines.length; i++) {
        if (wrappedLines[i] != null) {
          pdf.text(String(wrappedLines[i]), textX, startY + i * lineHeight);
        }
      }
    }
    
    // Save the PDF
    pdf.save('mindmap.pdf');
  } catch (e) {
    console.error('Failed to export PDF:', e);
    alert('Failed to export PDF: ' + e.message);
  }
}

function toggleFullScreen() {
  try {
    const fs = fullscreen();
    fullscreen(!fs);
  } catch (e) {
    console.error('Failed to toggle fullscreen:', e);
  }
}

// Helper function to get wrapped lines for a text box (duplicates TextBox logic)
function getWrappedLines(box) {
  // Validate box and its properties
  if (!box || !box.text || box.width == null || box.padding == null || box.fontSize == null) {
    return [''];
  }
  
  let lines = String(box.text).split('\n');
  let wrappedLines = [];
  // Guard width in case it's not initialized yet
  let baseWidth = (box.width != null && isFinite(box.width)) ? box.width : (box.minWidth || 80);
  let maxTextWidth = max(10, baseWidth - box.padding * 2);
  
  textSize(box.fontSize);
  
  for (let line of lines) {
    if (!line || line === '') {
      wrappedLines.push('');
      continue;
    }
    
    if (textWidth(line) <= maxTextWidth) {
      wrappedLines.push(line);
    } else {
      let words = line.split(' ');
      let currentLine = '';
      
      for (let i = 0; i < words.length; i++) {
        let testLine = currentLine + (currentLine ? ' ' : '') + words[i];
        
        if (textWidth(testLine) <= maxTextWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            wrappedLines.push(currentLine);
            currentLine = words[i];
          } else {
            let word = words[i];
            let charLine = '';
            for (let char of word) {
              if (textWidth(charLine + char) <= maxTextWidth) {
                charLine += char;
              } else {
                if (charLine) wrappedLines.push(charLine);
                charLine = char;
              }
            }
            currentLine = charLine;
          }
        }
      }
      
      if (currentLine) {
        wrappedLines.push(currentLine);
      }
    }
  }
  
  return wrappedLines.length > 0 ? wrappedLines : [''];
}