import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { APP_VERSION } from '@/lib/version';
import { getRegistrationStatus } from '@/lib/game-utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  CardData,
  WalletData,
  PendingDeed,
  MyTeamData,
  DareYaRevealResult,
  PlayerBadge,
  generateCard,
  markCell,
  unmarkCell,
  purchaseCell,
  pickThree,
  submitReferral,
  getWallet,
  suggestDeed,
  getMySuggestions,
  getPublicPrize,
  resetCard,
  getMyTeam,
  getMyTrades,
  revealDareYa,
  submitDareYaReferFriend,
  getMyProfile,
  getMyStreak,
  QuickTapDeed,
  getMyQuickTaps,
  tapQuickTapDeed,
  getSpotlightQuickTap,
  getQuickTapEligibleDeeds,
  setMyQuickTaps,
  StreakData,
  StreakMilestoneHit,
  BlackoutState,
  getMyCardStatus,
  revealBlackoutCell,
  passBlackoutCell,
  pauseBlackout,
  resumeBlackout,
  getPickupPrompt,
  submitPickupPromptResponse,
  ImpactStatsPeriod,
  MyImpactStats,
  getMyImpactStats,
} from '@/lib/game-utils';
import BingoCell from '@/components/BingoCell';
import CelebrationOverlay from '@/components/CelebrationOverlay';
import RegistrationModal from '@/components/RegistrationModal';
import DareModal from '@/components/DareModal';
import EditProfileModal from '@/components/EditProfileModal';
import StreakDisplay from '@/components/StreakDisplay';
import StreakMilestoneModal from '@/components/StreakMilestoneModal';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Heart, Wallet, ArrowLeft, Send, RefreshCw, Trophy, Users, DollarSign, Sparkles, Target, Lightbulb, Clock, Check, CheckCircle2, XCircle, Shield, Medal, LogOut, Printer, ChevronDown, Shuffle, Share2, X, UserCircle, Edit2, Menu as MenuIcon } from 'lucide-react';
import Footer from '@/components/Footer';
import { downloadBingoCardPdf, downloadTeamCardsPdf, TeamMemberCard } from '@/lib/bingo-pdf';
import { shareOrDownloadImpactCard } from '@/lib/impact-card';

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

const IMPACT_PERIOD_LABELS: Record<ImpactStatsPeriod, string> = {
  week: 'This Week', month: 'This Month', quarter: 'This Quarter', year: 'This Year', all: 'All Time',
};

const WIN_CONDITION_DESCRIPTIONS: Record<string, string> = {
  one_line: 'Complete 5 in a row (horizontal, vertical, or diagonal)',
  two_lines: 'Complete any two full lines',
  four_corners: 'Complete all four corner squares',
  fill_card: 'Complete every square on the entire card',
};

// A Blackout square is always in exactly one of these states, by construction
// server-side: still hidden, permanently blocked (passed on), open in the
// current group (revealed but not yet resolved), or completed. No purchase,
// referral, secret, or I-Dare-Ya treatment applies to any Blackout square.
const BlackoutTile: React.FC<{
  cell: CardData['cells'][number];
  isCompleted: boolean;
  isBlocked: boolean;
  isOpen: boolean;
  canReveal: boolean;
  revealing: boolean;
  passing: boolean;
  onReveal: () => void;
  onComplete: () => void;
  onPass: () => void;
}> = ({ cell, isCompleted, isBlocked, isOpen, canReveal, revealing, passing, onReveal, onComplete, onPass }) => {
  const [pendingReveal, setPendingReveal] = useState(false);
  const [pendingPass, setPendingPass] = useState(false);
  const [pendingComplete, setPendingComplete] = useState(false);

  if (cell.is_hidden) {
    return (
      <>
        <button
          onClick={() => setPendingReveal(true)}
          disabled={!canReveal || revealing}
          className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-800 to-blue-900 hover:from-blue-700 hover:to-blue-800 border border-white/10 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          aria-label="Hidden square — tap to reveal"
        >
          <span className="text-yellow-300 text-lg sm:text-2xl">?</span>
        </button>
        {pendingReveal && createPortal((
          <div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setPendingReveal(false)}
          >
            <div
              className="bg-indigo-950 rounded-2xl shadow-2xl p-5 flex flex-col items-center gap-3 w-full max-w-[280px]"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-base font-black text-white text-center leading-tight">Reveal this square?</p>
              <div className="flex flex-wrap gap-2 items-center justify-center mt-1 w-full">
                <button
                  type="button"
                  className="flex-1 min-w-[70px] flex items-center justify-center h-11 px-4 bg-emerald-500 active:bg-emerald-400 rounded-xl text-white font-bold text-base cursor-pointer select-none"
                  onClick={(e) => { e.stopPropagation(); setPendingReveal(false); onReveal(); }}
                >
                  ✓ Yes
                </button>
                <button
                  type="button"
                  className="flex-1 min-w-[70px] flex items-center justify-center h-11 px-4 bg-rose-600 active:bg-rose-500 rounded-xl text-white font-bold text-base cursor-pointer select-none"
                  onClick={(e) => { e.stopPropagation(); setPendingReveal(false); }}
                >
                  ✕ No
                </button>
              </div>
            </div>
          </div>
        ), document.body)}
      </>
    );
  }

  if (isBlocked) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 bg-blue-800/80 border border-rose-900/40">
        <span className="text-yellow-300/60 text-base sm:text-xl">✕</span>
        <span className="text-[7px] sm:text-[9px] font-bold text-yellow-300/60 uppercase tracking-widest">Passed</span>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 px-1 bg-gradient-to-br from-emerald-400 to-green-500">
        <Check className="w-4 h-4 sm:w-6 sm:h-6 text-white drop-shadow" strokeWidth={3} />
        <span className="text-[7px] sm:text-[9px] text-center leading-tight font-bold text-white/90 line-clamp-2 px-0.5">
          {cell.deed_text}
        </span>
      </div>
    );
  }

  // Open in the current group — needs a decision.
  if (isOpen) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-1 py-1 bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-400">
        <span className="text-[7px] sm:text-[9px] text-center leading-tight font-semibold text-slate-700 line-clamp-3">
          {cell.deed_text}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setPendingComplete(true)}
            disabled={passing}
            className="text-[7px] sm:text-[9px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded px-1.5 py-0.5 disabled:opacity-50"
          >
            Done
          </button>
          <button
            onClick={() => setPendingPass(true)}
            disabled={passing}
            className="text-[7px] sm:text-[9px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded px-1.5 py-0.5 disabled:opacity-50"
          >
            {passing ? '…' : 'Pass'}
          </button>
        </div>
        {pendingComplete && createPortal((
          <div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setPendingComplete(false)}
          >
            <div
              className="bg-indigo-950 rounded-2xl shadow-2xl p-5 flex flex-col items-center gap-3 w-full max-w-[280px]"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-base font-black text-white text-center leading-tight">Mark this square?</p>
              <p className="text-xs text-indigo-200 text-center leading-snug line-clamp-2">{cell.deed_text}</p>
              <div className="flex flex-wrap gap-2 items-center justify-center mt-1 w-full">
                <button
                  type="button"
                  className="flex-1 min-w-[70px] flex items-center justify-center h-11 px-4 bg-emerald-500 active:bg-emerald-400 rounded-xl text-white font-bold text-base cursor-pointer select-none"
                  onClick={(e) => { e.stopPropagation(); setPendingComplete(false); onComplete(); }}
                >
                  ✓ Yes
                </button>
                <button
                  type="button"
                  className="flex-1 min-w-[70px] flex items-center justify-center h-11 px-4 bg-rose-600 active:bg-rose-500 rounded-xl text-white font-bold text-base cursor-pointer select-none"
                  onClick={(e) => { e.stopPropagation(); setPendingComplete(false); }}
                >
                  ✕ No
                </button>
              </div>
            </div>
          </div>
        ), document.body)}
        {pendingPass && createPortal((
          <div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setPendingPass(false)}
          >
            <div
              className="bg-indigo-950 rounded-2xl shadow-2xl p-5 flex flex-col items-center gap-3 w-full max-w-[280px]"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-base font-black text-white text-center leading-tight">Pass on this square?</p>
              <div className="flex flex-wrap gap-2 items-center justify-center mt-1 w-full">
                <button
                  type="button"
                  className="flex-1 min-w-[70px] flex items-center justify-center h-11 px-4 bg-emerald-500 active:bg-emerald-400 rounded-xl text-white font-bold text-base cursor-pointer select-none"
                  onClick={(e) => { e.stopPropagation(); setPendingPass(false); onPass(); }}
                >
                  ✓ Yes
                </button>
                <button
                  type="button"
                  className="flex-1 min-w-[70px] flex items-center justify-center h-11 px-4 bg-rose-600 active:bg-rose-500 rounded-xl text-white font-bold text-base cursor-pointer select-none"
                  onClick={(e) => { e.stopPropagation(); setPendingPass(false); }}
                >
                  ✕ No
                </button>
              </div>
            </div>
          </div>
        ), document.body)}
      </div>
    );
  }

  // Should be unreachable — every non-hidden, non-blocked, non-completed
  // square is by construction part of the active group.
  return <div className="w-full h-full bg-slate-900" />;
};

