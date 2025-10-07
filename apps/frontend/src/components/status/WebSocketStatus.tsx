'use client';

import React from 'react';
import { useWebSocketContext } from '../../contexts/WebSocketContext';

interface WebSocketStatusProps {
  className?: string;
  showDetails?: boolean;
}

export function WebSocketStatus({ className = '', showDetails = false }: WebSocketStatusProps) {
  const { 
    connected, 
    connecting, 
    error, 
    reconnectAttempts, 
    lastHeartbeat,
    connect,
    disconnect
  } = useWebSocketContext();

  const getStatusColor = () => {
    if (connected) return 'bg-green-500';
    if (connecting) return 'bg-yellow-500';
    if (error) return 'bg-red-500';
    return 'bg-gray-500';
  };

  const getStatusText = () => {
    if (connected) return 'Connected';
    if (connecting) return 'Connecting...';
    if (error) return 'Disconnected';
    return 'Not Connected';
  };

  const formatLastHeartbeat = () => {
    if (!lastHeartbeat) return 'Never';
    const now = new Date();
    const diff = now.getTime() - lastHeartbeat.getTime();
    
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return lastHeartbeat.toLocaleTimeString();
  };

  if (!showDetails) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
        <span className="text-sm text-gray-600">{getStatusText()}</span>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Connection Status</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
      </div>

      <div className="space-y-3">
        {/* Connection Details */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-600">Status</div>
            <div className="font-medium">{getStatusText()}</div>
          </div>
          
          <div>
            <div className="text-gray-600">Last Heartbeat</div>
            <div className="font-medium">{formatLastHeartbeat()}</div>
          </div>
          
          {reconnectAttempts > 0 && (
            <div>
              <div className="text-gray-600">Reconnect Attempts</div>
              <div className="font-medium">{reconnectAttempts}</div>
            </div>
          )}
          
          {error && (
            <div className="col-span-2">
              <div className="text-gray-600">Error</div>
              <div className="font-medium text-red-600">{error}</div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2 pt-2 border-t border-gray-200">
          {!connected && !connecting && (
            <button
              onClick={connect}
              className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
            >
              Connect
            </button>
          )}
          
          {connected && (
            <button
              onClick={disconnect}
              className="px-3 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
            >
              Disconnect
            </button>
          )}
          
          {connecting && (
            <button
              disabled
              className="px-3 py-2 bg-gray-400 text-white text-sm rounded-md cursor-not-allowed"
            >
              Connecting...
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact status indicator for headers/navbars
export function WebSocketStatusIndicator({ className = '' }: { className?: string }) {
  try {
    const { connected, connecting, error } = useWebSocketContext();

    const getStatusColor = () => {
      if (connected) return 'bg-green-500';
      if (connecting) return 'bg-yellow-500 animate-pulse';
      if (error) return 'bg-red-500';
      return 'bg-gray-500';
    };

    const getTooltipText = () => {
      if (connected) return 'Real-time updates active';
      if (connecting) return 'Connecting to real-time updates...';
      if (error) return 'Real-time updates unavailable';
      return 'Real-time updates not connected';
    };

    return (
      <div className={`relative ${className}`} title={getTooltipText()}>
        <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
      </div>
    );
  } catch (error) {
    // If WebSocket context is not available, show a neutral indicator
    return (
      <div className={`relative ${className}`} title="WebSocket not initialized">
        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
      </div>
    );
  }
}