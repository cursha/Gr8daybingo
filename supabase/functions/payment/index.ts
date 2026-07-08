import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAuthUser, requireAuth } from '../_shared/auth.ts'
import { getSupabase, getSubPath, matchPath } from '../_shared/db.ts'
import Stripe from 'npm:stripe@17'

function getStripe(): Stripe {
  const key = Deno.env.get('STRIPE_SECRET_KEY')
  if (!key) throw { status: 503, detail: 'Stripe is not configured' }
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' })
}

const ALLOWED_TOPUP_AMOUNTS = [5, 10, 20]

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  const url = new URL(req.url)
  const path = getSubPath(url, 'payment')
  const method = req.method

  try {
    const authUser = await getAuthUser(req)

    // POST /checkout — create a Stripe checkout session (generic)
    if (method === 'POST' && path === '/checkout') {
      requireAuth(authUser)
      const body = await req.json()

      const {
        amount,
        currency = 'usd',
        stripe_price_id,
        quantity = 1,
        mode = 'payment',
        ui_mode = 'hosted',
        return_url,
        success_url,
        cancel_url,
        metadata,
        idempotency_key,
      } = body

      // Validate
      if (mode === 'subscription' && !stripe_price_id) {
        return errorResponse('stripe_price_id is required for subscription mode', 400)
      }
      if (mode === 'payment' && !amount && !stripe_price_id) {
        return errorResponse('Either amount or stripe_price_id is required for payment mode', 400)
      }
      if (ui_mode === 'embedded' && !return_url) {
        return errorResponse('return_url is required for embedded ui_mode', 400)
      }
      if (ui_mode === 'hosted' && (!success_url || !cancel_url)) {
        return errorResponse('success_url and cancel_url are required for hosted ui_mode', 400)
      }

      const stripe = getStripe()

      let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[]
      if (mode === 'subscription' || stripe_price_id) {
        lineItems = [{ price: stripe_price_id, quantity }]
      } else {
        const amountCents = Math.round(parseFloat(amount) * 100)
        lineItems = [{
          price_data: {
            currency,
            product_data: { name: 'Payment' },
            unit_amount: amountCents,
          },
          quantity,
        }]
      }

      const params: Stripe.Checkout.SessionCreateParams = {
        line_items: lineItems,
        mode,
        metadata: metadata ?? {},
      }

      if (ui_mode === 'embedded') {
        params.ui_mode = 'embedded'
        params.return_url = return_url
      } else {
        params.success_url = success_url
        params.cancel_url = cancel_url
      }

      const options: Stripe.RequestOptions = {}
      if (idempotency_key) options.idempotencyKey = idempotency_key

      const session = await stripe.checkout.sessions.create(params, options)

      return jsonResponse({
        url: session.url ?? null,
        client_secret: session.client_secret ?? null,
        session_id: session.id,
      })
    }

    // GET /checkout/:session_id/status
    const statusMatch = matchPath('/checkout/:session_id/status', path)
    if (method === 'GET' && statusMatch) {
      requireAuth(authUser)
      const stripe = getStripe()
      const session = await stripe.checkout.sessions.retrieve(statusMatch.session_id)
      return jsonResponse({
        status: session.status,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency,
        metadata: session.metadata ?? {},
      })
    }

    // POST /create-topup — create a Stripe Checkout session for wallet top-up
    if (method === 'POST' && path === '/create-topup') {
      requireAuth(authUser)
      const body = await req.json()
      const { amount } = body

      if (!ALLOWED_TOPUP_AMOUNTS.includes(Number(amount))) {
        return errorResponse('amount must be 5, 10, or 20', 400)
      }

      const stripe = getStripe()
      const amountCents = Number(amount) * 100

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `Havagr8day Bingo — $${amount} Wallet Top-Up` },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        success_url: 'https://havagr8day.com/wallet?success=1',
        cancel_url: 'https://havagr8day.com/wallet?cancelled=1',
        metadata: {
          user_id: authUser!.sub,
          topup_amount: String(amount),
        },
      })

      // Store a pending wallet transaction so the webhook can credit it
      const db = getSupabase()
      const { error: dbError } = await db
        .from('wallet_transactions')
        .insert({
          user_id: authUser!.sub,
          amount: Number(amount),
          transaction_type: 'deposit',
          item_description: `Wallet top-up via Stripe ($${amount})`,
          stripe_session_id: session.id,
          status: 'pending',
        })

      if (dbError) {
        console.error('Failed to store pending transaction:', dbError)
        // Don't block the redirect — the webhook can still credit later via session metadata
      }

      return jsonResponse({ url: session.url })
    }

    // POST /webhook — Stripe webhook (no auth, verified by signature)
    if (method === 'POST' && path === '/webhook') {
      const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
      if (!webhookSecret) {
        return errorResponse('Webhook secret not configured', 503)
      }

      const body = await req.text()
      const signature = req.headers.get('stripe-signature')
      if (!signature) {
        return errorResponse('Missing stripe-signature header', 400)
      }

      const stripe = getStripe()
      let event: Stripe.Event
      try {
        event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
      } catch (err) {
        console.error('Webhook signature verification failed:', err)
        return errorResponse('Invalid signature', 400)
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session

        // Only process top-up sessions (they carry topup_amount in metadata)
        const topupAmount = session.metadata?.topup_amount
        const userId = session.metadata?.user_id
        if (!topupAmount || !userId) {
          // Not a top-up session — ignore silently
          return jsonResponse({ received: true })
        }

        const amount = parseFloat(topupAmount)
        const db = getSupabase()

        // Check if we already have a pending transaction for this session
        const { data: existingTxn } = await db
          .from('wallet_transactions')
          .select('id, status')
          .eq('stripe_session_id', session.id)
          .maybeSingle()

        if (existingTxn) {
          if (existingTxn.status === 'completed') {
            // Already processed — idempotent, return OK
            return jsonResponse({ received: true })
          }
          // Mark the pending row completed and credit the wallet
          const { error: updateError } = await db
            .from('wallet_transactions')
            .update({ status: 'completed' })
            .eq('id', existingTxn.id)

          if (updateError) {
            console.error('Failed to mark transaction completed:', updateError)
            return errorResponse('DB error updating transaction', 500)
          }
        } else {
          // No pre-created row (create-topup DB insert failed earlier) — insert now
          const { error: insertError } = await db
            .from('wallet_transactions')
            .insert({
              user_id: userId,
              amount,
              transaction_type: 'deposit',
              item_description: `Wallet top-up via Stripe ($${amount})`,
              stripe_session_id: session.id,
              status: 'completed',
            })

          if (insertError) {
            console.error('Failed to insert transaction from webhook:', insertError)
            return errorResponse('DB error inserting transaction', 500)
          }
        }

        // Credit the player wallet
        const { data: walletRow } = await db
          .from('player_wallets')
          .select('id, balance')
          .eq('user_id', userId)
          .maybeSingle()

        if (!walletRow) {
          console.error('No wallet found for user_id:', userId)
          return errorResponse('Wallet not found', 404)
        }

        const newBalance = (walletRow.balance ?? 0) + amount
        const { error: walletError } = await db
          .from('player_wallets')
          .update({ balance: newBalance })
          .eq('id', walletRow.id)

        if (walletError) {
          console.error('Failed to credit wallet:', walletError)
          return errorResponse('DB error crediting wallet', 500)
        }

        console.log(`Credited $${amount} to wallet for user ${userId}. New balance: $${newBalance}`)
      }

      return jsonResponse({ received: true })
    }

    return errorResponse('Not found', 404)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      const e = err as { status: number; detail: string }
      return errorResponse(e.detail, e.status)
    }
    console.error('payment error:', err)
    return errorResponse('Internal server error', 500)
  }
})
