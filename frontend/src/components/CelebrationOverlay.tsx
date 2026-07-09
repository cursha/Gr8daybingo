import React, { useEffect, useState } from 'react';
import { PartyPopper, Trophy, Sparkles, Ticket } from 'lucide-react';
import { getPublicPrize } from '@/lib/game-utils';

interface CelebrationOverlayProps {
  show: boolean;
  onClose: () => void;
  winCondition: string;
  onNewGame?: () => void;
  newGameLoading?: boolean;
}

const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({ show, onClose, winCondition, onNewGame, newGameLoading = false }) => {
  const [confetti, setConfetti] = useState<Array<{ id: number; x: number; delay: number; color: string; size: number }>>([]);
  const [prize, setPrize] = useState<{ prize_image_url: string; prize_title: string } | null>(null);

  useEffect(() => {
    if (show) {
      const colors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#06B6D4'];
      const particles = Array.from({ length: 80 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
      }));
      setConfetti(particles);

      (async () => {
        try {
          const data = await getPublicPrize();
          if (data) setPrize(data);
        } catch {
          // ignore
        }
      })();
    }
  }, [show]);

  if (!show) return null;

  const conditionLabels: Record<string, string> = {
    one_line: 'One Line',
    two_lines: 'Two Lines',
    four_corners: 'Four Corners',
    x_pattern: 'X Pattern',
    around_the_edges: 'Around the Edges',
    fill_card: 'Full Card',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300 p-4 overflow-y-auto">
      {/* Always-reachable close button — pinned to the viewport, not the
          scrollable card, so it's never hidden below the fold on a short
          screen (the main Close/Start New Game buttons at the bottom of the
          card can be, since the card itself can be taller than the viewport). */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="fixed top-3 right-3 sm:top-5 sm:right-5 z-[60] w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white text-slate-700 text-lg font-bold shadow-lg"
      >
        ✕
      </button>

      {/* Confetti */}
      {confetti.map((p) => (
        <div
          key={p.id}
          className="absolute top-0 pointer-events-none"
          style={{ left: `${p.x}%`, animationDelay: `${p.delay}s` }}
        >
          <div
            className="rounded-full"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              animation: `fall ${3 + Math.random() * 2}s ease-in forwards`,
              animationDelay: `${p.delay}s`,
            }}
          />
        </div>
      ))}

      {/* Main card */}
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 sm:p-10 max-w-lg w-full my-8 text-center animate-in zoom-in duration-500">
        <div className="flex justify-center mb-4">
          <div className="relative bg-gradient-to-br from-amber-400 to-amber-600 rounded-full p-4 shadow-lg">
            <Trophy className="w-12 h-12 text-white" />
            <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-yellow-300 animate-pulse" />
          </div>
        </div>

        <h2 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
          BINGO!
        </h2>

        <p className="text-xl font-bold text-slate-800 mb-3">You're a B Kind Champion! 🎉</p>

        <p className="text-base text-slate-600 mb-4">
          You completed <span className="font-bold text-indigo-600">{conditionLabels[winCondition] || winCondition}</span>!
        </p>

        {/* Prize showcase */}
        {prize && prize.prize_image_url && (
          <div className="mb-5 bg-gradient-to-br from-amber-50 to-pink-50 rounded-xl p-4 border-2 border-amber-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">🏆 This Week's Prize</p>
            <div className="rounded-lg overflow-hidden mb-2 max-h-56 flex items-center justify-center bg-white">
              <img
                src={prize.prize_image_url}
                alt={prize.prize_title || 'Prize'}
                className="w-full h-auto object-contain max-h-56"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <p className="font-bold text-slate-800">{prize.prize_title || "This Week's Prize"}</p>
          </div>
        )}

        {/* Draw entry confirmation */}
        <div className="mb-5 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border-2 border-indigo-200">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Ticket className="w-5 h-5 text-indigo-600" />
            <p className="text-base font-bold text-indigo-800">You're in the draw!</p>
          </div>
          <p className="text-sm text-indigo-600">
            Your Bingo enters you automatically into this week's prize draw. The winner is selected every Monday. Good luck!
          </p>
        </div>

        <p className="text-sm text-slate-500 mb-5">
          Incredible work. Every Gr8Day Deed on your card made a real difference in someone's day. Keep spreading kindness!
        </p>

        <div className="flex items-center justify-center gap-2 mb-6">
          <PartyPopper className="w-5 h-5 text-amber-500" />
          <span className="text-sm text-slate-500">You're making a genuine impact.</span>
          <PartyPopper className="w-5 h-5 text-amber-500" />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          {onNewGame && (
            <button
              onClick={onNewGame}
              disabled={newGameLoading}
              className="bg-gradient-to-r from-red-600 to-red-700 text-white font-bold py-3 px-8 rounded-xl hover:from-red-700 hover:to-red-800 transition-all shadow-lg hover:shadow-xl w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {newGameLoading ? 'Starting...' : '🔄 Start New Game'}
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-slate-200 text-slate-700 font-bold py-3 px-8 rounded-xl hover:bg-slate-300 transition-all w-full sm:w-auto"
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default CelebrationOverlay;
