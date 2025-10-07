'use client';

import React from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';

const Strategies = () => {
  const prebuiltStrategies = [
    {
      id: 'rookie-risers',
      title: 'Rookie Risers',
      description: 'Focuses on acquiring moments of rising rookie players before their prices surge.',
      color: 'bg-teal-500',
      illustration: '🏀',
    },
    {
      id: 'post-game-spikes',
      title: 'Post-Game Spikes',
      description: 'Targets moments of players who had exceptional performances in recent games.',
      color: 'bg-orange-500',
      illustration: '🔥',
    },
    {
      id: 'arbitrage-mode',
      title: 'Arbitrage Mode',
      description: 'Identifies and exploits price discrepancies of moments across different marketplaces.',
      color: 'bg-blue-500',
      illustration: '⚡',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Strategies</h1>
        <p className="text-gray-400">Automated strategies to help you find and buy undervalued moments.</p>
      </div>

      {/* Prebuilt Strategies */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Prebuilt Strategies</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {prebuiltStrategies.map((strategy) => (
            <Card key={strategy.id} className="hover:border-gray-600 transition-colors cursor-pointer">
              <Card.Content>
                <div className="space-y-4">
                  <div className={`w-16 h-16 ${strategy.color} rounded-lg flex items-center justify-center`}>
                    <span className="text-2xl">{strategy.illustration}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">{strategy.title}</h3>
                    <p className="text-gray-400 text-sm">{strategy.description}</p>
                  </div>
                  <Button variant="outline" className="w-full">
                    Configure Strategy
                  </Button>
                </div>
              </Card.Content>
            </Card>
          ))}
        </div>
      </div>

      {/* Custom Strategies */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Custom Strategies</h2>
        <Card className="border-dashed border-gray-600">
          <Card.Content className="text-center py-12">
            <div className="space-y-4">
              <div className="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center mx-auto">
                <span className="text-2xl">➕</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Create your first strategy</h3>
                <p className="text-gray-400 text-sm mb-4">
                  Build a custom strategy to target specific players, teams, or game conditions.
                </p>
                <Button variant="primary">
                  New Strategy
                </Button>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
};

export default Strategies;