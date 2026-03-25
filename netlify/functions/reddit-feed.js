// netlify/functions/reddit-feed.js
// Fetches r/AquariuOS — titles, dates, authors, comment counts only.

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

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // Try JSON first (gives comment counts), fall back to RSS
  try {
    const r = await fetch('https://www.reddit.com/r/AquariuOS.json?limit=10&raw_json=1', {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });
    if (r.ok) {
      const data = await r.json();
      if (data && data.data && data.data.children && data.data.children.length) {
        const posts = data.data.children
          .map(c => c.data)
          .filter(p => !p.stickied)
          .map(p => ({
            title:        p.title,
            url:          'https://www.reddit.com' + p.permalink,
            author:       p.author,
            created_utc:  p.created_utc,
            num_comments: p.num_comments,
          }));
        return { statusCode: 200, headers, body: JSON.stringify({ posts }) };
      }
    }
  } catch(e) {}

  // RSS fallback
  try {
    const r = await fetch('https://www.reddit.com/r/AquariuOS/.rss?limit=10', {
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, text/xml' },
    });
    if (!r.ok) throw new Error('RSS ' + r.status);
    const xml = await r.text();
    const posts = parseRSS(xml);
    return { statusCode: 200, headers, body: JSON.stringify({ posts }) };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, posts: [] }) };
  }
};

function parseRSS(xml) {
  var posts = [];
  var re = /<entry>([\s\S]*?)<\/entry>/g;
  var m;
  while ((m = re.exec(xml)) !== null) {
    try {
      var e = m[1];
      var title  = clean(getTag(e, 'title'));
      var link   = getAttr(e, 'link', 'href') || getRedditLink(e);
      var upd    = getTag(e, 'updated');
      var author = clean(getTag(e, 'name'));
      if (!title || !link) continue;
      posts.push({
        title:        title,
        url:          link,
        author:       author,
        created_utc:  upd ? Math.floor(new Date(upd).getTime() / 1000) : 0,
        num_comments: 0,
      });
    } catch(ex) { continue; }
  }
  return posts.slice(0, 10);
}

function getTag(xml, tag) {
  var m = xml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return m ? m[1].trim() : '';
}
function getAttr(xml, tag, attr) {
  var m = xml.match(new RegExp('<' + tag + '[^>]*\\s' + attr + '="([^"]*)"', 'i'));
  return m ? m[1] : '';
}
function getRedditLink(xml) {
  var m = xml.match(/href="(https:\/\/www\.reddit\.com\/r\/[^"]+)"/i);
  return m ? m[1] : '';
}
function clean(s) {
  if (!s) return '';
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#32;/g,' ')
    .replace(/\s+/g,' ').trim();
}
