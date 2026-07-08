import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getSubPath } from '../_shared/db.ts'
import OpenAI from 'npm:openai@4'

// ── Voice mapping (model, gender) → voice name ──────────────────────────────
const VOICE_MAP: Record<string, string> = {
  'qwen3-tts-flash:male': 'Ethan',
  'qwen3-tts-flash:female': 'Cherry',
  'gemini-2.5-pro-preview-tts:male': 'Puck',
  'gemini-2.5-pro-preview-tts:female': 'Zephyr',
  'eleven_v3:male': 'echo',
  'eleven_v3:female': 'alloy',
  'eleven_turbo_v2:male': 'echo',
  'eleven_turbo_v2:female': 'alloy',
  'gpt-4o-mini-tts:male': 'echo',
  'gpt-4o-mini-tts:female': 'nova',
}
const DEFAULT_VOICE: Record<string, string> = { male: 'Ethan', female: 'Cherry' }

const PDF_ANALYSIS_MODEL = 'claude-sonnet-4-6'
const PDF_SYSTEM_PROMPT = `You are a careful PDF analysis assistant.
Rules:
- Answer only from the attached PDF.
- If the PDF does not contain the requested information, say so clearly.
- Do not invent or infer unsupported facts.
- Mention page numbers for important facts whenever the PDF makes that possible.
- Match the user's instruction language.`

const PDF_MODE_PROMPTS: Record<string, string> = {
  qa: 'Task type: Question answering.\nRead the attached PDF and answer the user\'s question directly, clearly, and only with information supported by the document.',
  extract: 'Task type: Structured extraction.\nRead the attached PDF and extract the requested information as concise Markdown with clear headings and bullets when helpful.',
}

// ── OpenAI client factory ────────────────────────────────────────────────────
function getClient(): OpenAI {
  const baseURL = Deno.env.get('APP_AI_BASE_URL')
  const apiKey = Deno.env.get('APP_AI_KEY')
  if (!baseURL || !apiKey) {
    throw { status: 503, detail: 'AI service not configured. Set APP_AI_BASE_URL and APP_AI_KEY.' }
  }
  return new OpenAI({ apiKey, baseURL: baseURL.replace(/\/$/, '') })
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseDataUri(dataUri: string): { bytes: Uint8Array; contentType: string } {
  if (!dataUri.includes(',')) throw new Error('Invalid data URI: missing comma separator')
  const [header, b64] = dataUri.split(',', 2)
  let contentType = 'application/octet-stream'
  if (header.startsWith('data:')) {
    const meta = header.slice(5)
    const part = meta.includes(';') ? meta.split(';')[0] : meta
    if (part.trim()) contentType = part.trim()
  }
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { bytes, contentType }
}

function contentTypeToExt(ct: string, defaultExt = 'bin'): string {
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp',
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg',
    'audio/flac': 'flac',
  }
  return map[ct.toLowerCase()] ?? defaultExt
}

async function dataUriOrUrlToBlob(input: string, namePrefix: string): Promise<File> {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const res = await fetch(input)
    if (!res.ok) throw new Error(`Failed to download: ${input}`)
    const blob = await res.blob()
    const name = input.split('?')[0].split('/').pop() || `${namePrefix}.bin`
    return new File([blob], name, { type: blob.type })
  }
  if (input.startsWith('data:')) {
    const { bytes, contentType } = parseDataUri(input)
    const ext = contentTypeToExt(contentType, 'bin')
    // bytes is always backed by a plain ArrayBuffer (built byte-by-byte above,
    // never a SharedArrayBuffer) — the cast just satisfies BlobPart's stricter
    // TS lib typing, no behavior change.
    return new File([bytes as Uint8Array<ArrayBuffer>], `${namePrefix}.${ext}`, { type: contentType })
  }
  throw new Error('Input must be a data URI or http(s) URL')
}

