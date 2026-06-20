import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getPlayerLeaderboard,
  getStreakLeaderboard,
  PlayerLeaderboardData,
  PlayerRankEntry,
  StreakLeaderboard,
  GeoCountry,
  GeoState,
} from '@/lib/game-utils';
import Footer from '@/components/Footer';
import {
  ArrowLeft, MapPin, ListChecks, Trophy, ChevronRight, Loader2, Users,
  Flame, Heart, TrendingUp, TrendingDown, Globe, UserPlus, Lock,
} from 'lucide-react';

type View = 'players' | 'streaks' | 'deeds' | 'places';

// ── helpers ───────────────────────────────────────────────────────────────────
const FLAGS: Record<string, string> = {
  CA: '🍁', US: '🇺🇸', GB: '🇬🇧', AU: '🇦🇺', NZ: '🇳🇿', IE: '🇮🇪', IN: '🇮🇳',
  NG: '🇳🇬', ZA: '🇿🇦', PH: '🇵🇭', MX: '🇲🇽', BR: '🇧🇷', FR: '🇫🇷', DE: '🇩🇪', JP: '🇯🇵',
};
const flagFor = (code?: string | null) => (code && FLAGS[code]) || '🌍';

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '🙂';

// A warm avatar colour derived from the name so each player is visually distinct.
const AVATAR_BG = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-sky-500', 'bg-indigo-500', 'bg-violet-500', 'bg-fuchsia-500',
];
const avatarColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
};

const MEDAL = ['🥇', '🥈', '🥉'];

// Kindness-meter colour by relative standing — variety like a dashboard, never punitive.
const meterColor = (ratio: number) =>
  ratio >= 0.66 ? 'bg-emerald-500' : ratio >= 0.33 ? 'bg-amber-500' : 'bg-rose-400';

// ── small building blocks ──────────────────────────────────────────────────────
const Avatar: React.FC<{ name: string; emoji?: string; size?: 'sm' | 'lg' }> = ({ name, emoji, size = 'sm' }) => {
  const dim = size === 'lg' ? 'w-14 h-14 text-lg' : 'w-9 h-9 text-xs';
  return (
    <div className={`${dim} ${avatarColor(name)} rounded-full grid place-items-center font-bold text-white shrink-0 shadow-sm relative`}>
      {initials(name)}
      {emoji && <span className="absolute -bottom-1 -right-1 text-xs drop-shadow">{emoji}</span>}
    </div>
  );
};

const StatChip: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2 bg-white/15 backdrop-blur rounded-xl px-3 py-2">
    <span className="text-white/90">{icon}</span>
    <div className="leading-tight">
      <p className="text-sm font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-white/70">{label}</p>
    </div>
  </div>
);

