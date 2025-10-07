'use client';

import React, { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Toggle from '../ui/Toggle';

const Settings = () => {
  const [notifications, setNotifications] = useState(true);
  const [dailySpendLimit, setDailySpendLimit] = useState('0');
  const [executionMode, setExecutionMode] = useState('auto');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
      </div>

      {/* Wallet Section */}
      <Card>
        <Card.Header>
          <Card.Title>Wallet</Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Wallet</p>
              <p className="text-gray-400 text-sm">Not connected</p>
            </div>
            <Button variant="primary">Connect</Button>
          </div>
        </Card.Content>
      </Card>

      {/* Budget Section */}
      <Card>
        <Card.Header>
          <Card.Title>Budget</Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            <Input
              label="Daily Spend Limit"
              type="number"
              value={dailySpendLimit}
              onChange={(e) => setDailySpendLimit(e.target.value)}
              placeholder="$0"
            />
          </div>
        </Card.Content>
      </Card>

      {/* Notifications Section */}
      <Card>
        <Card.Header>
          <Card.Title>Notifications</Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">Enable Notifications</p>
              <p className="text-gray-400 text-sm">Receive notifications for scouting, buying, and selling activities.</p>
            </div>
            <Toggle
              checked={notifications}
              onChange={setNotifications}
            />
          </div>
        </Card.Content>
      </Card>

      {/* Execution Mode Section */}
      <Card>
        <Card.Header>
          <Card.Title>Execution Mode</Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="space-y-4">
            <div
              className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                executionMode === 'auto'
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => setExecutionMode('auto')}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-medium">Auto</h4>
                  <p className="text-gray-400 text-sm">FastBreak automatically buys undervalued moments.</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 ${
                  executionMode === 'auto' ? 'border-blue-500 bg-blue-500' : 'border-gray-400'
                }`} />
              </div>
            </div>

            <div
              className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                executionMode === 'ask-first'
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => setExecutionMode('ask-first')}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-medium">Ask-first</h4>
                  <p className="text-gray-400 text-sm">FastBreak asks for confirmation before buying.</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 ${
                  executionMode === 'ask-first' ? 'border-blue-500 bg-blue-500' : 'border-gray-400'
                }`} />
              </div>
            </div>

            <div
              className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                executionMode === 'simulation'
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => setExecutionMode('simulation')}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-white font-medium">Simulation</h4>
                  <p className="text-gray-400 text-sm">FastBreak simulates buying without spending real funds.</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 ${
                  executionMode === 'simulation' ? 'border-blue-500 bg-blue-500' : 'border-gray-400'
                }`} />
              </div>
            </div>
          </div>
        </Card.Content>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button variant="primary" size="lg">
          Save Settings
        </Button>
      </div>
    </div>
  );
};

export default Settings;