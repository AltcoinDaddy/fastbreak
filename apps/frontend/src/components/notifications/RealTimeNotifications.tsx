'use client';

import React, { useState } from 'react';
import { useRecentTrades, useMarketAlerts, useWebSocketContext } from '../../contexts/WebSocketContext';
import { TradeNotification, MarketAlert } from '@fastbreak/types';

interface RealTimeNotificationsProps {
  className?: string;
}

export function RealTimeNotifications({ className = '' }: RealTimeNotificationsProps) {
  const [activeTab, setActiveTab] = useState<'trades' | 'alerts'>('trades');
  const recentTrades = useRecentTrades(10);
  const marketAlerts = useMarketAlerts();
  const { clearNotifications, clearAlerts } = useWebSocketContext();

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header with tabs */}
      <div className="border-b border-gray-200">
        <div className="flex items-center justify-between p-4">
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('trades')}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'trades'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Recent Trades ({recentTrades.length})
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'alerts'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Market Alerts ({marketAlerts.length})
            </button>
          </div>
          
          <button
            onClick={activeTab === 'trades' ? clearNotifications : clearAlerts}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'trades' ? (
          <TradesList trades={recentTrades} />
        ) : (
          <AlertsList alerts={marketAlerts} />
        )}
      </div>
    </div>
  );
}

interface TradesListProps {
  trades: TradeNotification[];
}

function TradesList({ trades }: TradesListProps) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-lg mb-2">No recent trades</div>
        <div className="text-sm">Trade notifications will appear here</div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const getTradeIcon = (type: 'buy' | 'sell') => {
    return type === 'buy' ? '📈' : '📉';
  };

  const getTradeColor = (type: 'buy' | 'sell') => {
    return type === 'buy' ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className="space-y-3">
      {trades.map((trade, index) => (
        <div key={`${trade.tradeId}-${index}`} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
          <div className="text-2xl">{getTradeIcon(trade.type)}</div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <span className={`font-medium capitalize ${getTradeColor(trade.type)}`}>
                {trade.type}
              </span>
              <span className="font-medium">{trade.playerName}</span>
              <span className="text-gray-500">•</span>
              <span className="font-medium">{formatCurrency(trade.price)}</span>
            </div>
            
            <div className="text-sm text-gray-600 mb-2">
              {trade.reasoning}
            </div>
            
            <div className="text-xs text-gray-500">
              {new Date(trade.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface AlertsListProps {
  alerts: MarketAlert[];
}

function AlertsList({ alerts }: AlertsListProps) {
  if (alerts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-lg mb-2">No market alerts</div>
        <div className="text-sm">Market alerts will appear here</div>
      </div>
    );
  }

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'arbitrage': return '⚡';
      case 'price_spike': return '🚀';
      case 'volume_surge': return '📊';
      case 'rare_listing': return '💎';
      default: return '📢';
    }
  };

  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => (
        <div key={`${alert.momentId}-${index}`} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
          <div className="text-2xl">{getAlertIcon(alert.type)}</div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <span className="font-medium">{alert.playerName}</span>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(alert.priority)}`}>
                {alert.priority.toUpperCase()}
              </span>
            </div>
            
            <div className="text-sm text-gray-700 mb-2">
              {alert.message}
            </div>
            
            <div className="text-xs text-gray-500">
              {new Date(alert.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}