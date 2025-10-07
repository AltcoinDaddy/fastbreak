'use client';

import React from 'react';
import { RealTimePortfolio } from '../../components/portfolio/RealTimePortfolio';
import { RealTimeNotifications } from '../../components/notifications/RealTimeNotifications';
import { WebSocketStatus } from '../../components/status/WebSocketStatus';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <WebSocketStatus showDetails={false} />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio - Takes up 2 columns on large screens */}
        <div className="lg:col-span-2">
          <RealTimePortfolio />
        </div>

        {/* Notifications - Takes up 1 column */}
        <div className="lg:col-span-1">
          <RealTimeNotifications />
        </div>
      </div>

      {/* WebSocket Status Details (for debugging/monitoring) */}
      <div className="mt-8">
        <WebSocketStatus showDetails={true} className="max-w-md" />
      </div>
    </div>
  );
}