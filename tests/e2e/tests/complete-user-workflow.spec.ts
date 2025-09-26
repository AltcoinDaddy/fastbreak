import { test, expect } from '@playwright/test';

test.describe('Complete User Workflow', () => {
  test('should complete full user journey from wallet connection to trade execution', async ({ page }) => {
    // Step 1: Visit dashboard and connect wallet
    await page.goto('/');
    
    await expect(page.locator('[data-testid="wallet-connect-button"]')).toBeVisible();
    await page.click('[data-testid="wallet-connect-button"]');
    
    // Mock successful wallet connection
    await page.evaluate(() => {
      window.localStorage.setItem('fcl:wallet', JSON.stringify({
        address: '0x1234567890abcdef',
        balance: '1000.00'
      }));
    });
    
    await page.reload();
    await expect(page.locator('[data-testid="wallet-address"]')).toContainText('0x1234567890abcdef');
    
    // Step 2: Configure trading strategy
    await page.click('[data-testid="strategy-config-tab"]');
    await page.click('[data-testid="strategy-rookie-risers"]');
    
    await page.fill('[data-testid="rookie-performance-threshold"]', '20');
    await page.fill('[data-testid="rookie-price-limit"]', '75');
    await page.click('[data-testid="save-strategy"]');
    
    await expect(page.locator('[data-testid="strategy-active-indicator"]')).toBeVisible();
    
    // Step 3: Set budget controls
    await page.click('[data-testid="budget-controls-tab"]');
    await page.fill('[data-testid="daily-spending-cap-input"]', '200');
    await page.fill('[data-testid="max-price-per-moment-input"]', '100');
    await page.click('[data-testid="save-budget-limits"]');
    
    await page.click('[data-testid="confirm-changes"]');
    await expect(page.locator('[data-testid="budget-updated-message"]')).toBeVisible();
    
    // Step 4: Mock AI detection of opportunity
    await page.route('**/api/opportunities/current', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            momentId: 'moment-123',
            playerName: 'Paolo Banchero',
            currentPrice: 65,
            aiValuation: 85,
            confidence: 0.87,
            reasoning: 'Rookie showing consistent improvement, undervalued by market'
          }
        ])
      });
    });
    
    // Step 5: Mock automated trade execution
    await page.route('**/api/trades/execute', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          tradeId: 'trade-123',
          status: 'executed',
          momentId: 'moment-123',
          price: 65,
          transactionHash: '0xabcdef123456'
        })
      });
    });
    
    // Step 6: Verify trade appears in portfolio
    await page.route('**/api/portfolio/**', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          holdings: [
            {
              id: 'moment-123',
              playerName: 'Paolo Banchero',
              momentType: 'Rookie Card',
              purchasePrice: 65.00,
              currentValue: 68.00,
              profitLoss: 3.00
            }
          ],
          totalValue: 68.00,
          totalROI: 4.6
        })
      });
    });
    
    await page.click('[data-testid="portfolio-tab"]');
    await expect(page.getByText('Paolo Banchero')).toBeVisible();
    await expect(page.getByText('$65.00')).toBeVisible();
    await expect(page.getByText('+$3.00')).toBeVisible();
    
    // Step 7: Check trade history with AI reasoning
    await page.click('[data-testid="trade-history-tab"]');
    
    await page.route('**/api/trades/history', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'trade-123',
            playerName: 'Paolo Banchero',
            purchasePrice: 65.00,
            reasoning: {
              summary: 'Rookie showing consistent improvement, undervalued by market',
              confidence: 0.87
            },
            timestamp: new Date().toISOString()
          }
        ])
      });
    });
    
    await page.reload();
    await expect(page.getByText('Rookie showing consistent improvement')).toBeVisible();
    
    // Step 8: Verify notification was sent
    await page.click('[data-testid="notifications-tab"]');
    
    await page.route('**/api/notifications/history', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'notif-1',
            type: 'purchase',
            title: 'Moment Purchased',
            message: 'Successfully acquired Paolo Banchero rookie moment for $65',
            timestamp: new Date().toISOString()
          }
        ])
      });
    });
    
    await page.reload();
    await expect(page.getByText('Successfully acquired Paolo Banchero')).toBeVisible();
  });

  test('should handle error scenarios gracefully throughout workflow', async ({ page }) => {
    // Test wallet connection failure
    await page.goto('/');
    
    await page.route('**/api/wallet/connect', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Wallet connection failed' })
      });
    });
    
    await page.click('[data-testid="wallet-connect-button"]');
    await expect(page.locator('[data-testid="connection-error"]')).toBeVisible();
    
    // Test strategy save failure
    await page.evaluate(() => {
      window.localStorage.setItem('fcl:wallet', JSON.stringify({
        address: '0x1234567890abcdef',
        balance: '1000.00'
      }));
    });
    
    await page.reload();
    await page.click('[data-testid="strategy-config-tab"]');
    
    await page.route('**/api/strategies', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Failed to save strategy' })
      });
    });
    
    await page.click('[data-testid="strategy-rookie-risers"]');
    await page.fill('[data-testid="rookie-performance-threshold"]', '20');
    await page.click('[data-testid="save-strategy"]');
    
    await expect(page.locator('[data-testid="strategy-save-error"]')).toBeVisible();
    
    // Test trade execution failure
    await page.route('**/api/trades/execute', route => {
      route.fulfill({
        status: 400,
        body: JSON.stringify({ 
          error: 'Insufficient balance',
          required: 100,
          available: 50
        })
      });
    });
    
    // Verify error handling and user feedback
    await expect(page.locator('[data-testid="trade-error-notification"]')).toBeVisible();
  });
});