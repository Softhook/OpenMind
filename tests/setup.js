/**
 * Jest setup file to provide global dependencies for tests
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load ColorPalette and make it globally available
const colorPaletteCode = fs.readFileSync(path.join(__dirname, '../src/ColorPalette.js'), 'utf8');
const colorSandbox = { module: { exports: {} } };
vm.createContext(colorSandbox);
vm.runInContext(colorPaletteCode, colorSandbox, { filename: 'ColorPalette.js' });
global.ColorPalette = colorSandbox.module.exports;

// Add p5.js mocks to global for Thrust classes
const p5Mocks = {
    push: jest.fn(), pop: jest.fn(), translate: jest.fn(), rotate: jest.fn(), 
    fill: jest.fn(), noStroke: jest.fn(), triangle: jest.fn(), circle: jest.fn(), 
    stroke: jest.fn(), strokeWeight: jest.fn(), noFill: jest.fn(), 
    textAlign: jest.fn(), textSize: jest.fn(), text: jest.fn(), 
    rectMode: jest.fn(), line: jest.fn(), strokeCap: jest.fn(), 
    rect: jest.fn(),
    ROUND: 'round', CENTER: 'center', BOTTOM: 'bottom', TOP: 'top'
};
Object.assign(global, p5Mocks);

// Ensure ThrustConstants and ThrustUtils are available
global.ThrustConstants = require('../src/ThrustConstants');
global.ThrustUtils = require('../src/ThrustUtils');

// Load remaining classes
global.ThrustShip = require('../src/ThrustShip');
global.ThrustBullet = require('../src/ThrustBullet');
global.ThrustExplosion = require('../src/ThrustExplosion');
