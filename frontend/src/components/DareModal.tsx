import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { BetYaRevealResult, BetYaReferFriendResult } from '@/lib/game-utils';
import { X } from 'lucide-react';

interface DareModalProps {
  result: BetYaRevealResult;
  onClose: () => void;
  onSubmitReferralEmail?: (email: string) => Promise<BetYaReferFriendResult>;
}

const outcomeStyle: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  fund_credit:   { bg: 'bg-emerald-900', text: 'text-emerald-300', border: 'border-emerald-400', emoji: '💰' },
  remove_funds:  { bg: 'bg-rose-900',    text: 'text-rose-300',    border: 'border-rose-400',    emoji: '😬' },
  refer_friend:  { bg: 'bg-sky-900',     text: 'text-sky-300',     border: 'border-sky-400',     emoji: '🤝' },
  free_square:   { bg: 'bg-violet-900',  text: 'text-violet-300',  border: 'border-violet-400',  emoji: '⭐' },
  replace_three: { bg: 'bg-amber-900',   text: 'text-amber-300',   border: 'border-amber-400',   emoji: '🎲' },
  nothing:       { bg: 'bg-slate-800',   text: 'text-slate-300',   border: 'border-slate-500',   emoji: '😶' },
};

const DareModal: React.FC<DareModalProps> = ({ result, onClose, onSubmitReferralEmail }) => {
  const style = outcomeStyle[result.outcome] ?? outcomeStyle.nothing;
  const [referEmail, setReferEmail] = useState('');
  const [referSubmitting, setReferSubmitting] = useState(false);
  const [referResult, setReferResult] = useState<BetYaReferFriendResult | null>(null);

  const handleReferSubmit = async () => {
    if (!onSubmitReferralEmail || !referEmail.trim() || referSubmitting) return;
    setReferSubmitting(true);
    try {
      const res = await onSubmitReferralEmail(referEmail.trim());
      setReferResult(res);
      if (res.matched) setReferEmail('');
    } catch (err: any) {
      setReferResult({ matched: false, message: err?.message || 'Something went wrong — please try again.' });
    } finally {
      setReferSubmitting(false);
    }
  };
  const earned = result.outcome === 'fund_credit' && typeof result.amount === 'number'
    ? `+${result.amount.toFixed(2)} Gr8Day Bucks`
    : result.outcome === 'remove_funds'
      ? result.amount > 0 ? `-${result.amount.toFixed(2)} Gr8Day Bucks` : null
      : null;

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`relative rounded-3xl shadow-2xl border-2 ${style.border} ${style.bg} w-full max-w-sm flex flex-col items-center gap-4 p-6 overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 opacity-10 animate-pulse"
          style={{ background: 'radial-gradient(circle at center, white 0%, transparent 70%)' }} />

        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 text-white/40 hover:text-white/80 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center z-10">
          <p className="text-xs font-bold tracking-[0.3em] text-white/50 uppercase mb-1">I Bet Ya!</p>
          <p className="text-4xl mb-1">{style.emoji}</p>
          <p className={`text-2xl font-black ${style.text} drop-shadow`}>{result.label}</p>
        </div>

        <div className="z-10 w-full flex flex-col items-center gap-2 text-center">
          {result.outcome === 'fund_credit' && (
            <p className="text-emerald-300 font-bold text-lg">
              🎉 {earned} added to your wallet!
            </p>
          )}
          {result.outcome === 'remove_funds' && (
            <p className="text-rose-300 font-bold text-lg">
              {earned ? `Ouch! ${earned} removed from your wallet.` : 'No funds to deduct — you got away with it!'}
            </p>
          )}
          {result.outcome === 'free_square' && (
            <p className="text-violet-300 font-bold text-lg">
              Centre square marked — free point!
            </p>
          )}
          {result.outcome === 'replace_three' && (
            result.replaced && result.replaced.length > 0 ? (
              <div className="text-amber-200 text-sm space-y-1 w-full">
                <p className="font-bold text-amber-300">{result.replaced.length} square{result.replaced.length !== 1 ? 's' : ''} swapped!</p>
                {result.replaced.map((r) => (
                  <div key={r.index} className="text-xs text-left bg-black/20 rounded-lg p-2">
                    <p className="line-through opacity-50">{r.old_deed}</p>
                    <p className="font-semibold">→ {r.new_deed}</p>
                  </div>
                ))}
                <p className="text-xs text-amber-400 mt-1">Complete these new deeds to mark them!</p>
              </div>
            ) : (
              <p className="text-amber-300 font-bold">No uncompleted squares to swap right now.</p>
            )
          )}
          {result.outcome === 'refer_friend' && (
            <div className="text-sky-200 text-sm space-y-2 w-full">
              {referResult?.matched ? (
                <>
                  <p className="font-bold text-emerald-300 text-base">🎉 Friend Referred!</p>
                  <p className="text-xs opacity-80">
                    +${(referResult.amount ?? 0).toFixed(2)} added to your wallet. Centre square complete!
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-sky-300 text-base">Refer a friend!</p>
                  <p className="text-xs opacity-80">
                    Enter the email of a friend who's already joined and was referred by you — match it to claim your reward.
                  </p>
                  <div className="flex flex-col gap-2 w-full">
                    <input
                      type="email"
                      value={referEmail}
                      onChange={(e) => setReferEmail(e.target.value)}
                      placeholder="friend@example.com"
                      className="w-full rounded-lg px-3 py-2 text-sm bg-black/30 border border-sky-700 text-white placeholder:text-sky-400/50 focus:outline-none focus:border-sky-400"
                    />
                    <button
                      onClick={handleReferSubmit}
                      disabled={!referEmail.trim() || referSubmitting}
                      className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-sm transition-colors"
                    >
                      {referSubmitting ? 'Checking…' : 'Check Email'}
                    </button>
                  </div>
                  {referResult && !referResult.matched && (
                    <p className="text-xs text-rose-300">{referResult.message || 'No match found — try another email.'}</p>
                  )}
                </>
              )}
            </div>
          )}
          {result.outcome === 'nothing' && (
            <p className="text-slate-300 font-semibold">No effect this time — better luck next week!</p>
          )}

          {typeof result.new_balance === 'number' && (result.outcome === 'fund_credit' || result.outcome === 'remove_funds') && (
            <p className="text-xs text-white/50 mt-1">
              Wallet balance: <span className="font-bold text-white/80">{result.new_balance.toFixed(2)} Gr8Day Bucks</span>
            </p>
          )}

          <button
            onClick={onClose}
            className="mt-3 px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default DareModal;
