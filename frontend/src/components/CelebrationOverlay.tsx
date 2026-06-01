import React, { useEffect, useState } from 'react';
import { PartyPopper, Trophy, Sparkles, Send, Loader2 } from 'lucide-react';
import { getPublicPrize, submitPrizeClaim } from '@/lib/game-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

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
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claimData, setClaimData] = useState({ full_name: '', email: '', phone: '', mailing_address: '', notes: '' });

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

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimData.full_name.trim() || !claimData.email.trim()) {
      toast.error('Name and email are required.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitPrizeClaim({
        full_name: claimData.full_name.trim(),
        email: claimData.email.trim(),
        phone: claimData.phone.trim() || undefined,
        mailing_address: claimData.mailing_address.trim() || undefined,
        notes: claimData.notes.trim() || undefined,
      });
      setClaimed(true);
      setShowClaimForm(false);
      toast.success(result.message || 'Prize claim submitted!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit claim. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

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
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">🏆 Your Prize</p>
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

        {/* Claim form */}
        {showClaimForm && !claimed && (
          <form onSubmit={handleSubmitClaim} className="text-left space-y-3 mb-5 bg-indigo-50 rounded-xl p-4 border border-indigo-200">
            <p className="text-sm font-bold text-indigo-800 text-center mb-1">Enter your details to claim your prize</p>
            <div className="space-y-1">
              <Label htmlFor="claim-name" className="text-xs">Full Name *</Label>
              <Input id="claim-name" value={claimData.full_name} onChange={(e) => setClaimData(p => ({ ...p, full_name: e.target.value }))} placeholder="Your full name" required className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="claim-email" className="text-xs">Email Address *</Label>
              <Input id="claim-email" type="email" value={claimData.email} onChange={(e) => setClaimData(p => ({ ...p, email: e.target.value }))} placeholder="you@example.com" required className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="claim-phone" className="text-xs">Phone (optional)</Label>
              <Input id="claim-phone" type="tel" value={claimData.phone} onChange={(e) => setClaimData(p => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 000-0000" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="claim-address" className="text-xs">Mailing Address (optional)</Label>
              <Input id="claim-address" value={claimData.mailing_address} onChange={(e) => setClaimData(p => ({ ...p, mailing_address: e.target.value }))} placeholder="Street, City, Province/State, Postal Code" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="claim-notes" className="text-xs">Notes (optional)</Label>
              <Textarea id="claim-notes" value={claimData.notes} onChange={(e) => setClaimData(p => ({ ...p, notes: e.target.value }))} placeholder="Any notes for the team" className="text-sm min-h-[56px]" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={submitting} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                {submitting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Submitting…</> : <><Send className="w-4 h-4 mr-1" /> Submit Claim</>}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowClaimForm(false)} className="px-3">
                Cancel
              </Button>
            </div>
          </form>
        )}

        {claimed && (
          <div className="mb-5 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-emerald-700 font-bold">✅ Prize claim submitted!</p>
            <p className="text-sm text-emerald-600 mt-1">We'll contact you within 48 hours.</p>
          </div>
        )}

        <p className="text-sm text-slate-500 mb-5">
          Incredible work. Every Gr8Day Deed on your card made a real difference in someone's day. Keep spreading kindness!
        </p>

        <div className="flex items-center justify-center gap-2 mb-6">
          <PartyPopper className="w-5 h-5 text-amber-500" />
          <span className="text-sm text-slate-500">You're making a genuine impact.</span>
          <PartyPopper className="w-5 h-5 text-amber-500" />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          {/* Claim prize button — only shown if not already claimed */}
          {!claimed && !showClaimForm && (
            <button
              onClick={() => setShowClaimForm(true)}
              className="bg-gradient-to-r from-amber-500 to-amber-600 text-white font-bold py-3 px-6 rounded-xl hover:from-amber-600 hover:to-amber-700 transition-all shadow-lg w-full sm:w-auto"
            >
              🏆 Claim Your Prize
            </button>
          )}
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
