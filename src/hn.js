// hn.js — pull recent stories from Hacker News.
//
// We use the free Algolia HN Search API because a single request gives us
// recent stories already sorted by date, with title/url/points/comments.
// (The official Firebase API would need one request per story id.)
//
// Docs: https://hn.algolia.com/api

const RECENT_URL = 'https://hn.algolia.com/api/v1/search_by_date?tags=story';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Raw fetch of the N most recent HN stories. Node 18+ has a built-in `fetch`.
async function fetchRecentStories(limit = 30) {
  const res = await fetch(`${RECENT_URL}&hitsPerPage=${limit}`);
  if (!res.ok) throw new Error(`HN API error: ${res.status}`);
  const json = await res.json();

  // Normalise into the small shape the rest of the app cares about.
  return (json.hits || [])
    .filter((h) => h.title) // drop anything without a title
    .map((h) => ({
      hnId: Number(h.objectID),
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points ?? 0,
      author: h.author ?? '',
      comments: h.num_comments ?? 0,
    }));
}

// ---- shared cache ----
// All monitors read HN through here. This decouples "how many monitors" from
// "how many API calls": every monitor fetching the same front page shares one
// result for CACHE_TTL_MS. With 50 monitors we hit the API roughly once per 5
// minutes instead of 50 times.
let cache = { stories: null, at: 0 };
let inFlight = null; // a fetch currently in progress (for request coalescing)

async function getRecentStories(limit = 30, ttlMs = CACHE_TTL_MS) {
  const now = Date.now();

  // 1) Fresh enough? Serve from cache — zero API calls.
  if (cache.stories && now - cache.at < ttlMs) return cache.stories;

  // 2) A fetch is already running (e.g. many monitors ticked at once)? Wait for
  //    that same request instead of starting another. This is the "no duplicate
  //    calls in the same instant" guarantee.
  if (inFlight) return inFlight;

  // 3) Cache is stale and nobody's fetching — do one real fetch and cache it.
  inFlight = fetchRecentStories(limit)
    .then((stories) => {
      cache = { stories, at: Date.now() };
      return stories;
    })
    .catch((err) => {
      // On failure, fall back to stale data if we have any, so a transient API
      // hiccup doesn't break every monitor tick.
      if (cache.stories) return cache.stories;
      throw err;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// How old the cached data is, in ms (for logging/UI). Infinity if never fetched.
function cacheAgeMs() {
  return cache.at ? Date.now() - cache.at : Infinity;
}

module.exports = { fetchRecentStories, getRecentStories, cacheAgeMs, CACHE_TTL_MS };
