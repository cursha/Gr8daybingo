import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Home, Gamepad2, Trophy, Flame, Calendar, Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  getLeaderboard,
  getPlayerLeaderboard,
  LeaderboardData,
  PlayerLeaderboardData,
  PlayerRankEntry,
  LeaderboardRegion,
  TopDeedEntry,
  GameLeaderboardEntry,
} from '@/lib/game-utils';
import Footer from '@/components/Footer';

const BADGE_IMAGES: Record<string, string> = {
  Starter:  '/badge-starter.png',
  Builder:  '/badge-builder.png',
  Champion: '/badge-champion.png',
  Hero:     '/badge-hero.png',
  Legend:   '/badge-legend.png',
  Expert:   '/badge-expert.png',
};

const COUNTRY_FLAG: Record<string, string> = {
  CA: '🇨🇦', US: '🇺🇸', GB: '🇬🇧', AU: '🇦🇺', NZ: '🇳🇿',
  IE: '🇮🇪', IN: '🇮🇳', NG: '🇳🇬', ZA: '🇿🇦', PH: '🇵🇭',
  MX: '🇲🇽', BR: '🇧🇷', FR: '🇫🇷', DE: '🇩🇪', JP: '🇯🇵',
};

function weekYearToLabel(weekYear: string): string {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(weekYear);
  if (!match) return weekYear;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const targetMonday = new Date(mondayOfWeek1);
  targetMonday.setUTCDate(mondayOfWeek1.getUTCDate() + (week - 1) * 7);
  return targetMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const PODIUM_STYLES = [
  { order: 2, height: 'h-28', bg: 'from-yellow-400 to-amber-500', ring: 'ring-yellow-300', label: '1st', crown: '👑', textSize: 'text-2xl' },
  { order: 1, height: 'h-20', bg: 'from-slate-300 to-slate-400', ring: 'ring-slate-300', label: '2nd', crown: '🥈', textSize: 'text-lg' },
  { order: 3, height: 'h-16', bg: 'from-amber-600 to-orange-700', ring: 'ring-amber-400', label: '3rd', crown: '🥉', textSize: 'text-base' },
];

const BadgeImg: React.FC<{ name: string; emoji: string; size?: string }> = ({ name, emoji, size = 'w-8 h-8' }) =>
  BADGE_IMAGES[name]
    ? <img src={BADGE_IMAGES[name]} alt={name} className={`${size} rounded-full object-cover`} />
    : <span className="text-xl leading-none">{emoji}</span>;

const PodiumCard: React.FC<{ entry: PlayerRankEntry; rank: 1 | 2 | 3 }> = ({ entry, rank }) => {
  const s = PODIUM_STYLES[rank - 1];
  return (
    <div className={`flex flex-col items-center gap-1 order-${s.order}`} style={{ order: s.order }}>
      <span className="text-2xl mb-1">{s.crown}</span>
      <BadgeImg name={entry.badge_name} emoji={entry.badge_emoji} size="w-12 h-12" />
      <p className={`font-black text-white ${s.textSize} text-center leading-tight max-w-[90px] truncate`}>{entry.display_name}</p>
      <p className="text-white/70 text-xs font-mono">GR8-{entry.player_number}</p>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Heart className="w-3.5 h-3.5 text-rose-300 fill-rose-300" />
          <span className="text-white font-black text-lg">{entry.deeds}</span>
        </div>
        {entry.referrals > 0 && (
          <div className="flex items-center gap-0.5">
            <span className="text-xs text-emerald-300 font-bold">+{entry.referrals} 🤝</span>
          </div>
        )}
      </div>
      <div className={`w-full ${s.height} bg-gradient-to-b ${s.bg} rounded-t-xl ring-2 ${s.ring} flex items-start justify-center pt-2`}>
        <span className="text-white/80 font-bold text-sm">{s.label}</span>
      </div>
    </div>
  );
};

const RankRow: React.FC<{ entry: PlayerRankEntry; rank: number }> = ({ entry, rank }) => (
  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${rank <= 3 ? 'bg-white/10' : 'bg-white/5 hover:bg-white/10'}`}>
    <span className={`w-7 text-center font-black text-sm flex-shrink-0 ${rank === 1 ? 'text-yellow-300' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-amber-500' : 'text-white/40'}`}>
      {rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank}
    </span>
    <BadgeImg name={entry.badge_name} emoji={entry.badge_emoji} size="w-7 h-7" />
    <div className="flex-1 min-w-0">
      <p className="font-bold text-white truncate text-sm">{entry.display_name}</p>
      <p className="text-white/40 text-xs">
        {entry.city && `${entry.city}`}{entry.city && entry.country_code && ', '}
        {entry.country_code && (COUNTRY_FLAG[entry.country_code] ?? entry.country_name ?? '')}
      </p>
    </div>
    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
      <div className="flex items-center gap-1">
        <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
        <span className="text-white font-black">{entry.deeds}</span>
      </div>
      {entry.referrals > 0 && (
        <span className="text-[10px] text-emerald-300 font-bold">🤝 {entry.referrals} referred</span>
      )}
    </div>
  </div>
);

const GameHistoryRow: React.FC<{ entry: GameLeaderboardEntry; isTop: boolean }> = ({ entry, isTop }) => (
  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${entry.is_current ? 'bg-indigo-500/20 border border-indigo-400/40' : isTop ? 'bg-amber-400/10 border border-amber-400/20' : 'bg-white/5'}`}>
    <div className="w-10 h-10 rounded-xl bg-white/10 flex flex-col items-center justify-center flex-shrink-0">
      <span className="text-[9px] text-white/50 uppercase font-bold leading-none">Game</span>
      <span className="text-sm font-black text-white leading-none">#{entry.game_number}</span>
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-white/90">{weekYearToLabel(entry.week_year)}</p>
        {entry.is_current && <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5"><Flame className="w-2.5 h-2.5" /> Live</span>}
        {entry.bingo_winners > 0 && <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">🎉 {entry.bingo_winners} BINGO</span>}
      </div>
      <p className="text-xs text-white/40">{entry.active_players} player{entry.active_players !== 1 ? 's' : ''}</p>
    </div>
    <div className="flex items-center gap-1 flex-shrink-0">
      <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
      <span className="text-white font-black text-lg">{entry.total_deeds}</span>
    </div>
  </div>
);

const Leaderboard: React.FC = () => {
  const [gameData, setGameData] = useState<LeaderboardData | null>(null);
  const [playerData, setPlayerData] = useState<PlayerLeaderboardData | null>(null);
  const [tab, setTab] = useState<'week' | 'alltime' | 'history'>('week');
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLeaderboard(), getPlayerLeaderboard()])
      .then(([g, p]) => { setGameData(g); setPlayerData(p); })
      .finally(() => setLoading(false));
  }, []);

  const topDeedsWY = gameData?.games.filter(g => g.total_deeds > 0).reduce<GameLeaderboardEntry | null>((b, g) => !b || g.total_deeds > b.total_deeds ? g : b, null)?.week_year ?? null;
  const regions = tab === 'week' ? (playerData?.regions_this_week ?? []) : (playerData?.regions_all_time ?? []);
  const allRanked = tab === 'week' ? (playerData?.this_week ?? []) : (playerData?.all_time ?? []);
  const ranked = regionFilter === 'ALL' ? allRanked : (regions.find(r => r.code === regionFilter)?.players ?? []);
  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #1e3a5f 40%, #064e3b 100%)' }}>
      {/* Nav */}
      <header className="sticky top-0 z-10 bg-black/20 backdrop-blur-md border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Heart className="w-6 h-6 text-pink-400 fill-pink-400" />
            <span className="font-bold text-white text-lg">Gr8Day Bingo</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link to="/" className="flex items-center gap-1 text-white/70 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <Home className="w-4 h-4" /><span className="hidden sm:inline ml-1">Home</span>
            </Link>
            <Link to="/game" className="flex items-center gap-1 text-white/70 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <Gamepad2 className="w-4 h-4" /><span className="hidden sm:inline ml-1">Play</span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-2xl mx-auto w-full px-4 py-8 flex-1 space-y-8">
        {/* Hero stat */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-yellow-400 to-amber-500 shadow-2xl shadow-amber-500/30 mb-2">
            <Trophy className="w-11 h-11 text-white" />
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-white tracking-tight">Leaderboard</h1>

          {/* All-time mega number */}
          {gameData && (
            <div className="space-y-1">
              <p className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-emerald-300">
                {gameData.grand_total_deeds.toLocaleString()}
              </p>
              <p className="text-white/60 text-lg font-medium">acts of kindness done by this community</p>
            </div>
          )}

          {/* Impact stats grid */}
          {playerData && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {/* This week's deeds + trend */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                <p className="text-2xl font-black text-emerald-300">{playerData.this_week_deeds}</p>
                <p className="text-white/50 text-xs mt-0.5">This week</p>
                <div className={`flex items-center justify-center gap-0.5 mt-1 text-xs font-bold ${playerData.week_trend > 0 ? 'text-emerald-400' : playerData.week_trend < 0 ? 'text-red-400' : 'text-white/30'}`}>
                  {playerData.week_trend > 0 ? <TrendingUp className="w-3 h-3" /> : playerData.week_trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {playerData.week_trend > 0 ? `+${playerData.week_trend}` : playerData.week_trend < 0 ? playerData.week_trend : '—'} vs last
                </div>
              </div>
              {/* Players */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                <p className="text-2xl font-black text-indigo-300">{playerData.all_time.length}</p>
                <p className="text-white/50 text-xs mt-0.5">Players</p>
                {(playerData.new_players_this_week ?? 0) > 0 && (
                  <p className="text-emerald-400 text-xs font-bold mt-1">+{playerData.new_players_this_week} new</p>
                )}
              </div>
              {/* Countries */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                <p className="text-2xl font-black text-yellow-300">{playerData.unique_countries || '—'}</p>
                <p className="text-white/50 text-xs mt-0.5">Countries</p>
                <div className="flex items-center justify-center gap-0.5 mt-1 flex-wrap">
                  {(playerData.top_country_flags ?? []).slice(0, 5).map((f, i) => (
                    <span key={i} className="text-sm leading-none">{f}</span>
                  ))}
                </div>
              </div>
              {/* Referrals */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
                <p className="text-2xl font-black text-teal-300">{playerData.total_referrals ?? 0}</p>
                <p className="text-white/50 text-xs mt-0.5">Referrals</p>
                <p className="text-teal-400/60 text-xs mt-1">🤝 players invited</p>
              </div>
              {/* All-time deeds */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center col-span-2">
                <p className="text-2xl font-black text-rose-300">{playerData.all_time.reduce((s, p) => s + p.deeds, 0).toLocaleString()}</p>
                <p className="text-white/50 text-xs mt-0.5">Total deeds all time</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span className="text-white/40 text-xs">{gameData?.total_games ?? 0} games played</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-2xl p-1">
          {[
            { key: 'week', label: '🔥 This Week' },
            { key: 'alltime', label: '🌟 All Time' },
            { key: 'history', label: '📅 History' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key as typeof tab); setRegionFilter('ALL'); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${tab === t.key ? 'bg-white text-slate-900 shadow-lg' : 'text-white/60 hover:text-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Region filter — only show on player tabs */}
        {!loading && tab !== 'history' && regions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setRegionFilter('ALL')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${regionFilter === 'ALL' ? 'bg-white text-slate-900' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
            >
              🌐 All
            </button>
            {regions.map(r => (
              <button
                key={r.code}
                onClick={() => setRegionFilter(r.code)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${regionFilter === r.code ? 'bg-white text-slate-900' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
              >
                {r.flag} {r.name} <span className="opacity-60 font-normal">({r.players.length})</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tab === 'history' ? (
          /* Game history */
          <div className="space-y-2">
            {(gameData?.games ?? []).length === 0 ? (
              <p className="text-center text-white/40 py-12">No games yet — start playing!</p>
            ) : (gameData?.games ?? []).map(g => (
              <GameHistoryRow key={g.week_year} entry={g} isTop={g.week_year === topDeedsWY} />
            ))}
          </div>
        ) : (
          /* Player rankings */
          <div className="space-y-6">
            {ranked.length === 0 ? (
              <p className="text-center text-white/40 py-12">
                {tab === 'week' ? 'No deeds yet this week — be the first!' : 'No players yet.'}
              </p>
            ) : (
              <>
                {/* Podium — top 3 */}
                {top3.length >= 1 && (
                  <div className="flex items-end justify-center gap-4 pt-4 pb-2">
                    {top3.length >= 2 && <PodiumCard entry={top3[1]} rank={2} />}
                    <PodiumCard entry={top3[0]} rank={1} />
                    {top3.length >= 3 && <PodiumCard entry={top3[2]} rank={3} />}
                  </div>
                )}

                {/* Rest of list */}
                {rest.length > 0 && (
                  <div className="space-y-1.5">
                    {rest.map((entry, i) => (
                      <RankRow key={entry.user_id} entry={entry} rank={i + 4} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Top 10 Most Popular Deeds */}
        {!loading && playerData && playerData.top_deeds && playerData.top_deeds.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-white font-black text-xl flex items-center gap-2">
              <Heart className="w-5 h-5 text-rose-400 fill-rose-400" /> Top 10 Most Popular Deeds
            </h2>
            <p className="text-white/50 text-sm">The acts of kindness this community loves most</p>
            <div className="space-y-2">
              {playerData.top_deeds.map((deed, i) => {
                const max = playerData.top_deeds[0].count;
                const pct = Math.round((deed.count / max) * 100);
                return (
                  <div key={deed.deed_id} className="bg-white/5 rounded-xl px-4 py-3 space-y-1.5">
                    <div className="flex items-start gap-3">
                      <span className={`text-sm font-black flex-shrink-0 mt-0.5 ${i === 0 ? 'text-yellow-300' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-500' : 'text-white/30'}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium leading-snug">{deed.deed_text}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="flex-1 bg-white/10 rounded-full h-1.5 mr-3 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-rose-400 to-pink-400 rounded-full transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-white/50 flex-shrink-0 flex items-center gap-1">
                            <Heart className="w-3 h-3 fill-rose-400 text-rose-400" />
                            {deed.count}×
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-400 fill-rose-400" /> How this works
          </h3>
          <ul className="space-y-2 text-sm text-white/60">
            <li>• Rankings show <strong className="text-white/80">real deeds only</strong> — purchased and referral squares don't count</li>
            <li>• <strong className="text-white/80">This Week</strong> resets every Monday — climb the ranks!</li>
            <li>• <strong className="text-white/80">All Time</strong> is your permanent legacy — every deed counts forever</li>
            <li>• The <strong className="text-white/80">History</strong> tab shows total community deeds per week</li>
          </ul>
        </div>
      </main>

      <Footer tone="dark" />
    </div>
  );
};

export default Leaderboard;
