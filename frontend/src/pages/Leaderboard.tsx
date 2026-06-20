import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getPlayerLeaderboard,
  PlayerLeaderboardData,
  GeoCountry,
  GeoState,
} from '@/lib/game-utils';
import Footer from '@/components/Footer';
import { ArrowLeft, MapPin, ListChecks, Trophy, ChevronRight, Loader2, Users } from 'lucide-react';

type View = 'places' | 'deeds' | 'players';

const Row: React.FC<{
  title: string;
  subtitle?: string;
  deeds: number;
  players?: number;
  onClick?: () => void;
  rank?: number;
}> = ({ title, subtitle, deeds, players, onClick, rank }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-200 last:border-0 ${
      onClick ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'
    }`}
  >
    {typeof rank === 'number' && (
      <span className="w-6 text-center text-sm font-bold text-slate-400">{rank}</span>
    )}
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-slate-800 truncate">{title}</p>
      {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
    </div>
    <div className="text-right">
      <p className="font-bold text-emerald-600 leading-tight">{deeds}</p>
      <p className="text-[11px] text-slate-400 leading-tight">deeds</p>
    </div>
    {typeof players === 'number' && (
      <div className="text-right w-14">
        <p className="font-semibold text-slate-600 leading-tight flex items-center justify-end gap-0.5">
          <Users className="w-3 h-3" /> {players}
        </p>
      </div>
    )}
    {onClick && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
  </button>
);

const Leaderboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<PlayerLeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('places');
  const [country, setCountry] = useState<GeoCountry | null>(null);
  const [stateNode, setStateNode] = useState<GeoState | null>(null);

  useEffect(() => {
    getPlayerLeaderboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const geo = data?.geo_tree ?? [];
  const deeds = (data?.deed_breakdown && data.deed_breakdown.length ? data.deed_breakdown : data?.top_deeds) ?? [];
  const players = data?.all_time ?? [];
  const totalDeeds = geo.reduce((s, c) => s + c.deeds, 0);
  const totalPlayers = geo.reduce((s, c) => s + c.players, 0);

  const tabs: { key: View; label: string; icon: React.ReactNode }[] = [
    { key: 'places', label: 'Places', icon: <MapPin className="w-4 h-4" /> },
    { key: 'deeds', label: 'Deeds', icon: <ListChecks className="w-4 h-4" /> },
    { key: 'players', label: 'Players', icon: <Trophy className="w-4 h-4" /> },
  ];

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
        {/* Community total */}
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-3xl font-black text-slate-800">
            {totalDeeds.toLocaleString()} <span className="text-base font-semibold text-slate-500">acts of kindness</span>
          </p>
          <p className="text-sm text-slate-500 mt-0.5">
            by {totalPlayers.toLocaleString()} players in {geo.length} {geo.length === 1 ? 'country' : 'countries'}
          </p>
        </div>

        {/* View tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setView(t.key); setCountry(null); setStateNode(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                view === t.key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-indigo-500 animate-spin" /></div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* PLACES: country -> province/state -> city */}
            {view === 'places' && (
              <>
                {(country || stateNode) && (
                  <div className="flex items-center gap-1 px-4 py-2 text-sm bg-slate-50 border-b border-slate-200 text-slate-500">
                    <button className="hover:text-indigo-600 font-medium" onClick={() => { setCountry(null); setStateNode(null); }}>All countries</button>
                    {country && <><ChevronRight className="w-3 h-3" /><button className="hover:text-indigo-600 font-medium" onClick={() => setStateNode(null)}>{country.name}</button></>}
                    {stateNode && <><ChevronRight className="w-3 h-3" /><span className="text-slate-700 font-medium">{stateNode.name}</span></>}
                  </div>
                )}

                {!country && geo.length === 0 && <p className="text-center text-slate-400 py-10 text-sm">No activity yet.</p>}

                {!country && geo.map((c) => (
                  <Row key={c.code + c.name} title={c.name} subtitle={`${c.states.length} ${c.states.length === 1 ? 'region' : 'regions'}`} deeds={c.deeds} players={c.players} onClick={() => setCountry(c)} />
                ))}

                {country && !stateNode && country.states.map((s) => (
                  <Row key={s.name} title={s.name} subtitle={`${s.cities.length} ${s.cities.length === 1 ? 'city' : 'cities'}`} deeds={s.deeds} players={s.players} onClick={() => setStateNode(s)} />
                ))}

                {stateNode && stateNode.cities.map((city) => (
                  <Row key={city.name} title={city.name} deeds={city.deeds} players={city.players} />
                ))}
              </>
            )}

            {/* DEEDS: most-completed deeds */}
            {view === 'deeds' && (
              deeds.length === 0
                ? <p className="text-center text-slate-400 py-10 text-sm">No deeds completed yet.</p>
                : deeds.map((d, i) => (
                    <Row key={d.deed_id} rank={i + 1} title={d.deed_text} subtitle={d.category || undefined} deeds={d.count} />
                  ))
            )}

            {/* PLAYERS: ranking */}
            {view === 'players' && (
              players.length === 0
                ? <p className="text-center text-slate-400 py-10 text-sm">No players ranked yet.</p>
                : players.map((p, i) => (
                    <Row
                      key={p.user_id}
                      rank={i + 1}
                      title={p.display_name}
                      subtitle={[p.city, p.country_name].filter(Boolean).join(', ') || undefined}
                      deeds={p.deeds}
                    />
                  ))
            )}
          </div>
        )}

        <p className="text-center text-xs text-slate-400">
          Rankings count real Gr8Day Deeds only. Purchased and referral squares don't count.
        </p>
      </div>
      <Footer tone="light" />
    </div>
  );
};

export default Leaderboard;
