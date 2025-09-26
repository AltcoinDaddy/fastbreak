import { test, expect } from '@playwright/test';

test.describe('AI Reasoning Flow', () => {
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

  test('should log detailed AI reasoning for each purchase', async ({ page }) => {
    await page.click('[data-testid="trade-history-tab"]');
    
    // Mock trade with detailed reasoning
    await page.route('**/api/trades/history', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'trade-1',
            momentId: 'moment-1',
            playerName: 'Ja Morant',
            reasoning: {
              summary: 'Strong buy signal based on recent performance surge',
              factors: [
                { type: 'performance', weight: 0.4, description: 'Career-high 35 points last game' },
                { type: 'market', weight: 0.3, description: 'Price 15% below fair value' },
                { type: 'scarcity', weight: 0.3, description: 'Only 500 moments in circulation' }
              ],
              confidence: 0.85
            },
            timestamp: new Date().toISOString()
          }
        ])
      });
    });
    
    await page.reload();
    
    // Requirement 9.1: Log detailed AI reasoning
    await page.click('[data-testid="trade-entry"]');
    await expect(page.locator('[data-testid="reasoning-summary"]')).toContainText('Strong buy signal');
    await expect(page.locator('[data-testid="confidence-score"]')).toContainText('85%');
  });

  test('should show reasoning with key factors in trade history', async ({ page }) => {
    await page.click('[data-testid="trade-history-tab"]');
    
    // Mock trade history with reasoning
    await page.route('**/api/trades/history', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'trade-1',
            playerName: 'Stephen Curry',
            reasoning: {
              summary: 'Player X just set career-high rebounds',
              keyFactor: 'Career-high 12 rebounds vs Lakers'
            }
          }
        ])
      });
    });
    
    await page.reload();
    
    // Requirement 9.2: Show reasoning in trade history
    await expect(page.getByText('Player X just set career-high rebounds')).toBeVisible();
  });

  test('should rank and display factors by importance', async ({ page }) => {
    await page.click('[data-testid="trade-history-tab"]');
    await page.click('[data-testid="trade-entry"]');
    
    // Mock detailed reasoning view
    await page.route('**/api/trades/*/reasoning', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          factors: [
            { type: 'performance', weight: 0.5, description: 'Triple-double performance', rank: 1 },
            { type: 'market', weight: 0.3, description: 'Undervalued by 20%', rank: 2 },
            { type: 'timing', weight: 0.2, description: 'Post-game spike window', rank: 3 }
          ]
        })
      });
    });
    
    await page.click('[data-testid="view-detailed-reasoning"]');
    
    // Requirement 9.3: Rank factors by importance
    const factors = page.locator('[data-testid="reasoning-factor"]');
    await expect(factors.first()).toContainText('Triple-double performance');
    await expect(factors.nth(1)).toContainText('Undervalued by 20%');
    await expect(factors.nth(2)).toContainText('Post-game spike window');
  });

  test('should include relevant stats and market context in reasoning', async ({ page }) => {
    await page.click('[data-testid="trade-history-tab"]');
    await page.click('[data-testid="trade-entry"]');
    await page.click('[data-testid="view-detailed-reasoning"]');
    
    // Mock reasoning with context
    await page.route('**/api/trades/*/reasoning', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          context: {
            playerStats: { points: 28, rebounds: 12, assists: 8 },
            marketData: { avgPrice: 45, currentPrice: 38, priceChange: -15.5 },
            historicalComparison: 'Best performance in last 30 games'
          }
        })
      });
    });
    
    await page.reload();
    
    // Requirement 9.4: Include stats, price comparisons, market context
    await expect(page.locator('[data-testid="player-stats"]')).toContainText('28 points');
    await expect(page.locator('[data-testid="market-context"]')).toContainText('$38 vs $45 avg');
    await expect(page.locator('[data-testid="historical-context"]')).toContainText('Best performance in last 30 games');
  });

  test('should display available information with disclaimers when incomplete', async ({ page }) => {
    await page.click('[data-testid="trade-history-tab"]');
    await page.click('[data-testid="trade-entry"]');
    
    // Mock incomplete reasoning data
    await page.route('**/api/trades/*/reasoning', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          reasoning: {
            summary: 'Limited data available',
            factors: [
              { type: 'performance', description: 'Recent game performance' }
            ],
            incomplete: true,
            missingData: ['market_sentiment', 'historical_prices']
          }
        })
      });
    });
    
    await page.click('[data-testid="view-detailed-reasoning"]');
    
    // Requirement 9.5: Display available info with disclaimers
    await expect(page.locator('[data-testid="incomplete-data-warning"]')).toBeVisible();
    await expect(page.getByText('Some reasoning data unavailable')).toBeVisible();
    await expect(page.getByText('market_sentiment, historical_prices')).toBeVisible();
  });
});