import { createLogger } from '@fastbreak/monitoring';

const logger = createLogger({ serviceName: 'request-batcher' });

export interface BatchConfig {
  maxBatchSize: number;
  maxWaitTime: number; // milliseconds
  maxConcurrentBatches: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface BatchRequest<T, R> {
  id: string;
  data: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export interface BatchProcessor<T, R> {
  process: (requests: T[]) => Promise<R[]>;
  getKey?: (request: T) => string; // For deduplication
}

export class RequestBatcher<T, R> {
  private config: BatchConfig;
  private processor: BatchProcessor<T, R>;
  private pendingRequests: Map<string, BatchRequest<T, R>> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private activeBatches = 0;
  private requestCounter = 0;

  constructor(config: BatchConfig, processor: BatchProcessor<T, R>) {
    this.config = config;
    this.processor = processor;
  }

  async add(data: T): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const id = this.generateRequestId();
      const request: BatchRequest<T, R> = {
        id,
        data,
        resolve,
        reject,
        timestamp: Date.now()
      };

      // Check for deduplication
      if (this.processor.getKey) {
        const key = this.processor.getKey(data);
        const existing = Array.from(this.pendingRequests.values())
          .find(req => this.processor.getKey!(req.data) === key);
        
        if (existing) {
          logger.debug('Deduplicating request', { key, originalId: existing.id, newId: id });
          // Attach to existing request
          const originalResolve = existing.resolve;
          existing.resolve = (result: R) => {
            originalResolve(result);
            resolve(result);
          };
          const originalReject = existing.reject;
          existing.reject = (error: Error) => {
            originalReject(error);
            reject(error);
          };
          return;
        }
      }

      this.pendingRequests.set(id, request);

      // Check if we should process immediately
      if (this.pendingRequests.size >= this.config.maxBatchSize) {
        this.processBatch();
      } else if (!this.batchTimer) {
        // Start timer for batch processing
        this.batchTimer = setTimeout(() => {
          this.processBatch();
        }, this.config.maxWaitTime);
      }
    });
  }

  private async processBatch(): Promise<void> {
    if (this.pendingRequests.size === 0) {
      return;
    }

    // Check concurrent batch limit
    if (this.activeBatches >= this.config.maxConcurrentBatches) {
      logger.debug('Max concurrent batches reached, delaying batch processing');
      setTimeout(() => this.processBatch(), 100);
      return;
    }

    // Clear the timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Extract requests to process
    const requestsToProcess = Array.from(this.pendingRequests.values());
    const batchSize = Math.min(requestsToProcess.length, this.config.maxBatchSize);
    const batch = requestsToProcess.slice(0, batchSize);

    // Remove processed requests from pending
    batch.forEach(req => this.pendingRequests.delete(req.id));

    // If there are remaining requests, schedule next batch
    if (this.pendingRequests.size > 0) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.config.maxWaitTime);
    }

    this.activeBatches++;

    try {
      logger.debug('Processing batch', { 
        batchSize: batch.length, 
        activeBatches: this.activeBatches,
        pendingRequests: this.pendingRequests.size
      });

      const startTime = Date.now();
      const results = await this.processWithRetry(batch.map(req => req.data));
      const duration = Date.now() - startTime;

      logger.info('Batch processed successfully', {
        batchSize: batch.length,
        duration_ms: duration,
        throughput: batch.length / (duration / 1000)
      });

      // Resolve all requests in the batch
      batch.forEach((request, index) => {
        if (results[index] !== undefined) {
          request.resolve(results[index]);
        } else {
          request.reject(new Error('No result returned for request'));
        }
      });

    } catch (error) {
      logger.error('Batch processing failed', { 
        batchSize: batch.length, 
        error: (error as Error).message 
      });

      // Reject all requests in the batch
      batch.forEach(request => {
        request.reject(error as Error);
      });
    } finally {
      this.activeBatches--;
    }
  }

  private async processWithRetry(requests: T[]): Promise<R[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await this.processor.process(requests);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelay * Math.pow(2, attempt); // Exponential backoff
          logger.warn('Batch processing failed, retrying', {
            attempt: attempt + 1,
            maxAttempts: this.config.retryAttempts + 1,
            delay_ms: delay,
            error: lastError.message
          });
          
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestCounter}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility methods
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  getActiveBatchCount(): number {
    return this.activeBatches;
  }

  async flush(): Promise<void> {
    if (this.pendingRequests.size > 0) {
      await this.processBatch();
    }
  }

  async shutdown(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Process any remaining requests
    await this.flush();

    // Wait for active batches to complete
    while (this.activeBatches > 0) {
      await this.sleep(100);
    }
  }

  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      activeBatches: this.activeBatches,
      totalRequests: this.requestCounter
    };
  }
}