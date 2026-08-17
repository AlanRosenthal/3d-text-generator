/**
 * Cloudflare Worker / Edge Proxy for 3D Text STL Studio
 * Resolves daFont URLs (e.g., https://www.dafont.com/verandah-reverie.font)
 * by fetching the target URL directly and returning binary font data.
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Handle CORS preflight OPTIONS request
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    const directUrl = url.searchParams.get('url');

    if (!directUrl) {
      return new Response('Missing parameter: use ?url=https://www.dafont.com/...', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Target URLs: try direct URL and fallback download endpoint extracted from daFont URL
    const targetUrls = [directUrl];
    const match = directUrl.match(/f=([a-zA-Z0-9_-]+)/) || directUrl.match(/dafont\.com\/([a-zA-Z0-9_-]+)/);
    if (match && match[1] && match[1] !== 'dl') {
      const slug = match[1].replace(/\.font$/i, '');
      const underscoreSlug = slug.replace(/-/g, '_');
      const hyphenSlug = slug.replace(/_/g, '-');
      targetUrls.push(`https://dl.dafont.com/dl/?f=${encodeURIComponent(underscoreSlug)}`);
      if (hyphenSlug !== underscoreSlug) {
        targetUrls.push(`https://dl.dafont.com/dl/?f=${encodeURIComponent(hyphenSlug)}`);
      }
    }

    let lastError = null;
    for (const targetUrl of targetUrls) {
      try {
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
          }
        });

        if (response.ok) {
          const body = await response.arrayBuffer();
          if (body && body.byteLength > 100) {
            return new Response(body, {
              status: 200,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Content-Type': 'application/octet-stream',
                'Cache-Control': 'public, max-age=86400'
              }
            });
          }
        }
      } catch (err) {
        lastError = err;
      }
    }

    return new Response(`Could not fetch font package: ${lastError ? lastError.message : 'Not found'}`, {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
};
