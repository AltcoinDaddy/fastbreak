'use client';

import React from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Strategy Templates</h1>
        <p className="text-gray-400">Choose from pre-built trading strategies or create your own</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="hover:border-gray-600 transition-colors">
          <Card.Content>
            <div className="space-y-4">
              <div className="w-16 h-16 bg-teal-500 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🏀</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Rookie Risers - Basic</h3>
                <p className="text-gray-400 text-sm">Identifies promising rookie players with strong early performance indicators and growth potential.</p>
              </div>
              <div className="flex space-x-2">
                <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">Beginner</span>
                <span className="px-2 py-1 bg-yellow-600 text-white text-xs rounded">Medium Risk</span>
              </div>
              <Button variant="primary" className="w-full">
                Use Template
              </Button>
            </div>
          </Card.Content>
        </Card>

        <Card className="hover:border-gray-600 transition-colors">
          <Card.Content>
            <div className="space-y-4">
              <div className="w-16 h-16 bg-orange-500 rounded-lg flex items-center justify-center">
                <span className="text-2xl">🔥</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Post-Game Spikes - Aggressive</h3>
                <p className="text-gray-400 text-sm">Capitalizes on immediate price movements following exceptional game performances.</p>
              </div>
              <div className="flex space-x-2">
                <span className="px-2 py-1 bg-purple-600 text-white text-xs rounded">Intermediate</span>
                <span className="px-2 py-1 bg-red-600 text-white text-xs rounded">High Risk</span>
              </div>
              <Button variant="primary" className="w-full">
                Use Template
              </Button>
            </div>
          </Card.Content>
        </Card>

        <Card className="hover:border-gray-600 transition-colors">
          <Card.Content>
            <div className="space-y-4">
              <div className="w-16 h-16 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-2xl">⚡</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Arbitrage - Conservative</h3>
                <p className="text-gray-400 text-sm">Low-risk arbitrage opportunities across multiple marketplaces with strict safety controls.</p>
              </div>
              <div className="flex space-x-2">
                <span className="px-2 py-1 bg-orange-600 text-white text-xs rounded">Advanced</span>
                <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">Low Risk</span>
              </div>
              <Button variant="primary" className="w-full">
                Use Template
              </Button>
            </div>
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}