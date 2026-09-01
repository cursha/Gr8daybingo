// =============================================================================
// Integration test for the mark-cell race-condition guard.
//
// This is the protection the security audit's stress test verified by hand
// (fire N simultaneous mark-cell requests at the same square, confirm exactly
// one wins) — automated here so a future refactor that reintroduces the
// "claim, then separately write" gap gets caught by `deno task test`, not by
// someone noticing double-rewards in production.
//
// Needs a live local Supabase stack with the edge functions actually serving
// (`supabase start` + `supabase functions serve`), unlike the pure-logic
// tests in this directory — it exercises the real /mark-cell route over
// HTTP, including the database write. If that stack isn't up, this test
// skips itself with a clear message instead of failing `deno task test` for
// anyone who hasn't started it.
// =============================================================================

const BASE_URL = Deno.env.get('SUPABASE_TEST_URL') ?? 'http://127.0.0.1:54321'
// Supabase's fixed local-dev anon key — printed by `supabase start` for every
// project using the CLI's default config, not a secret.
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const FN_URL = (fn: string, path: string) => `${BASE_URL}/functions/v1/${fn}${path}`

async function checkServerAvailable(): Promise<boolean> {
  try {
    const resp = await fetch(FN_URL('game', '/win-conditions'), {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      signal: AbortSignal.timeout(2000),
    })
    return resp.ok
  } catch {
    return false
  }
}

const SERVER_AVAILABLE = await checkServerAvailable()
if (!SERVER_AVAILABLE) {
  console.log(
    '\n⚠ mark_cell_concurrency.test.ts: no local Supabase functions server reachable at ' +
    `${BASE_URL} — skipping. Run "supabase start" and "supabase functions serve" first ` +
    'to exercise this test.\n',
  )
}

async function registerAnonymousPlayer(): Promise<string> {
  const nickname = `concurtest${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
  const resp = await fetch(FN_URL('auth-custom', '/register-anonymous'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ nickname, password: 'testpass123' }),
  })
  if (!resp.ok) throw new Error(`register-anonymous failed: ${resp.status} ${await resp.text()}`)
  const data = await resp.json()
  return data.token as string
}

interface GeneratedCard {
  card_id: number
  cells: Array<{ index: number; is_free_space: boolean; is_purchasable: boolean; is_bomb?: boolean; is_secret?: boolean }>
}

async function generateCard(token: string): Promise<GeneratedCard> {
  const resp = await fetch(FN_URL('game', '/generate-card'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    body: '{}',
  })
  if (!resp.ok) throw new Error(`generate-card failed: ${resp.status} ${await resp.text()}`)
  return await resp.json()
}

async function markCell(token: string, cardId: number, cellIndex: number): Promise<{ status: number; body: any }> {
  const resp = await fetch(FN_URL('game', '/mark-cell'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ card_id: cardId, cell_index: cellIndex }),
  })
  return { status: resp.status, body: await resp.json().catch(() => null) }
}

Deno.test({
  name: 'mark-cell: N simultaneous requests for the same square — exactly one wins',
  ignore: !SERVER_AVAILABLE,
  async fn() {
    const token = await registerAnonymousPlayer()
    const card = await generateCard(token)

    const plainCell = card.cells.find((c) => !c.is_free_space && !c.is_purchasable && !c.is_bomb && !c.is_secret)
    if (!plainCell) throw new Error('Generated card has no plain (non-special) cell to test against — cannot proceed.')

    const CONCURRENCY = 10
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => markCell(token, card.card_id, plainCell.index)),
    )

    const successes = results.filter((r) => r.status === 200 && r.body?.success === true)
    const rejections = results.filter((r) => r.status !== 200 || r.body?.success !== true)

    if (successes.length !== 1) {
      throw new Error(
        `Expected exactly 1 of ${CONCURRENCY} simultaneous mark-cell requests to succeed, got ${successes.length}. ` +
        `Statuses: ${results.map((r) => r.status).join(', ')}`,
      )
    }
    if (rejections.length !== CONCURRENCY - 1) {
      throw new Error(`Expected ${CONCURRENCY - 1} rejected requests, got ${rejections.length}`)
    }
    // Every rejection should be a real, expected rejection (409 "updated
    // elsewhere" from the race guard, or 400 "already marked" for a request
    // that read the card after the winner had already committed) — not some
    // unrelated server error masquerading as a rejection.
    for (const r of rejections) {
      if (r.status !== 409 && r.status !== 400) {
        throw new Error(`Unexpected rejection status ${r.status}: ${JSON.stringify(r.body)}`)
      }
    }

    // Re-fetch the card and confirm the win was persisted exactly once —
    // the real invariant this guard exists to protect, not just the HTTP
    // response shapes above.
    const refreshed = await generateCard(token)
    const completedCount = (refreshed as any).completed_cells?.filter((i: number) => i === plainCell.index).length
    if (completedCount !== 1) {
      throw new Error(`Expected cell ${plainCell.index} to appear exactly once in completed_cells, found ${completedCount}`)
    }
  },
})
