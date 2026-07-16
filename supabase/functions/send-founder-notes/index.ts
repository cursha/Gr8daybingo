import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getSupabase } from '../_shared/db.ts'
import { sendEmail, founderNoteEmail } from '../_shared/email.ts'
import { callAnthropicForText } from '../_shared/anthropic.ts'

// Hourly job (see 20260726000001_schedule_send_founder_notes.sql): sends
// every founder_note_queue row whose scheduled_send_at has arrived. Rows are
// queued by maybeQueueFounderNote in game/index.ts, one Anthropic call per
// row (never batched — each note is written for one specific player + deed,
// unlike the shared/templated AI content elsewhere in this app).

// Edit this prompt freely — it's isolated from the call/send logic below.
// {{FIRST_NAME}} and {{DEED_TEXT}} are the only two substitutions; the
// greeting and "- Curt" sign-off are added by founderNoteEmail (_shared/
// email.ts), not by the model, so the note always opens/closes correctly
// regardless of what the model produces for the body.
const FOUNDER_NOTE_PROMPT = `Write a short, casual, warm personal note (2-3 sentences) from Curt, the founder of HavaGr8Day, to a player named {{FIRST_NAME}} who just completed this good deed: "{{DEED_TEXT}}". React specifically to what they did — no generic praise. Keep it genuinely casual, like a quick personal message, never corporate or promotional. Do not mention money, prizes, or competition. Do not include a greeting (e.g. "Hi {{FIRST_NAME}},") or a sign-off (e.g. "- Curt") — those are added separately. Return ONLY the message body text, no preamble, no quotation marks.`

interface QueueRow {
  id: number
  user_id: string
  deed_text_snapshot: string
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret) {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (authHeader !== `Bearer ${cronSecret}`) {
      return errorResponse('Unauthorized', 401)
    }
  }

  const supabase = getSupabase()

  try {
    const { data: due, error: dueErr } = await supabase
      .from('founder_note_queue')
      .select('id, user_id, deed_text_snapshot')
      .eq('status', 'pending')
      .lte('scheduled_send_at', new Date().toISOString())
      .order('scheduled_send_at', { ascending: true })
    if (dueErr) throw dueErr

    const rows = (due ?? []) as QueueRow[]
    if (rows.length === 0) {
      return jsonResponse({ success: true, processed: 0, sent: 0, failed: 0 })
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    let sent = 0
    let failed = 0

    for (const row of rows) {
      try {
        const { data: player } = await supabase
          .from('users').select('email, first_name, name, username').eq('id', row.user_id).maybeSingle()
        if (!player?.email) {
          await markFailed(supabase, row.id, 'player_email_missing')
          failed++
          continue
        }
        const firstName = player.first_name ?? player.name ?? player.username ?? null

        if (!anthropicKey) {
          await markFailed(supabase, row.id, 'anthropic_key_not_configured')
          failed++
          continue
        }

        const prompt = FOUNDER_NOTE_PROMPT
          .replaceAll('{{FIRST_NAME}}', firstName ?? 'there')
          .replaceAll('{{DEED_TEXT}}', row.deed_text_snapshot)
        const result = await callAnthropicForText(anthropicKey, { prompt, maxTokens: 150 })
        if (!result.ok) {
          console.error('[send-founder-notes] Anthropic call failed for row', row.id, ':', result.reason)
          await markFailed(supabase, row.id, result.reason)
          failed++
          continue
        }
        const wordCount = result.text.split(/\s+/).length
        if (wordCount < 5 || wordCount > 120) {
          console.error('[send-founder-notes] generated note failed validation for row', row.id, ': word_count_' + wordCount)
          await markFailed(supabase, row.id, `word_count_${wordCount}`)
          failed++
          continue
        }

        // Store the generated message before sending — if the send fails,
        // the note is still there for debugging, only the status differs.
        await supabase.from('founder_note_queue').update({ generated_message: result.text }).eq('id', row.id)

        const tpl = founderNoteEmail(firstName, result.text)
        const emailResult = await sendEmail({ to: player.email, subject: tpl.subject, html: tpl.html })
        if (!emailResult.sent) {
          console.error('[send-founder-notes] send failed for row', row.id, ':', emailResult.error)
          await markFailed(supabase, row.id, emailResult.error ?? 'send_failed')
          failed++
          continue
        }

        await supabase.from('founder_note_queue')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', row.id)
        sent++
      } catch (err) {
        console.error('[send-founder-notes] unexpected error for row', row.id, ':', err)
        await markFailed(supabase, row.id, 'unexpected_error')
        failed++
      }
    }

    return jsonResponse({ success: true, processed: rows.length, sent, failed })
  } catch (err) {
    console.error('send-founder-notes error:', err)
    return errorResponse('Internal server error', 500)
  }
})

async function markFailed(supabase: ReturnType<typeof getSupabase>, id: number, _reason: string): Promise<void> {
  // _reason is console.error'd by the caller (per-row, before this is
  // called) — no error-message column on founder_note_queue per spec, so
  // the queue row itself only ever records pending/sent/failed.
  await supabase.from('founder_note_queue').update({ status: 'failed' }).eq('id', id)
}
