'use client';

import React, { useState, useEffect } from 'react';
import { WebSocketProvider } from '../../contexts/WebSocketContext';

interface ClientProvidersProps {
  children: React.ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  const [token, setToken] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Get token from localStorage or your auth system
    const storedToken = localStorage.getItem('fastbreak_token');
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  // Prevent hydration mismatch
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <WebSocketProvider 
      token={token}
      apiUrl={process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}
    >
      {children}
    </WebSocketProvider>
  );
}