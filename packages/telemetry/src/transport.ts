// SPDX-License-Identifier: AGPL-3.0-or-later
import type { TelemetryEvent } from './types'

/**
 * A transport sends a batch of events to wherever they ultimately live.
 * The package ships two: HttpTransport (POSTs to a configured ingest
 * URL — typically the project's own /api/dp/telemetry/ingest route) and
 * NoopTransport (drops everything; useful for tests + dev).
 *
 * Phase 2 will add ClickHouseTransport that talks to ClickHouse Cloud
 * directly (skipping the API route hop, since each project runs its
 * own ClickHouse per the per-project isolation rule).
 */
export interface Transport {
  send(batch: TelemetryEvent[]): Promise<void>
}

export class NoopTransport implements Transport {
  async send(): Promise<void> { /* drop */ }
}

export interface HttpTransportConfig {
  url: string
  headers?: Record<string, string>
  /** Optional fetch implementation (testing override). Defaults to global fetch. */
  fetch?: typeof globalThis.fetch
}

export class HttpTransport implements Transport {
  constructor(private config: HttpTransportConfig) {}
  async send(batch: TelemetryEvent[]): Promise<void> {
    const fetchImpl = this.config.fetch ?? globalThis.fetch
    const res = await fetchImpl(this.config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.config.headers },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    })
    if (!res.ok) {
      throw new Error(`[@dp/telemetry] transport responded ${res.status}`)
    }
  }
}
