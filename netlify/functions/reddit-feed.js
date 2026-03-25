// netlify/functions/reddit-feed.js
// Fetches r/AquariuOS via RSS — more reliable than JSON API for server-side requests.

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

  const rssUrl = 'https://www.reddit.com/r/AquariuOS/.rss?limit=10';

  try {
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AquariuOS-site/1.0; +https://aquariuos.com)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'RSS fetch returned ' + response.status, posts: [] }),
      };
    }

    const xml = await response.text();
    const posts = parseRSS(xml);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ posts }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, posts: [] }),
    };
  }
};

function parseRSS(xml) {
  var posts = [];
  var entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  var match;

  while ((match = entryRegex.exec(xml)) !== null) {
    try {
      var entry   = match[1];
      var title   = getTag(entry, 'title');
      var link    = getAttr(entry, 'link', 'href') || getLinkText(entry);
      var updated = getTag(entry, 'updated');
      var content = getTag(entry, 'content');

      if (!title || !link) continue;

      title   = stripCDATA(title);
      content = stripCDATA(content);

      var permalink   = link.replace('https://www.reddit.com', '');
      var selftext    = content ? stripHtml(content).slice(0, 500) : '';
      var created_utc = updated ? Math.floor(new Date(updated).getTime() / 1000) : 0;
      var preview_url = extractImage(content);

      posts.push({
        title:        title,
        permalink:    permalink,
        selftext:     selftext,
        created_utc:  created_utc,
        preview_url:  preview_url,
        num_comments: 0,
        url:          link,
      });
    } catch (e) {
      continue;
    }
  }

  return posts.slice(0, 10);
}

function getTag(xml, tag) {
  var re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  var m = xml.match(re);
  return m ? m[1].trim() : '';
}

function getAttr(xml, tag, attr) {
  var re = new RegExp('<' + tag + '[^>]*' + attr + '="([^"]*)"', 'i');
  var m = xml.match(re);
  return m ? m[1] : '';
}

function getLinkText(xml) {
  var m = xml.match(/href="(https:\/\/www\.reddit\.com\/r\/[^"]+)"/i);
  return m ? m[1] : '';
}

function stripCDATA(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function stripHtml(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractImage(html) {
  if (!html) return null;
  var m = html.match(/<img[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}
