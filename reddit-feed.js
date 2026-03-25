// netlify/functions/reddit-feed.js
// Proxies requests to Reddit's public JSON API, bypassing browser CORS restrictions.
// No API key needed — uses Reddit's public .json endpoint.

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300', // cache for 5 minutes
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const subreddit = 'AquariuOS';
  const limit = 10;
  const url = `https://www.reddit.com/r/${subreddit}.json?limit=${limit}&raw_json=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AquariuOS-site/1.0 (aquariuos.com)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'Reddit returned ' + response.status }),
      };
    }

    const data = await response.json();

    // Extract and clean up just what the front-end needs
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
        // Only pass through the image preview if it exists
        preview_url:  getPreviewUrl(p),
      }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ posts }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Fetch failed: ' + err.message }),
    };
  }
};

function getPreviewUrl(post) {
  try {
    const resolutions = post.preview.images[0].resolutions;
    // Pick the largest resolution under 1200px wide
    let best = resolutions[resolutions.length - 1];
    for (let i = resolutions.length - 1; i >= 0; i--) {
      if (resolutions[i].width <= 1200) { best = resolutions[i]; break; }
    }
    return best ? best.url : null;
  } catch (e) {
    return null;
  }
}
