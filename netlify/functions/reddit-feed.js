// netlify/functions/reddit-feed.js
// Uses Reddit's JSON API (no CORS issue server-side) to get clean post selftext.

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const response = await fetch(
      'https://www.reddit.com/r/AquariuOS.json?limit=10&raw_json=1',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AquariuOS-site/1.0; +https://aquariuos.com)',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return { statusCode: response.status, headers, body: JSON.stringify({ error: 'Reddit returned ' + response.status, posts: [] }) };
    }

    const data = await response.json();

    const posts = data.data.children
      .map(function(c) { return c.data; })
      .filter(function(p) { return !p.stickied; })
      .map(function(p) {
        return {
          title:        p.title,
          permalink:    p.permalink,
          url:          'https://www.reddit.com' + p.permalink,
          author:       p.author,
          created_utc:  p.created_utc,
          num_comments: p.num_comments,
          selftext:     firstTwoParagraphs(p.selftext || ''),
        };
      });

    return { statusCode: 200, headers, body: JSON.stringify({ posts }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, posts: [] }) };
  }
};

function firstTwoParagraphs(text) {
  if (!text || text.trim() === '') return '';
  // Reddit selftext is markdown — paragraphs are separated by double newlines
  var paragraphs = text
    .split(/\n\n+/)
    .map(function(p) { return p.trim(); })
    .filter(function(p) { return p.length > 0; });

  var result = paragraphs.slice(0, 2).join('\n\n');
  var hasMore = paragraphs.length > 2;

  // Strip markdown syntax for clean display
  result = result
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')       // italic
    .replace(/~~(.+?)~~/g, '$1')       // strikethrough
    .replace(/`(.+?)`/g, '$1')         // inline code
    .replace(/#{1,6}\s+/g, '')         // headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links → just text
    .replace(/^>\s+/gm, '')            // blockquotes
    .replace(/^[-*+]\s+/gm, '')        // list bullets
    .replace(/^\d+\.\s+/gm, '')        // numbered lists
    .trim();

  return hasMore ? result + '\u2026' : result;
}
