#!/usr/bin/env node
// Fetch GitHub repos (owned + contributed-to) + docs/images/preview.* hero
// images, write a JSON snapshot to disk. Designed to be run by cron once per
// hour. Writes atomically via tmp+rename so nginx never serves a half-written
// file.
//
// "Contributed" is defined as: any repo GitHub recognizes the user as having
// contributed to (commit, PR, review, or issue). Sourced via the GraphQL
// `user.repositoriesContributedTo` field — REST has no equivalent and the
// Search API only sees merged PRs.
//
// GITHUB_TOKEN is REQUIRED for contributions to populate (GraphQL refuses
// unauthenticated requests). Without it, owned repos still work; contributions
// silently return [].
//
// Env:
//   GH_USER         (default "mi-zuri") — owner of the repo listing
//   GH_CONTRIB_USER (default GH_USER) — personal login used for the
//                   contributions query; set when GH_USER is an org
//   OUT_PATH        (default "/var/www/mi.zur-i/data/projects.json")
//   GITHUB_TOKEN    required for contributions; raises rate limit from
//                   60/hr to 5000/hr regardless
//   README_CONCURRENCY  optional; max parallel side-call fetches (default 6)

import { writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const GH_USER = process.env.GH_USER || "mi-zuri";
const GH_CONTRIB_USER = process.env.GH_CONTRIB_USER || GH_USER;
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
    full_name: r.full_name,
    description: r.description,
    language: r.language,
    languages: languages || [],
    homepage: r.homepage,
    html_url: r.html_url,
    updated_at: r.updated_at,
  };
}

// GraphQL → every repo the user has contributed to (commit, PR, review,
// issue). Paginates through all pages. Returns "owner/name" pairs that the
// REST hydrate step then turns into full repo objects.
//
// `includeUserRepositories: false` excludes repos the user owns — those come
// from the REST listing already. Without a token GraphQL 401s, so we bail
// quietly and let the script continue with owned repos only.
async function fetchContributedFullNames() {
  if (!TOKEN) {
    console.warn(
      "no GITHUB_TOKEN set; skipping contributions (GraphQL requires auth)",
    );
    return [];
  }
  const query = `
    query($login: String!, $cursor: String) {
      user(login: $login) {
        repositoriesContributedTo(
          first: 100,
          after: $cursor,
          privacy: PUBLIC,
          includeUserRepositories: false,
          contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW, ISSUE]
        ) {
          pageInfo { hasNextPage endCursor }
          nodes { nameWithOwner isFork }
        }
      }
    }`;
  const names = [];
  let cursor = null;
  for (let page = 0; page < 10; page++) {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { login: GH_CONTRIB_USER, cursor },
      }),
    });
    if (!res.ok) {
      console.warn(`graphql contributions responded ${res.status}; skipping`);
      return names;
    }
    const json = await res.json();
    if (json.errors) {
      console.warn(`graphql errors: ${JSON.stringify(json.errors)}`);
      return names;
    }
    const conn = json.data?.user?.repositoriesContributedTo;
    if (!conn) return names;
    for (const n of conn.nodes) {
      if (!n.isFork) names.push(n.nameWithOwner);
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return names;
}

async function fetchRepoByUrl(url) {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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
  const ownRepos = allRepos.filter((r) => !r.fork);
  const ownFullNames = new Set(ownRepos.map((r) => r.full_name));

  // Contributed repos: dedupe against owned (so a contribution to your own
  // repo doesn't double-count) and drop forks for the same reason owned forks
  // are dropped.
  const contribFullNames = (await fetchContributedFullNames()).filter(
    (fn) => !ownFullNames.has(fn),
  );
  const contribUrls = contribFullNames.map(
    (fn) => `https://api.github.com/repos/${fn}`,
  );
  const contribReposRaw = await mapWithLimit(
    contribUrls,
    README_CONCURRENCY,
    fetchRepoByUrl,
  );
  const contribRepos = contribReposRaw.filter((r) => r && !r.fork);

  // Merge, then re-sort by updated_at since the two sources are independently
  // ordered. Newest first.
  const repos = [...ownRepos, ...contribRepos].sort(
    (a, b) => new Date(b.updated_at) - new Date(a.updated_at),
  );

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
    `[${new Date().toISOString()}] wrote ${repos.length} repos (${ownRepos.length} owned + ${contribRepos.length} contributed, ${images.filter(Boolean).length} with images) to ${OUT_PATH}`,
  );
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] fetch failed:`, err);
  process.exit(1);
});
