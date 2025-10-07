'use client';

import React from 'react';
import Card from '../ui/Card';
import Button from '../ui/Button';

interface MomentDetailsProps {
  momentId?: string;
}

const MomentDetails: React.FC<MomentDetailsProps> = ({ momentId }) => {
  // Mock data - in real app this would be fetched based on momentId
  const moment = {
    id: momentId || 'lebron-james-dunk-123',
    playerName: 'LeBron James',
    team: 'Los Angeles Lakers',
    jersey: '#23',
    position: 'Small Forward',
    series: 'Series 3',
    rarity: 'Common',
    mintCount: '10000+ minted',
    currentPrice: 15.00,
    floorPrice: 12.00,
    aiScore: 95,
    image: '👑', // In real app, this would be an actual image URL
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-sm text-gray-400">
        <span>Moments</span>
        <span>/</span>
        <span className="text-white">Moment Details</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">{moment.playerName}</h1>
        <p className="text-gray-400">{moment.team} | {moment.jersey} | {moment.position}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Moment Image and Details */}
        <div className="space-y-6">
          {/* Moment Image */}
          <Card>
            <Card.Content>
              <div className="aspect-square bg-gradient-to-br from-purple-900 to-blue-900 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="text-8xl mb-4">{moment.image}</div>
                  <div className="text-white">
                    <h3 className="text-xl font-bold">{moment.playerName}</h3>
                    <p className="text-gray-300">{moment.team} | {moment.jersey} | {moment.position}</p>
                    <p className="text-gray-400 mt-2">{moment.series} | {moment.rarity} | {moment.mintCount}</p>
                  </div>
                </div>
              </div>
            </Card.Content>
          </Card>
        </div>

        {/* Right Column - Buy/Sell Data and Reasoning */}
        <div className="space-y-6">
          {/* Buy/Sell Data */}
          <Card>
            <Card.Header>
              <Card.Title>Buy/Sell Data</Card.Title>
            </Card.Header>
            <Card.Content>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Current Price</span>
                  <span className="text-white font-semibold">${moment.currentPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Floor Price</span>
                  <span className="text-white font-semibold">${moment.floorPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">AI Score</span>
                  <span className="text-white font-semibold">{moment.aiScore}</span>
                </div>
              </div>
            </Card.Content>
          </Card>

          {/* Reasoning Summary */}
          <Card>
            <Card.Header>
              <Card.Title>Reasoning Summary</Card.Title>
            </Card.Header>
            <Card.Content>
              <div className="space-y-4">
                <p className="text-gray-300">
                  Our AI model identifies this moment as undervalued based on recent performance, market trends, and player statistics.
                  The AI score of {moment.aiScore} indicates a strong buy signal.
                </p>
                <Button variant="outline" className="w-full">
                  View on Flow Explorer
                </Button>
              </div>
            </Card.Content>
          </Card>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <Button variant="primary" size="lg" className="w-full">
              Buy Now
            </Button>
            <Button variant="outline" size="lg" className="w-full">
              Add to Watchlist
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MomentDetails;