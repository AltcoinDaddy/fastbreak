import { test, expect } from '@playwright/test';

test.describe('Dashboard Portfolio Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock wallet connection and portfolio data
    await page.evaluate(() => {
      window.localStorage.setItem('fcl:wallet', JSON.stringify({
        address: '0x1234567890abcdef',
        balance: '1000.00'
      }));
    });
    
    // Mock portfolio API responses
    await page.route('**/api/portfolio/**', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          holdings: [
            {
              id: 'moment-1',
              playerName: 'LeBron James',
              momentType: 'Dunk',
              purchasePrice: 45.00,
              currentValue: 52.00,
              profitLoss: 7.00
            }
          ],
          totalValue: 520.00,
          totalROI: 15.5,
          dailyReturn: 2.3,
          weeklyReturn: 8.7,
          monthlyReturn: 15.5
        })
      });
    });
    
    await page.goto('/dashboard');
  });

  test('should display current moment holdings with real-time values', async ({ page }) => {
    // Requirement 8.1: Display current holdings with real-time values
    await expect(page.locator('[data-testid="portfolio-holdings"]')).toBeVisible();
    await expect(page.getByText('LeBron James')).toBeVisible();
    await expect(page.getByText('$52.00')).toBeVisible();
  });

  test('should show portfolio performance metrics', async ({ page }) => {
    // Requirement 8.2: Show total ROI and returns
    await expect(page.locator('[data-testid="total-roi"]')).toContainText('15.5%');
    await expect(page.locator('[data-testid="daily-return"]')).toContainText('2.3%');
    await expect(page.locator('[data-testid="weekly-return"]')).toContainText('8.7%');
    await expect(page.locator('[data-testid="monthly-return"]')).toContainText('15.5%');
  });

  test('should display executed trades with profit/loss', async ({ page }) => {
    await page.click('[data-testid="trade-history-tab"]');
    
    // Mock trade history
    await page.route('**/api/trades/history', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'trade-1',
            momentId: 'moment-1',
            playerName: 'LeBron James',
            purchasePrice: 45.00,
            currentValue: 52.00,
            profitLoss: 7.00,
            timestamp: new Date().toISOString()
          }
        ])
      });
    });
    
    await page.reload();
    
    // Requirement 8.3: Show purchase price, current value, profit/loss
    await expect(page.locator('[data-testid="trade-entry"]')).toBeVisible();
    await expect(page.getByText('$45.00')).toBeVisible();
    await expect(page.getByText('+$7.00')).toBeVisible();
  });

  test('should update dashboard metrics in real-time', async ({ page }) => {
    // Mock WebSocket connection for real-time updates
    await page.evaluate(() => {
      // Simulate real-time update
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('portfolio-update', {
          detail: {
            totalValue: 525.00,
            totalROI: 16.7
          }
        }));
      }, 1000);
    });
    
    // Requirement 8.4: Update metrics in real-time
    await expect(page.locator('[data-testid="total-value"]')).toContainText('$525.00');
    await expect(page.locator('[data-testid="total-roi"]')).toContainText('16.7%');
  });

  test('should display cached data with staleness indicators when unavailable', async ({ page }) => {
    // Mock API failure
    await page.route('**/api/portfolio/**', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Service unavailable' })
      });
    });
    
    await page.reload();
    
    // Requirement 8.5: Display cached data with staleness indicators
    await expect(page.locator('[data-testid="data-staleness-warning"]')).toBeVisible();
    await expect(page.getByText('Data may be outdated')).toBeVisible();
  });
});