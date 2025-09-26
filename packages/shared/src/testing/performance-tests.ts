import { performance } from 'perf_hooks';
import { createLogger } from '@fastbreak/monitoring';

const logger = createLogger({ serviceName: 'performance-tests' });

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  throughput: number;
  memoryUsage: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    delta: NodeJS.MemoryUsage;
  };
}

export interface LoadTestConfig {
  concurrency: number;
  duration: number; // seconds
  rampUpTime: number; // seconds
  targetRPS?: number; // requests per second
}

export interface LoadTestResult {
  config: LoadTestConfig;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  actualRPS: number;
  errorRate: number;
  errors: Array<{ error: string; count: number }>;
}

export class PerformanceTester {
  async benchmark<T>(
    name: string,
    fn: () => Promise<T> | T,
    iterations: number = 1000
  ): Promise<BenchmarkResult> {
    logger.info('Starting benchmark', { name, iterations });

    const times: number[] = [];
    const memoryBefore = process.memoryUsage();

    // Warm up
    for (let i = 0; i < Math.min(10, iterations); i++) {
      await fn();
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const startTime = performance.now();

    // Run benchmark
    for (let i = 0; i < iterations; i++) {
      const iterationStart = performance.now();
      await fn();
      const iterationEnd = performance.now();
      times.push(iterationEnd - iterationStart);
    }

    const endTime = performance.now();
    const memoryAfter = process.memoryUsage();

    const totalTime = endTime - startTime;
    const averageTime = totalTime / iterations;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const throughput = iterations / (totalTime / 1000); // operations per second

    const result: BenchmarkResult = {
      name,
      iterations,
      totalTime,
      averageTime,
      minTime,
      maxTime,
      throughput,
      memoryUsage: {
        before: memoryBefore,
        after: memoryAfter,
        delta: {
          rss: memoryAfter.rss - memoryBefore.rss,
          heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
          heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
          external: memoryAfter.external - memoryBefore.external,
          arrayBuffers: memoryAfter.arrayBuffers - memoryBefore.arrayBuffers
        }
      }
    };

    logger.info('Benchmark completed', {
      name,
      averageTime: averageTime.toFixed(2),
      throughput: throughput.toFixed(2),
      memoryDelta: result.memoryUsage.delta.heapUsed
    });

    return result;
  }

  async loadTest(
    name: string,
    requestFn: () => Promise<any>,
    config: LoadTestConfig
  ): Promise<LoadTestResult> {
    logger.info('Starting load test', { name, config });

    const results: Array<{ success: boolean; responseTime: number; error?: string }> = [];
    const startTime = Date.now();
    const endTime = startTime + (config.duration * 1000);
    
    let activeRequests = 0;
    let completedRequests = 0;
    const errorCounts = new Map<string, number>();

    // Calculate ramp-up rate
    const rampUpInterval = (config.rampUpTime * 1000) / config.concurrency;
    let currentConcurrency = 0;

    const executeRequest = async (): Promise<void> => {
      activeRequests++;
      const requestStart = performance.now();

      try {
        await requestFn();
        const responseTime = performance.now() - requestStart;
        results.push({ success: true, responseTime });
      } catch (error) {
        const responseTime = performance.now() - requestStart;
        const errorMessage = (error as Error).message;
        results.push({ success: false, responseTime, error: errorMessage });
        
        const currentCount = errorCounts.get(errorMessage) || 0;
        errorCounts.set(errorMessage, currentCount + 1);
      } finally {
        activeRequests--;
        completedRequests++;
      }
    };

    // Ramp up phase
    const rampUpPromise = new Promise<void>((resolve) => {
      const rampUpTimer = setInterval(() => {
        if (currentConcurrency < config.concurrency && Date.now() < endTime) {
          currentConcurrency++;
          
          // Start continuous requests for this worker
          const workerLoop = async () => {
            while (Date.now() < endTime) {
              if (config.targetRPS) {
                // Rate limiting
                const delay = (1000 / config.targetRPS) * config.concurrency;
                await this.sleep(delay);
              }
              
              executeRequest();
              
              // Small delay to prevent overwhelming
              await this.sleep(1);
            }
          };
          
          workerLoop();
        } else {
          clearInterval(rampUpTimer);
          resolve();
        }
      }, rampUpInterval);
    });

    await rampUpPromise;

    // Wait for test duration to complete
    while (Date.now() < endTime) {
      await this.sleep(100);
    }

    // Wait for all active requests to complete
    while (activeRequests > 0) {
      await this.sleep(10);
    }

    // Calculate results
    const totalRequests = results.length;
    const successfulRequests = results.filter(r => r.success).length;
    const failedRequests = totalRequests - successfulRequests;
    const responseTimes = results.map(r => r.responseTime);
    
    responseTimes.sort((a, b) => a - b);
    
    const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const minResponseTime = responseTimes[0] || 0;
    const maxResponseTime = responseTimes[responseTimes.length - 1] || 0;
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);
    const p95ResponseTime = responseTimes[p95Index] || 0;
    const p99ResponseTime = responseTimes[p99Index] || 0;
    
    const actualDuration = (Date.now() - startTime) / 1000;
    const actualRPS = totalRequests / actualDuration;
    const errorRate = failedRequests / totalRequests;

    const errors = Array.from(errorCounts.entries()).map(([error, count]) => ({
      error,
      count
    }));

    const result: LoadTestResult = {
      config,
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      minResponseTime,
      maxResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      actualRPS,
      errorRate,
      errors
    };

    logger.info('Load test completed', {
      name,
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: averageResponseTime.toFixed(2),
      actualRPS: actualRPS.toFixed(2),
      errorRate: (errorRate * 100).toFixed(2)
    });

    return result;
  }

