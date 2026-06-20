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
  Flame, TrendingUp, TrendingDown, UserPlus, Globe, Lock, ChevronLeft,
} from 'lucide-react';

type View = 'players' | 'streaks' | 'deeds' | 'places';

// ── helpers ───────────────────────────────────────────────────────────────────
const initials = (s: string) =>
  s.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

// Performance-bar colour by relative standing (high -> low), like a BI dashboard.
const barColor = (ratio: number) =>
  ratio >= 0.66 ? 'bg-emerald-500' : ratio >= 0.33 ? 'bg-amber-500' : 'bg-rose-500';

// ── building blocks ─────────────────────────────────────────────────────────────
const Monogram: React.FC<{ label: string }> = ({ label }) => (
  <div className="w-9 h-9 rounded-full bg-slate-800 ring-1 ring-slate-700 grid place-items-center text-xs font-semibold text-slate-300 shrink-0">
    {initials(label)}
  </div>
);

const RateBar: React.FC<{ ratio: number }> = ({ ratio }) => (
  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden w-full">
    <div className={`h-full rounded-full ${barColor(ratio)}`} style={{ width: `${Math.max(4, Math.min(100, ratio * 100))}%` }} />
  </div>
);

// Circular gauge ring (the "conversion rate" style Curt liked) — pure SVG, no emoji.
const Gauge: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const r = 34, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const stroke = pct >= 66 ? '#10b981' : pct >= 33 ? '#f59e0b' : '#3b82f6';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-[88px] h-[88px]">
        <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
          <circle cx="44" cy="44" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle cx="44" cy="44" r={r} fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
            style={{ transition: 'stroke-dashoffset 600ms ease' }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-xl font-bold text-white tabular-nums">{pct}%</span>
        </div>
      </div>
      <span className="text-[11px] uppercase tracking-wider text-slate-400 text-center">{label}</span>
    </div>
  );
};

