// Only the real site should ever hear a browser response from these
// functions. Local dev talks to Supabase through Vite's own dev-server
// proxy (see frontend/vite.config.ts), which is same-origin from the
// browser's point of view, so it never needs a CORS allowance here.
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://havagr8day.com',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Expose-Headers': '*',
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  return null
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

export function errorResponse(detail: string, status: number): Response {
  return jsonResponse({ detail }, status)
}
