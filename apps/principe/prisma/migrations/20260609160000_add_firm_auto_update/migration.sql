-- Knowledge-update consent flag. Default false = manual (no push without
-- explicit opt-in); true = automatic install of available updates.
ALTER TABLE "VCFirm" ADD COLUMN "autoUpdate" BOOLEAN NOT NULL DEFAULT false;
