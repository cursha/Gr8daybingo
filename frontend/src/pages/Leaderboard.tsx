import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getPlayerLeaderboard,
  getStreakLeaderboard,
  getImpactSummary,
  getTeamLeaderboard,
  PlayerLeaderboardData,
  PlayerRankEntry,
  StreakLeaderboard,
  TeamRankEntry,
  ImpactSummary,
  ImpactPeriod,
  GeoCountry,
  GeoState,
} from '@/lib/game-utils';
import Footer from '@/components/Footer';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowLeft, MapPin, ListChecks, Trophy, ChevronRight, Loader2, Users,
  Flame, Globe, Lock, ChevronLeft, Sparkles, Award, Grid3x3, UsersRound, Building2, Map, Eye,
  ChevronUp, ChevronDown,
} from 'lucide-react';

type View = 'players' | 'streaks' | 'deeds' | 'places' | 'teams';

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

const PERIODS: { key: ImpactPeriod; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All Time' },
];

const ImpactCard: React.FC<{ icon: React.ReactNode; label: string; value?: number }> = ({ icon, label, value }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
    <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase tracking-wider">{icon}<span className="truncate">{label}</span></div>
    <p className="text-2xl font-bold text-white tabular-nums mt-1">{value == null ? '—' : value.toLocaleString()}</p>
  </div>
);

const ImpactGroup: React.FC<{ title: string; cols: string; cards: { icon: React.ReactNode; label: string; value?: number }[] }> = ({ title, cols, cards }) => (
  <div>
    <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-1.5 px-0.5">{title}</p>
    <div className={`grid ${cols} gap-2`}>
      {cards.map((c, i) => <ImpactCard key={i} {...c} />)}
    </div>
  </div>
);

// ── Demo data (shown to logged-out visitors; sample numbers, clearly labelled) ──
const demoPlayer = (n: number, username: string, deeds: number, city: string | null, country: string | null): PlayerRankEntry => ({
  user_id: `demo-${n}`, display_name: username, username, player_number: 10000 + n,
  city, country_name: country, country_code: null, deeds, referrals: 0, badge_name: '', badge_emoji: '',
});
const DEMO_DATA: PlayerLeaderboardData = {
  all_time: [
    demoPlayer(1, 'kindheart_maya', 142, 'Toronto', 'Canada'),
    demoPlayer(2, 'liam_gives', 128, 'Austin', 'United States'),
    demoPlayer(3, 'sofia_smiles', 119, 'Manchester', 'United Kingdom'),
    demoPlayer(4, 'noah_helps', 97, 'Calgary', 'Canada'),
    demoPlayer(5, 'ava_cares', 88, 'Sydney', 'Australia'),
    demoPlayer(6, 'ethan_good', 74, 'Manila', 'Philippines'),
    demoPlayer(7, 'mia_kind', 61, 'Toronto', 'Canada'),
    demoPlayer(8, 'lucas_lifts', 53, 'Chicago', 'United States'),
    demoPlayer(9, 'emma_joy', 44, 'Auckland', 'New Zealand'),
    demoPlayer(10, 'oliver_warm', 38, 'London', 'United Kingdom'),
  ],
  this_week: new Array(48).fill(null) as any,
  regions_all_time: [], regions_this_week: [], current_week_year: '',
  top_deeds: [], promotion_threshold: 0,
  this_week_deeds: 96, last_week_deeds: 82, week_trend: 14,
  unique_countries: 5, top_country_flags: [], new_players_this_week: 23, new_players_last_week: 17,
  total_referrals: 0,
  deed_breakdown: [
    { deed_id: 1, deed_text: 'Hold the door for someone', category: 'NOTICE', count: 184 },
    { deed_id: 2, deed_text: 'Thank a cashier or server warmly', category: 'CELEBRATE', count: 162 },
    { deed_id: 3, deed_text: 'Check in on a friend', category: 'CONNECT', count: 143 },
    { deed_id: 4, deed_text: 'Buy a stranger a coffee', category: 'DELIGHT', count: 121 },
    { deed_id: 5, deed_text: 'Encourage someone who is struggling', category: 'ENCOURAGE', count: 98 },
    { deed_id: 6, deed_text: 'Help a neighbour with a chore', category: 'HELP', count: 79 },
  ],
  geo_tree: [
    { code: 'CA', name: 'Canada', deeds: 540, players: 86, states: [
      { name: 'Ontario', deeds: 320, players: 52, cities: [
        { name: 'Toronto', deeds: 210, players: 33 }, { name: 'Milton', deeds: 64, players: 11 }, { name: 'Ottawa', deeds: 46, players: 8 },
      ] },
      { name: 'Alberta', deeds: 220, players: 34, cities: [{ name: 'Calgary', deeds: 140, players: 21 }, { name: 'Edmonton', deeds: 80, players: 13 }] },
    ] },
    { code: 'US', name: 'United States', deeds: 410, players: 71, states: [
      { name: 'Texas', deeds: 230, players: 38, cities: [{ name: 'Austin', deeds: 150, players: 24 }, { name: 'Houston', deeds: 80, players: 14 }] },
      { name: 'Illinois', deeds: 180, players: 33, cities: [{ name: 'Chicago', deeds: 180, players: 33 }] },
    ] },
    { code: 'GB', name: 'United Kingdom', deeds: 250, players: 44, states: [
      { name: 'England', deeds: 250, players: 44, cities: [{ name: 'London', deeds: 160, players: 28 }, { name: 'Manchester', deeds: 90, players: 16 }] },
    ] },
    { code: 'AU', name: 'Australia', deeds: 120, players: 22, states: [{ name: 'New South Wales', deeds: 120, players: 22, cities: [] }] },
    { code: 'PH', name: 'Philippines', deeds: 90, players: 18, states: [{ name: 'Metro Manila', deeds: 90, players: 18, cities: [] }] },
  ],
  geo_drilldown_threshold: 5,
};
const DEMO_STREAKS: StreakLeaderboard = {
  current_streak_leaders: [
    { username: 'kindheart_maya', name: null, current_streak_days: 86 },
    { username: 'noah_helps', name: null, current_streak_days: 54 },
    { username: 'sofia_smiles', name: null, current_streak_days: 41 },
    { username: 'liam_gives', name: null, current_streak_days: 33 },
    { username: 'ava_cares', name: null, current_streak_days: 22 },
  ],
  longest_streak_leaders: [
    { username: 'kindheart_maya', name: null, longest_streak_days: 124 },
    { username: 'sofia_smiles', name: null, longest_streak_days: 98 },
    { username: 'liam_gives', name: null, longest_streak_days: 77 },
  ],
  average_streak: 19.4,
};
const DEMO_IMPACT: ImpactSummary = {
  period: 'all',
  impact: { deeds_delivered: 1410, bingos_achieved: 96, full_cards_completed: 14 },
  participation: { active_players: 241, lifetime_players: 388, active_teams: 19, lifetime_teams: 27 },
  reach: { cities: 24, provinces: 11, countries: 5 },
};
const DEMO_TEAMS: { teams: TeamRankEntry[] } = {
  teams: [
    { team_id: 1, team_number: 1001, team_name: 'Kindness Crew', deeds: 312, active_members: 6, total_members: 8 },
    { team_id: 2, team_number: 1002, team_name: 'Good Vibes Only', deeds: 245, active_members: 5, total_members: 6 },
    { team_id: 3, team_number: 1003, team_name: 'Helping Hands', deeds: 178, active_members: 4, total_members: 5 },
  ],
};

