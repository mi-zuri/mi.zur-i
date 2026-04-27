#!/usr/bin/env node
// Fetch GitHub repos + docs/images/preview.* hero images, write a JSON
// snapshot to disk. Designed to be run by cron once per hour. Writes atomically
// via tmp+rename so nginx never serves a half-written file.
//
// Env:
//   GH_USER         (default "mi-zuri")
//   OUT_PATH        (default "/var/www/mi.zur-i/data/projects.json")
//   GITHUB_TOKEN    optional; raises rate limit from 60/hr to 5000/hr
//   README_CONCURRENCY  optional; max parallel side-call fetches (default 6)

import { writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const GH_USER = process.env.GH_USER || "mi-zuri";
const OUT_PATH = process.env.OUT_PATH || "/var/www/mi.zur-i/data/projects.json";
const TOKEN = process.env.GITHUB_TOKEN;
const README_CONCURRENCY = Number(process.env.README_CONCURRENCY) || 6;

const headers = {
  "user-agent": "mi.zur-i-fetch",
  accept: "application/vnd.github+json",
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
};

const PREVIEW_RE = /^preview\.(png|jpe?g|gif|webp|svg|avif)$/i;

async function fetchLanguages(repo) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo.owner.login}/${repo.name}/languages`,
      { headers },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Object.entries(data)
      .sort((a, b) => b[1] - a[1])
      .map(([lang]) => lang);
  } catch {
    return [];
  }
}

// Look for docs/images/preview.{png,jpg,...} in the repo. One directory
// listing handles every supported extension; missing dir → 404 → null.
async function fetchPreviewImage(repo) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo.owner.login}/${repo.name}/contents/docs/images`,
      { headers },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    const file = data.find(
      (f) => f.type === "file" && PREVIEW_RE.test(f.name),
    );
    return file?.download_url ?? null;
  } catch {
    return null;
  }
}

// Bounded parallelism — GitHub is fine with ~6 concurrent unauthenticated calls,
// and we don't want a 100-repo account to fan out into 100 sockets at once.
async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function slimRepo(r, languages) {
  return {
    name: r.name,
    description: r.description,
    language: r.language,
    languages: languages || [],
    homepage: r.homepage,
    html_url: r.html_url,
    updated_at: r.updated_at,
  };
}

async function main() {
  const reposRes = await fetch(
    `https://api.github.com/users/${GH_USER}/repos?sort=updated&per_page=100`,
    { headers },
  );
  if (!reposRes.ok) {
    throw new Error(`github repos endpoint responded ${reposRes.status}`);
  }
  const allRepos = await reposRes.json();
  const repos = allRepos.filter((r) => !r.fork);

  const [images, languages] = await Promise.all([
    mapWithLimit(repos, README_CONCURRENCY, fetchPreviewImage),
    mapWithLimit(repos, README_CONCURRENCY, fetchLanguages),
  ]);

  const payload = {
    fetchedAt: new Date().toISOString(),
    repos: repos.map((r, i) => slimRepo(r, languages[i])),
    images,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  const tmp = `${OUT_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(payload), "utf8");
  await rename(tmp, OUT_PATH);

  console.log(
    `[${new Date().toISOString()}] wrote ${repos.length} repos (${images.filter(Boolean).length} with images) to ${OUT_PATH}`,
  );
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] fetch failed:`, err);
  process.exit(1);
});
