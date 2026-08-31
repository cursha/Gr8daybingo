// =============================================================================
// A player's own wallet: balance, transaction history, and the Stripe
// PaymentIntent flow for topping up. Extracted wholesale out of
// game/index.ts; behavior (including the payment_intent_id idempotency
// guard) is unchanged.
// =============================================================================
import { jsonResponse, errorResponse } from '../../_shared/cors.ts'
import { requireAuth } from '../../_shared/auth.ts'
import { RouteHandler } from '../route_types.ts'

export const handleWalletRoutes: RouteHandler = async ({ req, method, path, authUser, supabase }) => {
  // ── GET /wallet ───────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/wallet') {
    const user = requireAuth(authUser)
    let { data: wallet } = await supabase
      .from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
    if (!wallet) {
      const { data: w } = await supabase
        .from('player_wallets')
        .insert({ user_id: user.sub, balance: 0 }).select().single()
      wallet = w
    }
    return jsonResponse({ balance: parseFloat(wallet.balance), wallet_id: wallet.id })
  }

  // POST /wallet/add-funds was removed: it credited a client-supplied amount
  // with no payment verification at all. The real, payment-verified path is
  // the Stripe checkout + signature-verified webhook in payment/index.ts,
  // which nothing here duplicated — this endpoint had no legitimate caller
  // (the frontend's addFunds() helper was likewise unused) and existed only
  // as a way to mint free wallet balance and cash it in as a real prize win.

  // ── GET /wallet/transactions ──────────────────────────────────────────────
  if (method === 'GET' && path === '/wallet/transactions') {
    const user = requireAuth(authUser)
    const { data: txns } = await supabase
      .from('wallet_transactions').select('*')
      .eq('user_id', user.sub)
      .order('created_at', { ascending: false })
      .limit(50)
    return jsonResponse({
      transactions: (txns ?? []).map((t) => ({
        id: t.id,
        amount: parseFloat(t.amount),
        transaction_type: t.transaction_type,
        item_description: t.item_description ?? null,
        created_at: t.created_at ?? null,
      })),
    })
  }

  // ── POST /wallet/create-payment-intent ───────────────────────────────────
  if (method === 'POST' && path === '/wallet/create-payment-intent') {
    const user = requireAuth(authUser)
    const body = await req.json()
    const amount = Number(body.amount)
    if (!amount || amount <= 0 || amount > 200) return errorResponse('Invalid amount', 400)

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey || stripeKey === 'FILL_IN_FROM_STRIPE_DASHBOARD') {
      return errorResponse('Payment processing is not yet configured. Please contact support.', 503)
    }

    // Create Stripe PaymentIntent
    const params = new URLSearchParams({
      amount: String(Math.round(amount * 100)), // cents
      currency: 'cad',
      'metadata[user_id]': user.sub,
      'metadata[wallet_amount]': String(amount),
      'automatic_payment_methods[enabled]': 'true',
    })

    const stripeResp = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const paymentIntent = await stripeResp.json() as { id?: string; client_secret?: string; error?: { message: string } }
    if (paymentIntent.error) return errorResponse(paymentIntent.error.message, 400)

    return jsonResponse({ client_secret: paymentIntent.client_secret })
  }

  // ── POST /wallet/confirm-payment ──────────────────────────────────────────
  if (method === 'POST' && path === '/wallet/confirm-payment') {
    const user = requireAuth(authUser)
    const body = await req.json()
    const { payment_intent_id } = body
    if (!payment_intent_id) return errorResponse('payment_intent_id is required', 400)

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey || stripeKey === 'FILL_IN_FROM_STRIPE_DASHBOARD') {
      return errorResponse('Payment processing not configured', 503)
    }

    // Retrieve and verify the payment intent from Stripe
    const stripeResp = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
      headers: { 'Authorization': `Bearer ${stripeKey}` },
    })
    const pi = await stripeResp.json() as { status?: string; metadata?: { user_id?: string; wallet_amount?: string }; error?: { message: string } }

    if (pi.error) return errorResponse(pi.error.message, 400)
    if (pi.status !== 'succeeded') return errorResponse('Payment not completed', 400)
    if (pi.metadata?.user_id !== user.sub) return errorResponse('Payment does not belong to this account', 403)

    const walletAmount = parseFloat(pi.metadata?.wallet_amount ?? '0')
    if (!walletAmount || walletAmount <= 0) return errorResponse('Invalid wallet amount', 400)

    // Idempotency: if this payment was already credited, don't credit again.
    // Return the current balance so the UI still updates correctly.
    const { data: existingTxn } = await supabase
      .from('wallet_transactions').select('id')
      .eq('payment_intent_id', payment_intent_id).maybeSingle()

    let { data: wallet } = await supabase
      .from('player_wallets').select('*').eq('user_id', user.sub).maybeSingle()
    if (!wallet) {
      const { data: w } = await supabase
        .from('player_wallets').insert({ user_id: user.sub, balance: 0 }).select().single()
      wallet = w
    }

    if (existingTxn) {
      return jsonResponse({ success: true, new_balance: parseFloat(wallet.balance), already_credited: true })
    }

    // Record the transaction FIRST with the payment_intent_id. The unique index
    // on payment_intent_id guarantees a concurrent duplicate insert fails, so the
    // wallet can never be credited twice for the same payment.
    const { error: txnError } = await supabase.from('wallet_transactions').insert({
      user_id: user.sub,
      amount: walletAmount,
      transaction_type: 'deposit',
      item_description: `Added ${walletAmount.toFixed(2)} Gr8Day Bucks to wallet`,
      payment_intent_id,
    })
    if (txnError) {
      // Likely a duplicate (unique violation) from a concurrent request — already credited.
      return jsonResponse({ success: true, new_balance: parseFloat(wallet.balance), already_credited: true })
    }

    const newBalance = parseFloat(wallet.balance) + walletAmount
    await supabase.from('player_wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() }).eq('user_id', user.sub)

    return jsonResponse({ success: true, new_balance: newBalance })
  }

  return null
}
