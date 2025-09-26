# FastBreak Notification Service

A comprehensive notification service with multiple delivery channels for the FastBreak NBA Top Shot auto-collector platform.

## Features

- **Multiple Delivery Channels**: Database storage, email, push notifications, and webhook support
- **Notification Types**: Trade notifications, budget alerts, system errors, and opportunity alerts
- **Priority System**: Low, medium, and high priority notifications with appropriate routing
- **Retry Mechanism**: Exponential backoff retry for failed deliveries
- **Queue System**: Redis-backed job queue for reliable notification processing
- **Rich Email Templates**: HTML email templates customized by notification type
- **Push Notifications**: Web Push API support with VAPID authentication
- **Notification History**: Complete audit trail with delivery status tracking
- **Admin Interface**: Queue management and statistics endpoints

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Gateway   │───▶│ Notification API │───▶│ Queue Worker    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │    Database      │    │ Delivery        │
                       │   (PostgreSQL)   │    │ Services        │
                       └──────────────────┘    └─────────────────┘
                                                        │
                                          ┌─────────────┼─────────────┐
                                          ▼             ▼             ▼
                                    ┌──────────┐ ┌──────────┐ ┌──────────┐
                                    │  Email   │ │   Push   │ │ Webhook  │
                                    │ Service  │ │ Service  │ │ Service  │
                                    └──────────┘ └──────────┘ └──────────┘
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Set up database tables:
```bash
# The service will create necessary tables automatically
# Or run the database migrations from the database package
```

4. Start Redis server:
```bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Or install locally
redis-server
```

## Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3007
NODE_ENV=development

# Database
DATABASE_URL=postgresql://fastbreak:password@localhost:5432/fastbreak

# Redis (for job queue)
REDIS_URL=redis://localhost:6379

# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@fastbreak.app
FROM_NAME=FastBreak

# Push Notifications (Web Push)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:admin@fastbreak.app

# Authentication
JWT_SECRET=your-jwt-secret
SERVICE_API_KEY=your-service-api-key
ADMIN_API_KEY=your-admin-api-key

# Notification Settings
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_MS=5000
NOTIFICATION_HISTORY_DAYS=30
```

### VAPID Keys Generation

Generate VAPID keys for push notifications:

```bash
npx web-push generate-vapid-keys
```

## Usage

### Starting the Service

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start

# Worker only (for separate worker processes)
npm run worker
```

### API Endpoints

#### Authentication
All endpoints require either:
- JWT token in `Authorization: Bearer <token>` header
- Service API key in `x-api-key` header

#### Core Notification Endpoints

```bash
# Send basic notification
POST /api/notifications
{
  "userId": "uuid",
  "type": "trade|budget|system|opportunity",
  "title": "Notification Title",
  "message": "Notification message",
  "priority": "low|medium|high",
  "channels": ["database", "email", "push"], // optional
  "metadata": {} // optional
}

# Send purchase notification
POST /api/notifications/purchase
{
  "userId": "uuid",
  "momentDetails": {
    "playerName": "LeBron James",
    "momentType": "Dunk",
    "price": 150.00,
    "serialNumber": 1234
  },
  "reasoning": "AI reasoning for purchase",
  "strategyUsed": "rookie_risers"
}

# Send rare moment notification
POST /api/notifications/rare-moment
{
  "userId": "uuid",
  "momentDetails": {
    "playerName": "Stephen Curry",
    "momentType": "3-Pointer",
    "price": 200.00,
    "serialNumber": 567,
    "scarcityRank": 15,
    "marketValue": 350.00
  }
}

# Send budget warning
POST /api/notifications/budget-warning
{
  "userId": "uuid",
  "budgetInfo": {
    "currentSpending": 850.00,
    "dailyLimit": 1000.00,
    "remainingBudget": 150.00,
    "percentageUsed": 85.0
  }
}

# Send system error notification
POST /api/notifications/system-error
{
  "userId": "uuid",
  "error": {
    "type": "API Connection Error",
    "message": "Failed to connect to NBA Stats API",
    "service": "marketplace-monitor",
    "timestamp": "2024-01-01T00:00:00Z",
    "troubleshootingSteps": ["Check connection", "Verify credentials"]
  }
}
```

#### User Notification Management

```bash
# Get notification history
GET /api/notifications/history?limit=50&offset=0

# Get unread count
GET /api/notifications/unread-count

# Mark notification as read
PUT /api/notifications/:id/read

# Mark all notifications as read
PUT /api/notifications/read-all
```

#### Push Notification Management

```bash
# Register push subscription
POST /api/notifications/push/subscribe
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "key",
      "auth": "key"
    }
  }
}

# Unregister push subscription
POST /api/notifications/push/unsubscribe
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}

# Test push notification
POST /api/notifications/push/test
```

#### Admin Endpoints

```bash
# Get service statistics (requires admin API key)
GET /admin/stats

# Pause notification queue
POST /admin/queue/pause

# Resume notification queue
POST /admin/queue/resume
```