const StatTile: React.FC<{ icon: React.ReactNode; value: React.ReactNode; label: string }> = ({ icon, value, label }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5">
    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider">{icon}{label}</div>
    <p className="text-lg font-bold text-white tabular-nums mt-0.5">{value}</p>
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
  const maxDeeds = players[0]?.deeds || 1;
  const maxDeedCount = deeds[0]?.count || 1;

  const nameOf = (p: PlayerRankEntry) => p.username || p.display_name || (p.player_number != null ? `GR8-${p.player_number}` : 'Player');

  const tabs: { key: View; label: string; icon: React.ReactNode }[] = [
    { key: 'players', label: 'Players', icon: <Trophy className="w-4 h-4" /> },
    { key: 'streaks', label: 'Streaks', icon: <Flame className="w-4 h-4" /> },
    { key: 'deeds', label: 'Deeds', icon: <ListChecks className="w-4 h-4" /> },
    { key: 'places', label: 'Places', icon: <MapPin className="w-4 h-4" /> },
  ];

  const streakList = (streakMode === 'current'
    ? streaks?.current_streak_leaders
    : streaks?.longest_streak_leaders) ?? [];
  const streakDays = (e: any) => streakMode === 'current' ? e.current_streak_days : e.longest_streak_days;
  const maxStreak = streakList.length ? streakDays(streakList[0]) || 1 : 1;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="bg-slate-950/90 backdrop-blur border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/game')} className="text-slate-400 hover:text-white flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Play
          </button>
          <h1 className="text-base font-semibold text-white flex-1 tracking-tight">Leaderboard</h1>
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white text-sm">Home</button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto w-full px-4 py-5 flex-1 space-y-4">
        {/* Hero: big number + gauge (BI-dashboard layout) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Community Kindness</p>
            <p className="text-4xl sm:text-5xl font-bold text-white mt-1 leading-none tabular-nums">{totalDeeds.toLocaleString()}</p>
            <p className="text-sm text-slate-400 mt-1.5">
              acts of kindness · {totalPlayers.toLocaleString()} {totalPlayers === 1 ? 'player' : 'players'} · {(data?.unique_countries ?? 0)} {data?.unique_countries === 1 ? 'country' : 'countries'}
            </p>
          </div>
          <Gauge value={participation} label="Kind this week" />
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatTile icon={<Users className="w-3.5 h-3.5 text-slate-400" />} value={totalPlayers.toLocaleString()} label="players" />
          <StatTile
            icon={weekTrend >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-400" />}
            value={`${weekTrend >= 0 ? '+' : ''}${weekTrend.toLocaleString()}`} label="vs last week" />
          <StatTile icon={<UserPlus className="w-3.5 h-3.5 text-sky-400" />} value={(data?.new_players_this_week ?? 0).toLocaleString()} label="new this week" />
          <StatTile icon={<Globe className="w-3.5 h-3.5 text-violet-400" />} value={(data?.unique_countries ?? 0).toLocaleString()} label="countries" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setView(t.key); setCountry(null); setStateNode(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                view === t.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-blue-500 animate-spin" /></div>
        ) : (
          <>
            {/* ── PLAYERS ─────────────────────────────────────────── */}
            {view === 'players' && (
              <Panel>
                <TableHead cols={['#', 'Player', 'Kindness']} />
                {players.length === 0 ? (
                  <Empty>No players ranked yet.</Empty>
                ) : players.map((p, i) => (
                  <div key={p.user_id} className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-800/70">
                    <span className="w-5 text-center text-sm font-semibold text-slate-500 tabular-nums">{i + 1}</span>
                    <Monogram label={nameOf(p)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{nameOf(p)}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {[p.city, p.country_name].filter(Boolean).join(', ') || (p.player_number != null ? `GR8-${p.player_number}` : '')}
                      </p>
                    </div>
                    <div className="w-28 shrink-0">
                      <p className="text-right text-sm font-bold text-white tabular-nums">{p.deeds.toLocaleString()}</p>
                      <div className="mt-1"><RateBar ratio={p.deeds / maxDeeds} /></div>
                    </div>
                  </div>
                ))}
              </Panel>
            )}

            {/* ── STREAKS ─────────────────────────────────────────── */}
            {view === 'streaks' && (
              <div className="space-y-3">
                <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
                  {(['current', 'longest'] as const).map((m) => (
                    <button key={m} onClick={() => setStreakMode(m)}
                      className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                        streakMode === m ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}>
                      {m === 'current' ? 'Current streak' : 'Longest ever'}
                    </button>
                  ))}
                </div>
                <Panel>
                  <TableHead cols={['#', 'Player', 'Days']} />
                  {streakList.length === 0 ? (
                    <Empty>No streaks yet. Do a deed today to start one.</Empty>
                  ) : streakList.map((e: any, i: number) => {
                    const name = e.username || e.name || 'Player';
                    const days = streakDays(e);
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-800/70">
                        <span className="w-5 text-center text-sm font-semibold text-slate-500 tabular-nums">{i + 1}</span>
                        <Monogram label={name} />
                        <p className="flex-1 min-w-0 font-medium text-white truncate">{name}</p>
                        <div className="w-28 shrink-0">
                          <p className="text-right text-sm font-bold text-white tabular-nums flex items-center justify-end gap-1">
                            <Flame className="w-3.5 h-3.5 text-amber-400" />{days}
                          </p>
                          <div className="mt-1"><RateBar ratio={days / maxStreak} /></div>
                        </div>
                      </div>
                    );
                  })}
                </Panel>
                <p className="text-center text-xs text-slate-500">A streak grows by one each day you complete at least one Gr8Day Deed.</p>
              </div>
            )}

            {/* ── DEEDS ───────────────────────────────────────────── */}
            {view === 'deeds' && (
              <Panel>
                <TableHead cols={['#', 'Deed', 'Done']} />
                {deeds.length === 0 ? (
                  <Empty>No deeds completed yet.</Empty>
                ) : deeds.map((d, i) => (
                  <div key={d.deed_id} className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-800/70">
                    <span className="w-5 text-center text-sm font-semibold text-slate-500 tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{d.deed_text}</p>
                      {d.category && <p className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold mt-0.5">{d.category}</p>}
                    </div>
                    <div className="w-24 shrink-0">
                      <p className="text-right text-sm font-bold text-white tabular-nums">{d.count.toLocaleString()}</p>
                      <div className="mt-1"><RateBar ratio={d.count / maxDeedCount} /></div>
                    </div>
                  </div>
                ))}
              </Panel>
            )}

            {/* ── PLACES (drill-down) ─────────────────────────────── */}
            {view === 'places' && (
              <Panel>
                {(country || stateNode) && (
                  <div className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-slate-400 border-b border-slate-800">
                    <ChevronLeft className="w-4 h-4" />
                    <button className="hover:text-white" onClick={() => { setCountry(null); setStateNode(null); }}>All countries</button>
                    {country && <><ChevronRight className="w-3 h-3 text-slate-600" /><button className="hover:text-white" onClick={() => setStateNode(null)}>{country.name}</button></>}
                    {stateNode && <><ChevronRight className="w-3 h-3 text-slate-600" /><span className="text-white">{stateNode.name}</span></>}
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                  <span className="flex-1">Region</span>
                  <span className="w-16 text-right">Deeds</span>
                  <span className="w-12 text-right">Players</span>
                  <span className="w-4" />
                </div>
                {!country && geo.length === 0 && <Empty>No activity yet.</Empty>}

                {!country && geo.map((c) => (
                  <PlaceRow key={c.code + c.name} title={c.name}
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
              </Panel>
            )}
          </>
        )}

        <p className="text-center text-xs text-slate-600">
          Rankings count real Gr8Day Deeds only. Purchased and referral squares don't count.
        </p>
      </div>
      <Footer tone="dark" />
    </div>
  );
};

// ── shared layout pieces ─────────────────────────────────────────────────────────
const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">{children}</div>
);

const TableHead: React.FC<{ cols: [string, string, string] | string[] }> = ({ cols }) => (
  <div className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
    <span className="w-5 text-center">{cols[0]}</span>
    <span className="flex-1">{cols[1]}</span>
    <span className="w-24 text-right">{cols[2]}</span>
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-center text-slate-500 py-10 text-sm border-t border-slate-800/70">{children}</p>
);

const PlaceRow: React.FC<{
  title: string; subtitle?: string; deeds: number; players: number; onClick?: () => void; locked?: boolean;
}> = ({ title, subtitle, deeds, players, onClick, locked }) => (
  <button type="button" onClick={onClick} disabled={!onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-t border-slate-800/70 ${onClick ? 'hover:bg-slate-800/50 cursor-pointer' : 'cursor-default'}`}>
    <div className="flex-1 min-w-0">
      <p className="font-medium text-white truncate">{title}</p>
      {subtitle && (
        <p className={`text-[11px] truncate flex items-center gap-1 mt-0.5 ${locked ? 'text-amber-500/80' : 'text-slate-500'}`}>
          {locked && <Lock className="w-3 h-3" />}{subtitle}
        </p>
      )}
    </div>
    <div className="w-16 text-right">
      <p className="font-bold text-white tabular-nums leading-tight">{deeds.toLocaleString()}</p>
    </div>
    <div className="w-12 text-right flex items-center justify-end gap-1 text-slate-300">
      <Users className="w-3 h-3 text-slate-500" /><span className="tabular-nums text-sm">{players}</span>
    </div>
    {onClick && <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />}
  </button>
);

export default Leaderboard;
