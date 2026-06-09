// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Publisher-side bridge to the principe-feed repo. Lets the (publisher's)
// Príncipe instance manage the feed's MANUAL inputs — operator-added URLs +
// files that the daily build digests — via the GitHub Contents API.
//
// Gated by config: only an instance with FEED_REPO + FEED_GITHUB_TOKEN set
// (i.e. the publisher's) exposes the Feed section. Everyone else: hidden.

const API = "https://api.github.com";
const URLS_PATH = "manual/urls.txt";
const INBOX_DIR = "manual/inbox";
const STORE_PATH = "state/store.json";

export interface FeedConfig {
  repo: string; // "owner/name"
  token: string;
}

export function feedConfig(): FeedConfig | null {
  const repo = process.env.FEED_REPO?.trim();
  const token = process.env.FEED_GITHUB_TOKEN?.trim();
  if (!repo || !token) return null;
  return { repo, token };
}

export function isFeedConfigured(): boolean {
  return feedConfig() !== null;
}

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "principe-feed-console",
    "x-github-api-version": "2022-11-28",
  };
}

async function gh(cfg: FeedConfig, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}/repos/${cfg.repo}/${path}`, {
    ...init,
    headers: { ...headers(cfg.token), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
}

interface ContentFile {
  content: string; // base64
  sha: string;
}

/** Read a file; returns null if it doesn't exist. */
async function readFile(cfg: FeedConfig, path: string): Promise<ContentFile | null> {
  const r = await gh(cfg, `contents/${path}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub read ${path}: ${r.status}`);
  const j = (await r.json()) as { content?: string; sha: string };
  return { content: j.content ? Buffer.from(j.content, "base64").toString("utf8") : "", sha: j.sha };
}

async function putFile(cfg: FeedConfig, path: string, contentB64: string, message: string, sha?: string): Promise<void> {
  const r = await gh(cfg, `contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: contentB64, ...(sha ? { sha } : {}) }),
  });
  if (!r.ok) throw new Error(`GitHub write ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

async function deleteFile(cfg: FeedConfig, path: string, sha: string, message: string): Promise<void> {
  const r = await gh(cfg, `contents/${path}`, {
    method: "DELETE",
    body: JSON.stringify({ message, sha }),
  });
  if (!r.ok) throw new Error(`GitHub delete ${path}: ${r.status}`);
}

export interface FeedState {
  urls: string[];
  files: { name: string; sha: string }[];
  liveCount: number;
  recentBuilds: { date: string; message: string; sha: string }[];
}

export async function getFeedState(cfg: FeedConfig): Promise<FeedState> {
  const [urlsFile, inboxRes, storeFile, commitsRes] = await Promise.all([
    readFile(cfg, URLS_PATH),
    gh(cfg, `contents/${INBOX_DIR}`),
    readFile(cfg, STORE_PATH),
    gh(cfg, `commits?path=${STORE_PATH}&per_page=6`),
  ]);

  const urls = (urlsFile?.content ?? "")
    .split("\n").map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  let files: { name: string; sha: string }[] = [];
  if (inboxRes.ok) {
    const arr = (await inboxRes.json()) as { name: string; sha: string; type: string }[];
    files = arr.filter((f) => f.type === "file" && !f.name.startsWith(".")).map((f) => ({ name: f.name, sha: f.sha }));
  }

  let liveCount = 0;
  try {
    liveCount = storeFile ? (JSON.parse(storeFile.content) as unknown[]).length : 0;
  } catch {
    liveCount = 0;
  }

  let recentBuilds: FeedState["recentBuilds"] = [];
  if (commitsRes.ok) {
    const commits = (await commitsRes.json()) as { sha: string; commit: { message: string; author: { date: string } } }[];
    recentBuilds = commits.map((c) => ({ date: c.commit.author.date, message: c.commit.message.split("\n")[0], sha: c.sha.slice(0, 7) }));
  }

  return { urls, files, liveCount, recentBuilds };
}

export async function addUrl(cfg: FeedConfig, url: string): Promise<void> {
  const existing = await readFile(cfg, URLS_PATH);
  const body = existing?.content ?? "# Manual URLs for the daily feed (one per line).\n";
  if (body.split("\n").some((l) => l.trim() === url.trim())) return; // already present
  const next = body.endsWith("\n") ? body + url + "\n" : body + "\n" + url + "\n";
  await putFile(cfg, URLS_PATH, Buffer.from(next, "utf8").toString("base64"), `feed: add manual url via console`, existing?.sha);
}

export async function removeUrl(cfg: FeedConfig, url: string): Promise<void> {
  const existing = await readFile(cfg, URLS_PATH);
  if (!existing) return;
  const next = existing.content.split("\n").filter((l) => l.trim() !== url.trim()).join("\n");
  await putFile(cfg, URLS_PATH, Buffer.from(next, "utf8").toString("base64"), `feed: remove manual url via console`, existing.sha);
}

export async function addFile(cfg: FeedConfig, name: string, contentB64: string): Promise<void> {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, "_");
  const existing = await readFile(cfg, `${INBOX_DIR}/${safe}`);
  await putFile(cfg, `${INBOX_DIR}/${safe}`, contentB64, `feed: add manual file ${safe} via console`, existing?.sha);
}

export async function removeFile(cfg: FeedConfig, name: string, sha: string): Promise<void> {
  await deleteFile(cfg, `${INBOX_DIR}/${name}`, sha, `feed: remove manual file ${name} via console`);
}
