import { test, expect } from '@playwright/test';

test.describe('Wallet Connection Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display wallet connection interface on dashboard', async ({ page }) => {
    // Requirement 1.1: Display wallet connection interface
    await expect(page.locator('[data-testid="wallet-connect-button"]')).toBeVisible();
    await expect(page.getByText('Connect Wallet')).toBeVisible();
  });

  test('should prompt for Flow wallet authentication when connect is clicked', async ({ page }) => {
    // Requirement 1.2: Prompt for Flow wallet authentication
    await page.click('[data-testid="wallet-connect-button"]');
    
    // Mock wallet connection dialog
    await expect(page.locator('[data-testid="wallet-auth-modal"]')).toBeVisible();
    await expect(page.getByText('Choose your Flow wallet')).toBeVisible();
  });

  test('should display wallet address and balance on successful connection', async ({ page }) => {
    // Mock successful wallet connection
    await page.evaluate(() => {
      window.localStorage.setItem('fcl:wallet', JSON.stringify({
        address: '0x1234567890abcdef',
        balance: '100.50'
      }));
    });
    
    await page.reload();
    
    // Requirement 1.3: Display wallet address and balance
    await expect(page.locator('[data-testid="wallet-address"]')).toContainText('0x1234567890abcdef');
    await expect(page.locator('[data-testid="wallet-balance"]')).toContainText('100.50');
  });

  test('should display error message with retry options on connection failure', async ({ page }) => {
    // Mock wallet connection failure
    await page.route('**/api/wallet/connect', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Connection failed' })
      });
    });

    await page.click('[data-testid="wallet-connect-button"]');
    
    // Requirement 1.4: Display error message with retry options
    await expect(page.locator('[data-testid="connection-error"]')).toBeVisible();
    await expect(page.getByText('Connection failed')).toBeVisible();
    await expect(page.locator('[data-testid="retry-connection"]')).toBeVisible();
  });

  test('should disable trading functions when wallet is disconnected', async ({ page }) => {
    // Start with connected wallet
    await page.evaluate(() => {
      window.localStorage.setItem('fcl:wallet', JSON.stringify({
        address: '0x1234567890abcdef',
        balance: '100.50'
      }));
    });
    
    await page.reload();
    
    // Disconnect wallet
    await page.click('[data-testid="wallet-disconnect"]');
    
    // Requirement 1.5: Disable trading functions until reconnection
    await expect(page.locator('[data-testid="strategy-config"]')).toBeDisabled();
    await expect(page.locator('[data-testid="trade-execute"]')).toBeDisabled();
  });
});