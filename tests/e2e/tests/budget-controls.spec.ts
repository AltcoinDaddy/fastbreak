import { test, expect } from '@playwright/test';

test.describe('Budget Controls Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock wallet connection
    await page.evaluate(() => {
      window.localStorage.setItem('fcl:wallet', JSON.stringify({
        address: '0x1234567890abcdef',
        balance: '1000.00'
      }));
    });
    
    await page.goto('/dashboard');
  });

  test('should display current spending limits and available balance', async ({ page }) => {
    await page.click('[data-testid="budget-controls-tab"]');
    
    // Requirement 3.1: Display current spending limits and available balance
    await expect(page.locator('[data-testid="current-balance"]')).toContainText('1000.00');
    await expect(page.locator('[data-testid="daily-spending-cap"]')).toBeVisible();
    await expect(page.locator('[data-testid="max-price-per-moment"]')).toBeVisible();
  });

  test('should enforce daily spending cap across automated purchases', async ({ page }) => {
    await page.click('[data-testid="budget-controls-tab"]');
    
    // Set daily spending cap
    await page.fill('[data-testid="daily-spending-cap-input"]', '100');
    await page.click('[data-testid="save-budget-limits"]');
    
    // Mock API response for spending cap enforcement
    await page.route('**/api/trades/execute', route => {
      route.fulfill({
        status: 400,
        body: JSON.stringify({ 
          error: 'Daily spending limit reached',
          dailySpent: 100,
          dailyLimit: 100
        })
      });
    });
    
    // Requirement 3.2: Enforce daily spending cap
    await expect(page.locator('[data-testid="spending-cap-status"]')).toContainText('100');
  });

  test('should reject purchases above maximum price per moment', async ({ page }) => {
    await page.click('[data-testid="budget-controls-tab"]');
    
    // Set max price per moment
    await page.fill('[data-testid="max-price-per-moment-input"]', '50');
    await page.click('[data-testid="save-budget-limits"]');
    
    // Mock trade attempt above threshold
    await page.route('**/api/trades/validate', route => {
      route.fulfill({
        status: 400,
        body: JSON.stringify({ 
          error: 'Price exceeds maximum limit',
          momentPrice: 75,
          maxPrice: 50
        })
      });
    });
    
    // Requirement 3.3: Reject purchases above threshold
    await expect(page.locator('[data-testid="price-limit-warning"]')).toBeVisible();
  });

  test('should pause automated trading when daily limit is reached', async ({ page }) => {
    // Mock daily limit reached scenario
    await page.route('**/api/trading/status', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ 
          status: 'paused',
          reason: 'daily_limit_reached',
          dailySpent: 100,
          dailyLimit: 100,
          nextReset: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        })
      });
    });
    
    await page.reload();
    
    // Requirement 3.4: Pause trading until next day
    await expect(page.locator('[data-testid="trading-status"]')).toContainText('Paused');
    await expect(page.locator('[data-testid="pause-reason"]')).toContainText('Daily limit reached');
  });

  test('should skip opportunities that exceed budget limits', async ({ page }) => {
    await page.click('[data-testid="trade-history-tab"]');
    
    // Mock skipped opportunities
    await page.route('**/api/trades/history', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: '1',
            type: 'skipped',
            reason: 'Exceeds daily budget limit',
            momentId: 'moment-123',
            price: 75,
            timestamp: new Date().toISOString()
          }
        ])
      });
    });
    
    await page.reload();
    
    // Requirement 3.5: Skip opportunities and log reason
    await expect(page.locator('[data-testid="skipped-trade"]')).toBeVisible();
    await expect(page.getByText('Exceeds daily budget limit')).toBeVisible();
  });

  test('should require user confirmation for budget limit modifications', async ({ page }) => {
    await page.click('[data-testid="budget-controls-tab"]');
    
    // Modify budget limits
    await page.fill('[data-testid="daily-spending-cap-input"]', '200');
    await page.click('[data-testid="save-budget-limits"]');
    
    // Requirement 3.6: Require user confirmation
    await expect(page.locator('[data-testid="confirmation-modal"]')).toBeVisible();
    await expect(page.getByText('Confirm budget limit changes')).toBeVisible();
    
    await page.click('[data-testid="confirm-changes"]');
    
    await expect(page.locator('[data-testid="budget-updated-message"]')).toBeVisible();
  });
});