let mindMap;
let newBoxButton;
let saveButton;
let loadButton;
let fileInput;
let exportPNGButton;
let exportPDFButton;

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
  
  // Create hidden file input for loading
  fileInput = createFileInput(handleFileLoad);
  fileInput.position(-200, -200); // Hide it off-screen
  fileInput.style('display', 'none');
}

function draw() {
  background(240);
  mindMap.draw();
}

function mousePressed() {
  // Prevent interaction with canvas when clicking on UI buttons
  if (mouseY > 40) {
    mindMap.handleMousePressed();
  }
}

function mouseReleased() {
  mindMap.handleMouseReleased();
}

function mouseDragged() {
  mindMap.handleMouseDragged();
}

function keyPressed() {
  mindMap.handleKeyPressed(key, keyCode);
  
  // Prevent default behavior for backspace
  if (keyCode === BACKSPACE) {
    return false;
  }
  
  // Prevent default behavior for arrow keys when editing
  if (mindMap.selectedBox && mindMap.selectedBox.isEditing) {
    if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW || 
        keyCode === UP_ARROW || keyCode === DOWN_ARROW) {
      return false;
    }
  }
  
  // Prevent default behavior for CMD+A, CMD+C, CMD+V when editing
  if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17))) {
    if (key === 'a' || key === 'A' || key === 'c' || key === 'C' || key === 'v' || key === 'V') {
      return false;
    }
  }
}

function mouseClicked(event) {
  // Handle right click (context menu)
  if (event.button === 2) {
    if (mindMap.handleRightClick()) {
      return false; // Prevent context menu
    }
  }
}

// Prevent default context menu
document.addEventListener('contextmenu', event => event.preventDefault());

function createNewBox() {
  // Create a new box at a semi-random position
  let x = random(200, width - 200);
  let y = random(150, height - 150);
  mindMap.addBox(new TextBox(x, y, "New Node"));
}

function triggerFileLoad() {
  // Trigger the hidden file input
  fileInput.elt.click();
}

function handleFileLoad(file) {
  if (file.type === 'application' || file.name.endsWith('.json')) {
    // file.data is already a parsed object from p5.js
    mindMap.load(file.data);
  } else {
    console.error('Please load a JSON file');
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function exportPNG() {
  // Save the current canvas as PNG
  saveCanvas('mindmap', 'png');
}

function exportPDF() {
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
    let start = conn.fromBox.getConnectionPoint(conn.toBox);
    let end = conn.toBox.getConnectionPoint(conn.fromBox);
    
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
    let totalHeight = wrappedLines.length * lineHeight;
    let startY = ty(box.y) - totalHeight / 2 + lineHeight * 0.7;
    let textX = tx(box.x - box.width / 2 + box.padding);
    
    for (let i = 0; i < wrappedLines.length; i++) {
      pdf.text(wrappedLines[i], textX, startY + i * lineHeight);
    }
  }
  
  // Save the PDF
  pdf.save('mindmap.pdf');
}

// Helper function to get wrapped lines for a text box (duplicates TextBox logic)
function getWrappedLines(box) {
  let lines = box.text.split('\n');
  let wrappedLines = [];
  let maxTextWidth = box.width - box.padding * 2;
  
  textSize(box.fontSize);
  
  for (let line of lines) {
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