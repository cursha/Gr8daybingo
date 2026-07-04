import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getMyProfile, getRegistrationStatus, getMyStreak, PlayerBadge, ProfileStatus, StreakData } from '@/lib/game-utils';
import { ArrowLeft, Heart } from 'lucide-react';
import StreakDisplay from '@/components/StreakDisplay';

const HERO_BG = 'linear-gradient(135deg, #312e81 0%, #1e3a5f 50%, #064e3b 100%)';

const BADGE_IMAGES: Record<string, string> = {
  Starter:  '/badge-starter.png',
  Builder:  '/badge-builder.png',
  Champion: '/badge-champion.png',
  Hero:     '/badge-hero.png',
  Legend:   '/badge-legend.png',
  Expert:   '/badge-expert.png',
};

const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [badge, setBadge] = useState<PlayerBadge | null>(null);
  const [profile, setProfile] = useState<ProfileStatus | null>(null);
  const [playerNumber, setPlayerNumber] = useState<number | null>(null);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { state: { from: '/profile' } });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      getMyProfile().catch(() => null),
      getRegistrationStatus().catch(() => null),
      getMyStreak().catch(() => null),
    ]).then(([badgeData, profileData, streakData]) => {
      setBadge(badgeData);
      setProfile(profileData);
      setPlayerNumber((profileData as any)?.player_number ?? null);
      setStreak(streakData);
    }).finally(() => setLoading(false));
  }, [user]);

  const displayName = profile?.first_name
    ? `${profile.first_name}${profile.last_name ? ' ' + profile.last_name : ''}`
    : user?.name ?? user?.email ?? 'Player';

  const isMaxBadge = badge && badge.deeds_to_next_badge === null;
  const progressPercent =
    badge && !isMaxBadge && badge.deeds_to_next_badge !== null
      ? Math.round(
          ((badge.total_deeds - (badge.total_deeds - (badge.deeds_to_next_badge === null ? 0 : 0))) /
            (badge.total_deeds + badge.deeds_to_next_badge)) *
            100
        )
      : 100;

  // Simpler progress calc: deeds done toward current tier's goal
  const getProgress = () => {
    if (!badge) return { pct: 0, done: 0, needed: 0 };
    if (isMaxBadge) return { pct: 100, done: badge.total_deeds, needed: 0 };
    const tiers = [0, 5, 10, 25, 50, 75, 100];
    let tierStart = 0;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (badge.total_deeds >= tiers[i]) {
        tierStart = tiers[i];
        break;
      }
    }
    const tierEnd = tierStart + (badge.deeds_to_next_badge ?? 0);
    const done = badge.total_deeds - tierStart;
    const needed = tierEnd - tierStart;
    const pct = needed > 0 ? Math.round((done / needed) * 100) : 100;
    return { pct, done: badge.total_deeds, needed: tierEnd };
  };

  const { pct, done, needed } = getProgress();

  return (
    <div className="min-h-screen" style={{ background: HERO_BG }}>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Top nav */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/game')}
            className="flex items-center gap-1.5 text-white hover:text-emerald-300 transition-colors font-semibold"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Game
          </button>
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-white">
            <Heart className="w-5 h-5 fill-white" />
          </button>
        </div>

        {/* Player header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-white">{displayName}</h1>
          {playerNumber && (
            <p className="text-white/50 font-mono text-sm">GR8-{playerNumber}</p>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Badge card */}
        {!loading && badge && (
          <div
            className={`rounded-2xl p-6 text-center space-y-4 shadow-2xl ${
              isMaxBadge
                ? 'bg-gradient-to-br from-yellow-400/20 to-amber-600/20 border border-yellow-400/40'
                : 'bg-white/10 border border-white/20'
            }`}
          >
            {/* Badge image with glow ring */}
            <div className="flex justify-center">
              <div
                className={`w-28 h-28 rounded-full flex items-center justify-center shadow-lg overflow-hidden ${
                  isMaxBadge
                    ? 'ring-4 ring-yellow-300/70 animate-pulse'
                    : 'ring-4 ring-emerald-400/40'
                }`}
              >
                {BADGE_IMAGES[badge.badge_name] ? (
                  <img
                    src={BADGE_IMAGES[badge.badge_name]}
                    alt={badge.badge_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-6xl">{badge.badge_emoji}</span>
                )}
              </div>
            </div>

            {/* Badge name */}
            <div>
              <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Your Badge</p>
              <p className={`text-2xl font-bold ${isMaxBadge ? 'text-yellow-300' : 'text-white'}`}>
                {badge.badge_name}
              </p>
            </div>

            {/* Total deeds */}
            <div className="bg-white/10 rounded-xl px-4 py-3">
              <p className="text-white/60 text-xs uppercase tracking-widest mb-0.5">Total Deeds Completed</p>
              <p className="text-3xl font-bold text-emerald-300">{badge.total_deeds}</p>
            </div>

            {/* Max badge celebration */}
            {isMaxBadge && (
              <div className="space-y-2">
                <p className="text-yellow-200 font-semibold text-sm">
                  You've reached the highest badge! 👑
                </p>
                <div className="flex justify-center gap-1 text-xl">
                  {'🎉 🌟 🎊 ✨ 🎉'.split(' ').map((e, i) => (
                    <span key={i}>{e}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Progress bar toward next badge */}
            {!isMaxBadge && badge.next_badge_name && (
              <div className="space-y-2 text-left">
                <div className="flex justify-between text-xs text-white/60">
                  <span>{done} / {needed} deeds</span>
                  <span>
                    {badge.deeds_to_next_badge} more to reach{' '}
                    <span className="text-white font-semibold">
                      {badge.next_badge_emoji} {badge.next_badge_name}
                    </span>
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Daily Streak */}
        {!loading && streak && (
          <StreakDisplay streak={streak} />
        )}

        {/* Badge tiers reference */}
        {!loading && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
            <p className="text-white/50 text-xs uppercase tracking-widest mb-3">Badge Tiers</p>
            {[
              { min: 0,   max: 4,    name: 'Newcomer',  emoji: '🌱' },
              { min: 5,   max: 9,    name: 'Starter',   emoji: '⭐' },
              { min: 10,  max: 24,   name: 'Builder',   emoji: '🔨' },
              { min: 25,  max: 49,   name: 'Champion',  emoji: '🏆' },
              { min: 50,  max: 74,   name: 'Hero',      emoji: '🦸' },
              { min: 75,  max: 99,   name: 'Legend',    emoji: '🌟' },
              { min: 100, max: null, name: 'Expert',    emoji: '👑' },
            ].map((tier) => {
              const isActive = badge && badge.badge_name === tier.name;
              return (
                <div
                  key={tier.name}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                    isActive ? 'bg-emerald-500/20 border border-emerald-400/40' : ''
                  }`}
                >
                  {BADGE_IMAGES[tier.name] ? (
                    <img src={BADGE_IMAGES[tier.name]} alt={tier.name} className="w-7 h-7 object-cover rounded-full" />
                  ) : (
                    <span className="text-lg w-7 text-center">{tier.emoji}</span>
                  )}
                  <div className="flex-1">
                    <span className={`text-sm font-medium ${isActive ? 'text-emerald-300' : 'text-white/70'}`}>
                      {tier.name}
                    </span>
                  </div>
                  <span className="text-xs text-white/40 font-mono">
                    {tier.max ? `${tier.min}–${tier.max}` : `${tier.min}+`}
                  </span>
                  {isActive && <span className="text-emerald-400 text-xs font-semibold">YOU</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