const GameBoard: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, logout, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<CardData | null>(null);
  const [showModePicker, setShowModePicker] = useState(false);
  const [pickedMode, setPickedMode] = useState<'classic' | 'blackout' | null>(null);
  const [modeConfirming, setModeConfirming] = useState(false);
  const [pickupPrompt, setPickupPrompt] = useState<{ id: number; question_text: string } | null>(null);
  const [pickupPromptAnswer, setPickupPromptAnswer] = useState('');
  const [blackoutRevealing, setBlackoutRevealing] = useState(false);
  const [blackoutPassingCell, setBlackoutPassingCell] = useState<number | null>(null);
  const [blackoutPausing, setBlackoutPausing] = useState(false);
  const [pickThreeMode, setPickThreeMode] = useState(false);
  const [pickThreeSelection, setPickThreeSelection] = useState<Set<number>>(new Set());
  const [pickThreeLoading, setPickThreeLoading] = useState(false);
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
  const [playerNumber, setPlayerNumber] = useState<number | null>(null);
  const [playerBadge, setPlayerBadge] = useState<PlayerBadge | null>(null);
  const [myTeam, setMyTeam] = useState<MyTeamData | null>(null);
  const [dareYaResult, setDareYaResult] = useState<DareYaRevealResult | null>(null);
  const [dareYaLoading, setDareYaLoading] = useState(false);
  const [pendingTradeCount, setPendingTradeCount] = useState(0);
  const [quickTapDeeds, setQuickTapDeeds] = useState<QuickTapDeed[]>([]);
  const [quickTapSource, setQuickTapSource] = useState<'custom' | 'default'>('default');
  const [quickTapTapping, setQuickTapTapping] = useState<number | null>(null);
  const [quickTapCounts, setQuickTapCounts] = useState<Record<number, number>>({});
  const [spotlightQuickTap, setSpotlightQuickTap] = useState<QuickTapDeed | null>(null);
  const [showQuickTapPicker, setShowQuickTapPicker] = useState(false);
  const [eligibleDeeds, setEligibleDeeds] = useState<QuickTapDeed[]>([]);
  const [pickerSelection, setPickerSelection] = useState<Set<number>>(new Set());
  const [pickerSaving, setPickerSaving] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [streakMilestones, setStreakMilestones] = useState<StreakMilestoneHit[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [showImpactPicker, setShowImpactPicker] = useState(false);
  const [impactPeriod, setImpactPeriod] = useState<ImpactStatsPeriod>('week');
  const [impactStats, setImpactStats] = useState<MyImpactStats | null>(null);
  const [impactStatsLoading, setImpactStatsLoading] = useState(false);
  const [selectedFeaturedDeed, setSelectedFeaturedDeed] = useState<string | null>(null);

  useEffect(() => {
    getPublicPrize()
      .then((p) => setPrize(p))
      .catch(() => setPrize(null));
  }, []);

  useEffect(() => {
    if (user) {
      getRegistrationStatus()
        .then((s) => setPlayerNumber((s as any)?.player_number ?? null))
        .catch(() => {});
      getMyProfile()
        .then((p) => setPlayerBadge(p))
        .catch(() => {});
      getMyQuickTaps()
        .then((res) => { setQuickTapDeeds(res.deeds); setQuickTapSource(res.source); })
        .catch(() => {});
      getSpotlightQuickTap()
        .then((res) => setSpotlightQuickTap(res.deed))
        .catch(() => setSpotlightQuickTap(null));
      getMyTeam()
        .then((res) => setMyTeam(res.team))
        .catch(() => setMyTeam(null));
      getMyTrades()
        .then((res) => {
          const userId = (user as any)?.sub ?? (user as any)?.id ?? '';
          const pending = res.trades.filter(
            (t) => t.to_user_id === userId && t.status === 'pending'
          ).length;
          setPendingTradeCount(pending);
        })
        .catch(() => setPendingTradeCount(0));
      getMyStreak()
        .then((s) => setStreak(s))
        .catch(() => {});
    }
  }, [user]);

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
      const [status, walletData] = await Promise.all([
        getMyCardStatus(),
        getWallet(),
      ]);
      setWallet(walletData);

      // No card yet this week, and Blackout is being offered as a choice —
      // show the picker BEFORE ever calling generate-card. Once a card
      // exists, that single call is the lock: generate-card just returns it
      // unchanged, so the picker must never show again after this point.
      if (!status.has_card && status.blackout_offered) {
        setShowModePicker(true);
        setLoading(false);
        getPickupPrompt()
          .then((res) => setPickupPrompt(res.id != null ? { id: res.id, question_text: res.question_text! } : null))
          .catch(() => setPickupPrompt(null));
        return;
      }

      // Note: do NOT trigger the celebration overlay here just because the
      // loaded card happens to already be is_bingo — a player now keeps
      // playing the same card (and reloading the page) for the rest of the
      // week, so that would re-show the full-screen "You Won!" modal on
      // every single visit. The overlay only belongs to the exact moment a
      // mark/purchase/dare-ya action just flips the card to is_bingo (see the
      // action handlers below), never to a page load.
      const cardData = await generateCard(status.has_card ? undefined : 'classic');
      setCard(cardData);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load game');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleConfirmMode = async () => {
    if (!pickedMode) return;
    setModeConfirming(true);
    // Best-effort, fire-and-forget — a failure here must never block or delay
    // card generation. Skipping the question never calls this at all.
    const trimmedAnswer = pickupPromptAnswer.trim();
    if (pickupPrompt && trimmedAnswer) {
      submitPickupPromptResponse(pickupPrompt.id, trimmedAnswer).catch(() => {});
    }
    try {
      const cardData = await generateCard(pickedMode);
      setCard(cardData);
      setShowModePicker(false);
      if (cardData.is_bingo) {
        setShowCelebration(true);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start your game');
    } finally {
      setModeConfirming(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadGame();
    }
  }, [user]);

  const handleMark = async (cellIndex: number) => {
    if (!card || actionLoading) return;
    const wasAlreadyBingo = card.is_bingo;
    setActionLoading(true);
    try {
      const result = await markCell(card.card_id, cellIndex);

      // Bomb Square: the whole card was just rewritten, not this one square
      // completed. Swap in the fresh state wholesale and stop — none of the
      // normal completion/secret/bingo/streak handling below applies.
      if (result.bomb_triggered && result.cells) {
        setCard((prev) => prev ? {
          ...prev,
          cells: result.cells!,
          completed_cells: result.completed_cells,
          purchased_cells: result.purchased_cells ?? [],
          referral_cells: result.referral_cells ?? [],
          is_bingo: result.is_bingo,
          pick_three_used: result.pick_three_used ?? false,
        } : null);
        toast.success('💣 Bomb Square! Your whole card just got rewritten — fresh deeds, fresh start!', { duration: 6000 });
        return;
      }

      // Update card state — also flip secret_revealed locally so a replay looks right.
      setCard((prev) => {
        if (!prev) return null;
        const nextCells = prev.cells.map((c) =>
          c.index === cellIndex && c.is_secret
            ? { ...c, secret_revealed: true }
            : c
        );
        // Blackout: this square just resolved (completed) — mirror the
        // backend's group-closing logic locally so the "reveal" button
        // reappears the instant the group empties, no extra fetch needed.
        const nextBlackout = prev.blackout && prev.blackout.active_group
          ? (() => {
              const remaining = prev.blackout!.active_group!.filter((i) => i !== cellIndex);
              return { ...prev.blackout!, active_group: remaining.length > 0 ? remaining : null };
            })()
          : prev.blackout;
        return {
          ...prev,
          cells: nextCells,
          completed_cells: result.completed_cells,
          is_bingo: result.is_bingo,
          draw_bonus_entries: result.draw_bonus_entries,
          blackout: nextBlackout,
        };
      });

      // Secret Square reveal: celebrate + refresh wallet so the new balance shows.
      if (typeof result.secret_reward === 'number' && result.secret_reward > 0) {
        toast.success(
          `🎉 You found the Secret Square! +${result.secret_reward.toFixed(2)} Gr8Day Bucks added to your wallet`,
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

      if (result.is_bingo && !wasAlreadyBingo) {
        setTimeout(() => setShowCelebration(true), 500);
      }

      if (result.streak_update) {
        const su = result.streak_update;
        setStreak((prev) => prev
          ? { ...prev, current_streak_days: su.current_streak_days, longest_streak_days: su.longest_streak_days }
          : null
        );
        if (su.new_milestones.length > 0) {
          setStreakMilestones(su.new_milestones);
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark cell');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlackoutReveal = async (cellIndex: number) => {
    if (!card || blackoutRevealing) return;
    setBlackoutRevealing(true);
    try {
      const result = await revealBlackoutCell(cellIndex);
      setCard((prev) => {
        if (!prev) return null;
        const revealedByIndex = new Map(result.revealed.map((c) => [c.index, c]));
        const nextCells = prev.cells.map((c) => revealedByIndex.get(c.index) ?? c);
        return {
          ...prev,
          cells: nextCells,
          blackout: prev.blackout
            ? { ...prev.blackout, hidden_cells: result.hidden_cells, active_group: result.active_group }
            : prev.blackout,
        };
      });
      toast.success(result.revealed.length > 1 ? `${result.revealed.length} squares revealed!` : 'Square revealed!');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reveal square');
    } finally {
      setBlackoutRevealing(false);
    }
  };

  const handleBlackoutPass = async (cellIndex: number) => {
    if (!card || blackoutPassingCell != null) return;
    setBlackoutPassingCell(cellIndex);
    try {
      const result = await passBlackoutCell(cellIndex);
      setCard((prev) =>
        prev && prev.blackout
          ? { ...prev, blackout: { ...prev.blackout, blocked_cells: result.blocked_cells, active_group: result.active_group } }
          : prev
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to pass on square');
    } finally {
      setBlackoutPassingCell(null);
    }
  };

  const handleBlackoutPause = async () => {
    if (!card || blackoutPausing) return;
    setBlackoutPausing(true);
    try {
      await pauseBlackout();
      setCard((prev) => (prev && prev.blackout ? { ...prev, blackout: { ...prev.blackout, is_paused: true } } : prev));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to pause');
    } finally {
      setBlackoutPausing(false);
    }
  };

  const handleBlackoutResume = async () => {
    if (!card || blackoutPausing) return;
    setBlackoutPausing(true);
    try {
      await resumeBlackout();
      setCard((prev) => (prev && prev.blackout ? { ...prev, blackout: { ...prev.blackout, is_paused: false } } : prev));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to resume');
    } finally {
      setBlackoutPausing(false);
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
    const cell = card.cells[cellIndex];
    if (!cell.is_purchasable) return;

    if (!wallet || wallet.balance < (cell.purchase_price || 0)) {
      toast.error(`Insufficient Gr8Day Bucks. You need ${cell.purchase_price}. Head to your Wallet to add funds.`);
      return;
    }

    const wasAlreadyBingo = card.is_bingo;
    setActionLoading(true);
    try {
      const result = await purchaseCell(card.card_id, cellIndex);
      setCard((prev) =>
        prev
          ? {
              ...prev,
              purchased_cells: result.purchased_cells,
              is_bingo: result.is_bingo,
              draw_bonus_entries: result.draw_bonus_entries,
            }
          : null
      );
      setWallet((prev) => (prev ? { ...prev, balance: result.new_balance } : null));
      toast.success(`Square purchased for ${cell.purchase_price} Gr8Day Bucks`);
      if (result.is_bingo && !wasAlreadyBingo) {
        setTimeout(() => setShowCelebration(true), 500);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to purchase cell');
    } finally {
      setActionLoading(false);
    }
  };

  // Same "unplayed, non-special" rule the backend enforces — kept in sync with
  // POST /pick-three's eligibility filter in game/index.ts. Deliberately does
  // NOT exclude secret squares: the client never even knows which cell (if
  // any) is secret, since sanitizeCells hides that until it's revealed.
  const isPickThreeEligible = (cellIndex: number): boolean => {
    if (!card) return false;
    const cell = card.cells[cellIndex];
    if (!cell || cellIndex === 12 || cell.is_free_space || cell.is_purchasable || cell.is_referral_free) return false;
    return !card.completed_cells.includes(cellIndex)
      && !card.purchased_cells.includes(cellIndex)
      && !card.referral_cells.includes(cellIndex);
  };

  const handleStartPickThree = () => {
    if (!card || card.pick_three_used) return;
    setPickThreeMode(true);
    setPickThreeSelection(new Set());
  };

  const handleCancelPickThree = () => {
    setPickThreeMode(false);
    setPickThreeSelection(new Set());
  };

  const handleTogglePickThree = (cellIndex: number) => {
    setPickThreeSelection((prev) => {
      const next = new Set(prev);
      if (next.has(cellIndex)) {
        next.delete(cellIndex);
      } else if (next.size < 3) {
        next.add(cellIndex);
      }
      return next;
    });
  };

  const handleConfirmPickThree = async () => {
    if (!card || pickThreeSelection.size !== 3) return;
    setPickThreeLoading(true);
    try {
      const result = await pickThree(card.card_id, [...pickThreeSelection]);
      setCard((prev) => (prev ? { ...prev, cells: result.cells, pick_three_used: true } : null));
      toast.success('3 squares swapped for new challenges!');
      setPickThreeMode(false);
      setPickThreeSelection(new Set());
    } catch (err: any) {
      toast.error(err?.message || 'Failed to use Pick Three');
    } finally {
      setPickThreeLoading(false);
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
    setActionLoading(true);
    try {
      await submitReferral(referralEmail.trim());
      toast.success('Invitation sent! Your square unlocks once your friend creates an account.');
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

  const handleQuickTapTap = async (deed: QuickTapDeed) => {
    if (quickTapTapping) return;
    setQuickTapTapping(deed.id);
    try {
      const result = await tapQuickTapDeed(deed.id);
      setQuickTapCounts(prev => ({ ...prev, [deed.id]: (prev[deed.id] ?? 0) + 1 }));
      toast.success(`${deed.deed_text} — thank you for the kindness!`);
      if (result?.streak_update) {
        const su = result.streak_update;
        setStreak((prev) => prev
          ? { ...prev, current_streak_days: su.current_streak_days, longest_streak_days: su.longest_streak_days }
          : null
        );
        if (su.new_milestones.length > 0) setStreakMilestones(su.new_milestones);
      }
    } catch {
      toast.error('Could not record your deed. Please try again.');
    } finally {
      setQuickTapTapping(null);
    }
  };

  const handleOpenPicker = async () => {
    try {
      const res = await getQuickTapEligibleDeeds();
      setEligibleDeeds(res.deeds);
      setPickerSelection(new Set(quickTapDeeds.map((d) => d.id)));
      setShowQuickTapPicker(true);
    } catch {
      toast.error('Could not load eligible deeds.');
    }
  };

  const handlePickerSave = async () => {
    const ids = [...pickerSelection];
    if (ids.length < 1 || ids.length > 3) { toast.error('Choose 1 to 3 deeds'); return; }
    setPickerSaving(true);
    try {
      await setMyQuickTaps(ids);
      const res = await getMyQuickTaps();
      setQuickTapDeeds(res.deeds);
      setQuickTapSource(res.source);
      setShowQuickTapPicker(false);
      toast.success('Quick Tap updated!');
    } catch {
      toast.error('Could not save your selection.');
    } finally {
      setPickerSaving(false);
    }
  };

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

  const loadImpactStats = async (period: ImpactStatsPeriod) => {
    setImpactPeriod(period);
    setImpactStatsLoading(true);
    try {
      const stats = await getMyImpactStats(period);
      setImpactStats(stats);
      // A deed featured under the old period might not exist in the new one.
      if (!stats.top_deeds.some((d) => d.deed_text === selectedFeaturedDeed)) {
        setSelectedFeaturedDeed(null);
      }
    } catch (err) {
      console.error('Failed to load impact stats', err);
      toast.error('Could not load your stats. Please try again.');
      setImpactStats(null);
    } finally {
      setImpactStatsLoading(false);
    }
  };

  const handleOpenImpactPicker = () => {
    setShowImpactPicker(true);
    setSelectedFeaturedDeed(null);
    loadImpactStats('week');
  };

  const handleGenerateImpactCard = async () => {
    if (!impactStats) return;
    setShareLoading(true);
    try {
      const featured = selectedFeaturedDeed
        ? impactStats.top_deeds.find((d) => d.deed_text === selectedFeaturedDeed)
        : null;
      // Username only — never a real name, this image is meant to be shared publicly.
      const username = (user as { name?: string } | null)?.name || `GR8-${playerNumber ?? '????'}`;

      const result = await shareOrDownloadImpactCard({
        username,
        periodLabel: IMPACT_PERIOD_LABELS[impactPeriod],
        count: featured ? featured.count : impactStats.total,
        featuredDeedText: featured ? featured.deed_text : null,
        totalDeeds: playerBadge?.total_deeds ?? 0,
        badgeName: playerBadge?.badge_name,
        badgeEmoji: playerBadge?.badge_emoji,
      });
      if (result === 'downloaded') toast.success('Your impact card is downloading.');
      setShowImpactPicker(false);
    } catch (err) {
      console.error('Failed to generate impact card', err);
      toast.error('Could not generate your impact card. Please try again.');
    } finally {
      setShareLoading(false);
    }
  };

  const handlePrintTeamPdf = async () => {
    if (!myTeam) return;
    try {
      const winConditionLabel = card?.win_condition
        ? WIN_CONDITION_LABELS[card.win_condition] || card.win_condition
        : undefined;

      // Use cached team data — cards were fetched server-side
      const membersWithCards: TeamMemberCard[] = myTeam.members
        .filter((m) => m.card != null)
        .map((m) => {
          const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || m.username || 'Player';
          const pn = m.player_number ? `GR8-${m.player_number}` : null;
          return { playerName: name, playerNumber: pn, card: m.card! };
        });

      if (membersWithCards.length === 0) {
        toast.error('No team members have cards generated yet.');
        return;
      }

      downloadTeamCardsPdf(myTeam.team_name, membersWithCards, { winConditionLabel });
      toast.success('Team bingo cards are downloading.');
    } catch (err) {
      console.error('Failed to generate team PDF', err);
      toast.error('Could not generate the team card. Please try again.');
    }
  };

  const handleDareYaReveal = async () => {
    if (!card || dareYaLoading) return;
    const wasAlreadyBingo = card.is_bingo;
    setDareYaLoading(true);
    try {
      const result = await revealDareYa(card.card_id);
      setDareYaResult(result);
      if (typeof result.new_balance === 'number') {
        setWallet((prev) => prev ? { ...prev, balance: result.new_balance! } : prev);
      }
      if (result.outcome === 'free_square' || result.outcome === 'replace_three') {
        await loadGame();
      }
      // Reflect the win + any draw-entry bonus locally regardless of outcome
      // type — loadGame() above only runs for free_square/replace_three, so
      // every other outcome (fund_credit, remove_funds, nothing) needs its
      // own state patch here too. Runs after loadGame() so it isn't wiped by
      // that refetch.
      setCard((prev) => prev ? {
        ...prev,
        is_bingo: result.is_bingo,
        completed_cells: result.completed_cells,
        draw_bonus_entries: result.draw_bonus_entries,
      } : prev);
      if (result.is_bingo && !wasAlreadyBingo) {
        setTimeout(() => setShowCelebration(true), 500);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not reveal your dare. Please try again.');
    } finally {
      setDareYaLoading(false);
    }
  };

  const handleDareYaReferFriend = async (email: string) => {
    if (!card) throw new Error('No active card');
    const result = await submitDareYaReferFriend(card.card_id, email);
    if (result.matched) {
      if (typeof result.new_balance === 'number') {
        setWallet((prev) => prev ? { ...prev, balance: result.new_balance! } : prev);
      }
      await loadGame();
      // loadGame() refetches the card fresh, which doesn't carry this
      // one-off award — patch it back on afterward.
      setCard((prev) => prev ? { ...prev, draw_bonus_entries: result.draw_bonus_entries } : prev);
    }
    return result;
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
        // The I DARE YA centre is a free space — it always counts (toward both
        // the progress bar and Bingo), even though it is never "marked".
        ...card.cells.filter((c) => c.is_free_space).map((c) => c.index),
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

  if (showModePicker) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 p-4">
        <div className="w-full max-w-md bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-5">
          <div className="text-center space-y-1">
            <h1 className="text-xl font-black text-white">Choose Your Game</h1>
            <p className="text-sm text-indigo-200/70">This locks in for the whole week once you confirm.</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => setPickedMode('classic')}
              className={`text-left rounded-xl border-2 p-4 transition-all duration-150 ${
                pickedMode === 'blackout'
                  ? 'opacity-40 border-white/10 bg-white/5 text-white/50'
                  : pickedMode === 'classic'
                    ? 'border-emerald-400 bg-emerald-500/15 text-white'
                    : 'border-white/20 bg-white/5 text-white hover:border-white/40'
              }`}
            >
              <p className="font-bold">Regular Bingo</p>
              <p className="text-xs opacity-80 mt-0.5">The classic card — every square visible from the start.</p>
            </button>
            <button
              onClick={() => setPickedMode('blackout')}
              className={`text-left rounded-xl border-2 p-4 transition-all duration-150 ${
                pickedMode === 'classic'
                  ? 'opacity-40 border-white/10 bg-white/5 text-white/50'
                  : pickedMode === 'blackout'
                    ? 'border-amber-400 bg-amber-500/15 text-white'
                    : 'border-white/20 bg-white/5 text-white hover:border-white/40'
              }`}
            >
              <p className="font-bold">Blackout Bingo</p>
              <p className="text-xs opacity-80 mt-0.5">Every square starts hidden. Reveal a few at a time, complete or pass on each.</p>
            </button>
          </div>
          {pickupPrompt && (
            <div className="space-y-2 pt-1 border-t border-white/10">
              <p className="text-sm font-bold text-white pt-3">{pickupPrompt.question_text}</p>
              <Textarea
                placeholder="Totally optional — answer or just hit Confirm."
                value={pickupPromptAnswer}
                onChange={(e) => setPickupPromptAnswer(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 text-sm min-h-[70px]"
                maxLength={1000}
              />
            </div>
          )}
          <Button
            onClick={handleConfirmMode}
            disabled={!pickedMode || modeConfirming}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold"
          >
            {modeConfirming ? 'Starting…' : 'Confirm'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 flex flex-col">
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
              <span className="text-base font-bold text-white hidden sm:inline whitespace-nowrap">Gr8Day Bingo</span>
              <span className="text-[10px] text-white/40 select-none self-end mb-1 hidden sm:inline">{APP_VERSION}</span>
            </div>
            {playerNumber && (
              <span className="hidden sm:flex items-center gap-1">
                {playerBadge && (
                  <img
                    src={`/badge-${playerBadge.badge_name.toLowerCase()}.png`}
                    alt={playerBadge.badge_name}
                    className="w-6 h-6 rounded-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <span className="text-xs text-white/50 font-mono">GR8-{playerNumber}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Wallet balance stays on the bar — it's the one number players
                check constantly to decide whether they can afford a square,
                so it doesn't get buried behind a menu tap like everything
                else here. "Bucks" drops on mobile to save width; the number
                itself never does. */}
            <Button
              size="sm"
              onClick={() => navigate('/wallet')}
              title="Wallet — tap to add funds"
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs rounded-full px-3 py-1.5"
            >
              <Wallet className="w-3.5 h-3.5 mr-1" />
              {wallet?.balance?.toFixed(2) || '0.00'}<span className="hidden sm:inline">&nbsp;Bucks</span>
            </Button>

            <button
              onClick={() => navigate('/how-to-play')}
              title="How to Play"
              className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-900 font-black text-sm shadow-[0_0_0_3px_rgba(251,191,36,0.25)] transition-all hover:scale-105 flex-shrink-0"
            >
              ?
            </button>

            {/* Everything else — profile, team, printing, admin, logout —
                lives in one Menu so the bar doesn't turn into a row of 7+
                competing buttons, especially on a phone. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="relative border-white/20 bg-white/5 text-white hover:bg-white/15 hover:text-white text-xs"
                  title="Menu"
                >
                  <MenuIcon className="w-3.5 h-3.5 sm:mr-1" />
                  <span className="hidden sm:inline">Menu</span>
                  <ChevronDown className="w-3 h-3 ml-0.5" />
                  {pendingTradeCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {pendingTradeCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-900 border-white/10 text-white">
                <DropdownMenuItem onClick={() => setShowEditProfile(true)} className="cursor-pointer focus:bg-white/10 focus:text-white">
                  <Edit2 className="w-3.5 h-3.5 mr-2" /> Edit Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/players/me')} className="cursor-pointer focus:bg-white/10 focus:text-white">
                  <UserCircle className="w-3.5 h-3.5 mr-2" /> My Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/leaderboard')} className="cursor-pointer focus:bg-white/10 focus:text-white">
                  <Medal className="w-3.5 h-3.5 mr-2" /> Leaderboard
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/prize-history')} className="cursor-pointer focus:bg-white/10 focus:text-white">
                  <Trophy className="w-3.5 h-3.5 mr-2" /> My Wins
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenImpactPicker} className="cursor-pointer focus:bg-white/10 focus:text-white">
                  <Share2 className="w-3.5 h-3.5 mr-2" /> Share My Impact
                </DropdownMenuItem>
                {myTeam && (
                  <>
                    <DropdownMenuItem onClick={() => navigate('/team')} className="cursor-pointer focus:bg-white/10 focus:text-white">
                      <Users className="w-3.5 h-3.5 mr-2" /> My Team
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePrintTeamPdf} className="cursor-pointer focus:bg-white/10 focus:text-white">
                      <Printer className="w-3.5 h-3.5 mr-2" /> Team Print
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/trade')} className="cursor-pointer focus:bg-white/10 focus:text-white">
                      <Users className="w-3.5 h-3.5 mr-2" /> Trade
                      {pendingTradeCount > 0 && (
                        <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                          {pendingTradeCount}
                        </span>
                      )}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onClick={handlePrintPdf} disabled={!card} className="cursor-pointer focus:bg-white/10 focus:text-white">
                  <Printer className="w-3.5 h-3.5 mr-2" /> Print Card
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate('/admin')} className="cursor-pointer focus:bg-white/10 focus:text-white">
                    <Shield className="w-3.5 h-3.5 mr-2" /> Admin Panel
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer focus:bg-white/10 focus:text-white">
                  <LogOut className="w-3.5 h-3.5 mr-2" /> Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

        {/* Quick Tap v2 */}
        {user && (
          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 mb-4">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="font-bold text-white/80 text-[11px] sm:text-xs uppercase tracking-wider">Quick Kindness — tap when you do it</h3>
              <button onClick={handleOpenPicker} className="text-[10px] sm:text-xs text-indigo-300 hover:text-white transition-colors">Customize</button>
            </div>
            {quickTapDeeds.length === 0 ? (
              <button onClick={handleOpenPicker} className="w-full py-3 text-sm text-indigo-300 hover:text-white border border-dashed border-white/20 rounded-lg transition-colors">
                Tap to choose your Quick Tap deeds
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {quickTapDeeds.map(deed => (
                  <button
                    key={deed.id}
                    onClick={() => handleQuickTapTap(deed)}
                    disabled={quickTapTapping === deed.id}
                    className="w-full flex flex-col items-center gap-0.5 sm:gap-1.5 bg-white/10 hover:bg-emerald-500/20 active:scale-95 border border-white/20 hover:border-emerald-400/50 rounded-xl sm:rounded-2xl px-2.5 py-1.5 sm:px-5 sm:py-3 transition-all duration-150 disabled:opacity-50"
                  >
                    <span className="text-[10px] sm:text-xs font-semibold text-white/80 text-center leading-tight line-clamp-2">{deed.quick_tap_label}</span>
                    {(quickTapCounts[deed.id] ?? 0) > 0 && (
                      <span className="text-[9px] sm:text-[10px] text-emerald-400 font-bold">+{quickTapCounts[deed.id]} today</span>
                    )}
                  </button>
                ))}
                {/* Admin spotlight quick tap — 4th slot, visually distinct from the player's own 3 */}
                {spotlightQuickTap && (
                  <button
                    onClick={() => handleQuickTapTap(spotlightQuickTap)}
                    disabled={quickTapTapping === spotlightQuickTap.id}
                    className="relative w-full flex flex-col items-center gap-0.5 sm:gap-1.5 bg-gradient-to-b from-amber-500/25 to-amber-600/10 hover:from-amber-400/35 hover:to-amber-500/15 active:scale-95 border border-amber-400/60 hover:border-amber-300 rounded-xl sm:rounded-2xl px-2.5 py-1.5 sm:px-5 sm:py-3 transition-all duration-150 disabled:opacity-50 shadow-[0_0_12px_-2px_rgba(251,191,36,0.35)]"
                  >
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-400 text-slate-900 text-[8px] sm:text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-full">
                      Gr8Day
                    </span>
                    <span className="text-[10px] sm:text-xs font-semibold text-amber-100 text-center leading-tight line-clamp-2 mt-1">
                      {spotlightQuickTap.quick_tap_label}
                    </span>
                    {(quickTapCounts[spotlightQuickTap.id] ?? 0) > 0 && (
                      <span className="text-[9px] sm:text-[10px] text-amber-300 font-bold">+{quickTapCounts[spotlightQuickTap.id]} today</span>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Quick Tap picker modal */}
        {showQuickTapPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-slate-700">
                <div>
                  <h2 className="font-bold text-white">Customize Quick Tap</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Choose 1–3 deeds to show as your quick buttons</p>
                </div>
                <button onClick={() => setShowQuickTapPicker(false)} className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-2">
                {eligibleDeeds.map((deed) => {
                  const checked = pickerSelection.has(deed.id);
                  const disabled = !checked && pickerSelection.size >= 3;
                  return (
                    <label key={deed.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checked ? 'bg-emerald-900/30 border-emerald-500/50' : 'border-slate-700 hover:border-slate-500'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => {
                          setPickerSelection(prev => {
                            const next = new Set(prev);
                            if (next.has(deed.id)) next.delete(deed.id); else next.add(deed.id);
                            return next;
                          });
                        }}
                        className="mt-0.5 accent-emerald-500"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{deed.deed_text}</p>
                        {deed.deed_text_long && <p className="text-xs text-slate-400 mt-0.5">{deed.deed_text_long}</p>}
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
                <button onClick={() => setShowQuickTapPicker(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button onClick={handlePickerSave} disabled={pickerSaving || pickerSelection.size === 0} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg disabled:opacity-50 transition-colors">
                  {pickerSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
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

        {/* ========== BINGO STRIP — celebratory, compact, does not block or
            crowd out continued play. A player who wins keeps playing the
            same card all the way to end of week: more completed deeds keep
            earning votes, and every additional line completed earns its own
            6-20 bonus roll. Start Over (reset) is an optional voluntary
            action, not required — kept as a small text link, not a CTA. ==== */}
        {card?.is_bingo && (
          <div className="mb-4 rounded-lg bg-amber-400 px-3 py-2 flex items-center gap-2 shadow-md">
            <Trophy className="w-4 h-4 text-slate-900 flex-shrink-0" />
            <p className="text-xs sm:text-sm font-bold text-slate-900 flex-1 min-w-0 truncate">
              Bingo! Keep playing for more entries.
              {typeof card?.draw_bonus_entries === 'number' && (
                <span> 🎟 +{card.draw_bonus_entries} this move!</span>
              )}
            </p>
            <button
              onClick={handleStartNewGame}
              disabled={actionLoading}
              className="text-[11px] font-bold text-slate-900 underline underline-offset-2 hover:text-slate-700 flex-shrink-0 disabled:opacity-50 p-2 -m-2"
            >
              Start Over
            </button>
          </div>
        )}

        {/* ========== PICK THREE (classic only — not available in Blackout) ========== */}
        {card && card.game_mode !== 'blackout' && (
          <div className="mb-4">
            {pickThreeMode ? (
              <div className="rounded-xl border-2 border-purple-400/60 bg-purple-500/10 backdrop-blur-sm p-3 flex flex-col sm:flex-row items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-purple-200">Pick Three: tap 3 unplayed squares to swap</p>
                  <p className="text-xs text-purple-300">{pickThreeSelection.size} / 3 selected</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={handleCancelPickThree} disabled={pickThreeLoading}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleConfirmPickThree}
                    disabled={pickThreeLoading || pickThreeSelection.size !== 3}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {pickThreeLoading ? 'Swapping…' : 'Confirm Swap'}
                  </Button>
                </div>
              </div>
            ) : (
              !card.pick_three_used && (
                <Button
                  variant="outline"
                  onClick={handleStartPickThree}
                  className="w-full sm:w-auto border-purple-400/60 text-purple-200 hover:bg-purple-500/10"
                >
                  <Shuffle className="w-4 h-4 mr-2" /> Pick Three — Swap 3 Squares
                </Button>
              )
            )}
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
                  {card.game_mode === 'blackout' ? (
                    card.cells.map((cell) => {
                      const isCompleted = card.completed_cells.includes(cell.index);
                      const isBlocked = card.blackout?.blocked_cells.includes(cell.index) ?? false;
                      const isOpen = card.blackout?.active_group?.includes(cell.index) ?? false;
                      const canReveal = !card.blackout?.is_paused && !card.blackout?.active_group;
                      return (
                        <div key={cell.index} className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
                          <div className="absolute inset-0">
                            <BlackoutTile
                              cell={cell}
                              isCompleted={isCompleted}
                              isBlocked={isBlocked}
                              isOpen={isOpen}
                              canReveal={canReveal}
                              revealing={blackoutRevealing}
                              passing={blackoutPassingCell === cell.index}
                              onReveal={() => handleBlackoutReveal(cell.index)}
                              onComplete={() => handleMark(cell.index)}
                              onPass={() => handleBlackoutPass(cell.index)}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    card.cells.map((cell) => (
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
                            prizeImageUrl={prize?.prize_image_url}
                            progress={cellProgress[cell.index] ?? 0}
                            onProgressChange={(idx, p) =>
                              setCellProgress((prev) => ({ ...prev, [idx]: p }))
                            }
                            onUnmark={handleUnmark}
                            onDare={handleDareYaReveal}
                            dareUsed={card.cells.find(c => c.index === 12)?.dare_ya_revealed === true}
                            winCondition={card.win_condition}
                            pickThreeMode={pickThreeMode}
                            pickThreeEligible={isPickThreeEligible(cell.index)}
                            pickThreeSelected={pickThreeSelection.has(cell.index)}
                            onTogglePickThree={handleTogglePickThree}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Blackout: Pause only shows between groups (no timer runs mid-group,
                so there's nothing meaningful to "pause" while one is open —
                Pass, rendered inline on each open square, is the only way out
                of an active group). */}
            {card.game_mode === 'blackout' && (
              <div className="mt-3 flex justify-center">
                {card.blackout?.is_paused ? (
                  <Button
                    onClick={handleBlackoutResume}
                    disabled={blackoutPausing}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  >
                    {blackoutPausing ? 'Resuming…' : '▶ Resume'}
                  </Button>
                ) : !card.blackout?.active_group ? (
                  <Button
                    variant="outline"
                    onClick={handleBlackoutPause}
                    disabled={blackoutPausing}
                    className="border-white/20 text-white/70 hover:text-white hover:bg-white/10"
                  >
                    {blackoutPausing ? 'Pausing…' : '⏸ Pause'}
                  </Button>
                ) : (
                  <p className="text-xs text-amber-300/80 text-center">Resolve every open square (complete or pass) to reveal again.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Daily Streak */}
        {user && streak && (
          <div className="mb-4">
            <StreakDisplay streak={streak} />
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
            Invite a friend by email. When they sign up and verify their email, you both get a Gr8Day Bucks bonus in your wallet.
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
              disabled={actionLoading || !referralEmail.trim()}
              className="bg-teal-500 hover:bg-teal-600 text-white font-bold"
            >
              <Send className="w-4 h-4 mr-1" />
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
      {dareYaResult && (
        <DareModal
          result={dareYaResult}
          onClose={() => setDareYaResult(null)}
          onSubmitReferralEmail={handleDareYaReferFriend}
        />
      )}
      {showEditProfile && (
        <EditProfileModal
          onClose={() => setShowEditProfile(false)}
          onDeleted={() => { logout(); navigate('/'); }}
        />
      )}
      {streakMilestones.length > 0 && (
        <StreakMilestoneModal
          milestones={streakMilestones}
          onClose={() => setStreakMilestones([])}
        />
      )}
      {showImpactPicker && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setShowImpactPicker(false)}
        >
          <div
            className="bg-indigo-950 rounded-2xl shadow-2xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-white">Share My Impact</h2>
              <button onClick={() => setShowImpactPicker(false)} className="text-white/50 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1 mb-4">
              {(['week', 'month', 'quarter', 'year', 'all'] as ImpactStatsPeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => loadImpactStats(p)}
                  className={`text-[10px] sm:text-xs font-bold py-2 rounded-lg transition-colors ${
                    impactPeriod === p ? 'bg-emerald-500 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {IMPACT_PERIOD_LABELS[p].replace('This ', '')}
                </button>
              ))}
            </div>

            {impactStatsLoading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-400 border-t-transparent" />
              </div>
            ) : impactStats && impactStats.total > 0 ? (
              <div className="space-y-2 mb-4">
                <button
                  onClick={() => setSelectedFeaturedDeed(null)}
                  className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                    selectedFeaturedDeed === null ? 'border-emerald-400 bg-emerald-500/15' : 'border-white/10 bg-white/5 hover:border-white/30'
                  }`}
                >
                  <p className="font-bold text-white text-sm">Total — {impactStats.total} Gr8Day Deed{impactStats.total === 1 ? '' : 's'}</p>
                  <p className="text-xs text-indigo-200/60 mt-0.5">{IMPACT_PERIOD_LABELS[impactPeriod]}</p>
                </button>

                {impactStats.top_deeds.length > 0 && (
                  <>
                    <p className="text-[11px] uppercase tracking-wider text-indigo-300/50 font-bold pt-1">Or feature one deed</p>
                    {impactStats.top_deeds.map((d) => (
                      <button
                        key={d.deed_text}
                        onClick={() => setSelectedFeaturedDeed(d.deed_text)}
                        className={`w-full text-left rounded-xl border-2 p-3 transition-all ${
                          selectedFeaturedDeed === d.deed_text ? 'border-amber-400 bg-amber-500/15' : 'border-white/10 bg-white/5 hover:border-white/30'
                        }`}
                      >
                        <p className="font-bold text-white text-sm">{d.deed_text}</p>
                        <p className="text-xs text-indigo-200/60 mt-0.5">{d.count} time{d.count === 1 ? '' : 's'}</p>
                      </button>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-indigo-200/50 text-center py-8">No Gr8Day Deeds in this period yet — try a longer time frame.</p>
            )}

            <Button
              onClick={handleGenerateImpactCard}
              disabled={!impactStats || impactStats.total === 0 || shareLoading || impactStatsLoading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold"
            >
              {shareLoading ? 'Creating…' : 'Generate & Share'}
            </Button>
          </div>
        </div>
      )}
      <Footer tone="dark" />
    </div>
  );
};

export default GameBoard;