// ── main ────────────────────────────────────────────────────────────────────────
const Leaderboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<PlayerLeaderboardData | null>(null);
  const [streaks, setStreaks] = useState<StreakLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('players');
  const [streakMode, setStreakMode] = useState<'current' | 'longest'>('current');
  const [country, setCountry] = useState<GeoCountry | null>(null);
  const [stateNode, setStateNode] = useState<GeoState | null>(null);

  useEffect(() => {
    Promise.allSettled([getPlayerLeaderboard(), getStreakLeaderboard()])
      .then(([p, s]) => {
        if (p.status === 'fulfilled') setData(p.value);
        if (s.status === 'fulfilled') setStreaks(s.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const players = data?.all_time ?? [];
  const deeds = (data?.deed_breakdown && data.deed_breakdown.length ? data.deed_breakdown : data?.top_deeds) ?? [];
  const geo = data?.geo_tree ?? [];
  const threshold = data?.geo_drilldown_threshold ?? 5;

  const totalDeeds = players.reduce((s, p) => s + p.deeds, 0);
  const totalPlayers = players.length;
  const activeThisWeek = data?.this_week?.length ?? 0;
  const participation = totalPlayers > 0 ? Math.round((activeThisWeek / totalPlayers) * 100) : 0;
  const weekTrend = data?.week_trend ?? 0;
  const flags = (data?.top_country_flags ?? []).slice(0, 6);

  const tabs: { key: View; label: string; icon: React.ReactNode }[] = [
    { key: 'players', label: 'Players', icon: <Trophy className="w-4 h-4" /> },
    { key: 'streaks', label: 'Streaks', icon: <Flame className="w-4 h-4" /> },
    { key: 'deeds', label: 'Deeds', icon: <ListChecks className="w-4 h-4" /> },
    { key: 'places', label: 'Places', icon: <MapPin className="w-4 h-4" /> },
  ];

  const podium = players.slice(0, 3);
  const rest = players.slice(3);
  const maxDeeds = players[0]?.deeds || 1;

  const streakList = (streakMode === 'current'
    ? streaks?.current_streak_leaders
    : streaks?.longest_streak_leaders) ?? [];
  const streakDays = (e: any) => streakMode === 'current' ? e.current_streak_days : e.longest_streak_days;
  const maxDeedCount = deeds[0]?.count || 1;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/game')} className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Play
          </button>
          <h1 className="text-lg font-bold text-slate-800 flex-1">Leaderboard</h1>
          <button onClick={() => navigate('/')} className="text-slate-500 hover:text-slate-800 text-sm">Home</button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto w-full px-4 py-5 flex-1 space-y-4">
        {/* Hero band */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-5 shadow-lg">
          <Heart className="absolute -right-4 -top-4 w-28 h-28 text-white/10 fill-white/10" />
          <div className="relative">
            <p className="text-white/80 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 fill-white/90 text-white/90" /> Community Kindness
            </p>
            <p className="text-4xl sm:text-5xl font-black text-white mt-1 leading-none">
              {totalDeeds.toLocaleString()}
            </p>
            <p className="text-white/85 text-sm mt-1">
              acts of kindness by {totalPlayers.toLocaleString()} {totalPlayers === 1 ? 'player' : 'players'}
              {flags.length > 0 && <span className="ml-2 tracking-tight">{flags.join(' ')}</span>}
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <StatChip
                icon={weekTrend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                label="vs last week"
                value={`${weekTrend >= 0 ? '+' : ''}${weekTrend.toLocaleString()}`}
              />
              <StatChip icon={<Flame className="w-4 h-4" />} label="kind this week" value={`${participation}%`} />
              <StatChip icon={<UserPlus className="w-4 h-4" />} label="new players" value={(data?.new_players_this_week ?? 0).toLocaleString()} />
              <StatChip icon={<Globe className="w-4 h-4" />} label="countries" value={(data?.unique_countries ?? 0).toLocaleString()} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setView(t.key); setCountry(null); setStateNode(null); }}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
                view === t.key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
        ) : (
          <>
            {/* ── PLAYERS ─────────────────────────────────────────────── */}
            {view === 'players' && (
              <div className="space-y-4">
                {players.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 py-10 text-center text-slate-400 text-sm">No players ranked yet. Be the first to do a Gr8Day Deed!</div>
                ) : (
                  <>
                    {/* Podium — top 3 */}
                    {podium.length >= 3 && (
                      <div className="bg-white rounded-2xl border border-slate-200 px-3 pt-5 pb-4">
                        <div className="grid grid-cols-3 items-end gap-2">
                          {[1, 0, 2].map((slot, col) => {
                            const p = podium[slot];
                            if (!p) return <div key={col} />;
                            const tall = slot === 0;
                            return (
                              <div key={p.user_id} className="flex flex-col items-center text-center">
                                <span className="text-2xl mb-1">{MEDAL[slot]}</span>
                                <Avatar name={p.display_name} emoji={p.badge_emoji} size={tall ? 'lg' : 'sm'} />
                                <p className={`font-bold text-slate-800 truncate w-full mt-1.5 ${tall ? 'text-sm' : 'text-xs'}`}>{p.display_name}</p>
                                {p.player_number != null && (
                                  <p className="text-[10px] text-slate-400">GR8-{p.player_number}</p>
                                )}
                                <div className={`mt-1.5 w-full rounded-t-lg ${tall ? 'h-16 bg-gradient-to-b from-amber-300 to-amber-400' : slot === 1 ? 'h-11 bg-gradient-to-b from-slate-200 to-slate-300' : 'h-8 bg-gradient-to-b from-orange-200 to-orange-300'} grid place-items-center`}>
                                  <span className="flex items-center gap-1 font-black text-slate-700 text-sm">
                                    <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />{p.deeds}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Ranked rows with kindness meter */}
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
                        <span className="w-6 text-center">#</span>
                        <span className="flex-1">Player</span>
                        <span className="w-28 text-right pr-1">Kindness</span>
                      </div>
                      {(podium.length >= 3 ? rest : players).map((p, i) => {
                        const rank = (podium.length >= 3 ? 3 : 0) + i + 1;
                        return <PlayerRow key={p.user_id} p={p} rank={rank} ratio={p.deeds / maxDeeds} />;
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── STREAKS ─────────────────────────────────────────────── */}
            {view === 'streaks' && (
              <div className="space-y-3">
                <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1">
                  {(['current', 'longest'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setStreakMode(m)}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${
                        streakMode === m ? 'bg-orange-500 text-white' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {m === 'current' ? '🔥 Current streak' : '🏆 Longest ever'}
                    </button>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {streakList.length === 0 ? (
                    <p className="text-center text-slate-400 py-10 text-sm">No streaks going yet. Do a deed today to start one!</p>
                  ) : (
                    streakList.map((e: any, i: number) => {
                      const name = e.name || e.username || 'Player';
                      return (
                        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
                          <span className="w-6 text-center text-sm font-bold text-slate-400">{i < 3 ? MEDAL[i] : i + 1}</span>
                          <Avatar name={name} />
                          <p className="flex-1 min-w-0 font-semibold text-slate-800 truncate">{name}</p>
                          <span className="flex items-center gap-1 font-black text-orange-500">
                            <Flame className="w-4 h-4 fill-orange-400" />{streakDays(e)}
                            <span className="text-xs font-medium text-slate-400 ml-0.5">{streakDays(e) === 1 ? 'day' : 'days'}</span>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                <p className="text-center text-xs text-slate-400">A streak grows by one each day you complete at least one Gr8Day Deed.</p>
              </div>
            )}

            {/* ── DEEDS ───────────────────────────────────────────────── */}
            {view === 'deeds' && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {deeds.length === 0 ? (
                  <p className="text-center text-slate-400 py-10 text-sm">No deeds completed yet.</p>
                ) : (
                  deeds.map((d, i) => (
                    <div key={d.deed_id} className="px-4 py-3 border-b border-slate-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="w-6 text-center text-sm font-bold text-slate-400">{i < 3 ? MEDAL[i] : i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{d.deed_text}</p>
                          {d.category && <p className="text-[11px] uppercase tracking-wide text-indigo-400 font-semibold">{d.category}</p>}
                        </div>
                        <span className="font-black text-emerald-600">{d.count}</span>
                      </div>
                      <div className="mt-2 ml-9 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(4, (d.count / maxDeedCount) * 100)}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── PLACES (drill-down) ─────────────────────────────────── */}
            {view === 'places' && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {(country || stateNode) && (
                  <div className="flex items-center gap-1 px-4 py-2 text-sm bg-slate-50 border-b border-slate-200 text-slate-500">
                    <button className="hover:text-indigo-600 font-medium" onClick={() => { setCountry(null); setStateNode(null); }}>All countries</button>
                    {country && <><ChevronRight className="w-3 h-3" /><button className="hover:text-indigo-600 font-medium" onClick={() => setStateNode(null)}>{country.name}</button></>}
                    {stateNode && <><ChevronRight className="w-3 h-3" /><span className="text-slate-700 font-medium">{stateNode.name}</span></>}
                  </div>
                )}

                {!country && geo.length === 0 && <p className="text-center text-slate-400 py-10 text-sm">No activity yet.</p>}

                {!country && geo.map((c) => (
                  <PlaceRow key={c.code + c.name} flag={flagFor(c.code)} title={c.name}
                    subtitle={`${c.states.length} ${c.states.length === 1 ? 'region' : 'regions'}`}
                    deeds={c.deeds} players={c.players} onClick={() => setCountry(c)} />
                ))}

                {country && !stateNode && country.states.map((s) => {
                  const canDrill = s.cities.length > 0;
                  return (
                    <PlaceRow key={s.name} title={s.name}
                      subtitle={canDrill ? `${s.cities.length} ${s.cities.length === 1 ? 'city' : 'cities'}` : `Cities unlock at ${threshold}+ players`}
                      locked={!canDrill} deeds={s.deeds} players={s.players}
                      onClick={canDrill ? () => setStateNode(s) : undefined} />
                  );
                })}

                {stateNode && stateNode.cities.map((city) => (
                  <PlaceRow key={city.name} title={city.name} deeds={city.deeds} players={city.players} />
                ))}
              </div>
            )}
          </>
        )}

        <p className="text-center text-xs text-slate-400">
          Rankings count real Gr8Day Deeds only. Purchased and referral squares don't count.
        </p>
      </div>
      <Footer tone="light" />
    </div>
  );
};

// ── row components ──────────────────────────────────────────────────────────────
const PlayerRow: React.FC<{ p: PlayerRankEntry; rank: number; ratio: number }> = ({ p, rank, ratio }) => (
  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0">
    <span className="w-6 text-center text-sm font-bold text-slate-400">{rank}</span>
    <Avatar name={p.display_name} emoji={p.badge_emoji} />
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-slate-800 truncate">{p.display_name}</p>
      <p className="text-[11px] text-slate-400 truncate">
        {[p.city, p.country_name].filter(Boolean).join(', ') || (p.player_number != null ? `GR8-${p.player_number}` : '')}
      </p>
    </div>
    <div className="w-28">
      <p className="text-right text-sm font-black text-slate-700 flex items-center justify-end gap-1">
        <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />{p.deeds}
      </p>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${meterColor(ratio)}`} style={{ width: `${Math.max(6, ratio * 100)}%` }} />
      </div>
    </div>
  </div>
);

const PlaceRow: React.FC<{
  flag?: string; title: string; subtitle?: string; deeds: number; players: number;
  onClick?: () => void; locked?: boolean;
}> = ({ flag, title, subtitle, deeds, players, onClick, locked }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-100 last:border-0 ${
      onClick ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
    }`}
  >
    {flag && <span className="text-xl shrink-0">{flag}</span>}
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-slate-800 truncate">{title}</p>
      {subtitle && (
        <p className={`text-xs truncate flex items-center gap-1 ${locked ? 'text-amber-500' : 'text-slate-400'}`}>
          {locked && <Lock className="w-3 h-3" />}{subtitle}
        </p>
      )}
    </div>
    <div className="text-right">
      <p className="font-bold text-emerald-600 leading-tight">{deeds.toLocaleString()}</p>
      <p className="text-[11px] text-slate-400 leading-tight">deeds</p>
    </div>
    <div className="text-right w-12">
      <p className="font-semibold text-slate-600 leading-tight flex items-center justify-end gap-0.5 text-sm">
        <Users className="w-3 h-3" /> {players}
      </p>
    </div>
    {onClick && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
  </button>
);

export default Leaderboard;
