"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

// Sprint 4 — admin form for handcrafted vendor cards. Submits to
// /api/admin/knowledge/vendor-card. The distiller picks this up via
// fireAndForgetDistill and produces a structured vendor card.
//
// Content owner: Omer (per Sprint 4 strategy session). 20 cards × ~30
// min each fills the V1 starter pack.

const VENDOR_CATEGORIES = [
  "EDR",
  "EPP",
  "XDR",
  "SIEM",
  "SOAR",
  "CNAPP",
  "CSPM",
  "CWPP",
  "CIEM",
  "DSPM",
  "IAM",
  "PAM",
  "Identity Governance",
  "SASE",
  "ZTNA",
  "AppSec",
  "API security",
  "Vuln management",
  "Email security",
  "Data security",
  "GRC",
  "Other",
] as const;

export function VendorCardForm({ onCreated }: { onCreated?: () => void }) {
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState<string>("EDR");
  const [capabilities, setCapabilities] = useState("");
  const [pricingTier, setPricingTier] = useState("");
  const [integrations, setIntegrations] = useState("");
  const [marketPosition, setMarketPosition] = useState("");
  const [primaryCritique, setPrimaryCritique] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function reset() {
    setProductName("");
    setCapabilities("");
    setPricingTier("");
    setIntegrations("");
    setMarketPosition("");
    setPrimaryCritique("");
    setAlternatives("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!productName.trim()) {
      setError("Product name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/knowledge/vendor-card", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productName: productName.trim(),
          category,
          capabilities: splitList(capabilities),
          pricingTier: pricingTier.trim() || undefined,
          integrations: splitList(integrations),
          marketPosition: marketPosition.trim() || undefined,
          primaryCritique: primaryCritique.trim() || undefined,
          alternativesToConsider: splitList(alternatives),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSuccess(`Added "${data.source.title}". Distillation queued.`);
      reset();
      onCreated?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-ink-100 rounded-md p-4 bg-elevated"
    >
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[13px] font-semibold text-ink-900">Add a vendor card</p>
        <p className="text-[11px] text-ink-300 font-mono">
          handcrafted · stored as KnowledgeSource (kind=VENDOR_CARD)
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 mb-3">
        <input
          required
          type="text"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="CrowdStrike Falcon"
          className="h-9 px-3 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 px-2 rounded-md border border-ink-100 bg-canvas text-[12px] text-ink-700 font-mono"
        >
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <textarea
        value={capabilities}
        onChange={(e) => setCapabilities(e.target.value)}
        placeholder="Capabilities (one per line) — e.g.&#10;Endpoint detection &amp; response&#10;Threat hunting&#10;Identity protection"
        rows={3}
        className="w-full px-3 py-2 mb-2 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 resize-y"
      />

      <input
        type="text"
        value={pricingTier}
        onChange={(e) => setPricingTier(e.target.value)}
        placeholder="Pricing tier — e.g. Premium · Enterprise ARR $250K+"
        className="w-full h-9 px-3 mb-2 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
      />

      <textarea
        value={integrations}
        onChange={(e) => setIntegrations(e.target.value)}
        placeholder="Integrations (one per line) — e.g.&#10;Splunk&#10;Okta&#10;ServiceNow"
        rows={2}
        className="w-full px-3 py-2 mb-2 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 resize-y"
      />

      <input
        type="text"
        value={marketPosition}
        onChange={(e) => setMarketPosition(e.target.value)}
        placeholder="Market position — e.g. Leader in Gartner MQ 2025 for EPP/EDR"
        className="w-full h-9 px-3 mb-2 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
      />

      <textarea
        value={primaryCritique}
        onChange={(e) => setPrimaryCritique(e.target.value)}
        placeholder="Primary critique — the honest weakness CISOs raise"
        rows={2}
        className="w-full px-3 py-2 mb-2 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 resize-y"
      />

      <textarea
        value={alternatives}
        onChange={(e) => setAlternatives(e.target.value)}
        placeholder="Alternatives to consider (one per line)"
        rows={2}
        className="w-full px-3 py-2 mb-3 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20 resize-y"
      />

      {error && (
        <p role="alert" className="mt-2 text-[12px] text-verdict-fail bg-verdict-fail/10 px-2 py-1 rounded mb-2">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-2 text-[12px] text-verdict-pass bg-verdict-pass/10 px-2 py-1 rounded font-mono mb-2">
          {success}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink-300 leading-relaxed">
          Distillation runs in the background — vendor card renders in
          briefings within a few seconds.
        </p>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={submitting || !productName.trim()}
        >
          {submitting ? "Adding" : "Add vendor card"}
        </Button>
      </div>
    </form>
  );
}

function splitList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
