import { PerformanceTester } from './performance-tests';
import { FastBreakCache } from '../cache/fastbreak-cache';
import { nbaStatsBatcher, topShotBatcher } from '../batching/api-batchers';
import Redis from 'ioredis';

export class FastBreakBenchmarks {
  private tester: PerformanceTester;
  private cache: FastBreakCache;
  private redis: Redis;

  constructor() {
    this.tester = new PerformanceTester();
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });
    this.cache = new FastBreakCache(this.redis);
  }

  async runAllBenchmarks() {
    console.log('🚀 Starting FastBreak Performance Benchmarks\n');

    const results = {
      cache: await this.runCacheBenchmarks(),
      batching: await this.runBatchingBenchmarks(),
      database: await this.runDatabaseBenchmarks(),
      ai: await this.runAIBenchmarks(),
      api: await this.runAPIBenchmarks()
    };

    console.log('\n📊 Benchmark Summary:');
    this.printSummary(results);

    return results;
  }

  async runCacheBenchmarks() {
    console.log('🗄️  Running Cache Benchmarks...\n');

    // Cache write performance
    const cacheWriteResult = await this.tester.benchmark(
      'Cache Write Operations',
      async () => {
        const key = `test_key_${Math.random()}`;
        const data = { id: Math.random(), data: 'test data', timestamp: Date.now() };
        await this.cache.cacheMomentDetails(key, data);
      },
      1000
    );
    console.log(this.tester.formatBenchmarkResult(cacheWriteResult));

    // Cache read performance
    await this.cache.cacheMomentDetails('benchmark_key', { id: 1, data: 'benchmark data' });
    const cacheReadResult = await this.tester.benchmark(
      'Cache Read Operations',
      async () => {
        await this.cache.getMomentDetails('benchmark_key');
      },
      1000
    );
    console.log(this.tester.formatBenchmarkResult(cacheReadResult));

    // Multi-level cache performance
    const multiLevelResult = await this.tester.benchmark(
      'Multi-level Cache Operations',
      async () => {
        const key = `ml_test_${Math.random()}`;
        const data = { id: Math.random(), complex: { nested: { data: 'test' } } };
        await this.cache.cacheMomentDetails(key, data);
        await this.cache.getMomentDetails(key);
      },
      500
    );
    console.log(this.tester.formatBenchmarkResult(multiLevelResult));

    // Cache memory leak test
    const memoryLeakResult = await this.tester.memoryLeakTest(
      'Cache Memory Leak Test',
      async () => {
        const key = `leak_test_${Math.random()}`;
        const data = { id: Math.random(), data: new Array(1000).fill('test') };
        await this.cache.cacheMomentDetails(key, data);
        await this.cache.getMomentDetails(key);
      },
      1000,
      100
    );

    console.log(`Memory Leak Test: ${memoryLeakResult.leaked ? '❌ LEAKED' : '✅ NO LEAK'}`);
    console.log(`Memory Growth: ${(memoryLeakResult.memoryGrowth / 1024 / 1024).toFixed(2)}MB\n`);

    return {
      write: cacheWriteResult,
      read: cacheReadResult,
      multiLevel: multiLevelResult,
      memoryLeak: memoryLeakResult
    };
  }

  async runBatchingBenchmarks() {
    console.log('📦 Running Batching Benchmarks...\n');

    // NBA Stats batching performance
    const nbaStatsResult = await this.tester.benchmark(
      'NBA Stats Batching',
      async () => {
        const playerId = `player_${Math.floor(Math.random() * 1000)}`;
        await nbaStatsBatcher.getPlayerStats(playerId);
      },
      100
    );
    console.log(this.tester.formatBenchmarkResult(nbaStatsResult));

    // Top Shot batching performance
    const topShotResult = await this.tester.benchmark(
      'Top Shot API Batching',
      async () => {
        const momentId = `moment_${Math.floor(Math.random() * 10000)}`;
        await topShotBatcher.getMomentDetails(momentId);
      },
      100
    );
    console.log(this.tester.formatBenchmarkResult(topShotResult));

    // Concurrent batching load test
    const concurrentBatchingResult = await this.tester.loadTest(
      'Concurrent Batching Load Test',
      async () => {
        const playerId = `player_${Math.floor(Math.random() * 100)}`;
        await nbaStatsBatcher.getPlayerStats(playerId);
      },
      {
        concurrency: 50,
        duration: 30,
        rampUpTime: 5
      }
    );
    console.log(this.tester.formatLoadTestResult(concurrentBatchingResult));

    return {
      nbaStats: nbaStatsResult,
      topShot: topShotResult,
      concurrent: concurrentBatchingResult
    };
  }

  async runDatabaseBenchmarks() {
    console.log('🗃️  Running Database Benchmarks...\n');

    // Simulate database operations
    const dbReadResult = await this.tester.benchmark(
      'Database Read Operations',
      async () => {
        // Simulate database read with delay
        await this.simulateDbOperation(5, 15);
      },
      200
    );
    console.log(this.tester.formatBenchmarkResult(dbReadResult));

    const dbWriteResult = await this.tester.benchmark(
      'Database Write Operations',
      async () => {
        // Simulate database write with delay
        await this.simulateDbOperation(10, 25);
      },
      200
    );
    console.log(this.tester.formatBenchmarkResult(dbWriteResult));

    // Database connection pool simulation
    const connectionPoolResult = await this.tester.loadTest(
      'Database Connection Pool Load Test',
      async () => {
        await this.simulateDbOperation(5, 20);
      },
      {
        concurrency: 20,
        duration: 30,
        rampUpTime: 5
      }
    );
    console.log(this.tester.formatLoadTestResult(connectionPoolResult));

    return {
      read: dbReadResult,
      write: dbWriteResult,
      connectionPool: connectionPoolResult
    };
  }

  async runAIBenchmarks() {
    console.log('🤖 Running AI Analysis Benchmarks...\n');

    // AI analysis simulation
    const aiAnalysisResult = await this.tester.benchmark(
      'AI Moment Analysis',
      async () => {
        await this.simulateAIAnalysis();
      },
      50
    );
    console.log(this.tester.formatBenchmarkResult(aiAnalysisResult));

    // AI batch processing
    const aiBatchResult = await this.tester.benchmark(
      'AI Batch Processing',
      async () => {
        const batch = Array.from({ length: 10 }, () => ({
          momentId: `moment_${Math.random()}`,
          playerStats: { points: Math.random() * 50, rebounds: Math.random() * 20 }
        }));
        await this.simulateAIBatchProcessing(batch);
      },
      20
    );
    console.log(this.tester.formatBenchmarkResult(aiBatchResult));

    // AI load test
    const aiLoadResult = await this.tester.loadTest(
      'AI Analysis Load Test',
      async () => {
        await this.simulateAIAnalysis();
      },
      {
        concurrency: 10,
        duration: 30,
        rampUpTime: 5
      }
    );
    console.log(this.tester.formatLoadTestResult(aiLoadResult));

    return {
      analysis: aiAnalysisResult,
      batch: aiBatchResult,
      load: aiLoadResult
    };
  }

  async runAPIBenchmarks() {
    console.log('🌐 Running API Benchmarks...\n');

    // API response time simulation
    const apiResponseResult = await this.tester.benchmark(
      'API Response Time',
      async () => {
        await this.simulateAPICall();
      },
      500
    );
    console.log(this.tester.formatBenchmarkResult(apiResponseResult));

    // API throughput test
    const apiThroughputResult = await this.tester.loadTest(
      'API Throughput Test',
      async () => {
        await this.simulateAPICall();
      },
      {
        concurrency: 100,
        duration: 60,
        rampUpTime: 10,
        targetRPS: 1000
      }
    );
    console.log(this.tester.formatLoadTestResult(apiThroughputResult));

    // API error handling
    const apiErrorResult = await this.tester.loadTest(
      'API Error Handling Test',
      async () => {
        if (Math.random() < 0.1) { // 10% error rate
          throw new Error('Simulated API error');
        }
        await this.simulateAPICall();
      },
      {
        concurrency: 50,
        duration: 30,
        rampUpTime: 5
      }
    );
    console.log(this.tester.formatLoadTestResult(apiErrorResult));

    return {
      response: apiResponseResult,
      throughput: apiThroughputResult,
      errorHandling: apiErrorResult
    };
  }

  // Simulation helpers
  private async simulateDbOperation(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    await this.sleep(delay);
  }

  private async simulateAIAnalysis(): Promise<any> {
    // Simulate CPU-intensive AI analysis
    const delay = Math.random() * 200 + 100; // 100-300ms
    await this.sleep(delay);
    
    // Simulate some computation
    let result = 0;
    for (let i = 0; i < 10000; i++) {
      result += Math.random();
    }
    
    return {
      fairValue: Math.random() * 1000,
      confidence: Math.random(),
      factors: ['performance', 'scarcity', 'market_trend'],
      computation: result
    };
  }

  private async simulateAIBatchProcessing(batch: any[]): Promise<any[]> {
    const delay = batch.length * 20; // 20ms per item
    await this.sleep(delay);
    
    return batch.map(item => ({
      ...item,
      analysis: {
        fairValue: Math.random() * 1000,
        confidence: Math.random()
      }
    }));
  }

  private async simulateAPICall(): Promise<any> {
    const delay = Math.random() * 50 + 10; // 10-60ms
    await this.sleep(delay);
    
    return {
      status: 'success',
      data: { id: Math.random(), timestamp: Date.now() }
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private printSummary(results: any) {
    console.log('\n=== PERFORMANCE SUMMARY ===');
    
    // Cache performance
    console.log(`\n🗄️  Cache Performance:`);
    console.log(`   Write: ${results.cache.write.throughput.toFixed(0)} ops/sec`);
    console.log(`   Read: ${results.cache.read.throughput.toFixed(0)} ops/sec`);
    console.log(`   Memory Leak: ${results.cache.memoryLeak.leaked ? '❌' : '✅'}`);
    
    // Batching performance
    console.log(`\n📦 Batching Performance:`);
    console.log(`   NBA Stats: ${results.batching.nbaStats.throughput.toFixed(0)} ops/sec`);
    console.log(`   Top Shot: ${results.batching.topShot.throughput.toFixed(0)} ops/sec`);
    console.log(`   Concurrent RPS: ${results.batching.concurrent.actualRPS.toFixed(0)}`);
    
    // Database performance
    console.log(`\n🗃️  Database Performance:`);
    console.log(`   Read: ${results.database.read.throughput.toFixed(0)} ops/sec`);
    console.log(`   Write: ${results.database.write.throughput.toFixed(0)} ops/sec`);
    console.log(`   Pool RPS: ${results.database.connectionPool.actualRPS.toFixed(0)}`);
    
    // AI performance
    console.log(`\n🤖 AI Performance:`);
    console.log(`   Analysis: ${results.ai.analysis.throughput.toFixed(0)} ops/sec`);
    console.log(`   Batch: ${results.ai.batch.throughput.toFixed(0)} ops/sec`);
    console.log(`   Load RPS: ${results.ai.load.actualRPS.toFixed(0)}`);
    
    // API performance
    console.log(`\n🌐 API Performance:`);
    console.log(`   Response: ${results.api.response.averageTime.toFixed(0)}ms avg`);
    console.log(`   Throughput: ${results.api.throughput.actualRPS.toFixed(0)} RPS`);
    console.log(`   Error Rate: ${(results.api.errorHandling.errorRate * 100).toFixed(1)}%`);
    
    console.log('\n=== END SUMMARY ===\n');
  }

  async cleanup() {
    await this.redis.quit();
  }
}

// Export a function to run benchmarks from command line
export async function runBenchmarks() {
  const benchmarks = new FastBreakBenchmarks();
  
  try {
    await benchmarks.runAllBenchmarks();
  } finally {
    await benchmarks.cleanup();
  }
}

// Allow running directly
if (require.main === module) {
  runBenchmarks().catch(console.error);
}