  async memoryLeakTest<T>(
    name: string,
    fn: () => Promise<T> | T,
    iterations: number = 1000,
    checkInterval: number = 100
  ): Promise<{ leaked: boolean; memoryGrowth: number; samples: Array<{ iteration: number; heapUsed: number }> }> {
    logger.info('Starting memory leak test', { name, iterations, checkInterval });

    const samples: Array<{ iteration: number; heapUsed: number }> = [];
    let initialHeapUsed = 0;

    for (let i = 0; i < iterations; i++) {
      await fn();

      if (i % checkInterval === 0) {
        if (global.gc) {
          global.gc();
        }
        
        const memoryUsage = process.memoryUsage();
        
        if (i === 0) {
          initialHeapUsed = memoryUsage.heapUsed;
        }
        
        samples.push({
          iteration: i,
          heapUsed: memoryUsage.heapUsed
        });
      }
    }

    // Final garbage collection and measurement
    if (global.gc) {
      global.gc();
    }
    
    const finalMemoryUsage = process.memoryUsage();
    samples.push({
      iteration: iterations,
      heapUsed: finalMemoryUsage.heapUsed
    });

    const memoryGrowth = finalMemoryUsage.heapUsed - initialHeapUsed;
    const leaked = memoryGrowth > (initialHeapUsed * 0.1); // Consider 10% growth as potential leak

    logger.info('Memory leak test completed', {
      name,
      memoryGrowth,
      leaked,
      initialHeapUsed,
      finalHeapUsed: finalMemoryUsage.heapUsed
    });

    return {
      leaked,
      memoryGrowth,
      samples
    };
  }

  async profileFunction<T>(
    name: string,
    fn: () => Promise<T> | T,
    iterations: number = 100
  ): Promise<{
    name: string;
    totalTime: number;
    averageTime: number;
    samples: number[];
    percentiles: {
      p50: number;
      p90: number;
      p95: number;
      p99: number;
    };
  }> {
    logger.info('Starting function profiling', { name, iterations });

    const samples: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      samples.push(end - start);
    }

    samples.sort((a, b) => a - b);

    const totalTime = samples.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / iterations;

    const percentiles = {
      p50: samples[Math.floor(samples.length * 0.5)],
      p90: samples[Math.floor(samples.length * 0.9)],
      p95: samples[Math.floor(samples.length * 0.95)],
      p99: samples[Math.floor(samples.length * 0.99)]
    };

    const result = {
      name,
      totalTime,
      averageTime,
      samples,
      percentiles
    };

    logger.info('Function profiling completed', {
      name,
      averageTime: averageTime.toFixed(2),
      p95: percentiles.p95.toFixed(2),
      p99: percentiles.p99.toFixed(2)
    });

    return result;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility method to format benchmark results
  formatBenchmarkResult(result: BenchmarkResult): string {
    return `
Benchmark: ${result.name}
Iterations: ${result.iterations}
Total Time: ${result.totalTime.toFixed(2)}ms
Average Time: ${result.averageTime.toFixed(2)}ms
Min Time: ${result.minTime.toFixed(2)}ms
Max Time: ${result.maxTime.toFixed(2)}ms
Throughput: ${result.throughput.toFixed(2)} ops/sec
Memory Delta: ${(result.memoryUsage.delta.heapUsed / 1024 / 1024).toFixed(2)}MB
    `.trim();
  }

  // Utility method to format load test results
  formatLoadTestResult(result: LoadTestResult): string {
    return `
Load Test Results
Configuration:
  Concurrency: ${result.config.concurrency}
  Duration: ${result.config.duration}s
  Ramp-up Time: ${result.config.rampUpTime}s

Results:
  Total Requests: ${result.totalRequests}
  Successful: ${result.successfulRequests}
  Failed: ${result.failedRequests}
  Error Rate: ${(result.errorRate * 100).toFixed(2)}%
  
Response Times:
  Average: ${result.averageResponseTime.toFixed(2)}ms
  Min: ${result.minResponseTime.toFixed(2)}ms
  Max: ${result.maxResponseTime.toFixed(2)}ms
  95th Percentile: ${result.p95ResponseTime.toFixed(2)}ms
  99th Percentile: ${result.p99ResponseTime.toFixed(2)}ms
  
Throughput: ${result.actualRPS.toFixed(2)} RPS

${result.errors.length > 0 ? `
Errors:
${result.errors.map(e => `  ${e.error}: ${e.count}`).join('\n')}
` : 'No errors'}
    `.trim();
  }
}