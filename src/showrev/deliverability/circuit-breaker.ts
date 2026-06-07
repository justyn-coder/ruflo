export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  halfOpenMaxAttempts: number;
  resetTimeoutMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  halfOpenMaxAttempts: 3,
  resetTimeoutMs: 30 * 60 * 1000, // 30 minutes
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private halfOpenAttempts = 0;
  private lastFailureAt: number | null = null;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  canSend(): boolean {
    if (this.state === 'CLOSED') return true;

    if (this.state === 'OPEN') {
      if (this.lastFailureAt && Date.now() - this.lastFailureAt >= this.config.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
        return true;
      }
      return false;
    }

    // HALF_OPEN
    return this.halfOpenAttempts < this.config.halfOpenMaxAttempts;
  }

  recordResult(success: boolean): void {
    if (success) {
      this.successes++;
      if (this.state === 'HALF_OPEN') {
        this.halfOpenAttempts++;
        if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
          this.state = 'CLOSED';
          this.failures = 0;
          this.halfOpenAttempts = 0;
        }
      } else {
        this.failures = Math.max(0, this.failures - 1);
      }
    } else {
      this.failures++;
      this.lastFailureAt = Date.now();
      if (this.state === 'HALF_OPEN' || this.failures >= this.config.failureThreshold) {
        this.state = 'OPEN';
      }
    }
  }

  getState(): { state: CircuitState; failures: number; successes: number } {
    return { state: this.state, failures: this.failures, successes: this.successes };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureAt = null;
  }
}
