// netlify/functions/reddit-feed.js
// Tries JSON API first (clean selftext), falls back to RSS if blocked.

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=180',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // ── Try JSON API first ──
  try {
    const r = await fetch('https://www.reddit.com/r/AquariuOS.json?limit=10&raw_json=1', {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });

    if (r.ok) {
      const data = await r.json();
      if (data && data.data && data.data.children && data.data.children.length) {
        const posts = data.data.children
          .map(function(c) { return c.data; })
          .filter(function(p) { return !p.stickied; })
          .map(function(p) {
            return {
              title:        p.title,
              url:          'https://www.reddit.com' + p.permalink,
              author:       p.author,
              created_utc:  p.created_utc,
              num_comments: p.num_comments,
              selftext:     firstTwoParagraphs(p.selftext || ''),
            };
          });
        return { statusCode: 200, headers, body: JSON.stringify({ posts, via: 'json' }) };
      }
    }
  } catch(e) { /* fall through to RSS */ }

  // ── Fall back to RSS ──
  try {
    const r = await fetch('https://www.reddit.com/r/AquariuOS/.rss?limit=10', {
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, text/xml' },
    });

    if (!r.ok) {
      return { statusCode: r.status, headers, body: JSON.stringify({ error: 'Both JSON and RSS failed', posts: [] }) };
    }

    const xml = await r.text();
    const posts = parseRSS(xml);
    return { statusCode: 200, headers, body: JSON.stringify({ posts, via: 'rss' }) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message, posts: [] }) };
  }
};

// ── JSON helpers ──

function firstTwoParagraphs(text) {
  if (!text || !text.trim()) return '';
  var paras = text.split(/\n\n+/)
    .map(function(p) { return p.trim(); })
    .filter(function(p) { return p.length > 10; });
  var result = paras.slice(0, 2).join('\n\n');
  var more = paras.length > 2;
  result = result
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .trim();
  return more ? result + '\u2026' : result;
}

// ── RSS helpers ──

function parseRSS(xml) {
  var posts = [];
  var re = /<entry>([\s\S]*?)<\/entry>/g;
  var m;
  while ((m = re.exec(xml)) !== null) {
    try {
      var e    = m[1];
      var title = clean(getTag(e, 'title'));
      var link  = getAttr(e, 'link', 'href') || getRedditLink(e);
      var upd   = getTag(e, 'updated');
      var author = clean(getTag(e, 'name'));
      var content = stripCDATA(getTag(e, 'content'));
      if (!title || !link) continue;

      // Extract readable body from HTML content
      var selftext = extractBody(content);

      posts.push({
        title:        title,
        url:          link,
        author:       author,
        created_utc:  upd ? Math.floor(new Date(upd).getTime() / 1000) : 0,
        num_comments: 0,
        selftext:     selftext,
      });
    } catch(ex) { continue; }
  }
  return posts.slice(0, 10);
}

function extractBody(html) {
  if (!html) return '';
  // Reddit RSS content = HTML. The post body is in <div class="md">
  // Everything after is the "submitted by" table footer — discard it.
  var mdMatch = html.match(/class="md"[^>]*>([\s\S]*?)<\/div>/i);
  var bodyHtml = mdMatch ? mdMatch[1] : html.replace(/<table[\s\S]*?<\/table>/gi, '');

  // Strip tags and decode
  var text = bodyHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'").replace(/&#32;/g,' ').replace(/&nbsp;/g,' ')
    .replace(/\s+/g, ' ').trim();

  if (!text || text.length < 10) return '';

  // Take first two "paragraphs" — sentences separated by 2+ spaces or sentence ends
  var paras = text.split(/\s{2,}/).filter(function(p){ return p.trim().length > 10; });
  var result = paras.slice(0, 2).join(' ');
  return result.length > 400 ? result.slice(0, 400) + '\u2026' : result;
}

function getTag(xml, tag) {
  var re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  var m = xml.match(re);
  return m ? m[1].trim() : '';
}

function getAttr(xml, tag, attr) {
  var re = new RegExp('<' + tag + '[^>]*\\s' + attr + '="([^"]*)"', 'i');
  var m = xml.match(re);
  return m ? m[1] : '';
}

function getRedditLink(xml) {
  var m = xml.match(/href="(https:\/\/www\.reddit\.com\/r\/[^"]+)"/i);
  return m ? m[1] : '';
}

function stripCDATA(s) {
  return s ? s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
}

function clean(s) {
  if (!s) return '';
  return stripCDATA(s).replace(/<[^>]+>/g,'')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#32;/g,' ')
    .replace(/\s+/g,' ').trim();
}
