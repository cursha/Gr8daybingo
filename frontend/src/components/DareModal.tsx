import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DareSpinResult } from '@/lib/game-utils';
import { X } from 'lucide-react';

interface DareModalProps {
  result: DareSpinResult;
  onClose: () => void;
  onReferralFlow?: () => void;
}

const SLOT_IMAGES = [
  '/dare-win.png',
  '/dare-lose.png',
  '/dare-refer.png',
  '/dare-centre.png',
  '/dare-win.png',
  '/dare-lose.png',
  '/dare-refer.png',
];

const outcomeImage: Record<string, string> = {
  add_funds:    '/dare-win.png',
  remove_funds: '/dare-lose.png',
  refer_player: '/dare-refer.png',
  swap_square:  '/dare-centre.png',
  nothing:      '/dare-centre.png',
};

const outcomeStyle: Record<string, { bg: string; text: string; border: string; emoji: string }> = {
  add_funds:    { bg: 'bg-emerald-900', text: 'text-emerald-300', border: 'border-emerald-400', emoji: '💰' },
  remove_funds: { bg: 'bg-rose-900',    text: 'text-rose-300',    border: 'border-rose-400',    emoji: '😬' },
  refer_player: { bg: 'bg-sky-900',     text: 'text-sky-300',     border: 'border-sky-400',     emoji: '🤝' },
  swap_square:  { bg: 'bg-violet-900',  text: 'text-violet-300',  border: 'border-violet-400',  emoji: '🎲' },
  nothing:      { bg: 'bg-slate-800',   text: 'text-slate-300',   border: 'border-slate-500',   emoji: '😶' },
};

const DareModal: React.FC<DareModalProps> = ({ result, onClose, onReferralFlow }) => {
  const [phase, setPhase] = useState<'spin' | 'reveal'>('spin');
  const [slotIdx, setSlotIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const style = outcomeStyle[result.outcome] ?? outcomeStyle.nothing;

  // Slot machine spin: fast → slow → stop
  useEffect(() => {
    let tick = 0;
    const delays = [
      ...Array(12).fill(60),   // fast
      ...Array(6).fill(120),   // medium
      ...Array(4).fill(220),   // slow
      ...Array(2).fill(380),   // very slow
    ];
    let i = 0;

    const step = () => {
      setSlotIdx((prev) => (prev + 1) % SLOT_LABELS.length);
      tick++;
      if (i < delays.length) {
        intervalRef.current = setTimeout(step, delays[i++]);
      } else {
        // Land on result label
        setPhase('reveal');
      }
    };

    intervalRef.current = setTimeout(step, delays[i++]);
    return () => { if (intervalRef.current) clearTimeout(intervalRef.current); };
  }, []);

  const earned = result.outcome === 'add_funds' && result.amount
    ? `+$${result.amount.toFixed(2)}`
    : result.outcome === 'remove_funds' && result.amount
      ? `-$${result.amount.toFixed(2)}`
      : null;

  const modal = (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={phase === 'reveal' ? onClose : undefined}
    >
      <div
        className={`relative rounded-3xl shadow-2xl border-2 ${style.border} ${style.bg} w-full max-w-sm flex flex-col items-center gap-4 p-6 overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background glow */}
        <div className={`absolute inset-0 opacity-10 ${phase === 'reveal' ? 'animate-pulse' : ''}`}
          style={{ background: 'radial-gradient(circle at center, white 0%, transparent 70%)' }} />

        {/* Header */}
        <div className="text-center z-10">
          <p className="text-xs font-bold tracking-[0.3em] text-white/50 uppercase mb-1">I Dare Ya!</p>
          <p className="text-2xl font-black text-white drop-shadow">Click &amp; Commit</p>
        </div>

        {/* Slot display — images spin then land */}
        <div className="z-10 w-full flex items-center justify-center overflow-hidden rounded-2xl" style={{ minHeight: '180px' }}>
          {phase === 'spin' ? (
            <img
              src={SLOT_IMAGES[slotIdx % SLOT_IMAGES.length]}
              alt="spinning…"
              className="w-48 h-48 object-contain select-none pointer-events-none"
              style={{ imageRendering: 'auto' }}
            />
          ) : (
            <img
              src={outcomeImage[result.outcome] ?? '/dare-centre.png'}
              alt={result.label}
              className="w-56 h-56 object-contain select-none drop-shadow-2xl"
              style={{ animation: 'dare-pop 0.35s cubic-bezier(0.34,1.56,0.64,1) both' }}
            />
          )}
        </div>

        {/* Result detail */}
        {phase === 'reveal' && (
          <div className="z-10 w-full flex flex-col items-center gap-2 text-center">
            {result.outcome === 'add_funds' && (
              <p className="text-emerald-300 font-bold text-lg">
                🎉 {earned} added to your wallet!
              </p>
            )}
            {result.outcome === 'remove_funds' && (
              <p className="text-rose-300 font-bold text-lg">
                Ouch! {earned} removed from your wallet.
              </p>
            )}
            {result.outcome === 'swap_square' && result.old_deed && (
              <div className="text-sm text-violet-200 space-y-1">
                <p className="font-bold text-violet-300">One of your squares changed!</p>
                <p className="opacity-70 line-through text-xs">{result.old_deed}</p>
                <p className="font-semibold">→ {result.new_deed}</p>
                <p className="text-xs text-violet-400 mt-1">That square is now un-marked — complete the new deed!</p>
              </div>
            )}
            {result.outcome === 'swap_square' && !result.old_deed && (
              <p className="text-violet-300 font-bold">No eligible squares to swap right now.</p>
            )}
            {result.outcome === 'refer_player' && (
              <div className="text-sky-200 text-sm space-y-2">
                <p className="font-bold text-sky-300 text-base">Refer a new player!</p>
                <p className="text-xs opacity-80">Enter a friend's email to earn a bonus square.</p>
                {onReferralFlow && (
                  <button
                    onClick={() => { onReferralFlow(); onClose(); }}
                    className="mt-1 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm transition-colors"
                  >
                    Send Referral
                  </button>
                )}
              </div>
            )}
            {result.outcome === 'nothing' && (
              <p className="text-slate-300 font-semibold">No effect this time. Better luck next week!</p>
            )}

            {typeof result.new_balance === 'number' && result.outcome !== 'nothing' && result.outcome !== 'refer_player' && result.outcome !== 'swap_square' && (
              <p className="text-xs text-white/50 mt-1">
                Wallet balance: <span className="font-bold text-white/80">${result.new_balance.toFixed(2)}</span>
              </p>
            )}

            <p className="text-xs text-white/30 mt-2">
              {result.dare_clicks_remaining === 0
                ? 'No more dares this week.'
                : `${result.dare_clicks_remaining} dare${result.dare_clicks_remaining !== 1 ? 's' : ''} left this week.`}
            </p>

            <button
              onClick={onClose}
              className="mt-2 px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {phase === 'spin' && (
          <p className="z-10 text-white/40 text-xs animate-pulse">Spinning…</p>
        )}

        {phase === 'reveal' && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 text-white/40 hover:text-white/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default DareModal;
