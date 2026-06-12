import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getMyPrizeHistory, PrizeHistoryEntry } from '@/lib/game-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Trophy, ArrowLeft, Loader2 } from 'lucide-react';

const HERO_BG = '#4FB3E8';

const WIN_LABELS: Record<string, string> = {
  one_line: 'One Line',
  two_lines: 'Two Lines',
  four_corners: 'Four Corners',
  x_pattern: 'X Pattern',
  around_the_edges: 'Around the Edges',
  fill_card: 'Full Card',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  contacted: 'bg-blue-100 text-blue-700',
  fulfilled: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

const PrizeHistory: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [history, setHistory] = useState<PrizeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { state: { from: '/prize-history' } });
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (user) {
      getMyPrizeHistory()
        .then(setHistory)
        .catch(() => {/* silent */})
        .finally(() => setLoading(false));
    }
  }, [user]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: HERO_BG }}>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/game')}
            className="flex items-center gap-1.5 text-white hover:text-yellow-300 transition-colors font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Game
          </button>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-white">
            <Heart className="w-5 h-5 fill-white" />
            <span className="font-black tracking-wide">Havagr8day!</span>
          </button>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Trophy className="w-5 h-5 text-yellow-500" />
              My Prize History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <Trophy className="w-12 h-12 text-slate-200 mx-auto" />
                <p className="text-slate-500 font-medium">No wins yet</p>
                <p className="text-slate-400 text-sm">Complete your bingo card to earn your first prize!</p>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white font-bold border-2 border-yellow-300"
                  onClick={() => navigate('/game')}
                >
                  Play Now
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((entry) => {
                  const weekNum = entry.week_year.replace('-W', ' · Week ');
                  const wonDate = new Date(entry.won_at).toLocaleDateString();
                  const winLabel = WIN_LABELS[entry.win_condition] ?? entry.win_condition;

                  return (
                    <div key={entry.week_year} className="border rounded-xl p-4 space-y-2 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-800">{weekNum}</p>
                          <p className="text-sm text-slate-500">{winLabel} · Won {wonDate}</p>
                        </div>
                        <Trophy className="w-6 h-6 text-yellow-500" />
                      </div>

                      {entry.claim ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span>Prize claim:</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[entry.claim.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {entry.claim.status}
                          </span>
                          <span className="text-slate-400 text-xs">
                            submitted {new Date(entry.claim.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-amber-600 font-medium">No prize claim submitted for this win.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PrizeHistory;
