import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  CardData,
  WalletData,
  PendingDeed,
  generateCard,
  markCell,
  unmarkCell,
  purchaseCell,
  submitReferral,
  getWallet,
  suggestDeed,
  getMySuggestions,
  getPublicPrize,
  resetCard,
} from '@/lib/game-utils';
import BingoCell from '@/components/BingoCell';
import CelebrationOverlay from '@/components/CelebrationOverlay';
import RegistrationModal from '@/components/RegistrationModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Heart, Wallet, ArrowLeft, Send, RefreshCw, Trophy, Users, DollarSign, Sparkles, Target, Lightbulb, Clock, CheckCircle2, XCircle, Shield, Lock, PartyPopper, Medal, LogOut, Printer } from 'lucide-react';
import { downloadBingoCardPdf } from '@/lib/bingo-pdf';

const HEADER_LETTERS = ['GR', '8', 'D', 'A', 'Y'];
const HEADER_COLORS = [
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-green-600',
  'from-sky-500 to-blue-600',
  'from-violet-500 to-purple-600',
];

const WIN_CONDITION_LABELS: Record<string, string> = {
  one_line: 'One Line',
  two_lines: 'Two Lines',
  four_corners: 'Four Corners',
  fill_card: 'Fill the Card',
};

const WIN_CONDITION_DESCRIPTIONS: Record<string, string> = {
  one_line: 'Complete 5 in a row (horizontal, vertical, or diagonal)',
  two_lines: 'Complete any two full lines',
  four_corners: 'Complete all four corner squares',
  fill_card: 'Complete every square on the entire card',
};

