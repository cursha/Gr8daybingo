// Shared helper for the short, non-agentic Claude text-generation calls used
// across edge functions (game announcement extra message, weekly-update
// subject line, weekly-update body, new-game-launch encouragement blurb).
// Handles only the network call, timeout, and text extraction — every
// caller owns its own prompt, validation rules, and fallback text, since
// those differ per call site and don't belong in a shared layer.

export interface AnthropicTextCallOptions {
  prompt: string
  maxTokens: number
  /** Defaults to 5000. Short copy tasks (a subject line, a one-paragraph
   *  blurb) fit comfortably inside 5s; a call generating a larger structured
   *  response should pass a higher value explicitly rather than inherit a
   *  budget sized for much shorter output. */
  timeoutMs?: number
  /** Defaults to 'claude-sonnet-5'. */
  model?: string
}

export type AnthropicTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: string }

/** Pulls the text out of a Claude Messages API response, matching on the
 *  typed 'text' block instead of assuming position (a thinking or other
 *  block type could otherwise land first). */
export function extractResponseText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  // deno-lint-ignore no-explicit-any
  const block = content.find((b: any) => b?.type === 'text')
  return block?.text ?? ''
}

/** Calls the Claude Messages API for a single short text response. Thinking
 *  is always disabled — every current caller is a short creative/copy task
 *  where thinking only adds latency against a tight timeout budget, never
 *  quality. Never throws: returns a discriminated result instead, since
 *  every caller is expected to fall back to its own default on `ok: false`
 *  rather than have a raised exception dictate that behaviour. Validation
 *  (word/char limits, banned characters, JSON shape, etc.) is caller-
 *  specific and intentionally stays out of this helper. */
export async function callAnthropicForText(
  anthropicKey: string,
  opts: AnthropicTextCallOptions,
): Promise<AnthropicTextResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000)
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: opts.model ?? 'claude-sonnet-5',
        max_tokens: opts.maxTokens,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: opts.prompt }],
      }),
      signal: controller.signal,
    })
    if (!resp.ok) {
      return { ok: false, reason: `api_error_${resp.status}` }
    }
    const json = await resp.json()
    const text = extractResponseText(json?.content).trim()
    if (!text) return { ok: false, reason: 'empty_response' }
    return { ok: true, text }
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'api_error'
    return { ok: false, reason }
  } finally {
    clearTimeout(timeoutId)
  }
}
