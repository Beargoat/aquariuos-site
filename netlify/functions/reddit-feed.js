// netlify/functions/reddit-feed.js
// Proxies requests to Reddit's public JSON API, bypassing browser CORS restrictions.
// No API key needed — uses Reddit's public .json endpoint.

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

  const subreddit = 'AquariuOS';
  const limit = 10;

  // Try both www and old reddit — old.reddit is more permissive with server requests
  const urls = [
    `https://www.reddit.com/r/${subreddit}.json?limit=${limit}&raw_json=1`,
    `https://old.reddit.com/r/${subreddit}.json?limit=${limit}&raw_json=1`,
  ];

  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AquariuOS-site/1.0; +https://aquariuos.com)',
          'Accept': 'application/json',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        lastError = `Reddit returned ${response.status}`;
        continue;
      }

      const data = await response.json();

      if (!data || !data.data || !data.data.children) {
        lastError = 'Unexpected response structure from Reddit';
        continue;
      }

      const posts = data.data.children
        .map(c => c.data)
        .filter(p => !p.stickied)
        .map(p => ({
          id:           p.id,
          title:        p.title,
          selftext:     p.selftext || '',
          url:          p.url,
          permalink:    p.permalink,
          created_utc:  p.created_utc,
          num_comments: p.num_comments,
          score:        p.score,
          preview_url:  getPreviewUrl(p),
        }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ posts }),
      };

    } catch (err) {
      lastError = err.message;
      continue;
    }
  }

  return {
    statusCode: 502,
    headers,
    body: JSON.stringify({ error: lastError || 'Could not reach Reddit', posts: [] }),
  };
};

function getPreviewUrl(post) {
  try {
    const resolutions = post.preview.images[0].resolutions;
    let best = resolutions[resolutions.length - 1];
    for (let i = resolutions.length - 1; i >= 0; i--) {
      if (resolutions[i].width <= 1200) { best = resolutions[i]; break; }
    }
    return best ? best.url : null;
  } catch (e) {
    return null;
  }
}
