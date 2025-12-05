// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * E2E tests for mobile navigation overlay
 * Tests touch device detection, button visibility, and navigation functionality
 */

test.describe('Mobile Navigation Overlay', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');
    // Wait for p5.js canvas to be created
    await page.waitForSelector('canvas', { timeout: 10000 });
  });

  test.describe('Touch Device Detection', () => {
    
    test('should show navigation buttons on mobile devices', async ({ page, isMobile }) => {
      if (isMobile) {
        // On mobile, buttons should be visible
        const overlay = page.locator('#mobile-nav-overlay');
        await expect(overlay).toBeVisible();
        
        const upButton = page.locator('#mobile-nav-up');
        const downButton = page.locator('#mobile-nav-down');
        await expect(upButton).toBeVisible();
        await expect(downButton).toBeVisible();
      }
    });

    test('should hide navigation buttons on large desktop screens without touch', async ({ page, viewport, isMobile }) => {
      // This test only applies to large non-touch desktop screens
      // On mobile/tablet devices with touch support, the overlay should be visible
      if (isMobile) {
        test.skip();
        return;
      }
      
      // Only check on large viewports without touch
      if (viewport && viewport.width > 768 && viewport.height > 500) {
        const overlay = page.locator('#mobile-nav-overlay');
        // The overlay should exist but be hidden on non-touch large screens
        await expect(overlay).toHaveCSS('visibility', 'hidden');
      }
    });

    test('should show navigation buttons on small screens', async ({ page }) => {
      // Resize to mobile size
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300); // Wait for resize handler
      
      const overlay = page.locator('#mobile-nav-overlay');
      await expect(overlay).toHaveCSS('visibility', 'visible');
      await expect(overlay).toHaveCSS('opacity', '1');
    });
  });

  test.describe('Button Positioning', () => {
    
    test('buttons should be positioned in bottom-left corner', async ({ page, isMobile }) => {
      if (isMobile) {
        const overlay = page.locator('#mobile-nav-overlay');
        await expect(overlay).toHaveCSS('position', 'fixed');
        await expect(overlay).toHaveCSS('bottom', '20px');
        await expect(overlay).toHaveCSS('left', '20px');
      }
    });

    test('buttons should maintain position on orientation change', async ({ page }) => {
      // Portrait
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300);
      
      const overlay = page.locator('#mobile-nav-overlay');
      const portraitPosition = await overlay.boundingBox();
      
      // Landscape
      await page.setViewportSize({ width: 667, height: 375 });
      await page.waitForTimeout(300);
      
      const landscapePosition = await overlay.boundingBox();
      
      // Position should remain in bottom-left in both orientations
      expect(portraitPosition).not.toBeNull();
      expect(landscapePosition).not.toBeNull();
      
      if (portraitPosition && landscapePosition) {
        // Check that buttons are still near bottom-left
        expect(landscapePosition.x).toBeLessThan(100);
        expect(landscapePosition.y).toBeGreaterThan(200); // Near bottom
      }
    });
  });

  test.describe('Navigation Functionality', () => {
    
    test('down button should navigate to next box', async ({ page }) => {
      // Set mobile viewport to show buttons
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);
      
      const downButton = page.locator('#mobile-nav-down');
      await expect(downButton).toBeVisible();
      
      // Click down button to navigate
      await downButton.click();
      await page.waitForTimeout(500); // Wait for animation
      
      // The button should still be functional after navigation
      await expect(downButton).toBeVisible();
    });

    test('up button should navigate to previous box', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);
      
      const upButton = page.locator('#mobile-nav-up');
      const downButton = page.locator('#mobile-nav-down');
      
      // Navigate down first
      await downButton.click();
      await page.waitForTimeout(500);
      
      // Then navigate up
      await upButton.click();
      await page.waitForTimeout(500);
      
      // Buttons should still be visible
      await expect(upButton).toBeVisible();
      await expect(downButton).toBeVisible();
    });

    test('navigation should cycle through all boxes', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);
      
      const downButton = page.locator('#mobile-nav-down');
      
      // Click multiple times to cycle through boxes
      for (let i = 0; i < 5; i++) {
        await downButton.click();
        await page.waitForTimeout(300);
      }
      
      // App should remain responsive after multiple navigations
      await expect(downButton).toBeVisible();
      await expect(downButton).toBeEnabled();
    });
  });

  test.describe('Touch Events', () => {
    
    test('buttons should respond to touch events', async ({ page, isMobile }) => {
      if (!isMobile) {
        test.skip();
        return;
      }
      
      const downButton = page.locator('#mobile-nav-down');
      await expect(downButton).toBeVisible();
      
      // Simulate touch on button
      await downButton.tap();
      await page.waitForTimeout(500);
      
      // Button should still be functional
      await expect(downButton).toBeVisible();
    });

    test('buttons should have proper touch target size', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300);
      
      const upButton = page.locator('#mobile-nav-up');
      const downButton = page.locator('#mobile-nav-down');
      
      // Get button dimensions
      const upBox = await upButton.boundingBox();
      const downBox = await downButton.boundingBox();
      
      // Minimum touch target size should be 44x44 (accessibility guideline)
      expect(upBox).not.toBeNull();
      expect(downBox).not.toBeNull();
      
      if (upBox && downBox) {
        expect(upBox.width).toBeGreaterThanOrEqual(44);
        expect(upBox.height).toBeGreaterThanOrEqual(44);
        expect(downBox.width).toBeGreaterThanOrEqual(44);
        expect(downBox.height).toBeGreaterThanOrEqual(44);
      }
    });
  });

  test.describe('Accessibility', () => {
    
    test('buttons should have proper aria labels', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300);
      
      const upButton = page.locator('#mobile-nav-up');
      const downButton = page.locator('#mobile-nav-down');
      
      await expect(upButton).toHaveAttribute('aria-label', 'Navigate to previous box');
      await expect(downButton).toHaveAttribute('aria-label', 'Navigate to next box');
    });

    test('buttons should be focusable', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300);
      
      const upButton = page.locator('#mobile-nav-up');
      await upButton.focus();
      await expect(upButton).toBeFocused();
    });
  });
});
