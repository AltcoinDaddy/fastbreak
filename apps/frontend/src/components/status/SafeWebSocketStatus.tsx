'use client';

import React from 'react';
import { WebSocketStatusIndicator } from './WebSocketStatus';

interface SafeWebSocketStatusProps {
  className?: string;
}

export function SafeWebSocketStatus({ className = '' }: SafeWebSocketStatusProps) {
  try {
    return <WebSocketStatusIndicator className={className} />;
  } catch (error) {
    // If WebSocket context is not available, show a neutral indicator
    return (
      <div className={`relative ${className}`} title="WebSocket not initialized">
        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
      </div>
    );
  }
}