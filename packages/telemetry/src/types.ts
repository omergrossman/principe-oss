// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Three event categories that travel through the same pipe:
 *   - 'business' — purchase, churn, plan-upgrade, usage-meter (the things
 *     that drive portfolio decisions)
 *   - 'engineering' — error, latency, deploy-marker, http-request (the
 *     things on-call cares about)
 *   - 'product' — feature-used, onboarding-step, session-start (the
 *     things product/design cares about)
 *
 * Schema is intentionally loose at the package layer — each project's
 * manifest declares the event names + payload shapes it emits. Schema
 * validation happens at the ingest endpoint, not in the SDK.
 */
export type EventCategory = 'business' | 'engineering' | 'product'

export interface TelemetryEvent {
  /** Stable event name, e.g., "customer.purchased", "http.5xx", "feature.tour.completed". */
  name: string
  category: EventCategory
  /** When the event happened (unix ms). Defaulted to Date.now() by track(). */
  timestamp: number
  /** Tenant attribution (which customer of which project). */
  tenantId?: string
  /** User attribution (which person — within the tenant). */
  userId?: string
  /** Session attribution. */
  sessionId?: string
  /** Project identifier — set once per TelemetryClient instance. */
  projectId: string
  /** Free-form attributes. Schema enforced at ingest, not here. */
  properties?: Record<string, unknown>
}

/** Identify call — attaches user-level metadata to subsequent events. */
export interface IdentifyTraits {
  userId: string
  tenantId?: string
  email?: string
  name?: string
  role?: string
  /** Additional custom traits. */
  [key: string]: unknown
}

/** Page call — for product-side route/page tracking. */
export interface PageContext {
  path: string
  title?: string
  referrer?: string
  tenantId?: string
  userId?: string
}