function extractCdnUrl(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  for (const key of ['url', 'video_url', 'audio_url']) {
    const v = o[key]
    if (typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'))) return v
  }
  const videos = o['videos']
  if (Array.isArray(videos) && videos.length > 0) {
    const u = (videos[0] as Record<string, unknown>)['url']
    if (typeof u === 'string') return u
  }
  const output = o['output']
  if (output && typeof output === 'object') {
    const u = (output as Record<string, unknown>)['url']
    if (typeof u === 'string') return u
  }
  // Try parsing JSON body (some proxy platforms)
  try {
    const content = o['content']
    if (content) {
      const parsed = JSON.parse(content as string)
      for (const key of ['url', 'video_url', 'audio_url']) {
        if (typeof parsed[key] === 'string') return parsed[key]
      }
    }
  } catch { /* ignore */ }
  return null
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  const url = new URL(req.url)
  const path = getSubPath(url, 'aihub')
  const method = req.method

  try {
    // POST /gentxt — text generation (streaming or non-streaming)
    if (method === 'POST' && path === '/gentxt') {
      const body = await req.json()
      const { messages, model, temperature = 0.7, max_tokens = 4096, stream = false } = body
      const client = getClient()

      const apiMessages = (messages as Array<{ role: string; content: unknown }>).map((m) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map((c: unknown) =>
              typeof c === 'object' && c !== null && 'model_dump' in c
                ? c
                : c
            )
          : m.content,
      }))

      if (stream) {
        const readable = new ReadableStream({
          async start(controller) {
            try {
              const s = await client.chat.completions.create({
                model,
                messages: apiMessages as OpenAI.Chat.ChatCompletionMessageParam[],
                temperature,
                max_tokens,
                stream: true,
              })
              for await (const chunk of s) {
                const content = chunk.choices[0]?.delta?.content
                if (content) {
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`),
                  )
                }
              }
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
              controller.close()
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify({ content: `[ERROR] ${msg}` })}\n\n`),
              )
              controller.close()
            }
          },
        })
        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      const response = await client.chat.completions.create({
        model,
        messages: apiMessages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature,
        max_tokens,
        stream: false,
      })
      const content = response.choices[0]?.message?.content ?? ''
      const usage = response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : null
      return jsonResponse({ content, model, usage })
    }

    // POST /genimg — image generation / editing
    if (method === 'POST' && path === '/genimg') {
      const body = await req.json()
      const { prompt, model, size = '1024x1024', quality = 'standard', n = 1, image } = body
      const client = getClient()

      let responseData: OpenAI.Images.ImagesResponse
      if (image) {
        const images = Array.isArray(image) ? image : [image]
        const file = await dataUriOrUrlToBlob(images[0], 'image')
        responseData = await client.images.edit({
          model,
          image: file,
          prompt,
          size: size as OpenAI.Images.ImageEditParams['size'],
          n,
        })
      } else {
        responseData = await client.images.generate({
          model,
          prompt,
          size: size as OpenAI.Images.ImageGenerateParams['size'],
          quality: quality as OpenAI.Images.ImageGenerateParams['quality'],
          n,
        })
      }

      const imageRefs = (responseData.data ?? []).map((item) => {
        if (item.url) return item.url
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
        throw new Error('No url or b64_json in image response')
      })
      const revisedPrompt = responseData.data?.[0]?.revised_prompt ?? null

      return jsonResponse({ images: imageRefs, model, revised_prompt: revisedPrompt })
    }

    // POST /genvideo — video generation
    if (method === 'POST' && path === '/genvideo') {
      const body = await req.json()
      const { prompt, model, size = '1280x720', seconds = 4, image } = body
      const client = getClient()

      const createParams: Record<string, unknown> = { model, prompt, size, seconds }
      if (image) {
        createParams.input_reference = await dataUriOrUrlToBlob(image, 'input_reference')
      }

      // @ts-ignore — videos API may not be in types
      let video = await client.videos.create(createParams)
      const videoId = video.id
      if (!videoId) throw new Error('Video generation started but missing video id')

      let status = video.status
      while (status === 'in_progress' || status === 'queued') {
        await new Promise((r) => setTimeout(r, 2000))
        // @ts-ignore
        video = await client.videos.retrieve(videoId)
        status = video.status
      }

      if (status === 'failed') {
        throw new Error(video.error?.message ?? 'Video generation failed')
      }

      const cdnUrl = extractCdnUrl(video)
      if (!cdnUrl) throw new Error('Video generation completed but missing CDN url')

      return jsonResponse({
        url: cdnUrl,
        model,
        duration: video.seconds ?? seconds,
        revised_prompt: video.revised_prompt ?? null,
      })
    }

    // POST /genaudio — text-to-speech
    if (method === 'POST' && path === '/genaudio') {
      const body = await req.json()
      const { text, model = 'qwen3-tts-flash', gender = 'female' } = body
      const client = getClient()

      const voice = VOICE_MAP[`${model}:${gender}`] ?? DEFAULT_VOICE[gender] ?? 'alloy'
      const resp = await client.audio.speech.create({
        model,
        input: text,
        voice: voice as OpenAI.Audio.SpeechCreateParams['voice'],
        response_format: 'mp3',
      })

      const cdnUrl = extractCdnUrl(resp)
      if (!cdnUrl) throw new Error('Audio generation completed but missing CDN url')

      return jsonResponse({ url: cdnUrl, model, gender, voice })
    }

    // POST /transcribe — speech-to-text
    if (method === 'POST' && path === '/transcribe') {
      const body = await req.json()
      const { audio, model = 'scribe_v2' } = body
      const client = getClient()

      const file = await dataUriOrUrlToBlob(audio, 'input_audio')
      const resp = await client.audio.transcriptions.create({
        file,
        model,
        response_format: 'json',
      })

      const text = typeof resp === 'string' ? resp : (resp as { text?: string }).text ?? ''
      if (!text) throw new Error('Audio transcription returned empty text')

      const sourceName = audio.startsWith('http') ? audio.split('?')[0].split('/').pop() : 'input_audio'
      return jsonResponse({ text, model, source_name: sourceName })
    }

    // POST /analyzepdf — PDF analysis
    if (method === 'POST' && path === '/analyzepdf') {
      const body = await req.json()
      const { pdf, instruction, mode = 'qa' } = body

      if (!instruction?.trim()) return errorResponse('instruction is required', 400)
      if (!pdf?.startsWith('data:application/pdf')) {
        return errorResponse('pdf must be a base64 data URI with content type application/pdf', 400)
      }

      const client = getClient()
      const { bytes: pdfBytes } = parseDataUri(pdf)
      const pdfB64 = btoa(String.fromCharCode(...pdfBytes))
      const userPrompt = `${PDF_MODE_PROMPTS[mode] ?? PDF_MODE_PROMPTS.qa}\n\nUser instruction:\n${instruction.trim()}`

      const response = await client.chat.completions.create({
        model: PDF_ANALYSIS_MODEL,
        messages: [
          { role: 'system', content: PDF_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: pdfB64 },
                citations: { enabled: true },
              },
            ] as unknown as string,
          },
        ],
        temperature: 0,
        max_tokens: 8192,
        stream: false,
      })

      const result = response.choices[0]?.message?.content ?? ''
      if (!result) throw new Error('PDF analysis returned empty result')

      return jsonResponse({
        status: 'success',
        result,
        message: 'PDF analyzed successfully.',
        mode,
        model: PDF_ANALYSIS_MODEL,
      })
    }

    return errorResponse('Not found', 404)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      const e = err as { status: number; detail: string }
      return errorResponse(e.detail, e.status)
    }
    console.error('aihub error:', err)
    return errorResponse('Internal server error', 500)
  }
})
