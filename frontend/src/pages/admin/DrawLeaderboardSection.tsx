import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Ticket } from 'lucide-react';
import { DrawLeaderboardPlayer, getAdminDrawLeaderboard } from '@/lib/game-utils';

interface DrawLeaderboardSectionProps {
  // Bump this (e.g. via a counter) to force a reload — used by the Card
  // Viewer section after it reverses a deed or adjusts a player's draw
  // entries, since those change this section's data from elsewhere.
  refreshKey?: number;
}

const DrawLeaderboardSection: React.FC<DrawLeaderboardSectionProps> = ({ refreshKey }) => {
  const [drawLeaderboard, setDrawLeaderboard] = useState<DrawLeaderboardPlayer[]>([]);
  const [drawLeaderboardWeek, setDrawLeaderboardWeek] = useState<string>('');
  const [drawLeaderboardLoading, setDrawLeaderboardLoading] = useState(false);

  const loadDrawLeaderboard = async () => {
    setDrawLeaderboardLoading(true);
    try {
      const res = await getAdminDrawLeaderboard();
      setDrawLeaderboard(res.players || []);
      setDrawLeaderboardWeek(res.week_year);
    } catch {
      // silent
    } finally {
      setDrawLeaderboardLoading(false);
    }
  };

  useEffect(() => {
    loadDrawLeaderboard();
  }, [refreshKey]);

  return (
    <section id="section-draw-leaderboard">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-purple-500" />
            Draw Entry Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 mb-3">
            Per-player draw-entry balances for week {drawLeaderboardWeek || '—'}. Active entries are what's actually weighted in the draw; lifetime is a running total that never decreases.
          </p>
          {drawLeaderboardLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">Loading…</div>
          ) : drawLeaderboard.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm flex flex-col items-center gap-2">
              <Ticket className="w-8 h-8 text-slate-300" />
              No players have earned draw entries yet.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[420px] overflow-y-auto divide-y">
                {drawLeaderboard.map((p) => (
                  <div key={p.user_id} className="px-3 py-2.5 text-sm flex items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{p.player_name}</p>
                      <p className="text-xs text-slate-400">
                        {p.this_week_entries} this week · {p.lifetime_entries} lifetime
                        {p.last_draw_win ? ` · last won ${new Date(p.last_draw_win).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${p.current_week_eligible ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {p.current_week_eligible ? 'Eligible' : 'Not eligible'}
                      </span>
                      <span className="text-sm font-bold text-purple-600 w-14 text-right">{p.active_entries}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default DrawLeaderboardSection;
