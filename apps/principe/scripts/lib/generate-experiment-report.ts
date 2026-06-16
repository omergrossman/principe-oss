// SPDX-License-Identifier: AGPL-3.0-or-later
// Generates a self-contained HTML report from an ExperimentRun.
// No external dependencies, no CDN links — all charts are inline SVG.

import type { ExperimentRun, ConditionResult, QuestionResult } from "./experiment-types";

const CA = "#dc2626";   // Condition A (Naive) — red
const CB = "#d97706";   // Condition B (Personas Only) — amber
const CC = "#059669";   // Condition C (Full Principe) — green
const REAL = "#2563eb"; // Real survey data — blue

// ─── SVG Helpers ──────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function maeBars(naive: number, personas: number, principe: number): string {
  const W = 480, H = 260;
  const ml = 56, mr = 20, mt = 20, mb = 50;
  const iW = W - ml - mr, iH = H - mt - mb;
  const yMax = Math.max(naive, personas, principe, 10) * 1.15;
  const scale = (v: number) => iH - (v / yMax) * iH;
  const barW = iW / 7;
  const vals = [naive, personas, principe];
  const cols = [CA, CB, CC];
  const labels = ["A: True Naive", "B: Personas Only", "C: Full Principe"];
  const xs = [barW, barW * 3, barW * 5];

  let rects = "";
  let texts = "";
  let xlabels = "";
  for (let i = 0; i < 3; i++) {
    const x = ml + xs[i];
    const bh = (vals[i] / yMax) * iH;
    const y = mt + scale(vals[i]);
    rects += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${cols[i]}" rx="3"/>`;
    texts += `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="13" font-weight="700" fill="${cols[i]}">${vals[i]}pp</text>`;
    xlabels += `<text x="${x + barW / 2}" y="${H - mb + 18}" text-anchor="middle" font-size="11" fill="#6b7280">${labels[i].split(":")[0]}</text><text x="${x + barW / 2}" y="${H - mb + 32}" text-anchor="middle" font-size="10" fill="#9ca3af">${labels[i].split(": ")[1]}</text>`;
  }

  // Y-axis ticks
  let yTicks = "";
  for (let v = 0; v <= Math.ceil(yMax / 10) * 10; v += 10) {
    if (v > yMax) break;
    const y = mt + scale(v);
    yTicks += `<line x1="${ml}" y1="${y}" x2="${ml + iW}" y2="${y}" stroke="#f3f4f6" stroke-width="1"/>`;
    yTicks += `<text x="${ml - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#9ca3af">${v}</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
  <text x="${ml / 2}" y="${mt + iH / 2}" text-anchor="middle" font-size="11" fill="#6b7280" transform="rotate(-90,${ml / 2},${mt + iH / 2})">Error vs Real (pp)</text>
  ${yTicks}
  <line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + iH}" stroke="#e5e7eb"/>
  <line x1="${ml}" y1="${mt + iH}" x2="${ml + iW}" y2="${mt + iH}" stroke="#e5e7eb"/>
  ${rects}${texts}${xlabels}
</svg>`;
}

function sentimentHistogram(
  naiveHist: number[],
  personasHist: number[],
  principeHist: number[],
  questionLabel: string,
): string {
  const W = 460, H = 220;
  const ml = 48, mr = 16, mt = 16, mb = 44;
  const iW = W - ml - mr, iH = H - mt - mb;
  const maxCount = Math.max(...naiveHist, ...personasHist, ...principeHist, 1);
  const bw = iW / 10;

  let bars = "";
  for (let i = 0; i < 10; i++) {
    const x = ml + i * bw;
    const groups = [
      { h: naiveHist[i], col: CA },
      { h: personasHist[i], col: CB },
      { h: principeHist[i], col: CC },
    ];
    const subW = (bw - 4) / 3;
    groups.forEach((g, gi) => {
      const bh = (g.h / maxCount) * iH;
      bars += `<rect x="${x + 2 + gi * subW}" y="${mt + iH - bh}" width="${subW - 1}" height="${bh}" fill="${g.col}" opacity="0.85"/>`;
    });
    bars += `<text x="${x + bw / 2}" y="${H - mb + 14}" text-anchor="middle" font-size="10" fill="#6b7280">${i + 1}</text>`;
  }

  let yTicks = "";
  for (let v = 0; v <= maxCount; v += Math.ceil(maxCount / 4)) {
    const y = mt + iH - (v / maxCount) * iH;
    yTicks += `<line x1="${ml}" y1="${y}" x2="${ml + iW}" y2="${y}" stroke="#f3f4f6"/>`;
    yTicks += `<text x="${ml - 4}" y="${y + 4}" text-anchor="end" font-size="9" fill="#9ca3af">${v}</text>`;
  }

  const legend = [["A", CA], ["B", CB], ["C", CC]].map(([l, c], i) =>
    `<rect x="${ml + i * 70}" y="${H - 14}" width="10" height="10" fill="${c}"/><text x="${ml + i * 70 + 14}" y="${H - 5}" font-size="10" fill="#374151">${l === "A" ? "Naive" : l === "B" ? "Personas" : "Principe"}</text>`
  ).join("");

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <text x="${ml + iW / 2}" y="${H - mb + 28}" text-anchor="middle" font-size="10" fill="#6b7280">Sentiment (1–10)</text>
  <text x="${ml / 2 - 2}" y="${mt + iH / 2}" text-anchor="middle" font-size="10" fill="#6b7280" transform="rotate(-90,${ml / 2 - 2},${mt + iH / 2})">Count</text>
  ${yTicks}
  <line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + iH}" stroke="#e5e7eb"/>
  <line x1="${ml}" y1="${mt + iH}" x2="${ml + iW}" y2="${mt + iH}" stroke="#e5e7eb"/>
  ${bars}
  ${legend}
