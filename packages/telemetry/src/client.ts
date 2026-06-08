// SPDX-License-Identifier: AGPL-3.0-or-later
import type { EventCategory, IdentifyTraits, PageContext, TelemetryEvent } from './types'
import type { Transport } from './transport'
import { EventBuffer, type BufferConfig } from './buffer'

export interface TelemetryClientConfig {
  /** Stable project identifier, e.g., "fable" / "product-2". */
  projectId: string
  /** Transport (Http/Noop/etc). */
  transport: Transport
  /** Default tenantId if every event is scoped to one tenant (rare; usually set per-event). */
  defaultTenantId?: string
  /** Optional override of buffer defaults. */
  buffer?: Omit<BufferConfig, 'transport'>
}

export class TelemetryClient {
  private readonly projectId: string
  private readonly buffer: EventBuffer
  private readonly defaultTenantId?: string
  private currentUser: { userId: string; tenantId?: string } | null = null

  constructor(config: TelemetryClientConfig) {
    this.projectId = config.projectId
    this.defaultTenantId = config.defaultTenantId
    this.buffer = new EventBuffer({
      transport: config.transport,
      ...config.buffer,
    })
  }

  /** Attach a user identity to subsequent events. */
  identify(traits: IdentifyTraits): void {
    this.currentUser = { userId: traits.userId, tenantId: traits.tenantId }
    this.track({
      name: 'identify',
      category: 'product',
      properties: { ...traits },
    })
  }

  /** Track an event. */
  track(input: {
    name: string
    category: EventCategory
    tenantId?: string
    userId?: string
    sessionId?: string
    properties?: Record<string, unknown>
    timestamp?: number
  }): void {
    const event: TelemetryEvent = {
      name: input.name,
      category: input.category,
      timestamp: input.timestamp ?? Date.now(),
      tenantId: input.tenantId ?? this.currentUser?.tenantId ?? this.defaultTenantId,
      userId: input.userId ?? this.currentUser?.userId,
      sessionId: input.sessionId,
      projectId: this.projectId,
      properties: input.properties,
    }
    this.buffer.enqueue(event)
  }

  /** Shortcut for product/page events. */
  page(ctx: PageContext): void {
    this.track({
      name: 'page.viewed',
      category: 'product',
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      properties: { path: ctx.path, title: ctx.title, referrer: ctx.referrer },
    })
  }

  /** Force flush — call before route changes or page-unload if needed. */
  async flush(): Promise<void> {
    await this.buffer.flush()
  }
}
