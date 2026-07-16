import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  TradeOffer,
  MyTeamData,
  CardData,
  getMyTrades,
  createTrade,
  acceptTrade,
  rejectOrCancelTrade,
  getMyTeam,
  generateCard,
} from '@/lib/game-utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Heart, Users, ArrowLeftRight, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

function displayName(u: { first_name: string | null; last_name: string | null; player_number: number | null } | undefined): string {
  if (!u) return 'Unknown';
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
  return name || (u.player_number ? `GR8-${u.player_number}` : 'Unknown');
}

function formatExpiry(createdAt: string): string {
  const expires = new Date(new Date(createdAt).getTime() + 48 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = expires.getTime() - now.getTime();
  if (diffMs <= 0) return 'Expired';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${mins}m remaining`;
}

// A still-hidden Blackout square's deed_text is nulled out even for its own
// owner (that's the fog-of-war) — trading it away is a blind pick.
function deedLabel(cell: { is_free_space: boolean; is_hidden?: boolean; deed_text: string }): string {
  if (cell.is_free_space) return 'Free Space';
  if (cell.is_hidden) return 'Mystery square (not yet revealed)';
  return cell.deed_text;
}

// A simplified mini-card view showing all 25 cells, with selectable/greyed-out logic
interface MiniCardProps {
  card: CardData;
  selectableCellIndexes: Set<number>;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

const MiniCard: React.FC<MiniCardProps> = ({ card, selectableCellIndexes, selectedIndex, onSelect }) => {
  const allCompleted = new Set([
    ...card.completed_cells,
    ...card.purchased_cells,
    ...card.referral_cells,
  ]);

  return (
    <div className="grid grid-cols-5 gap-1">
      {card.cells.map((cell) => {
        const isSelectable = selectableCellIndexes.has(cell.index);
        const isSelected = selectedIndex === cell.index;
        const isDone = allCompleted.has(cell.index) || cell.is_free_space;

        return (
          <button
            key={cell.index}
            onClick={() => isSelectable && onSelect(cell.index)}
            disabled={!isSelectable}
            className={[
              'rounded p-1 text-center text-xs leading-tight min-h-[52px] flex items-center justify-center transition-all',
              isDone
                ? 'bg-white/5 text-white/25 cursor-not-allowed'
                : isSelected
                  ? 'bg-indigo-500 text-white ring-2 ring-indigo-300 cursor-pointer'
                  : isSelectable
                    ? 'bg-white/10 text-white hover:bg-indigo-500/40 cursor-pointer'
                    : 'bg-white/5 text-white/30 cursor-not-allowed',
            ].join(' ')}
          >
            {cell.is_free_space ? '★' : cell.is_hidden ? '?' : cell.deed_text}
          </button>
        );
      })}
    </div>
  );
};

// Flat list of a teammate's tradeable squares — deliberately no grid, no row/
// column shown, so proposing a trade doesn't hand back a map of their card.
interface TeammateCellListProps {
  card: CardData;
  selectableCellIndexes: Set<number>;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

const TeammateCellList: React.FC<TeammateCellListProps> = ({ card, selectableCellIndexes, selectedIndex, onSelect }) => {
  const options = card.cells
    .filter((c) => selectableCellIndexes.has(c.index))
    .sort((a, b) => a.deed_text.localeCompare(b.deed_text));

  if (options.length === 0) {
    return <p className="text-white/40 text-sm text-center py-6">No tradeable squares on their card right now.</p>;
  }

  return (
    <div className="space-y-2">
      {options.map((cell) => {
        const isSelected = selectedIndex === cell.index;
        return (
          <button
            key={cell.index}
            onClick={() => onSelect(cell.index)}
            className={[
              'w-full text-left rounded-xl px-4 py-3 border transition-all text-sm',
              isSelected
                ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10',
            ].join(' ')}
          >
            {cell.deed_text}
          </button>
        );
      })}
    </div>
  );
};

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TradeOffer['status'] }) {
  const styles: Record<TradeOffer['status'], string> = {
    pending: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    accepted: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
    cancelled: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    expired: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Trade card ────────────────────────────────────────────────────────────────

interface TradeCardProps {
  trade: TradeOffer;
  currentUserId: string;
  onAccept: (id: number) => void;
  onRejectCancel: (id: number) => void;
  actionLoading: boolean;
}

const TradeCard: React.FC<TradeCardProps> = ({ trade, currentUserId, onAccept, onRejectCancel, actionLoading }) => {
  const isIncoming = trade.to_user_id === currentUserId;
  const fromName = displayName(trade.from_user);
  const toName = displayName(trade.to_user);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/50">{isIncoming ? 'Incoming offer' : 'Your offer'}</span>
        <StatusBadge status={trade.status} />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 bg-white/5 rounded-lg p-3 text-center">
          <div className="text-xs text-white/50 mb-1">{fromName} gives</div>
          <div className="text-sm text-white font-medium">{trade.from_deed_text}</div>
        </div>
        <ArrowLeftRight className="w-4 h-4 text-white/30 flex-shrink-0" />
        <div className="flex-1 bg-white/5 rounded-lg p-3 text-center">
          <div className="text-xs text-white/50 mb-1">{toName} gives</div>
          <div className="text-sm text-white font-medium">{trade.to_deed_text}</div>
        </div>
      </div>

      {trade.status === 'pending' && (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Clock className="w-3.5 h-3.5" />
          {formatExpiry(trade.created_at)}
        </div>
      )}

      {trade.status === 'pending' && (
        <div className="flex gap-2">
          {isIncoming && (
            <Button
              size="sm"
              disabled={actionLoading}
              onClick={() => onAccept(trade.id)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white flex-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Accept
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={actionLoading}
            onClick={() => onRejectCancel(trade.id)}
            className="border-white/20 bg-white/5 text-white hover:bg-red-500/20 hover:border-red-500/40 flex-1"
          >
            <XCircle className="w-3.5 h-3.5 mr-1" />
            {isIncoming ? 'Decline' : 'Cancel'}
          </Button>
        </div>
      )}
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

type Step = 'list' | 'pick-my-cell' | 'pick-teammate' | 'pick-their-cell' | 'confirm';

const TradeSquares: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [trades, setTrades] = useState<TradeOffer[]>([]);
  const [teamData, setTeamData] = useState<MyTeamData | null>(null);
  const [myCard, setMyCard] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // New-trade wizard state
  const [step, setStep] = useState<Step>('list');
  const [selectedMyCell, setSelectedMyCell] = useState<number | null>(null);
  const [selectedTeammate, setSelectedTeammate] = useState<string | null>(null);
  const [selectedTheirCell, setSelectedTheirCell] = useState<number | null>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { state: { from: '/trade' } });
  }, [authLoading, user, navigate]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [tradesRes, teamRes, cardRes] = await Promise.all([
        getMyTrades(),
        getMyTeam(),
        generateCard(),
      ]);
      setTrades(tradesRes.trades);
      setTeamData(teamRes.team);
      setMyCard(cardRes);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const currentUserId = (user as any)?.sub ?? (user as any)?.id ?? '';

  const hasActiveOutgoing = trades.some(
    (t) => t.from_user_id === currentUserId && t.status === 'pending'
  );
  const hasCompletedThisWeek = trades.some(
    (t) =>
      t.status === 'accepted' &&
      (t.from_user_id === currentUserId || t.to_user_id === currentUserId)
  );
  const canInitiateTrade = !hasActiveOutgoing && !hasCompletedThisWeek && !!teamData;

  const pendingIncoming = trades.filter(
    (t) => t.to_user_id === currentUserId && t.status === 'pending'
  );
  const outgoing = trades.filter((t) => t.from_user_id === currentUserId);
  const historical = trades.filter(
    (t) => t.status !== 'pending'
  );

  // Selectable cells for my card. Blackout: hidden squares stay selectable
  // (blind — I don't know what's under them either), only a blocked
  // (passed-on) square is excluded, same as completed/purchased/referral.
  const mySelectableCells = myCard
    ? new Set(
        myCard.cells
          .filter((c) => {
            if (c.is_free_space) return false;
            if (myCard.purchased_cells.includes(c.index)) return false;
            if (myCard.referral_cells.includes(c.index)) return false;
            if (myCard.completed_cells.includes(c.index)) return false;
            if (myCard.game_mode === 'blackout' && myCard.blackout?.blocked_cells.includes(c.index)) return false;
            return true;
          })
          .map((c) => c.index)
      )
    : new Set<number>();

  // Teammate's card
  const teammateData = teamData?.members.find((m) => m.user_id === selectedTeammate);
  const theirCard = teammateData?.card ?? null;
  const theirSelectableCells = theirCard
    ? new Set(
        theirCard.cells
          .filter((c) => {
            if (c.is_free_space) return false;
            if (theirCard.purchased_cells.includes(c.index)) return false;
            if (theirCard.referral_cells.includes(c.index)) return false;
            if (theirCard.completed_cells.includes(c.index)) return false;
            if (theirCard.game_mode === 'blackout' && theirCard.blackout?.blocked_cells.includes(c.index)) return false;
            return true;
          })
          .map((c) => c.index)
      )
    : new Set<number>();

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleAccept = async (id: number) => {
    setActionLoading(true);
    try {
      await acceptTrade(id);
      toast.success('Trade accepted! Your square has been swapped.');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to accept trade');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectCancel = async (id: number) => {
    setActionLoading(true);
    try {
      await rejectOrCancelTrade(id);
      toast.success('Trade updated.');
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update trade');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendOffer = async () => {
    if (!selectedTeammate || selectedMyCell === null || selectedTheirCell === null) return;
    setActionLoading(true);
    try {
      await createTrade({
        to_user_id: selectedTeammate,
        from_cell_index: selectedMyCell,
        to_cell_index: selectedTheirCell,
      });
      toast.success('Trade offer sent!');
      setStep('list');
      setSelectedMyCell(null);
      setSelectedTeammate(null);
      setSelectedTheirCell(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send trade offer');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const myCellText = myCard && selectedMyCell !== null
    ? deedLabel(myCard.cells.find((c) => c.index === selectedMyCell)!)
    : '';

  const theirCellText = theirCard && selectedTheirCell !== null
    ? deedLabel(theirCard.cells.find((c) => c.index === selectedTheirCell)!)
    : '';

  const teammates = teamData?.members.filter((m) => m.user_id !== currentUserId) ?? [];

  // ── Loading / no team ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-400 border-t-transparent" />
          <span className="text-indigo-300 font-medium animate-pulse">Loading trades...</span>
        </div>
      </div>
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => step !== 'list' ? setStep('list') : navigate('/game')}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-pink-400 fill-pink-400" />
            <span className="text-base font-bold text-white">Square Trades</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={loadData}
            disabled={loading || actionLoading}
            className="ml-auto text-white/50 hover:text-white hover:bg-white/10"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* No team message */}
        {!teamData && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/50 text-sm">You need to be on a team to trade squares.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/game')}
              className="mt-4 border-white/20 text-white hover:bg-white/10"
            >
              Back to Game
            </Button>
          </div>
        )}

        {teamData && (
          <>
            {/* ── STEP: List (default view) ──────────────────────────────── */}
            {step === 'list' && (
              <>
                {/* Limits banner */}
                {(hasActiveOutgoing || hasCompletedThisWeek) && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-300">
                    {hasCompletedThisWeek
                      ? 'You have already completed 1 trade this week. Trades reset next week.'
                      : 'You already have an active outgoing trade offer. Cancel it to send a new one.'}
                  </div>
                )}

                {/* Incoming offers */}
                {pendingIncoming.length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                      Incoming Offers ({pendingIncoming.length})
                    </h2>
                    <div className="space-y-3">
                      {pendingIncoming.map((t) => (
                        <TradeCard
                          key={t.id}
                          trade={t}
                          currentUserId={currentUserId}
                          onAccept={handleAccept}
                          onRejectCancel={handleRejectCancel}
                          actionLoading={actionLoading}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Outgoing offers */}
                {outgoing.filter((t) => t.status === 'pending').length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                      Your Outgoing Offer
                    </h2>
                    <div className="space-y-3">
                      {outgoing
                        .filter((t) => t.status === 'pending')
                        .map((t) => (
                          <TradeCard
                            key={t.id}
                            trade={t}
                            currentUserId={currentUserId}
                            onAccept={handleAccept}
                            onRejectCancel={handleRejectCancel}
                            actionLoading={actionLoading}
                          />
                        ))}
                    </div>
                  </section>
                )}

                {/* New trade button */}
                {canInitiateTrade && (
                  <Button
                    onClick={() => setStep('pick-my-cell')}
                    className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3"
                  >
                    <ArrowLeftRight className="w-4 h-4 mr-2" />
                    Propose a New Trade
                  </Button>
                )}

                {/* History */}
                {historical.length > 0 && (
                  <section>
                    <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                      Trade History
                    </h2>
                    <div className="space-y-3">
                      {historical.map((t) => (
                        <TradeCard
                          key={t.id}
                          trade={t}
                          currentUserId={currentUserId}
                          onAccept={handleAccept}
                          onRejectCancel={handleRejectCancel}
                          actionLoading={actionLoading}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {trades.length === 0 && (
                  <div className="text-center py-10">
                    <ArrowLeftRight className="w-10 h-10 text-white/15 mx-auto mb-3" />
                    <p className="text-white/40 text-sm">No trades this week yet.</p>
                    {canInitiateTrade && (
                      <p className="text-white/30 text-xs mt-1">Tap "Propose a New Trade" to swap a square with a teammate.</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── STEP: Pick my cell ─────────────────────────────────────── */}
            {step === 'pick-my-cell' && myCard && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-indigo-500/20 text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-full">Step 1 of 4</div>
                  <h2 className="text-white font-semibold">Choose your square to trade away</h2>
                </div>
                <p className="text-white/40 text-xs mb-4">
                  Tap an uncompleted, non-purchased, non-referral square.
                  {myCard.game_mode === 'blackout' && ' A "?" is a square you haven\'t revealed yet — trading it away is a blind pick.'}
                </p>
                <MiniCard
                  card={myCard}
                  selectableCellIndexes={mySelectableCells}
                  selectedIndex={selectedMyCell}
                  onSelect={setSelectedMyCell}
                />
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setStep('list'); setSelectedMyCell(null); }}
                    className="flex-1 border-white/20 text-white hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={selectedMyCell === null}
                    onClick={() => setStep('pick-teammate')}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white"
                  >
                    Next: Choose Teammate →
                  </Button>
                </div>
                {selectedMyCell !== null && (
                  <div className="mt-3 text-xs text-indigo-300 text-center">
                    Selected: <span className="font-semibold">{myCellText}</span>
                  </div>
                )}
              </section>
            )}

            {/* ── STEP: Pick teammate ────────────────────────────────────── */}
            {step === 'pick-teammate' && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-indigo-500/20 text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-full">Step 2 of 4</div>
                  <h2 className="text-white font-semibold">Choose a teammate</h2>
                </div>
                <div className="space-y-2">
                  {teammates.length === 0 && (
                    <p className="text-white/40 text-sm">No other teammates found.</p>
                  )}
                  {teammates.map((m) => (
                    <button
                      key={m.user_id}
                      onClick={() => { setSelectedTeammate(m.user_id); setSelectedTheirCell(null); }}
                      className={[
                        'w-full text-left rounded-xl px-4 py-3 border transition-all',
                        selectedTeammate === m.user_id
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-white'
                          : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10',
                      ].join(' ')}
                    >
                      <div className="font-medium">
                        {[m.first_name, m.last_name].filter(Boolean).join(' ') || m.username || 'Player'}
                      </div>
                      {m.player_number && (
                        <div className="text-xs text-white/40">GR8-{m.player_number}</div>
                      )}
                      {!m.card && (
                        <div className="text-xs text-amber-400 mt-0.5">No card this week</div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep('pick-my-cell')}
                    className="flex-1 border-white/20 text-white hover:bg-white/10"
                  >
                    ← Back
                  </Button>
                  <Button
                    disabled={!selectedTeammate || !teammateData?.card}
                    onClick={() => setStep('pick-their-cell')}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white"
                  >
                    Next: Their Card →
                  </Button>
                </div>
              </section>
            )}

            {/* ── STEP: Pick their cell ──────────────────────────────────── */}
            {step === 'pick-their-cell' && theirCard && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-indigo-500/20 text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-full">Step 3 of 4</div>
                  <h2 className="text-white font-semibold">
                    Choose a square from {displayName(teammateData ? { first_name: teammateData.first_name, last_name: teammateData.last_name, player_number: teammateData.player_number } : undefined)}'s card
                  </h2>
                </div>
                <p className="text-white/40 text-xs mb-4">Completed, purchased, referral, free, and blocked squares aren't listed — they can't be traded.</p>
                <TeammateCellList
                  card={theirCard}
                  selectableCellIndexes={theirSelectableCells}
                  selectedIndex={selectedTheirCell}
                  onSelect={setSelectedTheirCell}
                />
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep('pick-teammate')}
                    className="flex-1 border-white/20 text-white hover:bg-white/10"
                  >
                    ← Back
                  </Button>
                  <Button
                    disabled={selectedTheirCell === null}
                    onClick={() => setStep('confirm')}
                    className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white"
                  >
                    Next: Review →
                  </Button>
                </div>
                {selectedTheirCell !== null && (
                  <div className="mt-3 text-xs text-indigo-300 text-center">
                    Selected: <span className="font-semibold">{theirCellText}</span>
                  </div>
                )}
              </section>
            )}

            {/* ── STEP: Confirm ──────────────────────────────────────────── */}
            {step === 'confirm' && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="bg-indigo-500/20 text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-full">Step 4 of 4</div>
                  <h2 className="text-white font-semibold">Confirm your trade offer</h2>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 bg-white/5 rounded-lg p-3 text-center">
                      <div className="text-xs text-white/50 mb-1">You give</div>
                      <div className="text-sm text-white font-semibold">{myCellText}</div>
                    </div>
                    <ArrowLeftRight className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                    <div className="flex-1 bg-white/5 rounded-lg p-3 text-center">
                      <div className="text-xs text-white/50 mb-1">You receive</div>
                      <div className="text-sm text-white font-semibold">{theirCellText}</div>
                    </div>
                  </div>
                  <div className="text-xs text-white/40 text-center">
                    Trading with: <span className="text-white/70">{displayName(teammateData ? { first_name: teammateData.first_name, last_name: teammateData.last_name, player_number: teammateData.player_number } : undefined)}</span>
                  </div>
                  <div className="text-xs text-amber-300/70 text-center">
                    The offer expires in 48 hours. The swap only happens if they accept, and both squares must still be uncompleted at that time.
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep('pick-their-cell')}
                    className="flex-1 border-white/20 text-white hover:bg-white/10"
                    disabled={actionLoading}
                  >
                    ← Back
                  </Button>
                  <Button
                    onClick={handleSendOffer}
                    disabled={actionLoading}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                  >
                    {actionLoading ? 'Sending...' : 'Send Trade Offer'}
                  </Button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TradeSquares;
