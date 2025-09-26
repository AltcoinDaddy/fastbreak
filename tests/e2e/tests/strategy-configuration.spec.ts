import { test, expect } from '@playwright/test';

test.describe('Strategy Configuration Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock wallet connection
    await page.evaluate(() => {
      window.localStorage.setItem('fcl:wallet', JSON.stringify({
        address: '0x1234567890abcdef',
        balance: '100.50'
      }));
    });
    
    await page.goto('/dashboard');
  });

  test('should display available strategy types', async ({ page }) => {
    await page.click('[data-testid="strategy-config-tab"]');
    
    // Requirement 2.1: Display available strategy types
    await expect(page.locator('[data-testid="strategy-rookie-risers"]')).toBeVisible();
    await expect(page.locator('[data-testid="strategy-post-game-spikes"]')).toBeVisible();
    await expect(page.locator('[data-testid="strategy-arbitrage-mode"]')).toBeVisible();
  });

  test('should show relevant configuration parameters for selected strategy', async ({ page }) => {
    await page.click('[data-testid="strategy-config-tab"]');
    
    // Requirement 2.2: Display relevant configuration parameters
    await page.click('[data-testid="strategy-rookie-risers"]');
    await expect(page.locator('[data-testid="rookie-performance-threshold"]')).toBeVisible();
    await expect(page.locator('[data-testid="rookie-price-limit"]')).toBeVisible();
  });

  test('should configure rookie risers strategy parameters', async ({ page }) => {
    await page.click('[data-testid="strategy-config-tab"]');
    await page.click('[data-testid="strategy-rookie-risers"]');
    
    // Requirement 2.3: Configure rookie risers parameters
    await page.fill('[data-testid="rookie-performance-threshold"]', '15');
    await page.fill('[data-testid="rookie-price-limit"]', '50');
    await page.fill('[data-testid="rookie-games-threshold"]', '10');
    
    await page.click('[data-testid="save-strategy"]');
    
    await expect(page.locator('[data-testid="strategy-saved-message"]')).toBeVisible();
  });

  test('should configure post-game spikes strategy parameters', async ({ page }) => {
    await page.click('[data-testid="strategy-config-tab"]');
    await page.click('[data-testid="strategy-post-game-spikes"]');
    
    // Requirement 2.4: Configure post-game spikes parameters
    await page.fill('[data-testid="performance-metric-points"]', '30');
    await page.fill('[data-testid="performance-metric-rebounds"]', '10');
    await page.fill('[data-testid="time-window-hours"]', '2');
    
    await page.click('[data-testid="save-strategy"]');
    
    await expect(page.locator('[data-testid="strategy-saved-message"]')).toBeVisible();
  });

  test('should configure arbitrage mode strategy parameters', async ({ page }) => {
    await page.click('[data-testid="strategy-config-tab"]');
    await page.click('[data-testid="strategy-arbitrage-mode"]');
    
    // Requirement 2.5: Configure arbitrage mode parameters
    await page.fill('[data-testid="price-difference-threshold"]', '5');
    await page.selectOption('[data-testid="marketplace-primary"]', 'nba-top-shot');
    await page.selectOption('[data-testid="marketplace-secondary"]', 'flowty');
    
    await page.click('[data-testid="save-strategy"]');
    
    await expect(page.locator('[data-testid="strategy-saved-message"]')).toBeVisible();
  });

  test('should validate parameters and confirm activation', async ({ page }) => {
    await page.click('[data-testid="strategy-config-tab"]');
    await page.click('[data-testid="strategy-rookie-risers"]');
    
    // Fill valid parameters
    await page.fill('[data-testid="rookie-performance-threshold"]', '15');
    await page.fill('[data-testid="rookie-price-limit"]', '50');
    
    await page.click('[data-testid="save-strategy"]');
    
    // Requirement 2.6: Validate parameters and confirm activation
    await expect(page.locator('[data-testid="strategy-validation-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="strategy-active-indicator"]')).toBeVisible();
  });

  test('should show validation errors for invalid parameters', async ({ page }) => {
    await page.click('[data-testid="strategy-config-tab"]');
    await page.click('[data-testid="strategy-rookie-risers"]');
    
    // Fill invalid parameters
    await page.fill('[data-testid="rookie-performance-threshold"]', '-5');
    await page.fill('[data-testid="rookie-price-limit"]', '0');
    
    await page.click('[data-testid="save-strategy"]');
    
    await expect(page.locator('[data-testid="validation-error"]')).toBeVisible();
    await expect(page.getByText('Performance threshold must be positive')).toBeVisible();
  });
});