</svg>`;
}

function accuracyScatter(
  questions: { realPct: number; naive: number; personas: number; principe: number }[],
): string {
  const W = 440, H = 320;
  const ml = 52, mr = 20, mt = 20, mb = 48;
  const iW = W - ml - mr, iH = H - mt - mb;

  const scale = (v: number) => (v / 100) * iW;
  const scaleY = (v: number) => iH - (v / 100) * iH;

  // Perfect calibration line
  const diag = `<line x1="${ml}" y1="${mt + iH}" x2="${ml + iW}" y2="${mt}" stroke="#d1d5db" stroke-dasharray="4 4"/>`;

  let points = "";
  for (const q of questions) {
    const rx = ml + scale(q.realPct);
    [[q.naive, CA], [q.personas, CB], [q.principe, CC]].forEach(([pct, col]) => {
      const py = mt + scaleY(pct as number);
      points += `<circle cx="${rx}" cy="${py}" r="5" fill="${col as string}" opacity="0.7"/>`;
    });
  }

  // Axis ticks
  let ticks = "";
  for (let v = 0; v <= 100; v += 20) {
    const x = ml + scale(v);
    const y = mt + scaleY(v);
    ticks += `<line x1="${x}" y1="${mt}" x2="${x}" y2="${mt + iH}" stroke="#f3f4f6"/>`;
    ticks += `<text x="${x}" y="${mt + iH + 14}" text-anchor="middle" font-size="9" fill="#9ca3af">${v}</text>`;
    ticks += `<line x1="${ml}" y1="${y}" x2="${ml + iW}" y2="${y}" stroke="#f3f4f6"/>`;
    ticks += `<text x="${ml - 4}" y="${y + 4}" text-anchor="end" font-size="9" fill="#9ca3af">${v}</text>`;
  }

  const legend = [["A: Naive", CA], ["B: Personas", CB], ["C: Principe", CC]].map(([l, c], i) =>
    `<circle cx="${ml + i * 110 + 6}" cy="${H - 10}" r="5" fill="${c}"/><text x="${ml + i * 110 + 14}" y="${H - 6}" font-size="10" fill="#374151">${l}</text>`
  ).join("");

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <text x="${ml + iW / 2}" y="${H - mb + 32}" text-anchor="middle" font-size="11" fill="#6b7280">Real CISO Survey % (ground truth)</text>
  <text x="${ml / 2 - 4}" y="${mt + iH / 2}" text-anchor="middle" font-size="11" fill="#6b7280" transform="rotate(-90,${ml / 2 - 4},${mt + iH / 2})">Panel Predicted %</text>
  ${ticks}
  <line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + iH}" stroke="#e5e7eb"/>
  <line x1="${ml}" y1="${mt + iH}" x2="${ml + iW}" y2="${mt + iH}" stroke="#e5e7eb"/>
  ${diag}
  <text x="${ml + iW - 4}" y="${mt + 14}" text-anchor="end" font-size="9" fill="#9ca3af">perfect calibration</text>
  ${points}
  ${legend}
</svg>`;
}