### Service Integration

#### From Other Services

```typescript
import axios from 'axios';

// Send notification from another service
const response = await axios.post('http://notification-service:3007/api/notifications/purchase', {
  userId: 'user-uuid',
  momentDetails: {
    playerName: 'LeBron James',
    momentType: 'Dunk',
    price: 150.00,
    serialNumber: 1234
  },
  reasoning: 'Strong performance metrics indicate undervaluation',
  strategyUsed: 'rookie_risers'
}, {
  headers: {
    'x-api-key': process.env.SERVICE_API_KEY
  }
});
```

#### Frontend Integration

```javascript
// Register for push notifications
if ('serviceWorker' in navigator && 'PushManager' in window) {
  const registration = await navigator.serviceWorker.register('/sw.js');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: 'your-vapid-public-key'
  });

  await fetch('/api/notifications/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({ subscription })
  });
}
```

## Notification Types

### Trade Notifications
- **Purpose**: Inform users about successful moment purchases
- **Priority**: Medium
- **Channels**: Database, Email, Push (based on user preferences)
- **Content**: Moment details, purchase price, AI reasoning, strategy used

### Opportunity Notifications
- **Purpose**: Alert users about rare moment acquisitions
- **Priority**: High
- **Channels**: All channels (forced)
- **Content**: Moment details, market value comparison, savings amount

### Budget Notifications
- **Purpose**: Warn users about spending limit approaches
- **Priority**: Medium (85-89% usage) or High (90%+ usage)
- **Channels**: Database, Email, Push (based on user preferences)
- **Content**: Current spending, limits, remaining budget

### System Notifications
- **Purpose**: Alert users about system errors and issues
- **Priority**: High
- **Channels**: Database, Email, Push (based on user preferences)
- **Content**: Error details, affected service, troubleshooting steps

## Queue System

The service uses Bull (Redis-backed) for reliable job processing:

- **Retry Logic**: Exponential backoff with configurable max attempts
- **Priority Queues**: High priority notifications processed first
- **Dead Letter Queue**: Failed jobs stored for manual inspection
- **Monitoring**: Queue statistics and health checks available

### Queue Management

```bash
# Monitor queue status
curl -H "x-api-key: your-admin-key" http://localhost:3007/admin/stats

# Pause processing
curl -X POST -H "x-api-key: your-admin-key" http://localhost:3007/admin/queue/pause

# Resume processing
curl -X POST -H "x-api-key: your-admin-key" http://localhost:3007/admin/queue/resume
```

## Email Templates

The service includes rich HTML email templates for each notification type:

- **Trade Notifications**: Moment card with purchase details and AI reasoning
- **Opportunity Alerts**: Highlighted rare moment with savings calculation
- **Budget Warnings**: Progress bar and spending breakdown
- **System Errors**: Error details with troubleshooting steps

Templates are responsive and include both HTML and plain text versions.

## Push Notifications

Web Push notifications using the Push API:

- **VAPID Authentication**: Secure push delivery
- **Rich Notifications**: Custom icons, actions, and data
- **Subscription Management**: Automatic cleanup of invalid subscriptions
- **Fallback Handling**: Graceful degradation when push fails

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Monitoring

### Health Checks

```bash
# Service health
GET /health

# Returns:
{
  "status": "healthy",
  "service": "notification-service",
  "database": { "status": "connected" },
  "queue": { "waiting": 0, "active": 1, "completed": 100 }
}
```

### Metrics

The service exposes metrics for monitoring:

- Notification delivery rates by channel
- Queue processing statistics
- Error rates and retry counts
- User engagement metrics

## Deployment

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3007
CMD ["node", "dist/index.js"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-service
spec:
  replicas: 2
  selector:
    matchLabels:
      app: notification-service
  template:
    metadata:
      labels:
        app: notification-service
    spec:
      containers:
      - name: notification-service
        image: fastbreak/notification-service:latest
        ports:
        - containerPort: 3007
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-secret
              key: url
        - name: REDIS_URL
          value: "redis://redis-service:6379"
```

## Security

- **Authentication**: JWT tokens and API keys
- **Rate Limiting**: Configurable request limits
- **Input Validation**: Joi schema validation
- **CORS**: Configurable cross-origin policies
- **Helmet**: Security headers
- **Secrets Management**: Environment variables for sensitive data

## Troubleshooting

### Common Issues

1. **Email not sending**
   - Check SMTP configuration
   - Verify credentials and app passwords
   - Check firewall/network restrictions

2. **Push notifications failing**
   - Verify VAPID keys are correct
   - Check subscription endpoint validity
   - Ensure HTTPS in production

3. **Queue not processing**
   - Check Redis connection
   - Verify worker is running
   - Check queue health endpoint

4. **Database connection issues**
   - Verify DATABASE_URL format
   - Check network connectivity
   - Ensure database exists and user has permissions

### Logs

The service provides structured logging:

```bash
# View logs
docker logs notification-service

# Follow logs
docker logs -f notification-service
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.