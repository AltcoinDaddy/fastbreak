import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { createLogger, register } from '@fastbreak/monitoring';
import { PerformanceCollector } from './collectors/performance-collector';
import { AlertManager } from './alerting/alert-manager';
import { DashboardAPI } from './api/dashboard-api';

const logger = createLogger({ serviceName: 'monitoring-dashboard' });

export class DashboardServer {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer;
  private performanceCollector: PerformanceCollector;
  private alertManager: AlertManager;
  private dashboardAPI: DashboardAPI;

  constructor(
    private dbPool: Pool,
    private redis: Redis,
    private port: number = 3001
  ) {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.performanceCollector = new PerformanceCollector(dbPool, redis);
    this.alertManager = new AlertManager(redis);
    this.dashboardAPI = new DashboardAPI(this.performanceCollector, this.alertManager);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static('public'));
    
    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
  }

  private setupRoutes() {
    // Prometheus metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
      } catch (error) {
        res.status(500).end('Error collecting metrics');
      }
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // Dashboard API routes
    this.app.use('/api', this.dashboardAPI.getRouter());

    // Serve dashboard HTML
    this.app.get('/', (req, res) => {
      res.send(this.getDashboardHTML());
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      logger.info('WebSocket client connected');

      // Send initial data
      this.sendInitialData(ws);

      // Set up periodic updates
      const interval = setInterval(async () => {
        try {
          const metrics = await this.performanceCollector.getCurrentMetrics();
          ws.send(JSON.stringify({
            type: 'metrics_update',
            data: metrics,
            timestamp: Date.now()
          }));
        } catch (error) {
          logger.error('Error sending WebSocket update', { error: (error as Error).message });
        }
      }, 5000); // Update every 5 seconds

      ws.on('close', () => {
        clearInterval(interval);
        logger.info('WebSocket client disconnected');
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error: error.message });
        clearInterval(interval);
      });
    });
  }

  private async sendInitialData(ws: any) {
    try {
      const [metrics, alerts, systemInfo] = await Promise.all([
        this.performanceCollector.getCurrentMetrics(),
        this.alertManager.getActiveAlerts(),
        this.performanceCollector.getSystemInfo()
      ]);

      ws.send(JSON.stringify({
        type: 'initial_data',
        data: {
          metrics,
          alerts,
          systemInfo
        },
        timestamp: Date.now()
      }));
    } catch (error) {
      logger.error('Error sending initial data', { error: (error as Error).message });
    }
  }

  private getDashboardHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FastBreak Performance Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .dashboard {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .metric-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            color: #2563eb;
        }
        .metric-label {
            color: #6b7280;
            margin-top: 5px;
        }
        .chart-container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .alerts {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .alert {
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
            border-left: 4px solid;
        }
        .alert.critical {
            background-color: #fef2f2;
            border-color: #ef4444;
        }
        .alert.warning {
            background-color: #fffbeb;
            border-color: #f59e0b;
        }
        .alert.info {
            background-color: #eff6ff;
            border-color: #3b82f6;
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-healthy { background-color: #10b981; }
        .status-warning { background-color: #f59e0b; }
        .status-critical { background-color: #ef4444; }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1>FastBreak Performance Dashboard</h1>
            <p>Real-time monitoring and performance metrics</p>
            <div id="connection-status">
                <span class="status-indicator status-healthy"></span>
                Connected
            </div>
        </div>

        <div class="metrics-grid" id="metrics-grid">
            <!-- Metrics cards will be populated by JavaScript -->
        </div>

        <div class="chart-container">
            <h3>Response Time Trends</h3>
            <canvas id="responseTimeChart" width="400" height="200"></canvas>
        </div>

        <div class="chart-container">
            <h3>Request Volume</h3>
            <canvas id="requestVolumeChart" width="400" height="200"></canvas>
        </div>

        <div class="alerts" id="alerts">
            <h3>Active Alerts</h3>
            <div id="alerts-list">
                <!-- Alerts will be populated by JavaScript -->
            </div>
        </div>
    </div>

    <script>
        class Dashboard {
            constructor() {
                this.ws = null;
                this.charts = {};
                this.metrics = {};
                this.connect();
                this.initCharts();
            }

            connect() {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                this.ws = new WebSocket(\`\${protocol}//\${window.location.host}\`);

                this.ws.onopen = () => {
                    console.log('Connected to dashboard');
                    this.updateConnectionStatus(true);
                };

                this.ws.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                };

                this.ws.onclose = () => {
                    console.log('Disconnected from dashboard');
                    this.updateConnectionStatus(false);
                    setTimeout(() => this.connect(), 5000);
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.updateConnectionStatus(false);
                };
            }

            updateConnectionStatus(connected) {
                const statusEl = document.getElementById('connection-status');
                if (connected) {
                    statusEl.innerHTML = '<span class="status-indicator status-healthy"></span>Connected';
                } else {
                    statusEl.innerHTML = '<span class="status-indicator status-critical"></span>Disconnected';
                }
            }

            handleMessage(message) {
                switch (message.type) {
                    case 'initial_data':
                        this.updateMetrics(message.data.metrics);
                        this.updateAlerts(message.data.alerts);
                        break;
                    case 'metrics_update':
                        this.updateMetrics(message.data);
                        this.updateCharts(message.data);
                        break;
                }
            }

            updateMetrics(metrics) {
                this.metrics = metrics;
                const grid = document.getElementById('metrics-grid');
                
                const metricCards = [
                    { key: 'requestsPerSecond', label: 'Requests/sec', format: (v) => v.toFixed(1) },
                    { key: 'avgResponseTime', label: 'Avg Response Time (ms)', format: (v) => v.toFixed(0) },
                    { key: 'errorRate', label: 'Error Rate (%)', format: (v) => (v * 100).toFixed(2) },
                    { key: 'activeUsers', label: 'Active Users', format: (v) => v.toString() },
                    { key: 'dbConnections', label: 'DB Connections', format: (v) => v.toString() },
                    { key: 'cacheHitRate', label: 'Cache Hit Rate (%)', format: (v) => (v * 100).toFixed(1) }
                ];

                grid.innerHTML = metricCards.map(card => \`
                    <div class="metric-card">
                        <div class="metric-value">\${card.format(metrics[card.key] || 0)}</div>
                        <div class="metric-label">\${card.label}</div>
                    </div>
                \`).join('');
            }

            updateAlerts(alerts) {
                const alertsList = document.getElementById('alerts-list');
                
                if (!alerts || alerts.length === 0) {
                    alertsList.innerHTML = '<p>No active alerts</p>';
                    return;
                }

                alertsList.innerHTML = alerts.map(alert => \`
                    <div class="alert \${alert.severity}">
                        <strong>\${alert.title}</strong><br>
                        \${alert.message}<br>
                        <small>\${new Date(alert.timestamp).toLocaleString()}</small>
                    </div>
                \`).join('');
            }

            initCharts() {
                // Response Time Chart
                const responseTimeCtx = document.getElementById('responseTimeChart').getContext('2d');
                this.charts.responseTime = new Chart(responseTimeCtx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Response Time (ms)',
                            data: [],
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                });

                // Request Volume Chart
                const requestVolumeCtx = document.getElementById('requestVolumeChart').getContext('2d');
                this.charts.requestVolume = new Chart(requestVolumeCtx, {
                    type: 'bar',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Requests/min',
                            data: [],
                            backgroundColor: '#10b981'
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                });
            }

            updateCharts(metrics) {
                const now = new Date().toLocaleTimeString();
                
                // Update response time chart
                const responseChart = this.charts.responseTime;
                responseChart.data.labels.push(now);
                responseChart.data.datasets[0].data.push(metrics.avgResponseTime || 0);
                
                // Keep only last 20 data points
                if (responseChart.data.labels.length > 20) {
                    responseChart.data.labels.shift();
                    responseChart.data.datasets[0].data.shift();
                }
                responseChart.update('none');

                // Update request volume chart
                const volumeChart = this.charts.requestVolume;
                volumeChart.data.labels.push(now);
                volumeChart.data.datasets[0].data.push(metrics.requestsPerSecond * 60 || 0);
                
                if (volumeChart.data.labels.length > 20) {
                    volumeChart.data.labels.shift();
                    volumeChart.data.datasets[0].data.shift();
                }
                volumeChart.update('none');
            }
        }

        // Initialize dashboard when page loads
        document.addEventListener('DOMContentLoaded', () => {
            new Dashboard();
        });
    </script>
</body>
</html>
    `;
  }

  async start() {
    // Start performance collection
    await this.performanceCollector.start();
    
    // Start alert monitoring
    await this.alertManager.start();

    // Start HTTP server
    this.server.listen(this.port, () => {
      logger.info('Monitoring dashboard started', { port: this.port });
    });
  }

  async stop() {
    await this.performanceCollector.stop();
    await this.alertManager.stop();
    
    this.wss.close();
    this.server.close();
    
    logger.info('Monitoring dashboard stopped');
  }
}