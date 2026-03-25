// netlify/functions/reddit-feed.js
// Fetches r/AquariuOS via RSS. Returns titles, dates, and links only — no body parsing.

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
    const response = await fetch('https://www.reddit.com/r/AquariuOS/.rss?limit=10', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AquariuOS-site/1.0; +https://aquariuos.com)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      return { statusCode: response.status, headers, body: JSON.stringify({ error: 'RSS returned ' + response.status, posts: [] }) };
    }

    const xml = await response.text();
    const posts = parseRSS(xml);
    return { statusCode: 200, headers, body: JSON.stringify({ posts }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, posts: [] }) };
  }
};

function parseRSS(xml) {
  var posts = [];
  var entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  var m;

  while ((m = entryRe.exec(xml)) !== null) {
    try {
      var entry   = m[1];
      var title   = cleanText(getTag(entry, 'title'));
      var link    = getAttr(entry, 'link', 'href') || getLinkText(entry);
      var updated = getTag(entry, 'updated');
      var author  = cleanText(getTag(entry, 'name'));

      if (!title || !link) continue;

      posts.push({
        title:       title,
        permalink:   link.replace('https://www.reddit.com', ''),
        author:      author,
        created_utc: updated ? Math.floor(new Date(updated).getTime() / 1000) : 0,
        url:         link,
      });
    } catch (e) { continue; }
  }

  return posts.slice(0, 10);
}

function getTag(xml, tag) {
  var re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  var match = xml.match(re);
  return match ? match[1].trim() : '';
}

function getAttr(xml, tag, attr) {
  var re = new RegExp('<' + tag + '[^>]*\\s' + attr + '="([^"]*)"', 'i');
  var match = xml.match(re);
  return match ? match[1] : '';
}

function getLinkText(xml) {
  var m = xml.match(/href="(https:\/\/www\.reddit\.com\/r\/[^"]+)"/i);
  return m ? m[1] : '';
}

function cleanText(s) {
  if (!s) return '';
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#32;/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
