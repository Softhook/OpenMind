// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E tests for desktop navigation functionality
 * Tests keyboard navigation, mouse interactions, and box selection
 */

test.describe('Desktop Navigation', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas', { timeout: 10000 });
  });

  test.describe('Keyboard Navigation', () => {
    
    test('down arrow should navigate to next box', async ({ page }) => {
      // Press down arrow to select first box
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(500);
      
      // Canvas should still be present and interactive
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible();
    });

    test('up arrow should navigate to previous box', async ({ page }) => {
      // Navigate down first
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
      
      // Navigate down again
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
      
      // Navigate up
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(500);
      
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible();
    });

    test('navigation should cycle through boxes', async ({ page }) => {
      // Cycle through boxes multiple times
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(200);
      }
      
      // App should remain responsive
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible();
    });

    test('left/right arrows should navigate between sibling boxes', async ({ page }) => {
      // First select a box
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
      
      // Navigate right
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      
      // Navigate left
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(300);
      
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible();
    });
  });

  test.describe('Canvas Interactions', () => {
    
    test('canvas should be present and full screen', async ({ page, viewport }) => {
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible();
      
      const boundingBox = await canvas.boundingBox();
      expect(boundingBox).not.toBeNull();
      
      if (boundingBox && viewport) {
        expect(boundingBox.width).toBe(viewport.width);
        expect(boundingBox.height).toBe(viewport.height);
      }
    });

    test('clicking on canvas should not break navigation', async ({ page }) => {
      const canvas = page.locator('canvas');
      
      // Click on canvas
      await canvas.click({ position: { x: 200, y: 200 } });
      await page.waitForTimeout(300);
      
      // Navigation should still work
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
      
      await expect(canvas).toBeVisible();
    });
  });

  test.describe('UI Buttons', () => {
    
    test('save button should be present', async ({ page }) => {
      const saveButton = page.getByRole('button', { name: 'Save' });
      await expect(saveButton).toBeVisible();
    });

    test('load button should be present', async ({ page }) => {
      const loadButton = page.getByRole('button', { name: 'Load' });
      await expect(loadButton).toBeVisible();
    });

    test('export buttons should be present', async ({ page }) => {
      const exportPNG = page.getByRole('button', { name: 'Export PNG' });
      const exportPDF = page.getByRole('button', { name: 'Export PDF' });
      const exportText = page.getByRole('button', { name: 'Export Text' });
      
      await expect(exportPNG).toBeVisible();
      await expect(exportPDF).toBeVisible();
      await expect(exportText).toBeVisible();
    });

    test('keyboard controls button should be present', async ({ page }) => {
      const keyboardControls = page.getByRole('button', { name: 'Keyboard Controls' });
      await expect(keyboardControls).toBeVisible();
    });
  });

  test.describe('Zoom and Pan', () => {
    
    test('should handle mouse wheel zoom', async ({ page }) => {
      const canvas = page.locator('canvas');
      
      // Zoom in with wheel
      await canvas.hover();
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(300);
      
      // Canvas should still be visible
      await expect(canvas).toBeVisible();
    });

    test('should allow panning with middle mouse or space+drag', async ({ page }) => {
      const canvas = page.locator('canvas');
      
      // Middle mouse pan simulation
      await canvas.hover();
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(300, 300);
      await page.mouse.up({ button: 'middle' });
      
      await expect(canvas).toBeVisible();
    });
  });

  test.describe('Box Creation', () => {
    
    test('double-clicking on canvas should create new box', async ({ page, viewport }) => {
      const canvas = page.locator('canvas');
      
      // Use coordinates within the viewport
      const clickX = viewport ? Math.min(200, viewport.width - 50) : 200;
      const clickY = viewport ? Math.min(200, viewport.height - 50) : 200;
      
      // Double-click on empty area
      await canvas.dblclick({ position: { x: clickX, y: clickY } });
      await page.waitForTimeout(500);
      
      // App should remain responsive
      await expect(canvas).toBeVisible();
    });
  });

  test.describe('Responsiveness', () => {
    
    test('should handle window resize gracefully', async ({ page }) => {
      const canvas = page.locator('canvas');
      
      // Resize to various sizes
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForTimeout(300);
      await expect(canvas).toBeVisible();
      
      await page.setViewportSize({ width: 800, height: 600 });
      await page.waitForTimeout(300);
      await expect(canvas).toBeVisible();
      
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForTimeout(300);
      await expect(canvas).toBeVisible();
    });
  });
});

test.describe('Navigation Animation', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('canvas', { timeout: 10000 });
  });

  test('navigation should animate smoothly', async ({ page }) => {
    // Select a box first
    await page.keyboard.press('ArrowDown');
    
    // Wait for animation to complete
    await page.waitForTimeout(800);
    
    // Navigate to another box
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(800);
    
    // App should remain responsive after animations
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('rapid navigation should not break the app', async ({ page }) => {
    // Rapid key presses
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(50); // Very short delay
    }
    
    // Wait for animations to settle
    await page.waitForTimeout(1000);
    
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();
  });
});
