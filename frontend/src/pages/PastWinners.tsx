import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPastWinners, PublicWinner } from '@/lib/game-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Heart, Trophy, Loader2 } from 'lucide-react';
import Footer from '@/components/Footer';

const HERO_BG = '#4FB3E8';

function formatWeekYear(weekYear: string): string {
  const [year, wStr] = weekYear.split('-W');
  return `Week ${parseInt(wStr, 10)}, ${year}`;
}

// Public page — no login required. Mirrors the display-name rules already
// used on the public leaderboard: real name, else username, else GR8-####.
// Never shows email or user id.
const PastWinners: React.FC = () => {
  const navigate = useNavigate();
  const [winners, setWinners] = useState<PublicWinner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPastWinners(12)
      .then((r) => setWinners(r.winners))
      .catch(() => setWinners([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: HERO_BG }}>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 flex-1 w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-white hover:text-yellow-300 transition-colors font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back Home
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
              Past Draw Winners
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : winners.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <Trophy className="w-12 h-12 text-slate-200 mx-auto" />
                <p className="text-slate-500 font-medium">No draw has run yet</p>
                <p className="text-slate-400 text-sm">Check back after the first weekly draw completes.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {winners.map((w) => (
                  <div
                    key={`${w.week_year}-${w.selected_at}`}
                    className="border rounded-xl p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                  >
                    {w.prize_image_url ? (
                      <img
                        src={w.prize_image_url}
                        alt={w.prize_title ?? 'Prize'}
                        className="w-14 h-14 object-cover rounded-lg border flex-shrink-0"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                        <Trophy className="w-6 h-6 text-amber-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 truncate">{w.display_name}</p>
                      <p className="text-sm text-slate-500 truncate">
                        {w.prize_title ? w.prize_title : 'Weekly draw winner'} · {formatWeekYear(w.week_year)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Footer tone="dark" />
    </div>
  );
};

export default PastWinners;