// ── main ────────────────────────────────────────────────────────────────────────
const Leaderboard: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const isDemo = !authLoading && !user;
  const [data, setData] = useState<PlayerLeaderboardData | null>(null);
  const [streaks, setStreaks] = useState<StreakLeaderboard | null>(null);
  const [teams, setTeams] = useState<{ teams: TeamRankEntry[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('players');
  const [streakMode, setStreakMode] = useState<'current' | 'longest'>('current');
  const [country, setCountry] = useState<GeoCountry | null>(null);
  const [stateNode, setStateNode] = useState<GeoState | null>(null);
  const [period, setPeriod] = useState<ImpactPeriod>('all');
  const [impact, setImpact] = useState<ImpactSummary | null>(null);
  const [playerSort, setPlayerSort] = useState<{ key: 'name' | 'deeds' | 'last_played'; dir: 'asc' | 'desc' }>({ key: 'deeds', dir: 'desc' });

  useEffect(() => {
    if (authLoading) return;
    // Logged-out visitors see a clearly-labelled demo, not the live community data.
    if (!user) {
      setData(DEMO_DATA);
      setStreaks(DEMO_STREAKS);
      setTeams(DEMO_TEAMS);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.allSettled([getPlayerLeaderboard(), getStreakLeaderboard(), getTeamLeaderboard()])
      .then(([p, s, t]) => {
        if (p.status === 'fulfilled') setData(p.value);
        if (s.status === 'fulfilled') setStreaks(s.value);
        if (t.status === 'fulfilled') setTeams(t.value);
      })
      .finally(() => setLoading(false));
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setImpact({ ...DEMO_IMPACT, period }); return; }
    getImpactSummary(period).then(setImpact).catch(() => {});
  }, [authLoading, user, period]);

  const players = data?.all_time ?? [];
  const deeds = (data?.deed_breakdown && data.deed_breakdown.length ? data.deed_breakdown : data?.top_deeds) ?? [];
  const geo = data?.geo_tree ?? [];
  const threshold = data?.geo_drilldown_threshold ?? 5;

  const totalDeeds = players.reduce((s, p) => s + p.deeds, 0);
  const totalPlayers = players.length;
  const thisWeekDeeds = data?.this_week_deeds ?? 0;
  // Countries where deeds actually happened (excludes the "Unknown" bucket), so
  // the hero matches the Reach card instead of counting registered-but-idle countries.
  const heroCountries = geo.filter((c) => c.deeds > 0 && c.code !== 'XX' && c.name !== 'Unknown').length || (data?.unique_countries ?? 0);
  const maxDeeds = players.reduce((m, p) => Math.max(m, p.deeds), 1);
  const maxDeedCount = deeds[0]?.count || 1;

  const nameOf = (p: PlayerRankEntry) => p.username || p.display_name || (p.player_number != null ? `GR8-${p.player_number}` : 'Player');

  const sortedPlayers = useMemo(() => {
    const list = [...players];
    const { key, dir } = playerSort;
    const mul = dir === 'asc' ? 1 : -1;
    if (key === 'name') {
      list.sort((a, b) => mul * nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' }));
    } else if (key === 'last_played') {
      list.sort((a, b) => {
        const at = a.last_played ? new Date(a.last_played).getTime() : null;
        const bt = b.last_played ? new Date(b.last_played).getTime() : null;
        if (at == null && bt == null) return 0;
        if (at == null) return 1;
        if (bt == null) return -1;
        return mul * (at - bt);
      });
    } else {
      list.sort((a, b) => mul * (a.deeds - b.deeds));
    }
    return list;
  }, [players, playerSort]);

  const handlePlayerSortClick = (key: 'name' | 'deeds' | 'last_played') => {
    setPlayerSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: key === 'name' ? 'asc' : 'desc' };
    });
  };

  const tabs: { key: View; label: string; icon: React.ReactNode }[] = [
    { key: 'players', label: 'Players', icon: <Trophy className="w-4 h-4" /> },
    { key: 'streaks', label: 'Streaks', icon: <Flame className="w-4 h-4" /> },
    { key: 'teams', label: 'Teams', icon: <UsersRound className="w-4 h-4" /> },
    { key: 'deeds', label: 'Deeds', icon: <ListChecks className="w-4 h-4" /> },
    { key: 'places', label: 'Countries', icon: <MapPin className="w-4 h-4" /> },
  ];

  const streakList = (streakMode === 'current'
    ? streaks?.current_streak_leaders
    : streaks?.longest_streak_leaders) ?? [];
  const streakDays = (e: any) => streakMode === 'current' ? e.current_streak_days : e.longest_streak_days;
  const maxStreak = streakList.length ? streakDays(streakList[0]) || 1 : 1;
  const maxTeamDeeds = teams?.teams.length ? teams.teams[0].deeds || 1 : 1;

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
        {/* Demo banner for logged-out visitors */}
        {isDemo && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <Eye className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-sm text-amber-100 flex-1">
              <span className="font-semibold">Demo view.</span> These are sample numbers.{' '}
              <button onClick={() => navigate('/login')} className="underline font-semibold hover:text-white">Sign in</button> to see the live Impact Board.
            </p>
          </div>
        )}

        {/* Hero: community total + this-week count (BI-dashboard layout) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Community Gr8Day Deeds</p>
            <p className="text-4xl sm:text-5xl font-bold text-white mt-1 leading-none tabular-nums">{totalDeeds.toLocaleString()}</p>
            <p className="text-sm text-slate-400 mt-1.5">
              by {totalPlayers.toLocaleString()} {totalPlayers === 1 ? 'player' : 'players'} · {heroCountries.toLocaleString()} {heroCountries === 1 ? 'country' : 'countries'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-3xl sm:text-4xl font-bold text-blue-400 tabular-nums leading-none">{thisWeekDeeds.toLocaleString()}</p>
            <p className="text-[11px] uppercase tracking-wider text-slate-400 mt-1.5 leading-tight">Gr8Day Deeds<br />This Week</p>
          </div>
        </div>

        {/* Impact summary with time filter (Issue #14) */}
        <div className="space-y-3">
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  period === p.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          <ImpactGroup title="Impact" cols="grid-cols-3" cards={[
            { icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" />, label: 'Gr8Day Deeds', value: impact?.impact.deeds_delivered },
            { icon: <Award className="w-3.5 h-3.5 text-emerald-400" />, label: 'Bingos', value: impact?.impact.bingos_achieved },
            { icon: <Grid3x3 className="w-3.5 h-3.5 text-sky-400" />, label: 'Full Cards', value: impact?.impact.full_cards_completed },
          ]} />

          <ImpactGroup title="Participation" cols="grid-cols-2 sm:grid-cols-4" cards={[
            { icon: <Users className="w-3.5 h-3.5 text-blue-400" />, label: 'Active Players', value: impact?.participation.active_players },
            { icon: <UsersRound className="w-3.5 h-3.5 text-blue-400" />, label: 'Active Teams', value: impact?.participation.active_teams },
            { icon: <Users className="w-3.5 h-3.5 text-slate-400" />, label: 'Lifetime Players', value: impact?.participation.lifetime_players },
            { icon: <UsersRound className="w-3.5 h-3.5 text-slate-400" />, label: 'Lifetime Teams', value: impact?.participation.lifetime_teams },
          ]} />

          <ImpactGroup title="Reach" cols="grid-cols-3" cards={[
            { icon: <Building2 className="w-3.5 h-3.5 text-violet-400" />, label: 'Cities', value: impact?.reach.cities },
            { icon: <Map className="w-3.5 h-3.5 text-violet-400" />, label: 'Provinces', value: impact?.reach.provinces },
            { icon: <Globe className="w-3.5 h-3.5 text-violet-400" />, label: 'Countries', value: impact?.reach.countries },
          ]} />
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
              <div className="space-y-3">
                <Panel>
                  <TableHead
                    cols={['#', 'Player', 'Gr8Day Deeds', 'Last Deed']}
                    sortKeys={[null, 'name', 'deeds', 'last_played']}
                    activeSort={playerSort}
                    onSort={handlePlayerSortClick}
                  />
                  {sortedPlayers.length === 0 ? (
                    <Empty>No players ranked yet.</Empty>
                  ) : sortedPlayers.map((p, i) => (
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
                      <div className="w-24 shrink-0 text-right">
                        <p className="text-xs text-slate-400 tabular-nums">{fmtPlayed(p.last_played)}</p>
                      </div>
                    </div>
                  ))}
                </Panel>
              </div>
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
                  <TableHead cols={['#', 'Player', 'Days', 'Last Deed']} />
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
                        <div className="w-24 shrink-0 text-right">
                          <p className="text-xs text-slate-400 tabular-nums">{fmtPlayed(e.last_valid_deed_date)}</p>
                        </div>
                      </div>
                    );
                  })}
                </Panel>
                <p className="text-center text-xs text-slate-500">A streak grows by one each day you complete at least one Gr8Day Deed.</p>
              </div>
            )}

            {/* ── TEAMS ───────────────────────────────────────────── */}
            {view === 'teams' && (
              <div className="space-y-3">
                <Panel>
                  <TableHead cols={['#', 'Team', 'Deeds', 'Members']} />
                  {(teams?.teams ?? []).length === 0 ? (
                    <Empty>No teams ranked yet.</Empty>
                  ) : (teams?.teams ?? []).map((t, i) => (
                    <div key={t.team_id} className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-800/70">
                      <span className="w-5 text-center text-sm font-semibold text-slate-500 tabular-nums">{i + 1}</span>
                      <Monogram label={t.team_name} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white truncate">{t.team_name}</p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {t.team_number != null ? `Team #${t.team_number}` : ''}
                        </p>
                      </div>
                      <div className="w-28 shrink-0">
                        <p className="text-right text-sm font-bold text-white tabular-nums">{t.deeds.toLocaleString()}</p>
                        <div className="mt-1"><RateBar ratio={t.deeds / maxTeamDeeds} /></div>
                      </div>
                      <div className="w-24 shrink-0 text-right">
                        <p className="text-xs text-slate-400 tabular-nums">{t.total_members}</p>
                      </div>
                    </div>
                  ))}
                </Panel>
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

const fmtPlayed = (d?: string | null): string => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });  
};

const TableHead: React.FC<{
  cols: string[];
  sortKeys?: (string | null)[];
  activeSort?: { key: string; dir: 'asc' | 'desc' };
  onSort?: (key: string) => void;
}> = ({ cols, sortKeys, activeSort, onSort }) => {
  const cell = (label: string, idx: number, className: string) => {
    const key = sortKeys?.[idx];
    if (!key || !onSort) return <span className={className}>{label}</span>;
    const isActive = activeSort?.key === key;
    return (
      <button
        onClick={() => onSort(key)}
        className={`${className} flex items-center gap-0.5 ${idx > 1 ? 'justify-end' : ''} cursor-pointer hover:text-slate-300 transition-colors ${isActive ? 'text-slate-300' : ''}`}
      >
        {label}
        {isActive && (activeSort!.dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>
    );
  };
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
      {cell(cols[0], 0, 'w-5 text-center')}
      {cell(cols[1], 1, 'flex-1')}
      {cols[2] != null && cell(cols[2], 2, 'w-24 text-right')}
      {cols[3] != null && cell(cols[3], 3, 'w-24 text-right')}
    </div>
  );
};

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
