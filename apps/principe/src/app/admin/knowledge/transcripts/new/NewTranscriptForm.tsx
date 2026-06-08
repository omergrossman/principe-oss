"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { INDUSTRIES, REGION_KEYS, REGION_LABELS, COMPANY_SIZES } from "@/lib/canon";

export function NewTranscriptForm() {
  const router = useRouter();
  const [speakerName, setSpeakerName] = useState("");
  const [speakerRole, setSpeakerRole] = useState("CISO");
  const [speakerIndustry, setSpeakerIndustry] = useState<string>(INDUSTRIES[0]);
  const [speakerRegion, setSpeakerRegion] = useState<string>("us");
  const [speakerCompanySize, setSpeakerCompanySize] = useState<string>(COMPANY_SIZES[2]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [rawTranscript, setRawTranscript] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/knowledge/transcripts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speakerName,
          speakerRole,
          speakerIndustry,
          speakerRegion,
          speakerCompanySize,
          sourceUrl: sourceUrl.trim() || undefined,
          sourceTitle,
          rawTranscript,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(data.errors ?? [data.error ?? `HTTP ${res.status}`]);
        setSubmitting(false);
        return;
      }
      router.push(`/admin/knowledge/transcripts/${data.transcriptId}`);
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Network error"]);
      setSubmitting(false);
    }
  }

  const transcriptLength = rawTranscript.length;
  const transcriptShort = transcriptLength < 500;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Speaker name">
          <input
            type="text"
            required
            value={speakerName}
            onChange={(e) => setSpeakerName(e.target.value)}
            placeholder="Sarah Chen"
            className={inputCls}
          />
        </Field>
        <Field label="Speaker role">
          <input
            type="text"
            required
            value={speakerRole}
            onChange={(e) => setSpeakerRole(e.target.value)}
            placeholder="CISO / BISO / Head of Security"
            className={inputCls}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Industry">
          <select
            value={speakerIndustry}
            onChange={(e) => setSpeakerIndustry(e.target.value)}
            className={selectCls}
          >
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Region">
          <select
            value={speakerRegion}
            onChange={(e) => setSpeakerRegion(e.target.value)}
            className={selectCls}
          >
            {REGION_KEYS.map((r) => (
              <option key={r} value={r}>
                {REGION_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Company size">
          <select
            value={speakerCompanySize}
            onChange={(e) => setSpeakerCompanySize(e.target.value)}
            className={selectCls}
          >
            {COMPANY_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Source title">
        <input
          type="text"
          required
          value={sourceTitle}
          onChange={(e) => setSourceTitle(e.target.value)}
          placeholder="RSA 2026 — Closing the Gap on Third-Party Risk"
          className={inputCls}
        />
      </Field>

      <Field label="Source URL (optional)">
        <input
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=…"
          className={`${inputCls} font-mono text-[12px]`}
        />
      </Field>

      <Field
        label="Transcript"
        hint={`${transcriptLength.toLocaleString()} chars — minimum 500`}
      >
        <textarea
          required
          value={rawTranscript}
          onChange={(e) => setRawTranscript(e.target.value)}
          placeholder="Paste the full transcript. Speaker labels (e.g. 'Sarah:') and timestamps are fine — distillation handles them."
          rows={16}
          className={`${inputCls} font-mono text-[12px] resize-y leading-relaxed`}
        />
      </Field>

      {errors.length > 0 && (
        <ul role="alert" className="text-[12px] text-verdict-fail bg-verdict-fail/10 px-3 py-2 rounded-md space-y-1">
          {errors.map((e, i) => (
            <li key={i}>· {e}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-ink-300 leading-relaxed">
          Distillation runs in the background once you submit (~10-30s).
          You&apos;ll land on the detail page; insights appear when ready.
        </p>
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={submitting || transcriptShort || !speakerName.trim() || !sourceTitle.trim()}
        >
          {submitting ? "Submitting" : "Ingest transcript"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px] font-medium text-ink-700">{label}</span>
        {hint && (
          <span className="text-[11px] text-ink-300 font-mono">{hint}</span>
        )}
      </div>
      {children}
    </label>
  );
}

const inputCls =
  "w-full h-9 px-3 rounded-md border border-ink-100 bg-canvas text-[13px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20";
const selectCls =
  "w-full h-9 px-2 rounded-md border border-ink-100 bg-canvas text-[12px] text-ink-700 font-mono focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20";
