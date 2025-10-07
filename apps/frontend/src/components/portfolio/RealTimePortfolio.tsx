'use client';

import React from 'react';
import { usePortfolioValue, usePriceUpdate } from '../../contexts/WebSocketContext';
import { PortfolioMoment } from '@fastbreak/types';

interface RealTimePortfolioProps {
  className?: string;
}

export function RealTimePortfolio({ className = '' }: RealTimePortfolioProps) {
  const portfolioUpdate = usePortfolioValue();

  if (!portfolioUpdate) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <h2 className="text-xl font-semibold mb-4">Portfolio Overview</h2>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
          </div>
        </div>
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

  const formatPercent = (percent: number) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Portfolio Overview</h2>
        <div className="text-sm text-gray-500">
          Last updated: {new Date(portfolioUpdate.lastUpdated).toLocaleTimeString()}
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Total Value</div>
          <div className="text-2xl font-bold">
            {formatCurrency(portfolioUpdate.totalValue)}
          </div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Total Change</div>
          <div className={`text-2xl font-bold ${getChangeColor(portfolioUpdate.totalChange)}`}>
            {formatCurrency(portfolioUpdate.totalChange)}
          </div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Change %</div>
          <div className={`text-2xl font-bold ${getChangeColor(portfolioUpdate.changePercent)}`}>
            {formatPercent(portfolioUpdate.changePercent)}
          </div>
        </div>
      </div>

      {/* Moments List */}
      <div>
        <h3 className="text-lg font-medium mb-4">Holdings ({portfolioUpdate.moments.length})</h3>
        <div className="space-y-3">
          {portfolioUpdate.moments.map((moment) => (
            <PortfolioMomentCard key={moment.momentId} moment={moment} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface PortfolioMomentCardProps {
  moment: PortfolioMoment;
}

function PortfolioMomentCard({ moment }: PortfolioMomentCardProps) {
  const priceUpdate = usePriceUpdate(moment.momentId);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatPercent = (percent: number) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  // Use real-time price if available, otherwise use moment data
  const currentValue = priceUpdate?.currentPrice || moment.currentValue;
  const profitLoss = currentValue - moment.purchasePrice;
  const profitLossPercent = ((currentValue - moment.purchasePrice) / moment.purchasePrice) * 100;

  return (
    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex-1">
        <div className="font-medium">{moment.playerName}</div>
        <div className="text-sm text-gray-600">
          Purchased: {formatCurrency(moment.purchasePrice)}
          {priceUpdate && (
            <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
              Live Price
            </span>
          )}
        </div>
      </div>
      
      <div className="text-right">
        <div className="font-medium">{formatCurrency(currentValue)}</div>
        <div className={`text-sm ${getChangeColor(profitLoss)}`}>
          {formatCurrency(profitLoss)} ({formatPercent(profitLossPercent)})
        </div>
      </div>
    </div>
  );
}