/**
 * Cloudflare Worker / Generic CORS Proxy for 3D Text STL Studio
 * Generic proxy that fetches the requested target URL directly without site-specific logic.
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

    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response('Missing parameter: use ?url=https://...', {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
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
      return new Response(`Failed to fetch target URL: ${response.status} ${response.statusText}`, {
        status: response.status || 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
