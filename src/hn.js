// hn.js — pull recent stories from Hacker News.
//
// We use the free Algolia HN Search API because a single request gives us
// recent stories already sorted by date, with title/url/points/comments.
// (The official Firebase API would need one request per story id.)
//
// Docs: https://hn.algolia.com/api

const RECENT_URL = 'https://hn.algolia.com/api/v1/search_by_date?tags=story';

// Fetch the N most recent HN stories. Node 18+ has a built-in `fetch`.
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

module.exports = { fetchRecentStories };
