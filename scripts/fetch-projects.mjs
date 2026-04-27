#!/usr/bin/env node
// Fetch GitHub repos + README hero images, write a JSON snapshot to disk.
// Designed to be run by cron once per hour. Writes atomically via tmp+rename
// so nginx never serves a half-written file.
//
// Env:
//   GH_USER         (default "mi-zuri")
//   OUT_PATH        (default "/var/www/mi.zur-i/data/projects.json")
//   GITHUB_TOKEN    optional; raises rate limit from 60/hr to 5000/hr
//   README_CONCURRENCY  optional; max parallel README fetches (default 6)

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

const BADGE_HOST_PATTERNS = [
  /(^|\.)shields\.io$/i,
  /(^|\.)badge\.fury\.io$/i,
  /(^|\.)travis-ci\.(org|com)$/i,
  /(^|\.)circleci\.com$/i,
  /(^|\.)codecov\.io$/i,
  /(^|\.)coveralls\.io$/i,
  /(^|\.)appveyor\.com$/i,
  /(^|\.)snyk\.io$/i,
  /(^|\.)gitter\.im$/i,
  /(^|\.)badgen\.net$/i,
];

function isBadgeUrl(url) {
  try {
    const u = new URL(url);
    if (BADGE_HOST_PATTERNS.some((re) => re.test(u.hostname))) return true;
    if (/\/badge(s)?\b/i.test(u.pathname)) return true;
    if (/\/workflows\/.+\/badge\.svg/i.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function resolveImageUrl(src, owner, repo, branch) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("data:")) return null;
  const cleaned = src.replace(/^\.?\//, "");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${cleaned}`;
}

function pickFirstImage(md, owner, repo, branch) {
  const images = [];
  const mdRe = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  const htmlRe = /<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = mdRe.exec(md))) images.push({ src: m[1], at: m.index });
  while ((m = htmlRe.exec(md))) images.push({ src: m[1], at: m.index });
  images.sort((a, b) => a.at - b.at);
  for (const { src } of images) {
    const resolved = resolveImageUrl(src, owner, repo, branch);
    if (!resolved) continue;
    if (isBadgeUrl(resolved)) continue;
    return resolved;
  }
  return null;
}

async function fetchReadmeImage(repo) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo.owner.login}/${repo.name}/readme`,
      { headers },
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.download_url) return null;
    const mdRes = await fetch(data.download_url);
    if (!mdRes.ok) return null;
    const md = await mdRes.text();
    return pickFirstImage(md, repo.owner.login, repo.name, repo.default_branch);
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

function slimRepo(r) {
  return {
    name: r.name,
    description: r.description,
    language: r.language,
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

  const images = await mapWithLimit(repos, README_CONCURRENCY, fetchReadmeImage);

  const payload = {
    fetchedAt: new Date().toISOString(),
    repos: repos.map(slimRepo),
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
