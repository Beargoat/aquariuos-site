// netlify/functions/reddit-feed.js
// Fetches r/AquariuOS via RSS — reliable for server-side requests, no auth needed.

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
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: 'RSS returned ' + response.status, posts: [] }),
      };
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
      var content = getTag(entry, 'content');

      if (!title || !link) continue;

      // Strip the HTML content down to plain readable text
      var selftext = extractSelftext(stripCDATA(content));

      var created_utc = updated ? Math.floor(new Date(updated).getTime() / 1000) : 0;
      var permalink   = link.replace('https://www.reddit.com', '');
      var preview_url = extractImage(stripCDATA(content));

      posts.push({
        title:        title,
        permalink:    permalink,
        selftext:     selftext,
        created_utc:  created_utc,
        preview_url:  preview_url,
        num_comments: 0,
        url:          link,
      });
    } catch (e) { continue; }
  }

  return posts.slice(0, 10);
}

// Pull out the actual post body text, ignoring the Reddit-injected
// "submitted by /u/..." footer and [link]/[comments] cruft
function extractSelftext(html) {
  if (!html) return '';

  // Reddit wraps the actual post body in a <div> before the "submitted by" table
  // The structure is roughly:
  //   <!-- SC_OFF --><div class="md">...actual text...</div><!-- SC_ON -->
  //   <table>...submitted by footer...</table>
  var mdMatch = html.match(/class="md"[^>]*>([\s\S]*?)<\/div>/i);
  if (mdMatch) {
    var bodyHtml = mdMatch[1];
    // Strip inner HTML tags, decode entities, trim
    var text = decodeEntities(bodyHtml.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ').trim();
    return text.slice(0, 400) + (text.length > 400 ? '\u2026' : '');
  }

  // Fallback: strip everything — remove the footer table first
  var stripped = html
    .replace(/<table[\s\S]*?<\/table>/gi, '')   // remove "submitted by" table
    .replace(/<[^>]+>/g, ' ')                   // strip remaining tags
    .replace(/\[link\]|\[comments\]/g, '')       // remove [link] [comments] text
    .replace(/submitted by\s+\/u\/\S+/gi, '')   // remove "submitted by /u/x"
    .replace(/&#32;/g, ' ');                     // decode &#32; (space)

  var text = decodeEntities(stripped).replace(/\s+/g, ' ').trim();
  return text.slice(0, 400) + (text.length > 400 ? '\u2026' : '');
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

function stripCDATA(s) {
  return s ? s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
}

function cleanText(s) {
  return decodeEntities(stripCDATA(s).replace(/<[^>]+>/g, '')).trim();
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#32;/g, ' ')
    .replace(/&#\d+;/g, ' ');
}

function extractImage(html) {
  if (!html) return null;
  // Look for preview.redd.it images specifically — those are Reddit's image previews
  var m = html.match(/https:\/\/preview\.redd\.it\/[^"'\s)]+/i);
  if (m) return m[0].replace(/&amp;/g, '&');
  // Fallback to any img src
  var img = html.match(/<img[^>]+src="([^"]+)"/i);
  return img ? img[1].replace(/&amp;/g, '&') : null;
}
