'use client';

import React, { useState } from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';

const Trades = () => {
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [timeframeFilter, setTimeframeFilter] = useState('all');

  const leaderboardData = [
    {
      id: '1',
      username: 'Alex Turner',
      roi: 15.2,
      topTrades: ['Trade 1', 'Trade 2'],
    },
    {
      id: '2',
      username: 'Jordan Carter',
      roi: 8.5,
      topTrades: ['Trade 3', 'Trade 4'],
    },
    {
      id: '3',
      username: 'Olivia Bennett',
      roi: 22.1,
      topTrades: ['Trade 5', 'Trade 6'],
    },
    {
      id: '4',
      username: 'Ethan Harper',
      roi: 5.3,
      topTrades: ['Trade 7', 'Trade 8'],
    },
    {
      id: '5',
      username: 'Sophia Evans',
      roi: 12.7,
      topTrades: ['Trade 9', 'Trade 10'],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Trades</h1>
          <p className="text-gray-400">Track your trade performance and strategy effectiveness.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex space-x-4">
        <div className="relative">
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none pr-8"
          >
            <option value="all">Strategy Type</option>
            <option value="rookie_risers">Rookie Risers</option>
            <option value="post_game_spikes">Post-Game Spikes</option>
            <option value="arbitrage_mode">Arbitrage Mode</option>
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="relative">
          <select
            value={timeframeFilter}
            onChange={(e) => setTimeframeFilter(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none pr-8"
          >
            <option value="all">Timeframe</option>
            <option value="1d">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Leaderboard */}
      <Card>
        <Card.Content>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-4 text-sm font-medium text-gray-400">Username</th>
                  <th className="text-left py-4 text-sm font-medium text-gray-400">ROI</th>
                  <th className="text-left py-4 text-sm font-medium text-gray-400">Top Trades</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardData.map((user, index) => (
                  <tr key={user.id} className="border-b border-gray-800">
                    <td className="py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-white">{index + 1}</span>
                        </div>
                        <span className="text-white font-medium">{user.username}</span>
                      </div>
                    </td>
                    <td className="py-4">
                      <span className={`font-medium ${user.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {user.roi >= 0 ? '+' : ''}{user.roi}%
                      </span>
                    </td>
                    <td className="py-4">
                      <div className="flex space-x-2">
                        {user.topTrades.map((trade, tradeIndex) => (
                          <span
                            key={tradeIndex}
                            className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300"
                          >
                            {trade}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
};

export default Trades;