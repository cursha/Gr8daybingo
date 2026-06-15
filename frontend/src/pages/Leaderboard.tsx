import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Trophy,
  Home,
  Gamepad2,
  Heart,
  Loader2,
  Calendar,
  Sparkles,
  Flame,
} from 'lucide-react';
import {
  getLeaderboard,
  LeaderboardData,
  GameLeaderboardEntry,
} from '@/lib/game-utils';
import { toast } from 'sonner';
import Footer from '@/components/Footer';
import WorldDeedsMap from '@/components/WorldDeedsMap';

/**
 * Convert an ISO week-year string like "2026-W17" into a human-friendly label
 * showing the Monday of that week (e.g. "Week of Apr 20, 2026").
 */
function weekYearToLabel(weekYear: string): string {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(weekYear);
  if (!match) return weekYear;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);

  // ISO week 1 = week containing the first Thursday. Compute Monday of week N.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1 = Monday ... 7 = Sunday
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const targetMonday = new Date(mondayOfWeek1);
  targetMonday.setUTCDate(mondayOfWeek1.getUTCDate() + (week - 1) * 7);

  return `Week of ${targetMonday.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })}`;
}

const GameRow: React.FC<{ entry: GameLeaderboardEntry; isTopDeeds: boolean }> = ({
  entry,
  isTopDeeds,
}) => {
  return (
    <div
      className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl transition-all ${
        entry.is_current
          ? 'bg-gradient-to-r from-indigo-50 via-white to-purple-50 border-2 border-indigo-300 shadow-sm'
          : isTopDeeds
            ? 'bg-gradient-to-r from-amber-50 via-white to-orange-50 border border-amber-200'
            : 'bg-white border border-slate-100 hover:bg-slate-50'
      }`}
    >
      {/* Game number badge */}
      <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex flex-col items-center justify-center text-white shadow-md">
        <span className="text-[9px] uppercase font-bold tracking-wider opacity-80 leading-none">
          Game
        </span>
        <span className="text-base font-black leading-none mt-0.5">
          #{entry.game_number}
        </span>
      </div>

      {/* Week label + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            {weekYearToLabel(entry.week_year)}
          </p>
          {entry.is_current && (
            <Badge className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-0">
              <Flame className="w-3 h-3 mr-1" />
              Live Now
            </Badge>
          )}
          {entry.bingo_winners > 0 && (
            <Badge className="bg-gradient-to-r from-emerald-500 to-green-500 text-white border-0">
              🎉 {entry.bingo_winners} BINGO
              {entry.bingo_winners === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {entry.active_players}{' '}
          {entry.active_players === 1 ? 'player' : 'players'} participated
        </p>
      </div>

      {/* Total deeds */}
      <div className="flex-shrink-0 text-right">
        <div className="flex items-center gap-1.5 justify-end">
          <Heart className="w-4 h-4 text-rose-500 fill-rose-400" />
          <span className="text-2xl font-black text-slate-800">
            {entry.total_deeds}
          </span>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
          total {entry.total_deeds === 1 ? 'Gr8Day Deed' : 'Gr8Day Deeds'}
        </p>
      </div>
    </div>
  );
};

const Leaderboard: React.FC = () => {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      const res = await getLeaderboard();
      setData(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load leaderboard';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, []);

  // Identify the game with the highest total deeds to highlight (excluding empty)
  const topDeedsGameWY: string | null = (() => {
    if (!data || data.games.length === 0) return null;
    const withDeeds = data.games.filter((g) => g.total_deeds > 0);
    if (withDeeds.length === 0) return null;
    return withDeeds.reduce((best, g) =>
      g.total_deeds > best.total_deeds ? g : best,
    ).week_year;
  })();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Heart className="w-5 h-5 text-white fill-white" />
            </div>
            <span className="font-bold text-lg text-slate-800">B Kind</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">
                <Home className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Home</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/game">
                <Gamepad2 className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Play</span>
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500 mb-4 shadow-lg">
            <Trophy className="w-9 h-9 text-white fill-white/90" />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 mb-2">
            Leaderboard
          </h1>
          <p className="text-slate-600 max-w-xl mx-auto">
            Every game totals the Gr8Day Deeds done by <strong>all players</strong>{' '}
            combined. The whole community scores together! 💖
          </p>
          {data && (
            <div className="mt-4 inline-flex items-center gap-2 bg-white/60 backdrop-blur px-4 py-2 rounded-full border border-slate-200 shadow-sm">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-slate-700">
                <strong className="text-slate-900">{data.grand_total_deeds}</strong>{' '}
                Gr8Day Deeds done across{' '}
                <strong className="text-slate-900">{data.total_games}</strong>{' '}
                {data.total_games === 1 ? 'game' : 'games'}
              </span>
            </div>
          )}
        </div>

        <Card className="border-slate-200 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="flex items-center gap-2 text-slate-800">
              <Trophy className="w-5 h-5 text-amber-500" />
              Games History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
                <p className="text-sm text-slate-500">Loading leaderboard...</p>
              </div>
            ) : !data || data.games.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 mb-4">
                  <Trophy className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-2">
                  No games yet
                </h3>
                <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
                  Start playing to log the first Gr8Day Deeds of this game!
                </p>
                <Button
                  asChild
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
                >
                  <Link to="/game">
                    <Gamepad2 className="w-4 h-4 mr-2" />
                    Join In Now
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {data.games.map((entry) => (
                  <GameRow
                    key={entry.week_year}
                    entry={entry}
                    isTopDeeds={entry.week_year === topDeedsGameWY}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* World map */}
        <WorldDeedsMap />

        {/* How it works */}
        <Card className="mt-6 border-slate-200 bg-gradient-to-br from-indigo-50 to-purple-50">
          <CardContent className="p-6">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-500 fill-rose-400" />
              How this leaderboard works
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 font-bold mt-0.5">•</span>
                <span>
                  Each <strong>game = one week</strong>. Everyone in the
                  community plays the same game.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 font-bold mt-0.5">•</span>
                <span>
                  Every Gr8Day Deed marked on <em>anyone's</em> bingo card adds +1 to
                  that game's total.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 font-bold mt-0.5">•</span>
                <span>
                  Purchased and referral squares don't count — only real good
                  Gr8Day Deeds.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 font-bold mt-0.5">•</span>
                <span>A new game starts fresh every Monday.</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </main>
      <Footer tone="light" />
    </div>
  );
};

export default Leaderboard;