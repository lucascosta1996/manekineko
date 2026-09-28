/** Shared across factory profiles in one runtime. Leave headroom below the
 * provider's 50 requests/second for the separate metadata job and other reads.
 * Count JSON-RPC methods, not HTTP batches; idle time never earns burst credit. */
export class RpcPacer {
  private queue: Promise<void> = Promise.resolve();
  private nextAt = 0;
  private readonly now: () => number;
  private readonly wait: (ms: number) => Promise<void>;
  constructor(
    now = () => performance.now(),
    wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  ) { this.now = now; this.wait = wait; }
  acquire(count: number): Promise<void> {
    if (!Number.isInteger(count) || count < 1 || count > 10) return Promise.reject(new Error('invalid_rpc_batch_size'));
    const turn = this.queue.then(async () => {
      while (this.now() < this.nextAt) await this.wait(this.nextAt - this.now());
      this.nextAt = this.now() + count * 75;
    });
    this.queue = turn.catch(() => {});
    return turn;
  }
}
export const indexerRpcPacer = new RpcPacer();
