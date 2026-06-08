# Knowledge corpus snapshots — Sprint 4

This directory holds JSON snapshots of the public corpora seeded into the Principe knowledge base. The seeders at `apps/principe/scripts/_seed-knowledge.ts` read these files and idempotently upsert KnowledgeSource rows for a given firm.

Why snapshots (vs live-fetching at seed time)?

- **Reproducibility.** MITRE STIX format drifts; EUR-Lex URLs change; NIST CSF PDFs get re-released. A committed snapshot means the seed is reproducible regardless of upstream churn.
- **Auditability.** When a panel response cites NIST PR.PT-3, we want to be able to point at the snapshot date and version.
- **Content ownership.** Content is Omer's hands-on work; the seeder is engineering.

## Files (content TBD per Sprint 4 plan)

| Target | Snapshot file | Curator | Last-known good |
|---|---|---|---|
| MITRE ATT&CK Enterprise | `mitre-attack-snapshot.json` | Omer | _pending_ |
| NIST CSF v2 | `nist-csf-snapshot.json` | Omer | _pending_ |
| DORA | `dora-snapshot.json` | Omer | _pending_ |
| NIS2 | `nis2-snapshot.json` | Omer | _pending_ |

## Snapshot shape

Each file is an array. Each row:

```json
{
  "url": "https://attack.mitre.org/tactics/TA0001/",
  "title": "MITRE ATT&CK — Initial Access (TA0001)",
  "content": "<long descriptive text covering the tactic + techniques>",
  "applicableIndustries": ["financial-services", "healthcare"],
  "applicableFrameworks": ["MITRE ATT&CK"],
  "region": "global"
}
```

`applicableIndustries` and `applicableFrameworks` are optional — seeders default to the target's typical framework + an empty industry list (broadly applicable).

## Running a seeder

```bash
cd apps/principe
pnpm tsx scripts/_seed-knowledge.ts --target=mitre --firm-id=<vcFirmId>
pnpm tsx scripts/_seed-knowledge.ts --target=nist-csf --firm-id=<vcFirmId>
pnpm tsx scripts/_seed-knowledge.ts --target=dora --firm-id=<vcFirmId>
pnpm tsx scripts/_seed-knowledge.ts --target=nis2 --firm-id=<vcFirmId>
```

Idempotent — re-running with the same firm + URL updates content + re-triggers distillation. The distiller picks framework / regulation schema based on the source's category.