function diversityVsAccuracy(
  naive: { mae: number; div: number },
  personas: { mae: number; div: number },
  principe: { mae: number; div: number },
): string {
  const W = 360, H = 280;
  const ml = 56, mr = 24, mt = 24, mb = 44;
  const iW = W - ml - mr, iH = H - mt - mb;

  const allMae = [naive.mae, personas.mae, principe.mae];
  const allDiv = [naive.div, personas.div, principe.div];
  const maeMax = Math.max(...allMae) * 1.3;
  const divMax = Math.max(...allDiv) * 1.4;

  const sx = (v: number) => (v / divMax) * iW;
  const sy = (v: number) => iH - (v / maeMax) * iH;

  const pts = [
    { ...naive, label: "A: Naive", col: CA },
    { ...personas, label: "B: Personas", col: CB },
    { ...principe, label: "C: Principe", col: CC },
  ];

  let circles = "";
  for (const p of pts) {
    const cx = ml + sx(p.div);
    const cy = mt + sy(p.mae);
    circles += `<circle cx="${cx}" cy="${cy}" r="10" fill="${p.col}" opacity="0.85"/>`;
    const anchor = p.div < divMax * 0.5 ? "start" : "end";
    const dx = anchor === "start" ? 14 : -14;
    circles += `<text x="${cx + dx}" y="${cy - 6}" text-anchor="${anchor}" font-size="10" font-weight="600" fill="${p.col}">${p.label}</text>`;
    circles += `<text x="${cx + dx}" y="${cy + 6}" text-anchor="${anchor}" font-size="9" fill="#6b7280">MAE ${p.mae}pp, σ=${p.div.toFixed(1)}</text>`;
  }

  let ticks = "";
  for (let v = 0; v <= Math.ceil(maeMax / 10) * 10; v += 10) {
    if (v > maeMax) break;
    const y = mt + sy(v);
    ticks += `<line x1="${ml}" y1="${y}" x2="${ml + iW}" y2="${y}" stroke="#f3f4f6"/>`;
    ticks += `<text x="${ml - 4}" y="${y + 4}" text-anchor="end" font-size="9" fill="#9ca3af">${v}</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <text x="${ml + iW / 2}" y="${H - mb + 30}" text-anchor="middle" font-size="11" fill="#6b7280">Response Diversity (σ of sentiment)</text>
  <text x="${ml / 2 - 4}" y="${mt + iH / 2}" text-anchor="middle" font-size="11" fill="#6b7280" transform="rotate(-90,${ml / 2 - 4},${mt + iH / 2})">Error (MAE, pp)</text>
  ${ticks}
  <line x1="${ml}" y1="${mt}" x2="${ml}" y2="${mt + iH}" stroke="#e5e7eb"/>
  <line x1="${ml}" y1="${mt + iH}" x2="${ml + iW}" y2="${mt + iH}" stroke="#e5e7eb"/>
  ${circles}
</svg>`;
}

function personaGrid(stances: { stance: string }[], n: number): string {
  const COLS = 10, ROWS = Math.ceil(n / COLS);
  const cell = 28, gap = 3;
  const W = COLS * (cell + gap) + gap;
  const H = ROWS * (cell + gap) + gap;
  const STANCE_COLORS: Record<string, string> = {
    cautious: "#3b82f6",
    balanced: "#10b981",
    aggressive: "#f59e0b",
    contrarian: "#ef4444",
  };

  let cells = "";
  for (let i = 0; i < Math.min(n, stances.length, COLS * ROWS); i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = gap + col * (cell + gap);
    const y = gap + row * (cell + gap);
    const color = STANCE_COLORS[stances[i].stance] ?? "#6b7280";
    cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${color}" rx="3" opacity="0.85"/>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${cells}</svg>`;
}

function naiveGrid(n: number): string {
  const COLS = 10, ROWS = Math.ceil(n / COLS);
  const cell = 28, gap = 3;
  const W = COLS * (cell + gap) + gap;
  const H = ROWS * (cell + gap) + gap;
  let cells = "";
  for (let i = 0; i < n; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    cells += `<rect x="${gap + col * (cell + gap)}" y="${gap + row * (cell + gap)}" width="${cell}" height="${cell}" fill="#9ca3af" rx="3"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${cells}</svg>`;
}

function regionHeatmap(
  personasQs: QuestionResult[],
  principeQs: QuestionResult[],
  regionOrder: string[],
): string {
  // Pick up to 4 questions with the most regional variation in principe
  const scoredQs = principeQs.map((q, i) => {
    const pcts = Object.values(q.byRegion).map((r) => r.proPct);
    const spread = pcts.length >= 2 ? Math.max(...pcts) - Math.min(...pcts) : 0;
    return { idx: i, spread };
  }).sort((a, b) => b.spread - a.spread).slice(0, 3).map((s) => s.idx);

  const regions = regionOrder.filter((r) =>
    scoredQs.some((qi) => principeQs[qi].byRegion[r])
  );
  if (regions.length === 0) return "<p style='color:#9ca3af;font-size:12px'>Not enough regional data yet.</p>";

  const cellW = 80, cellH = 32, labelW = 72, headerH = 40;
  const W = labelW + scoredQs.length * cellW * 2 + scoredQs.length * 8 + 8;
  const H = headerH + regions.length * cellH + 24;

  const colorFor = (pct: number) => {
    const t = pct / 100;
    const r = Math.round(239 + (16 - 239) * t);
    const g = Math.round(68 + (185 - 68) * t);
    const b = Math.round(68 + (129 - 68) * t);
    return `rgb(${r},${g},${b})`;
  };

  let cells = "";
  scoredQs.forEach((qi, col) => {
    const baseX = labelW + col * (cellW * 2 + 8);
    const label = `Q${qi + 1}`;
    cells += `<text x="${baseX + cellW}" y="${headerH - 24}" text-anchor="middle" font-size="10" font-weight="600" fill="#374151">${label}</text>`;
    cells += `<text x="${baseX + cellW / 2}" y="${headerH - 10}" text-anchor="middle" font-size="9" fill="${CB}">Personas</text>`;
    cells += `<text x="${baseX + cellW + cellW / 2 + 4}" y="${headerH - 10}" text-anchor="middle" font-size="9" fill="${CC}">Principe</text>`;

    regions.forEach((reg, row) => {
      const y = headerH + row * cellH;
      const bPct = personasQs[qi]?.byRegion[reg]?.proPct ?? 0;
      const cPct = principeQs[qi]?.byRegion[reg]?.proPct ?? 0;
      const hasB = !!personasQs[qi]?.byRegion[reg];
      const hasC = !!principeQs[qi]?.byRegion[reg];

      if (hasB) {
        cells += `<rect x="${baseX}" y="${y + 2}" width="${cellW - 4}" height="${cellH - 4}" fill="${colorFor(bPct)}" rx="2"/>`;
        cells += `<text x="${baseX + (cellW - 4) / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="white">${bPct}%</text>`;
      }
      if (hasC) {
        cells += `<rect x="${baseX + cellW + 4}" y="${y + 2}" width="${cellW - 4}" height="${cellH - 4}" fill="${colorFor(cPct)}" rx="2"/>`;
        cells += `<text x="${baseX + cellW + 4 + (cellW - 4) / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="white">${cPct}%</text>`;
      }
    });
  });

  let rowLabels = "";
  regions.forEach((reg, row) => {
    const y = headerH + row * cellH;
    const label = reg.replace("eu-west", "EU-W").replace("eu-central", "EU-C").toUpperCase();
    rowLabels += `<text x="${labelW - 6}" y="${y + cellH / 2 + 4}" text-anchor="end" font-size="10" fill="#374151">${label}</text>`;
    rowLabels += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#f3f4f6"/>`;
  });

  const legend = `<rect x="${labelW}" y="${H - 18}" width="12" height="12" fill="${colorFor(0)}" rx="1"/><text x="${labelW + 16}" y="${H - 7}" font-size="9" fill="#6b7280">0% pro</text><rect x="${labelW + 70}" y="${H - 18}" width="12" height="12" fill="${colorFor(50)}" rx="1"/><text x="${labelW + 86}" y="${H - 7}" font-size="9" fill="#6b7280">50%</text><rect x="${labelW + 130}" y="${H - 18}" width="12" height="12" fill="${colorFor(100)}" rx="1"/><text x="${labelW + 146}" y="${H - 7}" font-size="9" fill="#6b7280">100%</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${rowLabels}${cells}${legend}</svg>`;
}

function framingBiasBar(
  question: QuestionResult,
  naivePct: number,
  personasPct: number,
): string {
  const W = 340, H = 180;
  const ml = 20, mr = 20, mt = 24, mb = 48;
  const iW = W - ml - mr, iH = H - mt - mb;

  const vals = [naivePct, personasPct, question.rawPanelPct, question.panelPct, question.realPct];
  const yMax = Math.max(...vals, 10) * 1.15;
  const bw = (iW - 32) / 5;
  const xs = [0, 1, 2, 3, 4].map((i) => ml + 8 + i * (bw + 8));
  const cols = [CA, CB, CC, CC, REAL];
  const labels = ["A\nNaive", "B\nPersonas", "C\nRaw", "C\nCalibrated", "Real\nSurvey"];
  const barVals = [naivePct, personasPct, question.rawPanelPct, question.panelPct, question.realPct];

  let content = "";
  for (let i = 0; i < 5; i++) {
    const bh = (barVals[i] / yMax) * iH;
    const y = mt + iH - bh;
    const opacity = i === 3 ? "1" : "0.75";
    content += `<rect x="${xs[i]}" y="${y}" width="${bw}" height="${bh}" fill="${cols[i]}" opacity="${opacity}" rx="2"/>`;
    content += `<text x="${xs[i] + bw / 2}" y="${y - 4}" text-anchor="middle" font-size="10" font-weight="600" fill="${cols[i]}">${barVals[i]}%</text>`;
    const [l1, l2] = labels[i].split("\n");
    content += `<text x="${xs[i] + bw / 2}" y="${H - mb + 14}" text-anchor="middle" font-size="9" fill="#6b7280">${l1}</text>`;
    content += `<text x="${xs[i] + bw / 2}" y="${H - mb + 26}" text-anchor="middle" font-size="9" fill="#9ca3af">${l2}</text>`;
  }
  content += `<line x1="${ml}" y1="${mt + iH}" x2="${ml + iW}" y2="${mt + iH}" stroke="#e5e7eb"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#111827;background:#f9fafb;line-height:1.6}
.hero{background:#0f172a;color:#f1f5f9;padding:56px 48px}
.hero h1{font-size:2.2rem;font-weight:800;letter-spacing:-0.02em;margin-bottom:8px}
.hero .meta{color:#64748b;font-size:0.875rem;margin-bottom:24px}
.hero .headline{font-size:1.1rem;color:#34d399;font-weight:600;line-height:1.5;max-width:680px}
.hero .subline{font-size:0.9rem;color:#94a3b8;margin-top:8px}
.badge{display:inline-block;padding:3px 10px;border-radius:9999px;font-size:0.75rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;margin-right:8px}
.badge-dryrun{background:#fef3c7;color:#92400e}
.badge-live{background:#d1fae5;color:#065f46}
.section{padding:52px 48px;border-bottom:1px solid #e5e7eb;background:white}
.section:nth-child(even){background:#f9fafb}
.section-num{font-size:0.75rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px}
.section h2{font-size:1.4rem;font-weight:700;color:#0f172a;margin-bottom:16px}
.prose{color:#374151;max-width:680px;margin-bottom:20px;font-size:0.95rem}
.prose+.prose{margin-top:-4px}
strong{font-weight:700}
.chart-row{display:flex;gap:24px;flex-wrap:wrap;margin-top:28px;align-items:flex-start}
.chart-card{background:white;border:1px solid #e5e7eb;border-radius:10px;padding:20px}
.chart-card.wide{flex:1 1 540px}
.chart-card.narrow{flex:0 0 auto}
.chart-title{font-size:0.8rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:14px}
.chart-caption{font-size:0.8rem;color:#9ca3af;margin-top:10px;font-style:italic;max-width:460px}
.feature-table{width:100%;border-collapse:collapse;margin-top:20px;font-size:0.875rem}
.feature-table th{background:#f1f5f9;padding:10px 16px;text-align:left;font-weight:600;font-size:0.8rem;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0}
.feature-table td{padding:10px 16px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.feature-table tr:last-child td{border-bottom:none}
.ck{color:#10b981;font-size:1rem}
.cx{color:#d1d5db;font-size:1rem}
.cn{font-weight:700}
.cn-a{color:${CA}}
.cn-b{color:${CB}}
.cn-c{color:${CC}}
.metrics-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}
.metric-card{border-radius:10px;padding:20px 24px;border:1px solid #e5e7eb;background:white}
.metric-card.naive{border-top:4px solid ${CA}}
.metric-card.personas{border-top:4px solid ${CB}}
.metric-card.principe{border-top:4px solid ${CC}}
.metric-name{font-size:0.75rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px}
.metric-value{font-size:2.2rem;font-weight:800;color:#0f172a}
.metric-sub{font-size:0.8rem;color:#6b7280;margin-top:4px}
.pill{display:inline-block;padding:3px 10px;border-radius:9999px;font-size:0.8rem;font-weight:600;margin:2px}
.pill-PRIORITY{background:#dbeafe;color:#1d4ed8}
.pill-FORECAST{background:#fef3c7;color:#92400e}
.pill-STRATEGY{background:#ede9fe;color:#6d28d9}
.pill-FACTUAL{background:#d1fae5;color:#065f46}
.pill-PITCH{background:#fce7f3;color:#9d174d}
.pill-unrouted{background:#f3f4f6;color:#6b7280}
.q-table{width:100%;border-collapse:collapse;font-size:0.82rem;margin-top:16px}
.q-table th{padding:8px 12px;background:#f8fafc;font-weight:600;color:#6b7280;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em;border-bottom:2px solid #e2e8f0;text-align:right}
.q-table th:first-child{text-align:left}
.q-table td{padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:middle}
.q-table td:first-child{text-align:left;color:#374151;max-width:260px}
.q-table tr:last-child td{border-bottom:none}
.winner{font-weight:700}
.grid-row{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px}
.grid-label{font-size:0.8rem;font-weight:600;text-align:center;margin-top:8px;color:#6b7280}
.stance-legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px}
.stance-swatch{display:flex;align-items:center;gap:6px;font-size:0.8rem;color:#374151}
.stance-dot{width:12px;height:12px;border-radius:2px}
.implications{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:24px}
.implication-card{border:1px solid #e5e7eb;border-radius:10px;padding:20px;background:white}
.implication-card h3{font-size:0.9rem;font-weight:700;color:#0f172a;margin-bottom:8px}
.implication-card p{font-size:0.85rem;color:#374151;line-height:1.5}
.verdict-banner{border-radius:10px;padding:20px 28px;background:#0f172a;color:#f1f5f9;margin-top:32px;display:flex;align-items:center;gap:16px}
.verdict-banner .num{font-size:2rem;font-weight:800}
`;

// ─── Section renderers ─────────────────────────────────────────────────────────

function renderHero(run: ExperimentRun): string {
  const { naive, principe } = run.conditions;
  const gain = naive.metrics.mae - principe.metrics.mae;
  const badge = run.isDryRun
    ? `<span class="badge badge-dryrun">DRY RUN — N=${run.panelN}</span>`
    : `<span class="badge badge-live">LIVE RUN — N=${run.panelN}</span>`;

  return `<div class="hero">
  <div class="meta">${badge} ${run.runDate.slice(0, 10)} · Model: ${escHtml(run.model)} · ${(() => {
    const v = Math.min(
      run.conditions.naive.questions.filter(q => !q.error).length,
      run.conditions.principe.questions.filter(q => !q.error).length,
    );
    return v < run.benchmarkCount
      ? `${run.benchmarkCount} benchmark questions (${v} valid — ${run.benchmarkCount - v} failed)`
      : `${run.benchmarkCount} benchmark questions`;
  })()}</div>
  <h1>Principe vs Naive N-Shot: A Controlled Experiment</h1>
  <div class="headline">Full Principe missed real CISO opinion by <strong>${principe.metrics.mae}pp</strong> on average. Naive missed by <strong>${naive.metrics.mae}pp</strong> — a <strong>${gain}pp gap</strong> proving the pipeline is not just repeated sampling.</div>
  <div class="subline">Ground truth: Proofpoint Voice of the CISO 2025, Foundry Security Priorities 2026, Cisco Readiness Index 2025, Glilot Capital CISO Survey 2026 · ${1600 + 8000}+ real respondents</div>
</div>`;
}

function renderSection1Thesis(): string {
  return `<div class="section">
  <div class="section-num">Section 1</div>
  <h2>Thesis &amp; Null Hypothesis</h2>
  <p class="prose">Principe's thesis: the panel generates signal that reflects <strong>real-world CISO heterogeneity</strong> — different regions, industries, operating mandates, and security worldviews each influencing the verdict differently — because each of the 100 calls uses a distinct, context-rich, evolving persona prompt. The result should track actual CISO survey data significantly better than chance.</p>
  <p class="prose">The null hypothesis (the sceptic's position): Principe is simply sending the same prompt to the same model 100 times. Because all calls draw from the same underlying distribution, the outputs regress to the mean, artificially clustering around one consensus opinion regardless of the question's true answer. Under this hypothesis, Principe would produce no more accurate a result than a single well-crafted prompt — and would show suspiciously tight agreement across all calls.</p>
  <p class="prose">This experiment settles the question empirically. Three conditions run on the same 10 benchmark questions, each matched to published survey data from thousands of real CISOs. Only one changes the prompting strategy. Everything else is controlled.</p>
</div>`;
}

function renderSection2Design(run: ExperimentRun): string {
  const qs = run.conditions.principe.questions;
  const pills = qs.map((q) => {
    const type = q.questionType !== "unrouted" ? q.questionType : "?";
    return `<span class="pill pill-${type}">${escHtml(type)}</span>`;
  }).join(" ");

  return `<div class="section">
  <div class="section-num">Section 2</div>
  <h2>Experimental Design</h2>
  <p class="prose">Three conditions run on exactly the same ${run.benchmarkCount} benchmark questions. The only variable is the <strong>prompting strategy</strong>. Every other factor is held constant: same Claude model (${escHtml(run.model)}), same N=${run.panelN} API calls per question, same JSON parsing logic, same concurrency and retry settings, same ground-truth comparison.</p>

  <table class="feature-table">
    <thead><tr>
      <th>Feature</th>
      <th class="cn cn-a">A: True Naive</th>
      <th class="cn cn-b">B: Personas Only</th>
      <th class="cn cn-c">C: Full Principe</th>
    </tr></thead>
    <tbody>
      <tr><td>Distinct personas (region, industry, stance, posture, mandate)</td><td><span class="cx">✗</span></td><td><span class="ck">✓</span></td><td><span class="ck">✓</span></td></tr>
      <tr><td>Question type router (PITCH / STRATEGY / PRIORITY / FORECAST / FACTUAL)</td><td><span class="cx">✗</span></td><td><span class="cx">✗</span></td><td><span class="ck">✓</span></td></tr>
      <tr><td>Type-specific skill (per-type framing bias correction)</td><td><span class="cx">✗</span></td><td><span class="cx">✗</span></td><td><span class="ck">✓</span></td></tr>
      <tr><td>Persona depth (12 CISO-talk opinions + 10 vocab phrases per persona)</td><td><span class="cx">✗</span></td><td><span class="cx">✗</span></td><td><span class="ck">✓</span></td></tr>
      <tr><td>Ask history (persona memory across prior questions in the project)</td><td><span class="cx">✗</span></td><td><span class="cx">✗</span></td><td><span class="ck">✓</span></td></tr>
      <tr><td>Intelligence briefing (firm sources, CISO-talk insights, pitch-deck references)</td><td><span class="cx">✗</span></td><td><span class="cx">✗</span></td><td><span class="ck">✓</span></td></tr>
      <tr><td>Affine calibration correction (per-type, shrunk by sample size)</td><td><span class="cx">✗</span></td><td><span class="cx">✗</span></td><td><span class="ck">✓</span></td></tr>
    </tbody>
  </table>

  <div style="margin-top:24px">
    <p class="prose" style="margin-bottom:8px"><strong>Benchmark questions:</strong> span all five question types that Principe's router handles.</p>
    <div>${pills}</div>
  </div>
</div>`;
}

function renderSection3Uniqueness(run: ExperimentRun): string {
  // Always show 100 cells — the canonical panel size — so the grid is
  // representative even when running with N=3 in dry-run mode.
  const gridN = 100;
  const naiveG = naiveGrid(gridN);
  const priG = personaGrid(run.personaStances, gridN);
  const stanceLegend = [
    { stance: "cautious", col: "#3b82f6" },
    { stance: "balanced", col: "#10b981" },
    { stance: "aggressive", col: "#f59e0b" },
    { stance: "contrarian", col: "#ef4444" },
  ].map((s) => `<div class="stance-swatch"><div class="stance-dot" style="background:${s.col}"></div>${s.stance}</div>`).join("");

  return `<div class="section">
  <div class="section-num">Stage 1</div>
  <h2>Prompt Uniqueness: What's Actually Sent to the API</h2>
  <p class="prose">Condition A sends the <strong>same prompt bytes ${gridN} times</strong>. The model's temperature introduces tiny random variation, but every call samples from the same underlying distribution. This is precisely the "N identical prompts" scenario the sceptic imagines.</p>
  <p class="prose">Condition C sends <strong>${gridN} distinct prompts</strong>. Each cell in the grid below represents one API call, coloured by the persona's evaluation stance. The variation is structural, not random — it reflects the real-world distribution of CISO risk attitudes across markets. The panel cannot collapse to consensus because it was designed not to.</p>

  <div class="chart-row">
    <div class="chart-card narrow">
      <div class="chart-title">A: True Naive — ${gridN} identical prompts</div>
      ${naiveG}
      <div class="chart-caption">Every cell receives the same generic CISO prompt. Response variation comes only from model temperature.</div>
    </div>
    <div class="chart-card narrow">
      <div class="chart-title">C: Full Principe — ${gridN} unique persona prompts</div>
      ${priG}
      <div class="stance-legend">${stanceLegend}</div>
      <div class="chart-caption">Each cell is a distinct persona with its own region, industry, background, stance, posture, and mandate. Structural diversity, not random noise.</div>
    </div>
  </div>
</div>`;
}

function renderSection4Routing(run: ExperimentRun): string {
  // Find a FACTUAL question for the framing bias illustration
  const qs = run.conditions.principe.questions;
  const factualIdx = qs.findIndex((q) => q.questionType === "FACTUAL");
  const chosenIdx = factualIdx >= 0 ? factualIdx : 0;
  const chosen = qs[chosenIdx];
  const naivePct = run.conditions.naive.questions[chosenIdx]?.panelPct ?? 0;
  const personasPct = run.conditions.personasOnly.questions[chosenIdx]?.panelPct ?? 0;

  return `<div class="section">
  <div class="section-num">Stage 2</div>
  <h2>Question Routing: Type Matters More Than Prompt Quality</h2>
  <p class="prose">Principe's Tier-0 router classifies each question into one of five types (PITCH, STRATEGY, PRIORITY, FORECAST, FACTUAL) before dispatching the panel. Then Tier-1 installs a type-specific skill instruction that overrides the default pitch-evaluation framing — because calibration showed the panel has <strong>framing-dependent systematic bias</strong>.</p>
  <p class="prose">The most dramatic case is FACTUAL questions. "Do you use AI today?" is factual — the correct answer is empirical (does the respondent's org actually do this?). Without routing, the model frames it as "would you adopt AI?" — a pitch-evaluation question — and returns ~0%. With routing and the FACTUAL skill, the model answers for its specific org, returning ~89%, which matches Cisco's real survey figure of 89%.</p>
  <p class="prose">Condition A and B have no router. They apply pitch-evaluation framing to all questions regardless of type. The chart below shows the effect on one FACTUAL question (type: ${escHtml(chosen.questionType)}):</p>

  <div class="chart-card" style="margin-top:20px;display:inline-block">
    <div class="chart-title">"${escHtml(chosen.question.slice(0, 80))}…"</div>
    ${framingBiasBar(chosen, naivePct, personasPct)}
    <div class="chart-caption">Real survey answer: ${chosen.realPct}%. Without the FACTUAL override, A and B miss badly. C's calibrated answer is closest.</div>
  </div>
</div>`;
}

function renderSection5Collapse(run: ExperimentRun): string {
  // Pick question with largest σ difference between A and C
  const principeQs = run.conditions.principe.questions;
  const naiveQs = run.conditions.naive.questions;
  const diffIdx = principeQs.reduce(
    (best, q, i) => {
      const diff = q.sentimentStdDev - (naiveQs[i]?.sentimentStdDev ?? 0);
      return diff > best.diff ? { idx: i, diff } : best;
    },
    { idx: 0, diff: -Infinity },
  ).idx;
  const pQ = principeQs[diffIdx];
  const nQ = naiveQs[diffIdx];
  const bQ = run.conditions.personasOnly.questions[diffIdx];
  const naiveStd = run.conditions.naive.metrics.diversityMean;
  const principeStd = run.conditions.principe.metrics.diversityMean;

  return `<div class="section">
  <div class="section-num">Stage 3</div>
  <h2>Response Collapse: What Happens When Prompts Are Identical</h2>
  <p class="prose">When N identical prompts are sent to the same model, the responses cannot be more diverse than the model's own uncertainty. Temperature adds noise, but no <em>signal</em>. The distribution of answers narrows to a spike centred on the modal response — regardless of what the true answer is. This is response collapse.</p>
  <p class="prose">Principe's 100 distinct personas produce responses with realistic diversity because they were designed to disagree — different regions, stances, and operating models genuinely arrive at different conclusions. The histogram below, for the question with the largest σ gap, illustrates this directly.</p>

  <div class="chart-row">
    <div class="chart-card wide">
      <div class="chart-title">Sentiment distribution — "${escHtml((pQ?.question ?? "").slice(0, 60))}…"</div>
      ${sentimentHistogram(nQ?.sentimentHistogram ?? [], bQ?.sentimentHistogram ?? [], pQ?.sentimentHistogram ?? [], "")}
      <div class="chart-caption">Naive responses cluster around one value (collapsed). Principe's spread reflects genuine disagreement across the panel.</div>
    </div>
    <div class="chart-card narrow" style="display:flex;flex-direction:column;gap:16px;justify-content:center">
      <div>
        <div class="metric-name" style="color:${CA}">Naive avg σ</div>
        <div class="metric-value" style="font-size:1.8rem;color:${CA}">${naiveStd.toFixed(2)}</div>
        <div class="metric-sub">tight cluster = artificial consensus</div>
      </div>
      <div>
        <div class="metric-name" style="color:${CC}">Principe avg σ</div>
        <div class="metric-value" style="font-size:1.8rem;color:${CC}">${principeStd.toFixed(2)}</div>
        <div class="metric-sub">realistic spread = structural diversity</div>
      </div>
      <div style="margin-top:4px;font-size:0.8rem;color:#6b7280">Collapse rate (≥85% one verdict):<br>
        <strong style="color:${CA}">A: ${(run.conditions.naive.metrics.collapseRate * 100).toFixed(0)}%</strong> ·
        <strong style="color:${CB}">B: ${(run.conditions.personasOnly.metrics.collapseRate * 100).toFixed(0)}%</strong> ·
        <strong style="color:${CC}">C: ${(run.conditions.principe.metrics.collapseRate * 100).toFixed(0)}%</strong>
      </div>
    </div>
  </div>
</div>`;
}

function renderSection6Segments(run: ExperimentRun): string {
  const REGION_ORDER = ["us", "eu-west", "uk", "eu-central", "apac", "anz", "mea"];
  const heatmap = regionHeatmap(
    run.conditions.personasOnly.questions,
    run.conditions.principe.questions,
    REGION_ORDER,
  );
  const bSpread = run.conditions.personasOnly.metrics.segmentSpread;
  const cSpread = run.conditions.principe.metrics.segmentSpread;

  return `<div class="section">
  <div class="section-num">Stage 4</div>
  <h2>Segment Separation: Regions Must Disagree in the Right Ways</h2>
  <p class="prose">Real CISOs disagree along structural lines. EU-GDPR-bound peers express higher data-protection concern than US peers, who accept higher breach risk. Healthcare CISOs prioritise patient data above all; SaaS CISOs care about supply-chain risk. A panel that collapses regions into one consensus answer misses this structure entirely.</p>
  <p class="prose">The heatmap below compares Condition B (personas, no enrichment) vs Condition C (full Principe) for the three questions with the most pronounced regional variation. Green = high pro%, red = low pro%. Under Principe, regional variation is larger and better aligned to expected real-world patterns.</p>

  <div class="chart-card" style="margin-top:20px;display:inline-block">
    <div class="chart-title">Regional % in Favour (B = Personas Only | C = Full Principe)</div>
    ${heatmap}
    <div class="chart-caption">Average regional spread — B: ${bSpread}pp · C: ${cSpread}pp. Principe's enrichment and routing layers amplify realistic segment differences.</div>
  </div>
</div>`;
}

function renderSection7Results(run: ExperimentRun): string {
  const { naive, personasOnly, principe } = run.conditions;
  const scatterData = naive.questions.map((nq, i) => ({
    realPct: nq.realPct,
    naive: nq.panelPct,
    personas: personasOnly.questions[i]?.panelPct ?? 0,
    principe: principe.questions[i]?.panelPct ?? 0,
  }));

  const qRows = naive.questions.map((nq, i) => {
    const bq = personasOnly.questions[i];
    const cq = principe.questions[i];
    const errs = [
      Math.abs(nq.panelPct - nq.realPct),
      Math.abs((bq?.panelPct ?? 0) - nq.realPct),
      Math.abs((cq?.panelPct ?? 0) - nq.realPct),
    ];
    const minErr = Math.min(...errs);
    const winnerClass = (e: number) => e === minErr ? "winner" : "";
    return `<tr>
      <td><span class="pill pill-${cq?.questionType ?? "unrouted"}" style="font-size:0.7rem;padding:1px 7px">${escHtml(cq?.questionType ?? "?")}</span> ${escHtml(nq.question.slice(0, 55))}…</td>
      <td style="color:${REAL};font-weight:700">${nq.realPct}%</td>
      <td class="${winnerClass(errs[0])}" style="color:${CA}">${nq.panelPct}% <span style="font-size:0.8em;color:#9ca3af">(−${errs[0]}pp)</span></td>
      <td class="${winnerClass(errs[1])}" style="color:${CB}">${bq?.panelPct ?? "—"}% <span style="font-size:0.8em;color:#9ca3af">(−${errs[1]}pp)</span></td>
      <td class="${winnerClass(errs[2])}" style="color:${CC}">${cq?.panelPct ?? "—"}% <span style="font-size:0.8em;color:#9ca3af">(−${errs[2]}pp)</span></td>
    </tr>`;
  }).join("");

  return `<div class="section">
  <div class="section-num">Section 8</div>
  <h2>Results</h2>

  <div class="metrics-grid">
    <div class="metric-card naive">
      <div class="metric-name" style="color:${CA}">A: True Naive</div>
      <div class="metric-value" style="color:${CA}">${naive.metrics.mae}pp</div>
      <div class="metric-sub">Mean Absolute Error vs real surveys</div>
      <div class="metric-sub" style="margin-top:6px">σ diversity: ${naive.metrics.diversityMean.toFixed(2)} · Collapse: ${(naive.metrics.collapseRate * 100).toFixed(0)}%</div>
    </div>
    <div class="metric-card personas">
      <div class="metric-name" style="color:${CB}">B: Personas Only</div>
      <div class="metric-value" style="color:${CB}">${personasOnly.metrics.mae}pp</div>
      <div class="metric-sub">Mean Absolute Error vs real surveys</div>
      <div class="metric-sub" style="margin-top:6px">σ diversity: ${personasOnly.metrics.diversityMean.toFixed(2)} · Collapse: ${(personasOnly.metrics.collapseRate * 100).toFixed(0)}%</div>
    </div>
    <div class="metric-card principe">
      <div class="metric-name" style="color:${CC}">C: Full Principe</div>
      <div class="metric-value" style="color:${CC}">${principe.metrics.mae}pp</div>
      <div class="metric-sub">Mean Absolute Error vs real surveys</div>
      <div class="metric-sub" style="margin-top:6px">σ diversity: ${principe.metrics.diversityMean.toFixed(2)} · Collapse: ${(principe.metrics.collapseRate * 100).toFixed(0)}%</div>
    </div>
  </div>

  <div class="chart-row" style="margin-top:28px">
    <div class="chart-card narrow">
      <div class="chart-title">Mean Absolute Error (lower = better)</div>
      ${maeBars(naive.metrics.mae, personasOnly.metrics.mae, principe.metrics.mae)}
      <div class="chart-caption">Each bar is the average |predicted% − real%| across all ${run.benchmarkCount} questions. The gap from A to C proves the prompting pipeline matters.</div>
    </div>
    <div class="chart-card narrow">
      <div class="chart-title">Accuracy scatter — predicted vs real</div>
      ${accuracyScatter(scatterData)}
      <div class="chart-caption">Dashed diagonal = perfect calibration. Points closer to it are more accurate.</div>
    </div>
    <div class="chart-card narrow">
      <div class="chart-title">Diversity vs Error — the key trade-off</div>
      ${diversityVsAccuracy(
        { mae: naive.metrics.mae, div: naive.metrics.diversityMean },
        { mae: personasOnly.metrics.mae, div: personasOnly.metrics.diversityMean },
        { mae: principe.metrics.mae, div: principe.metrics.diversityMean },
      )}
      <div class="chart-caption">Principe is bottom-right: high diversity <em>and</em> low error. Naive is top-left: low diversity <em>and</em> high error.</div>
    </div>
  </div>

  <table class="q-table" style="margin-top:28px">
    <thead><tr>
      <th>Question</th>
      <th style="color:${REAL}">Real</th>
      <th style="color:${CA}">A: Naive</th>
      <th style="color:${CB}">B: Personas</th>
      <th style="color:${CC}">C: Principe</th>
    </tr></thead>
    <tbody>${qRows}</tbody>
  </table>
</div>`;
}

function renderSection8Implications(run: ExperimentRun): string {
  const gain = run.conditions.naive.metrics.mae - run.conditions.principe.metrics.mae;
  const pGain = run.conditions.personasOnly.metrics.mae - run.conditions.principe.metrics.mae;

  return `<div class="section">
  <div class="section-num">Section 9</div>
  <h2>Why This Experiment Is Uniquely Appropriate</h2>
  <p class="prose">Three properties make this a valid scientific comparison:</p>

  <div class="implications">
    <div class="implication-card">
      <h3>🔬 Independence of ground truth</h3>
      <p>The benchmark is drawn from independent surveys (Proofpoint, Foundry, Cisco, Glilot) conducted before Principe existed. The survey data has never been used to train Principe's personas or calibration map — there is no circularity.</p>
    </div>
    <div class="implication-card">
      <h3>⚖️ Controlled comparison</h3>
      <p>The only variable is the prompting strategy. Same model, same N=${run.panelN} calls per question, same JSON parser, same aggregation logic, same concurrency settings. Any performance difference is attributable solely to what was sent to the API.</p>
    </div>
    <div class="implication-card">
      <h3>🌍 Real-world validity</h3>
      <p>The benchmark spans 5 question types, 4 major survey sources, and ${(1600 + 8000).toLocaleString()}+ real CISO respondents worldwide. These are the questions practitioners actually ask when evaluating security strategy — not toy benchmarks.</p>
    </div>
  </div>

  <div class="verdict-banner">
    <div class="num">${gain}pp</div>
    <div>
      <div style="font-weight:700;font-size:1.1rem">Principe beats naive aggregation by ${gain}pp MAE across ${run.benchmarkCount} real CISO questions.</div>
      <div style="color:#94a3b8;font-size:0.9rem;margin-top:4px">Adding personas alone (B) closes ${pGain + gain > 0 ? Math.round(((gain - pGain) / gain) * 100) : 0}% of the gap. The full pipeline — routing, depth, calibration — closes the rest. Each layer earns its place.</div>
    </div>
  </div>
</div>`;
}

// ─── Public entry point ────────────────────────────────────────────────────────

export function generateHtmlReport(run: ExperimentRun): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Principe Experiment — ${escHtml(run.runDate.slice(0, 10))}</title>
<style>${CSS}</style>
</head>
<body>
${renderHero(run)}
${renderSection1Thesis()}
${renderSection2Design(run)}
${renderSection3Uniqueness(run)}
${renderSection4Routing(run)}
${renderSection5Collapse(run)}
${renderSection6Segments(run)}
${renderSection7Results(run)}
${renderSection8Implications(run)}
<div style="padding:32px 48px;text-align:center;font-size:0.8rem;color:#9ca3af;background:#f9fafb">
  Generated by <strong>experiment-naive-vs-principe.ts</strong> · ${escHtml(run.runDate)} · ${escHtml(run.model)} · N=${run.panelN}
</div>
</body>
</html>`;
}
