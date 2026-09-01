import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, X, Flame } from 'lucide-react';
import { toast } from 'sonner';
import BingoCell from '@/components/BingoCell';
import {
  AdminPlayerCardResult,
  AdminPlayerMatch,
  adminGetPlayerCard,
  adminSearchPlayersByLastName,
  AdminCompletedDeed,
  adminGetCompletedDeeds,
  adminReverseDeed,
  adminDrawAdjust,
  CellData,
} from '@/lib/game-utils';

interface CardViewerSectionProps {
  // Called after a deed reversal or draw-entry adjustment, since both
  // change data the Draw Leaderboard section (owned separately) shows.
  onDrawEntriesChanged: () => void;
}

const CardViewerSection: React.FC<CardViewerSectionProps> = ({ onDrawEntriesChanged }) => {
  const [cardViewerPN, setCardViewerPN] = useState('');
  const [cardViewerLastName, setCardViewerLastName] = useState('');
  const [cardViewerResult, setCardViewerResult] = useState<AdminPlayerCardResult | null>(null);
  const [cardViewerMatches, setCardViewerMatches] = useState<AdminPlayerMatch[]>([]);
  const [cardViewerLoading, setCardViewerLoading] = useState(false);

  const [completedDeeds, setCompletedDeeds] = useState<AdminCompletedDeed[]>([]);
  const [completedDeedsLoading, setCompletedDeedsLoading] = useState(false);
  const [reversingDeedId, setReversingDeedId] = useState<number | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  const handleCardViewerLookup = async () => {
    const pn = parseInt(cardViewerPN.trim());
    if (isNaN(pn)) { toast.error('Enter a valid player number'); return; }
    setCardViewerLoading(true);
    setCardViewerResult(null);
    setCardViewerMatches([]);
    try {
      const result = await adminGetPlayerCard(pn);
      setCardViewerResult(result);
    } catch (err: any) {
      toast.error(err?.message || 'Player not found');
    } finally {
      setCardViewerLoading(false);
    }
  };

  const handleCardViewerLastNameSearch = async () => {
    const q = cardViewerLastName.trim();
    if (!q) { toast.error('Enter a last name to search'); return; }
    setCardViewerLoading(true);
    setCardViewerResult(null);
    setCardViewerMatches([]);
    try {
      const matches = await adminSearchPlayersByLastName(q);
      if (matches.length === 0) toast.info('No players found with that last name');
      setCardViewerMatches(matches);
    } catch (err: any) {
      toast.error(err?.message || 'Search failed');
    } finally {
      setCardViewerLoading(false);
    }
  };

  const handleCardViewerSelectMatch = async (pn: number) => {
    setCardViewerMatches([]);
    setCardViewerLoading(true);
    setCardViewerResult(null);
    try {
      const result = await adminGetPlayerCard(pn);
      setCardViewerResult(result);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load card');
    } finally {
      setCardViewerLoading(false);
    }
  };

  const loadCompletedDeeds = async (playerId: string) => {
    setCompletedDeedsLoading(true);
    try {
      const res = await adminGetCompletedDeeds(playerId);
      setCompletedDeeds(res.deeds || []);
    } catch {
      // silent
    } finally {
      setCompletedDeedsLoading(false);
    }
  };

  // Load this player's deed history whenever a new player card is viewed.
  useEffect(() => {
    if (cardViewerResult?.player.id) {
      loadCompletedDeeds(cardViewerResult.player.id);
    } else {
      setCompletedDeeds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardViewerResult?.player.id]);

  const handleReverseDeed = async (deedId: number) => {
    if (!confirm('Reverse this completed deed? This removes its draw entry (and the bingo bonus, if reversing it un-completes the card) and hides it from the Impact Board.')) return;
    setReversingDeedId(deedId);
    try {
      const res = await adminReverseDeed(deedId);
      toast.success(
        res.bingo_bonus_reversed
          ? 'Deed reversed — bingo bonus also reversed'
          : res.deed_entry_reversed
          ? 'Deed reversed'
          : 'Deed hidden (no draw entry existed to reverse)'
      );
      if (cardViewerResult?.player.id) await loadCompletedDeeds(cardViewerResult.player.id);
      onDrawEntriesChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reverse deed');
    } finally {
      setReversingDeedId(null);
    }
  };

  const handleDrawAdjust = async () => {
    if (!cardViewerResult?.player.id) return;
    const amount = parseInt(adjustAmount.trim());
    if (!Number.isFinite(amount) || amount === 0) { toast.error('Enter a non-zero whole number'); return; }
    if (!adjustReason.trim()) { toast.error('A reason is required'); return; }
    setAdjustLoading(true);
    try {
      await adminDrawAdjust(cardViewerResult.player.id, amount, adjustReason.trim());
      toast.success(`Draw entries ${amount > 0 ? 'added' : 'removed'}`);
      setAdjustAmount('');
      setAdjustReason('');
      onDrawEntriesChanged();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to adjust draw entries');
    } finally {
      setAdjustLoading(false);
    }
  };

  return (
    <section id="section-card-viewer">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-indigo-500" />
            View Player Card
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-500">Look up any player's current bingo card by player number or last name. Read-only view.</p>

          {/* Search by last name */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-600">Search by last name</p>
            <div className="flex gap-2">
              <Input
                placeholder="Last name (e.g. Smith)"
                value={cardViewerLastName}
                onChange={(e) => setCardViewerLastName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCardViewerLastNameSearch()}
                className="max-w-xs"
              />
              <Button
                onClick={handleCardViewerLastNameSearch}
                disabled={cardViewerLoading}
                variant="outline"
              >
                {cardViewerLoading ? 'Searching…' : <><Search className="w-4 h-4 mr-1" /> Search</>}
              </Button>
            </div>
          </div>

          {/* Last name matches */}
          {cardViewerMatches.length > 0 && (
            <div className="border rounded-lg overflow-hidden divide-y">
              {cardViewerMatches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleCardViewerSelectMatch(m.player_number)}
                  className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-medium text-slate-800 text-sm">{m.display_name}</span>
                    {m.email && <span className="text-xs text-slate-400 ml-2">{m.email}</span>}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">GR8-{m.player_number}</span>
                </button>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="flex-1 border-t" /><span>or</span><div className="flex-1 border-t" />
          </div>

          {/* Search by player number */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-600">Look up by player number</p>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Player number (e.g. 10001)"
                value={cardViewerPN}
                onChange={(e) => setCardViewerPN(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCardViewerLookup()}
                className="max-w-xs"
              />
              <Button
                onClick={handleCardViewerLookup}
                disabled={cardViewerLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {cardViewerLoading ? 'Loading…' : 'View Card'}
              </Button>
              {cardViewerResult && (
                <Button variant="ghost" onClick={() => { setCardViewerResult(null); setCardViewerMatches([]); }}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {cardViewerResult && (
            <div className="space-y-4">
              {/* Player summary */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex flex-wrap gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Player</p>
                  <p className="font-semibold text-slate-800">{cardViewerResult.player.display_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">GR8 Number</p>
                  <p className="font-mono font-semibold text-slate-800">GR8-{cardViewerResult.player.player_number}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="text-slate-700">{cardViewerResult.player.email ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 flex items-center gap-1"><Flame className="w-3 h-3 text-orange-400" /> Current Streak</p>
                  <p className="font-semibold text-orange-600">{cardViewerResult.player.current_streak_days} days</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Best Streak</p>
                  <p className="font-semibold text-indigo-600">{cardViewerResult.player.longest_streak_days} days</p>
                </div>
              </div>

              {/* Draw entry manual adjustment */}
              <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Adjust Draw Entries</p>
                <div className="flex flex-wrap gap-2 items-start">
                  <Input
                    type="number"
                    placeholder="Amount (+/-)"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    className="w-36 h-8 text-sm bg-white"
                  />
                  <Input
                    placeholder="Reason (required)"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="flex-1 min-w-[180px] h-8 text-sm bg-white"
                  />
                  <Button
                    size="sm"
                    onClick={handleDrawAdjust}
                    disabled={adjustLoading || !adjustAmount.trim() || !adjustReason.trim()}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    {adjustLoading ? 'Applying…' : 'Apply'}
                  </Button>
                </div>
                <p className="text-xs text-purple-600">Positive adds entries, negative removes them (floored at zero). Every adjustment is logged with the reason above.</p>
              </div>

              {/* Recent completed deeds — reverse-deed UI */}
              <div className="border rounded-lg overflow-hidden">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-3 pt-3 pb-1">Recent Completed Deeds</p>
                {completedDeedsLoading ? (
                  <div className="text-center py-6 text-slate-400 text-sm">Loading…</div>
                ) : completedDeeds.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm">No completed deeds yet.</div>
                ) : (
                  <div className="max-h-[280px] overflow-y-auto divide-y">
                    {completedDeeds.map((d) => (
                      <div key={d.id} className={`px-3 py-2 text-sm flex items-center justify-between gap-3 ${d.reversed ? 'opacity-50' : ''}`}>
                        <div className="min-w-0">
                          <p className="text-slate-800 truncate">{d.deed_text}</p>
                          <p className="text-xs text-slate-400">
                            {d.source_type === 'quick_action' ? 'Quick Tap' : 'Bingo card'}
                            {d.category ? ` · ${d.category}` : ''} · {new Date(d.completed_at).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={d.reversed || reversingDeedId === d.id}
                          onClick={() => handleReverseDeed(d.id)}
                          className="flex-shrink-0 text-rose-600 hover:text-rose-700"
                        >
                          {d.reversed ? 'Reversed' : reversingDeedId === d.id ? 'Reversing…' : 'Reverse'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cardViewerResult.card === null ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  This player has no card yet.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Card started: <strong className="text-slate-700">
                        {cardViewerResult.card.created_at ? new Date(cardViewerResult.card.created_at).toLocaleDateString() : cardViewerResult.card.week_year}
                      </strong>
                    </span>
                    <span>
                      Completed: <strong className="text-slate-700">{cardViewerResult.card.completed_cells.length + cardViewerResult.card.purchased_cells.length}</strong> squares
                      {cardViewerResult.card.is_bingo && <span className="ml-2 text-emerald-600 font-bold">🎉 BINGO!</span>}
                    </span>
                  </div>

                  {/* Bingo grid — locked/read-only */}
                  <div className="bg-indigo-950 rounded-xl p-3">
                    {/* Column headers */}
                    <div className="grid grid-cols-5 gap-1 mb-1">
                      {['GR', '8', 'D', 'A', 'Y'].map((l, i) => (
                        <div key={i} className="text-center text-xs font-black text-white/60 py-1">{l}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {cardViewerResult.card.cells.map((cell: CellData) => (
                        <BingoCell
                          key={cell.index}
                          cell={cell}
                          completedCells={cardViewerResult.card!.completed_cells}
                          purchasedCells={cardViewerResult.card!.purchased_cells}
                          referralCells={cardViewerResult.card!.referral_cells}
                          onMark={() => {}}
                          onUnmark={() => {}}
                          onPurchase={() => {}}
                          locked={true}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500 pt-1">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Completed deed</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Purchased square</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-400 inline-block" /> Referral free</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border inline-block" /> Uncompleted</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default CardViewerSection;
