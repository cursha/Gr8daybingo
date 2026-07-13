import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getPlayerProfile, PlayerProfile as PlayerProfileData } from '@/lib/game-utils';
import { toast } from 'sonner';
import { ArrowLeft, Heart, Flame, Users, Globe2 } from 'lucide-react';
import Footer from '@/components/Footer';

// Same mapping as pages/Profile.tsx (the self-view page) — Newcomer has no
// image asset, falls back to the emoji from the API.
const BADGE_IMAGES: Record<string, string> = {
  Starter:  '/badge-starter.png',
  Builder:  '/badge-builder.png',
  Champion: '/badge-champion.png',
  Hero:     '/badge-hero.png',
  Legend:   '/badge-legend.png',
  Expert:   '/badge-expert.png',
};

const PlayerProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { username } = useParams<{ username: string }>();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<PlayerProfileData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate('/login', { state: { from: `/players/${username}` } });
  }, [loading, user, navigate, username]);

  const loadProfile = useCallback(async () => {
    if (!username) return;
    setDataLoading(true);
    setNotFound(false);
    try {
      const data = await getPlayerProfile(username);
      setProfile(data);
    } catch (err: any) {
      if (err?.status === 404) {
        setNotFound(true);
      } else {
        toast.error(err?.message || 'Failed to load player profile');
      }
    } finally {
      setDataLoading(false);
    }
  }, [username]);

  useEffect(() => {
    if (user) loadProfile();
  }, [user, loadProfile]);

  if (loading || (dataLoading && !notFound)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-400 border-t-transparent" />
          <span className="text-indigo-300 font-medium animate-pulse">Loading profile...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-900 flex flex-col">
      <header className="bg-black/30 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/leaderboard')}
              className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" /> Leaderboard
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-pink-400 fill-pink-400" />
            <span className="text-base font-bold text-white hidden sm:inline">Gr8Day Bingo</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-10">
        {notFound ? (
          <div className="text-center py-20">
            <p className="text-2xl font-black text-white mb-2">Player not found</p>
            <p className="text-indigo-200/70">No player goes by that username.</p>
          </div>
        ) : profile ? (
          <div className="space-y-6">
            {/* Hero */}
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center">
              <div className="flex justify-center mb-3">
                {BADGE_IMAGES[profile.badge_name] ? (
                  <div className="w-24 h-24 rounded-full ring-4 ring-amber-400/40 overflow-hidden shadow-lg">
                    <img src={BADGE_IMAGES[profile.badge_name]} alt={profile.badge_name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="text-6xl">{profile.badge_emoji}</div>
                )}
              </div>
              <h1 className="text-3xl font-black text-white">{profile.username}</h1>
              {profile.player_number && (
                <p className="text-indigo-300/70 text-sm mt-1">Player #{profile.player_number}</p>
              )}
              <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500/20 to-amber-400/10 border border-amber-400/30 text-amber-200 px-4 py-1.5 rounded-full text-sm font-bold mt-4">
                {profile.badge_name}
              </div>
              {profile.next_badge_name && profile.deeds_to_next_badge !== null && (
                <p className="text-indigo-200/50 text-xs mt-3">
                  {profile.deeds_to_next_badge} deed{profile.deeds_to_next_badge === 1 ? '' : 's'} away from{' '}
                  <span className="text-indigo-200/80 font-semibold">
                    {profile.next_badge_emoji} {profile.next_badge_name}
                  </span>
                </p>
              )}
              <p className="text-indigo-300/50 text-xs mt-4">
                Member since {new Date(profile.member_since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 text-center">
                <p className="text-3xl font-black text-white">{profile.total_deeds}</p>
                <p className="text-indigo-300/60 text-xs font-medium uppercase tracking-wider mt-1">Gr8Day Deeds</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <Flame className="w-5 h-5 text-orange-400" />
                  <p className="text-3xl font-black text-white">{profile.current_streak_days}</p>
                </div>
                <p className="text-indigo-300/60 text-xs font-medium uppercase tracking-wider mt-1">Current Streak</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <Flame className="w-5 h-5 text-rose-400" />
                  <p className="text-3xl font-black text-white">{profile.longest_streak_days}</p>
                </div>
                <p className="text-indigo-300/60 text-xs font-medium uppercase tracking-wider mt-1">Longest Streak</p>
              </div>
            </div>

            {/* Country / Team */}
            {(profile.country_name || profile.team_name) && (
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 flex flex-wrap items-center justify-center gap-6">
                {profile.country_name && (
                  <div className="flex items-center gap-2 text-indigo-200">
                    <Globe2 className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-medium">{profile.country_name}</span>
                  </div>
                )}
                {profile.team_name && (
                  <div className="flex items-center gap-2 text-indigo-200">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-medium">{profile.team_name}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </main>

      <Footer tone="dark" />
    </div>
  );
};

export default PlayerProfilePage;
