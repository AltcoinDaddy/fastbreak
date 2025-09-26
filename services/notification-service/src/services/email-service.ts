import nodemailer from 'nodemailer';
import { NotificationWithRetry, EmailTemplate } from '../types/notification';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  /**
   * Send email notification
   */
  async sendEmail(to: string, notification: NotificationWithRetry): Promise<void> {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error('Email service not configured');
    }

    const template = this.generateEmailTemplate(notification);
    
    const mailOptions = {
      from: {
        name: process.env.FROM_NAME || 'FastBreak',
        address: process.env.FROM_EMAIL || process.env.SMTP_USER
      },
      to,
      subject: template.subject,
      text: template.text,
      html: template.html
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${to} for notification ${notification.id}`);
    } catch (error) {
      console.error(`Failed to send email to ${to}:`, error);
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Generate email template based on notification type and content
   */
  private generateEmailTemplate(notification: NotificationWithRetry): EmailTemplate {
    const baseSubject = `FastBreak - ${notification.title}`;
    
    switch (notification.type) {
      case 'trade':
        return this.generateTradeEmailTemplate(notification, baseSubject);
      case 'opportunity':
        return this.generateOpportunityEmailTemplate(notification, baseSubject);
      case 'budget':
        return this.generateBudgetEmailTemplate(notification, baseSubject);
      case 'system':
        return this.generateSystemEmailTemplate(notification, baseSubject);
      default:
        return this.generateDefaultEmailTemplate(notification, baseSubject);
    }
  }

  private generateTradeEmailTemplate(notification: NotificationWithRetry, subject: string): EmailTemplate {
    const metadata = notification.metadata || {};
    const momentDetails = metadata.momentDetails || {};
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .moment-card { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #667eea; }
          .price { font-size: 24px; font-weight: bold; color: #28a745; }
          .reasoning { background: #e9ecef; padding: 15px; border-radius: 8px; margin: 10px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🏀 New Moment Acquired!</h1>
        </div>
        <div class="content">
          <div class="moment-card">
            <h2>${momentDetails.playerName || 'Unknown Player'}</h2>
            <p><strong>Moment Type:</strong> ${momentDetails.momentType || 'N/A'}</p>
            <p><strong>Serial Number:</strong> #${momentDetails.serialNumber || 'N/A'}</p>
            <p><strong>Purchase Price:</strong> <span class="price">$${(momentDetails.price || 0).toFixed(2)}</span></p>
            ${metadata.strategyUsed ? `<p><strong>Strategy:</strong> ${metadata.strategyUsed}</p>` : ''}
          </div>
          
          ${metadata.reasoning ? `
            <div class="reasoning">
              <h3>🤖 AI Reasoning</h3>
              <p>${metadata.reasoning}</p>
            </div>
          ` : ''}
          
          <p>Your FastBreak AI has successfully identified and acquired this moment based on your configured strategies.</p>
          
          <a href="${process.env.FRONTEND_URL || 'https://app.fastbreak.com'}/dashboard" class="button">View Dashboard</a>
        </div>
        <div class="footer">
          <p>This is an automated message from FastBreak. You can manage your notification preferences in your dashboard.</p>
        </div>
      </body>
      </html>
    `;

    const text = `
FastBreak - New Moment Acquired!

${momentDetails.playerName || 'Unknown Player'}
Moment Type: ${momentDetails.momentType || 'N/A'}
Serial Number: #${momentDetails.serialNumber || 'N/A'}
Purchase Price: $${(momentDetails.price || 0).toFixed(2)}
${metadata.strategyUsed ? `Strategy: ${metadata.strategyUsed}` : ''}

${metadata.reasoning ? `AI Reasoning: ${metadata.reasoning}` : ''}

Your FastBreak AI has successfully identified and acquired this moment based on your configured strategies.

View your dashboard: ${process.env.FRONTEND_URL || 'https://app.fastbreak.com'}/dashboard
    `;

    return { subject, html, text };
  }

  private generateOpportunityEmailTemplate(notification: NotificationWithRetry, subject: string): EmailTemplate {
    const metadata = notification.metadata || {};
    const momentDetails = metadata.momentDetails || {};
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .rare-moment { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border: 2px solid #ff6b6b; }
          .price { font-size: 24px; font-weight: bold; color: #28a745; }
          .savings { font-size: 20px; font-weight: bold; color: #ff6b6b; }
          .scarcity { background: #fff3cd; padding: 10px; border-radius: 6px; border-left: 4px solid #ffc107; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .button { display: inline-block; background: #ff6b6b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🔥 RARE MOMENT ALERT!</h1>
        </div>
        <div class="content">
          <div class="rare-moment">
            <h2>${momentDetails.playerName || 'Unknown Player'}</h2>
            <p><strong>Moment Type:</strong> ${momentDetails.momentType || 'N/A'}</p>
            <p><strong>Serial Number:</strong> #${momentDetails.serialNumber || 'N/A'}</p>
            <p><strong>Purchase Price:</strong> <span class="price">$${(momentDetails.price || 0).toFixed(2)}</span></p>
            <p><strong>Market Value:</strong> $${(momentDetails.marketValue || 0).toFixed(2)}</p>
            <p><strong>You Saved:</strong> <span class="savings">$${(metadata.savingsAmount || 0).toFixed(2)} (${metadata.savingsPercent || 0}%)</span></p>
            
            ${momentDetails.scarcityRank ? `
              <div class="scarcity">
                <strong>🏆 Scarcity Rank:</strong> ${momentDetails.scarcityRank}
                <br><small>This is a rare find with exceptional scarcity!</small>
              </div>
            ` : ''}
          </div>
          
          <p><strong>Exceptional opportunity!</strong> Your FastBreak AI has identified and acquired a rare moment significantly below market value.</p>
          
          <a href="${process.env.FRONTEND_URL || 'https://app.fastbreak.com'}/dashboard" class="button">View Dashboard</a>
        </div>
        <div class="footer">
          <p>This is a high-priority alert from FastBreak. Rare moment opportunities like this are uncommon!</p>
        </div>
      </body>
      </html>
    `;

    const text = `
FastBreak - RARE MOMENT ALERT!

${momentDetails.playerName || 'Unknown Player'}
Moment Type: ${momentDetails.momentType || 'N/A'}
Serial Number: #${momentDetails.serialNumber || 'N/A'}
Purchase Price: $${(momentDetails.price || 0).toFixed(2)}
Market Value: $${(momentDetails.marketValue || 0).toFixed(2)}
You Saved: $${(metadata.savingsAmount || 0).toFixed(2)} (${metadata.savingsPercent || 0}%)

${momentDetails.scarcityRank ? `Scarcity Rank: ${momentDetails.scarcityRank}` : ''}

Exceptional opportunity! Your FastBreak AI has identified and acquired a rare moment significantly below market value.

View your dashboard: ${process.env.FRONTEND_URL || 'https://app.fastbreak.com'}/dashboard
    `;

    return { subject, html, text };
  }

  private generateBudgetEmailTemplate(notification: NotificationWithRetry, subject: string): EmailTemplate {
    const metadata = notification.metadata || {};
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ffc107 0%, #ff8f00 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .budget-info { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffc107; }
          .progress-bar { background: #e9ecef; height: 20px; border-radius: 10px; overflow: hidden; margin: 10px 0; }
          .progress-fill { background: linear-gradient(90deg, #28a745 0%, #ffc107 70%, #dc3545 100%); height: 100%; transition: width 0.3s ease; }
          .amount { font-size: 18px; font-weight: bold; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .button { display: inline-block; background: #ffc107; color: #333; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>⚠️ Budget Alert</h1>
        </div>
        <div class="content">
          <div class="budget-info">
            <h3>Daily Spending Update</h3>
            <p>You've used <strong>${(metadata.percentageUsed || 0).toFixed(1)}%</strong> of your daily budget.</p>
            
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${Math.min(metadata.percentageUsed || 0, 100)}%"></div>
            </div>
            
            <p><strong>Current Spending:</strong> <span class="amount">$${(metadata.currentSpending || 0).toFixed(2)}</span></p>
            <p><strong>Daily Limit:</strong> <span class="amount">$${(metadata.dailyLimit || 0).toFixed(2)}</span></p>
            <p><strong>Remaining Budget:</strong> <span class="amount">$${(metadata.remainingBudget || 0).toFixed(2)}</span></p>
          </div>
          
          <p>This is a ${notification.priority} priority alert to keep you informed of your spending progress.</p>
          
          <a href="${process.env.FRONTEND_URL || 'https://app.fastbreak.com'}/settings/budget" class="button">Manage Budget</a>
        </div>
        <div class="footer">
          <p>Budget alerts help you stay in control of your FastBreak spending. You can adjust these settings anytime.</p>
        </div>
      </body>
      </html>
    `;

    const text = `
FastBreak - Budget Alert

Daily Spending Update
You've used ${(metadata.percentageUsed || 0).toFixed(1)}% of your daily budget.

Current Spending: $${(metadata.currentSpending || 0).toFixed(2)}
Daily Limit: $${(metadata.dailyLimit || 0).toFixed(2)}
Remaining Budget: $${(metadata.remainingBudget || 0).toFixed(2)}

This is a ${notification.priority} priority alert to keep you informed of your spending progress.

Manage your budget: ${process.env.FRONTEND_URL || 'https://app.fastbreak.com'}/settings/budget
    `;

    return { subject, html, text };
  }

  private generateSystemEmailTemplate(notification: NotificationWithRetry, subject: string): EmailTemplate {
    const metadata = notification.metadata || {};
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .error-info { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #dc3545; }
          .troubleshooting { background: #d1ecf1; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .button { display: inline-block; background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
          ol { padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🚨 System Alert</h1>
        </div>
        <div class="content">
          <div class="error-info">
            <h3>${metadata.type || 'System Error'}</h3>
            <p><strong>Service:</strong> ${metadata.service || 'Unknown'}</p>
            <p><strong>Time:</strong> ${metadata.timestamp ? new Date(metadata.timestamp).toLocaleString() : 'Unknown'}</p>
            <p><strong>Message:</strong> ${metadata.message || notification.message}</p>
          </div>
          
          ${metadata.troubleshootingSteps && metadata.troubleshootingSteps.length > 0 ? `
            <div class="troubleshooting">
              <h4>🔧 Troubleshooting Steps</h4>
              <ol>
                ${metadata.troubleshootingSteps.map(step => `<li>${step}</li>`).join('')}
              </ol>
            </div>
          ` : ''}
          
          <p>Our team has been automatically notified and is working to resolve this issue. Your trading strategies may be temporarily affected.</p>
          
          <a href="${process.env.FRONTEND_URL || 'https://app.fastbreak.com'}/support" class="button">Contact Support</a>
        </div>
        <div class="footer">
          <p>This is an automated system alert from FastBreak. We apologize for any inconvenience.</p>
        </div>
      </body>
      </html>
    `;

    const text = `
FastBreak - System Alert

${metadata.type || 'System Error'}
Service: ${metadata.service || 'Unknown'}
Time: ${metadata.timestamp ? new Date(metadata.timestamp).toLocaleString() : 'Unknown'}
Message: ${metadata.message || notification.message}

${metadata.troubleshootingSteps && metadata.troubleshootingSteps.length > 0 ? `
Troubleshooting Steps:
${metadata.troubleshootingSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}
` : ''}

Our team has been automatically notified and is working to resolve this issue. Your trading strategies may be temporarily affected.

Contact Support: ${process.env.FRONTEND_URL || 'https://app.fastbreak.com'}/support
    `;

    return { subject, html, text };
  }

  private generateDefaultEmailTemplate(notification: NotificationWithRetry, subject: string): EmailTemplate {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
          .message { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${notification.title}</h1>
        </div>
        <div class="content">
          <div class="message">
            <p>${notification.message.replace(/\n/g, '<br>')}</p>
          </div>
          
          <a href="${process.env.FRONTEND_URL || 'https://app.fastbreak.com'}/dashboard" class="button">View Dashboard</a>
        </div>
        <div class="footer">
          <p>This is an automated message from FastBreak.</p>
        </div>
      </body>
      </html>
    `;

    const text = `
FastBreak - ${notification.title}

${notification.message}

View your dashboard: ${process.env.FRONTEND_URL || 'https://app.fastbreak.com'}/dashboard
    `;

    return { subject, html, text };
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service connection test failed:', error);
      return false;
    }
  }
}