const GameBoard: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<CardData | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [referralEmail, setReferralEmail] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [cellProgress, setCellProgress] = useState<Record<number, number>>({});

  // Deed suggestion state
  const [suggestText, setSuggestText] = useState('');
  const [suggestCategory, setSuggestCategory] = useState('');
  const [suggestNotes, setSuggestNotes] = useState('');
  const [mySuggestions, setMySuggestions] = useState<PendingDeed[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [prize, setPrize] = useState<{ prize_image_url: string; prize_title: string } | null>(null);

  useEffect(() => {
    getPublicPrize()
      .then((p) => setPrize(p))
      .catch(() => setPrize(null));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login', { state: { from: '/game' } });
    }
  }, [authLoading, user, navigate]);

  const loadGame = useCallback(async () => {
    try {
      setLoading(true);
      setCellProgress({});
      const [cardData, walletData] = await Promise.all([
        generateCard(),
        getWallet(),
      ]);
      setCard(cardData);
      setWallet(walletData);
      if (cardData.is_bingo) {
        setShowCelebration(true);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load game');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadGame();
    }
  }, [user]);

  const handleMark = async (cellIndex: number) => {
    if (!card || actionLoading) return;
    if (card.is_bingo) {
      toast.info('Game over! Start a new game to continue playing.');
      return;
    }
    setActionLoading(true);
    try {
      const result = await markCell(card.card_id, cellIndex);

      // Update card state — also flip secret_revealed locally so a replay looks right.
      setCard((prev) => {
        if (!prev) return null;
        const nextCells = prev.cells.map((c) =>
          c.index === cellIndex && c.is_secret
            ? { ...c, secret_revealed: true }
            : c
        );
        return {
          ...prev,
          cells: nextCells,
          completed_cells: result.completed_cells,
          is_bingo: result.is_bingo,
        };
      });

      // Secret Square reveal: celebrate + refresh wallet so the new balance shows.
      if (typeof result.secret_reward === 'number' && result.secret_reward > 0) {
        toast.success(
          `🎉 You found the Secret Square! +$${result.secret_reward.toFixed(2)} added to your wallet`,
          { duration: 5000 }
        );
        try {
          const w = await getWallet();
          setWallet(w);
        } catch {
          // non-critical
        }
      } else {
        toast.success('Gr8Day Deed completed — well done!');
      }

      if (result.is_bingo) {
        setTimeout(() => setShowCelebration(true), 500);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark cell');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnmark = async (cellIndex: number) => {
    if (!card || actionLoading) return;
    setActionLoading(true);
    try {
      const result = await unmarkCell(card.card_id, cellIndex);
      setCard((prev) =>
        prev
          ? { ...prev, completed_cells: result.completed_cells, is_bingo: result.is_bingo }
          : null
      );
      setCellProgress((prev) => {
        const next = { ...prev };
        delete next[cellIndex];
        return next;
      });
      toast.success('Deed unmarked.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unmark cell');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePurchase = async (cellIndex: number) => {
    if (!card || actionLoading) return;
    if (card.is_bingo) {
      toast.info('Game over! Start a new game to continue playing.');
      return;
    }
    const cell = card.cells[cellIndex];
    if (!cell.is_purchasable) return;

    if (!wallet || wallet.balance < (cell.purchase_price || 0)) {
      toast.error(`Insufficient funds. You need $${cell.purchase_price}. Head to your Wallet to add funds.`);
      return;
    }

    setActionLoading(true);
    try {
      const result = await purchaseCell(card.card_id, cellIndex);
      setCard((prev) =>
        prev
          ? {
              ...prev,
              purchased_cells: result.purchased_cells,
              is_bingo: result.is_bingo,
            }
          : null
      );
      setWallet((prev) => (prev ? { ...prev, balance: result.new_balance } : null));
      toast.success(`Square purchased for $${cell.purchase_price}`);
      if (result.is_bingo) {
        setTimeout(() => setShowCelebration(true), 500);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to purchase cell');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartNewGame = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      const newCard = await resetCard();
      setCard(newCard);
      setCellProgress({});
      setShowCelebration(false);
      toast.success('New game started! Good luck and keep spreading kindness.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start new game');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReferral = async () => {
    if (!referralEmail.trim()) return;
    if (card?.is_bingo) {
      toast.info('Game over! Start a new game to continue playing.');
      return;
    }
    setActionLoading(true);
    try {
      await submitReferral(referralEmail.trim());
      toast.success('Referral submitted! All "Refer a Player" squares are now marked!');
      setReferralEmail('');
      await loadGame();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit referral');
    } finally {
      setActionLoading(false);
    }
  };

  const loadMySuggestions = useCallback(async () => {
    try {
      const res = await getMySuggestions();
      setMySuggestions(res.suggestions || []);
    } catch {
      // silent — suggestion list is optional
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadMySuggestions();
    }
  }, [user, loadMySuggestions]);

  const handlePrintPdf = () => {
    if (!card) {
      toast.error('Your card is not loaded yet. Please wait a moment and try again.');
      return;
    }
    try {
      const playerName =
        (user as { first_name?: string; last_name?: string; email?: string } | null)?.first_name ||
        (user as { email?: string } | null)?.email ||
        undefined;
      const winConditionLabel = card.win_condition
        ? WIN_CONDITION_LABELS[card.win_condition] || card.win_condition
        : undefined;
      downloadBingoCardPdf(card, { playerName, winConditionLabel });
      toast.success('Your printable bingo card is downloading.');
    } catch (err) {
      console.error('Failed to generate PDF', err);
      toast.error('Could not generate the printable card. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore — context clears local state
    } finally {
      navigate('/');
    }
  };

  const handleSuggestDeed = async () => {
    const text = suggestText.trim();
    if (!text) {
      toast.error('Please describe the Gr8Day Deed you want to suggest.');
      return;
    }
    setSuggesting(true);
    try {
      const res = await suggestDeed({
        deed_text: text,
        category: suggestCategory.trim() || undefined,
        notes: suggestNotes.trim() || undefined,
      });
      toast.success(res?.message || 'Suggestion submitted! Awaiting admin approval.');
      setSuggestText('');
      setSuggestCategory('');
      setSuggestNotes('');
      await loadMySuggestions();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit suggestion');
    } finally {
      setSuggesting(false);
    }
  };

  // Count progress
  const totalCells = 25;
  const completedCount = card
    ? new Set([
        ...card.completed_cells,
        ...card.purchased_cells,
        ...card.referral_cells,
      ]).size
    : 0;

  // Current game mode label
  const currentMode = card?.win_condition || 'one_line';
  const modeLabel = WIN_CONDITION_LABELS[currentMode] || currentMode;
  const modeDescription = WIN_CONDITION_DESCRIPTIONS[currentMode] || '';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-400 border-t-transparent" />
          <span className="text-indigo-300 font-medium animate-pulse">Loading your card...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900">
      {user && <RegistrationModal enforce />}
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="text-white/70 hover:text-white hover:bg-white/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-pink-400 fill-pink-400" />
              <span className="text-base font-bold text-white hidden sm:inline">Gr8Day Bingo</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="bg-amber-500/20 border border-amber-500/30 text-amber-300 px-3 py-1.5 rounded-full text-sm font-bold flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              ${wallet?.balance?.toFixed(2) || '0.00'}
            </div>
            <Button
              size="sm"
              onClick={() => navigate('/wallet')}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs"
            >
              <DollarSign className="w-3.5 h-3.5 mr-0.5" />
              Add Funds
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/leaderboard')}
              className="border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white text-xs"
              title="Leaderboard"
            >
              <Medal className="w-3.5 h-3.5 mr-0.5" />
              <span className="hidden sm:inline">Leaderboard</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrintPdf}
              disabled={!card}
              className="border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white text-xs"
              title="Print / Save as PDF"
            >
              <Printer className="w-3.5 h-3.5 mr-0.5" />
              <span className="hidden sm:inline">Print PDF</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/admin')}
              className="border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white text-xs"
              title="Admin Panel"
            >
              <Shield className="w-3.5 h-3.5 mr-0.5" />
              <span className="hidden sm:inline">Admin</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleLogout}
              className="border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white text-xs"
              title="Log Out"
            >
              <LogOut className="w-3.5 h-3.5 mr-0.5" />
              <span className="hidden sm:inline">Log Out</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Prize Banner */}
        {prize && prize.prize_image_url && (
          <div className="mb-4 rounded-xl overflow-hidden border border-white/10 bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-emerald-500/10 backdrop-blur-sm">
            <div className="flex items-center gap-3 p-3">
              <img
                src={prize.prize_image_url}
                alt={prize.prize_title || 'Current prize'}
                className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border-2 border-white/20 flex-shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">Current Prize</p>
                <p className="text-sm sm:text-base font-bold text-white truncate">
                  {prize.prize_title || "This Week's Prize"}
                </p>
                <p className="text-xs text-white/60 hidden sm:block">Complete your card to win!</p>
              </div>
              <Trophy className="w-6 h-6 text-amber-400 flex-shrink-0" />
            </div>
          </div>
        )}

        {/* Title + Game Mode Display */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Your Gr8Day Card
            </h1>
            <p className="text-xs sm:text-sm text-indigo-300/70 mt-0.5">
              Week {card?.week_year || '...'} · {completedCount}/{totalCells} squares completed
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Game mode badge (read-only) */}
            <div className="bg-indigo-500/20 border border-indigo-400/30 rounded-lg px-3 py-1.5 flex items-center gap-2" title={modeDescription}>
              <Target className="w-3.5 h-3.5 text-indigo-400" />
              <div className="text-left">
                <span className="text-xs font-bold text-indigo-300 block leading-tight">{modeLabel}</span>
                <span className="text-[10px] text-indigo-400/60 leading-tight hidden sm:block">{modeDescription}</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => loadGame()}
              title="Refresh card"
              className="border-white/20 text-white/70 hover:text-white hover:bg-white/10 h-9 w-9"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${(completedCount / totalCells) * 100}%` }}
            />
          </div>
        </div>

        {/* ========== GAME OVER BANNER ========== */}
        {card?.is_bingo && (
          <div className="mb-4 rounded-xl overflow-hidden border-2 border-amber-400/60 bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-emerald-500/20 backdrop-blur-sm shadow-xl animate-in fade-in slide-in-from-top-2 duration-500">
            <div className="flex flex-col sm:flex-row items-center gap-3 p-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="bg-gradient-to-br from-amber-400 to-amber-600 rounded-full p-2.5 shadow-lg flex-shrink-0">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold flex items-center gap-1">
                    <PartyPopper className="w-3 h-3" /> Game Over — You Won!
                  </p>
                  <p className="text-sm sm:text-base font-bold text-white">
                    Your game is complete. The next game starts Monday.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleStartNewGame}
                disabled={actionLoading}
                size="lg"
                className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-black shadow-lg w-full sm:w-auto"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${actionLoading ? 'animate-spin' : ''}`} />
                Start New Game
              </Button>
            </div>
          </div>
        )}

        {/* ========== BINGO CARD ========== */}
        {card && (
          <div className="mb-6">
            {/* Outer glow frame */}
            <div className="relative rounded-2xl p-[3px] bg-gradient-to-br from-amber-400 via-pink-500 to-violet-600 shadow-2xl shadow-purple-900/50">
              {/* Inner card */}
              <div className="rounded-[13px] overflow-hidden bg-indigo-950">

                {/* Column headers */}
                <div className="grid grid-cols-5">
                  {HEADER_LETTERS.map((letter, i) => (
                    <div
                      key={i}
                      className={`
                        bg-gradient-to-b ${HEADER_COLORS[i]}
                        text-center py-2.5 sm:py-3.5 md:py-4
                        text-2xl sm:text-3xl md:text-4xl
                        font-black text-white
                        tracking-wider select-none
                        ${i > 0 ? 'border-l border-white/20' : ''}
                      `}
                      style={{ textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                    >
                      {letter}
                    </div>
                  ))}
                </div>

                {/* Grid cells with visible grid lines — every square has equal width AND height */}
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                    gridAutoRows: '1fr',
                    gap: '1px',
                    backgroundColor: 'rgba(99, 102, 241, 0.4)',
                  }}
                >
                  {card.cells.map((cell) => (
                    <div
                      key={cell.index}
                      className="relative w-full"
                      style={{ aspectRatio: '1 / 1' }}
                    >
                      <div className="absolute inset-0">
                        <BingoCell
                          cell={cell}
                          completedCells={card.completed_cells}
                          purchasedCells={card.purchased_cells}
                          referralCells={card.referral_cells}
                          onMark={handleMark}
                          onPurchase={handlePurchase}
                          locked={card.is_bingo}
                          prizeImageUrl={prize?.prize_image_url}
                          progress={cellProgress[cell.index] ?? 0}
                          onProgressChange={(idx, p) =>
                            setCellProgress((prev) => ({ ...prev, [idx]: p }))
                          }
                          onUnmark={handleUnmark}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 mb-4">
          <h3 className="font-bold text-white/80 mb-3 text-xs uppercase tracking-wider">How to Play</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-white shadow-sm flex-shrink-0" />
              <span className="text-indigo-200/80">Tap to complete</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-gradient-to-br from-slate-100 to-slate-200 shadow-sm flex-shrink-0 flex items-center justify-center">
                <DollarSign className="w-3 h-3 text-amber-600" />
              </div>
              <span className="text-indigo-200/80">Buy to unlock</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-gradient-to-br from-teal-50 to-cyan-100 shadow-sm flex-shrink-0 flex items-center justify-center">
                <Users className="w-3 h-3 text-teal-600" />
              </div>
              <span className="text-indigo-200/80">Refer to unlock</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-gradient-to-br from-emerald-400 to-green-500 shadow-sm flex-shrink-0 flex items-center justify-center">
                <Trophy className="w-3 h-3 text-white" />
              </div>
              <span className="text-indigo-200/80">Completed!</span>
            </div>
          </div>
        </div>

        {/* Referral Section */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 mb-6">
          <h3 className="font-bold text-white mb-2 flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-400" />
            Invite a Friend
          </h3>
          <p className="text-xs text-indigo-300/60 mb-3">
            Refer a player and ALL "Refer a Player" squares on your card will be automatically marked!
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="friend@example.com"
              value={referralEmail}
              onChange={(e) => setReferralEmail(e.target.value)}
              className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/30 text-sm"
            />
            <Button
              onClick={handleReferral}
              disabled={actionLoading || !referralEmail.trim() || !!card?.is_bingo}
              className="bg-teal-500 hover:bg-teal-600 text-white font-bold"
            >
              {card?.is_bingo ? <Lock className="w-4 h-4 mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              Invite
            </Button>
          </div>
        </div>

        {/* Suggest a Gr8Day Deed Section */}
        <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 mb-6">
          <h3 className="font-bold text-white mb-2 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            Suggest a Gr8Day Deed
          </h3>
          <p className="text-xs text-indigo-300/60 mb-3">
            Got a great idea? Submit a Gr8Day Deed and an admin will review it. Approved Gr8Day Deeds join the weekly pool for everyone to enjoy.
          </p>
          <div className="space-y-2">
            <Textarea
              placeholder="Describe the Gr8Day Deed (e.g., 'Mentor a student at a local school')"
              value={suggestText}
              onChange={(e) => setSuggestText(e.target.value)}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/30 text-sm min-h-[70px]"
              maxLength={500}
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Category (optional, e.g. Community)"
                value={suggestCategory}
                onChange={(e) => setSuggestCategory(e.target.value)}
                className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/30 text-sm"
                maxLength={60}
              />
              <Input
                placeholder="Notes to the admin (optional)"
                value={suggestNotes}
                onChange={(e) => setSuggestNotes(e.target.value)}
                className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/30 text-sm"
                maxLength={200}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleSuggestDeed}
                disabled={suggesting || !suggestText.trim()}
                className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
              >
                <Send className="w-4 h-4 mr-1" /> {suggesting ? 'Submitting...' : 'Submit Suggestion'}
              </Button>
            </div>
          </div>

          {mySuggestions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
                My Suggestions ({mySuggestions.length})
              </h4>
              <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {mySuggestions.map((s) => {
                  const statusConfig =
                    s.status === 'approved'
                      ? { icon: CheckCircle2, color: 'text-emerald-400', label: 'Approved' }
                      : s.status === 'rejected'
                      ? { icon: XCircle, color: 'text-rose-400', label: 'Rejected' }
                      : { icon: Clock, color: 'text-amber-300', label: 'Pending' };
                  const StatusIcon = statusConfig.icon;
                  return (
                    <li
                      key={s.id}
                      className="flex items-start gap-2 text-xs bg-white/5 rounded-md px-2.5 py-1.5"
                    >
                      <StatusIcon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${statusConfig.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white/80 truncate">{s.deed_text}</p>
                        {s.category && (
                          <span className="text-[10px] text-indigo-300/60">{s.category}</span>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold ${statusConfig.color} flex-shrink-0`}>
                        {statusConfig.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Celebration */}
      <CelebrationOverlay
        show={showCelebration}
        onClose={() => setShowCelebration(false)}
        winCondition={card?.win_condition || 'one_line'}
        onNewGame={handleStartNewGame}
        newGameLoading={actionLoading}
      />
    </div>
  );
};

export default GameBoard;