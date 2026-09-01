import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Ticket } from 'lucide-react';
import { DrawWinner, getAdminDrawResults } from '@/lib/game-utils';

const DrawResultsSection: React.FC = () => {
  const [drawWinners, setDrawWinners] = useState<DrawWinner[]>([]);

  const loadDrawResults = async () => {
    try {
      const res = await getAdminDrawResults();
      setDrawWinners(res.winners || []);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    loadDrawResults();
  }, []);

  return (
    <section id="section-draw">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-purple-500" />
            Weekly Draw Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 mb-3">
            Every completed deed earns a weekly-draw entry, and a bingo earns a configurable bonus on top. The draw runs weekly.
          </p>
          {drawWinners.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm flex flex-col items-center gap-2">
              <Ticket className="w-8 h-8 text-slate-300" />
              No draw results yet.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[360px] overflow-y-auto divide-y">
                {drawWinners.map((w) => (
                  <div key={w.id} className="px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-slate-800">{w.name ?? 'Unknown'}</p>
                        {w.email && (
                          <p className="text-slate-500 text-xs">
                            <a href={`mailto:${w.email}`} className="text-indigo-600 hover:underline">{w.email}</a>
                          </p>
                        )}
                        <p className="text-xs text-slate-400">
                          {w.week_year} · won with {w.winning_active_entries ?? '?'} of {w.total_pool_entries ?? '?'} pool entries
                          {w.eligible_players != null ? ` (${w.eligible_players} eligible players)` : ''} · drawn {new Date(w.selected_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded ${w.odds_weight < 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {w.odds_weight < 0.5 ? 'Repeat winner' : 'Winner'}
                      </span>
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

export default DrawResultsSection;
