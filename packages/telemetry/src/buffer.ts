import type { TelemetryEvent } from './types'
import type { Transport } from './transport'

export interface BufferConfig {
  transport: Transport
  /** Flush when buffer hits this many events. Default 20. */
  maxBatchSize?: number
  /** Or flush every N ms. Default 5000. */
  flushIntervalMs?: number
  /** Called when transport.send throws — return true to drop, false to retry once. */
  onSendError?: (err: unknown, batch: TelemetryEvent[]) => boolean
}

export class EventBuffer {
  private events: TelemetryEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly maxBatchSize: number
  private readonly flushIntervalMs: number
  private readonly transport: Transport
  private readonly onSendError?: BufferConfig['onSendError']

  constructor(config: BufferConfig) {
    this.transport = config.transport
    this.maxBatchSize = config.maxBatchSize ?? 20
    this.flushIntervalMs = config.flushIntervalMs ?? 5000
    this.onSendError = config.onSendError
  }

  enqueue(event: TelemetryEvent): void {
    this.events.push(event)
    if (this.events.length >= this.maxBatchSize) {
      void this.flush()
    } else if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => void this.flush(), this.flushIntervalMs)
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.events.length === 0) return
    const batch = this.events.splice(0)
    try {
      await this.transport.send(batch)
    } catch (err) {
      const drop = this.onSendError ? this.onSendError(err, batch) : true
      if (!drop) {
        // single retry
        try {
          await this.transport.send(batch)
        } catch {
          // give up — could optionally re-buffer + escalate, kept simple here
        }
      }
    }
  }
}
