/**
 * Cloudflare Worker / Vercel Edge Proxy for 3D Text STL Studio
 * 
 * Setup Instructions:
 * 1. Create a free Cloudflare Worker at https://workers.cloudflare.com
 * 2. Click "Create Worker", paste this entire file, and click "Save and Deploy"
 * 3. Copy your Worker URL (e.g., https://dafont-proxy.yourname.workers.dev)
 * 4. Paste your Worker URL into window.CUSTOM_PROXY_URL in js/app.js
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

    const slug = url.searchParams.get('f');
    const directUrl = url.searchParams.get('url');

    let targetUrl = '';
    if (directUrl) {
      targetUrl = directUrl;
    } else if (slug) {
      targetUrl = `https://dl.dafont.com/dl/?f=${encodeURIComponent(slug)}`;
    } else {
      return new Response('Missing parameter: use ?f=fontname or ?url=https://...', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
        }
      });

      if (!response.ok) {
        return new Response(`Upstream request failed with status ${response.status}`, {
          status: response.status,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }

      const body = await response.arrayBuffer();

      return new Response(body, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
