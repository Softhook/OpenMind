/**
 * Jest setup file to provide global dependencies for tests
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load ColorPalette and make it globally available
const colorPaletteCode = fs.readFileSync(path.join(__dirname, '../src/ColorPalette.js'), 'utf8');
const sandbox = { module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(colorPaletteCode, sandbox, { filename: 'ColorPalette.js' });
global.ColorPalette = sandbox.module.exports;
