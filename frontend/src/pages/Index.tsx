import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Heart, Star, Trophy, Wallet, Shield, Users, Gift, Medal, LogOut } from 'lucide-react';
import RegistrationModal from '@/components/RegistrationModal';
import { getPublicPrize } from '@/lib/game-utils';

const LOGO_IMAGE = '/assets/havagr8day-bingo-logo.png';
const PATTERN_IMAGE = 'https://mgx-backend-cdn.metadl.com/generate/images/1035418/2026-04-16/mwrzlxiaafbq/good-deeds-pattern.png';
// Sky blue matching the reference card
const HERO_BG = '#4FB3E8';

const Index: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const [prize, setPrize] = useState<{ prize_image_url: string; prize_title: string } | null>(null);

  useEffect(() => {
    getPublicPrize()
      .then((p) => setPrize(p))
      .catch(() => setPrize(null));
  }, []);

  const handleLogin = () => {
    navigate('/login');
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore — context already clears local state
    } finally {
      navigate('/');
    }
  };

  const handlePlay = () => {
    if (user) {
      navigate('/game');
    } else {
      navigate('/login', { state: { from: '/game' } });
    }
  };

  const features = [
    {
      icon: <Heart className="w-8 h-8 text-rose-500" />,
      title: 'Meaningful Acts',
      description: 'Your card features real-world Gr8Day Deeds — from buying a stranger coffee to volunteering at a shelter.',
    },
    {
      icon: <Trophy className="w-8 h-8 text-amber-500" />,
      title: 'Multiple Win Conditions',
      description: 'Choose your challenge: complete One Line, Two Lines, or Four Corners to hit Gr8Day.',
    },
    {
      icon: <Wallet className="w-8 h-8 text-indigo-500" />,
      title: 'Power-Up Squares',
      description: 'Short on time? Purchase select squares to accelerate your path to winning.',
    },
    {
      icon: <Users className="w-8 h-8 text-emerald-500" />,
      title: 'Invite & Earn',
      description: 'Refer friends to the game and unlock free marked squares on your card.',
    },
    {
      icon: <Star className="w-8 h-8 text-violet-500" />,
      title: 'Fresh Weekly Cards',
      description: 'A new personalized card is generated every week — tied to your account for consistency.',
    },
    {
      icon: <Shield className="w-8 h-8 text-cyan-500" />,
      title: 'Progress Saved',
      description: 'Your completed Gr8Day Deeds are tracked automatically. Pick up right where you left off.',
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {user && <RegistrationModal enforce />}
      {/* Header */}
      <header
        className="backdrop-blur-sm border-b border-white/20 sticky top-0 z-40"
        style={{ backgroundColor: `${HERO_BG}ee` }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-7 h-7 text-white fill-red-500" />
            <span className="text-xl font-black text-white tracking-wide drop-shadow">Havagr8day!</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/leaderboard')}
              className="text-white hover:bg-white/20 hover:text-white px-2 sm:px-3"
              title="Leaderboard"
            >
              <Medal className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Leaderboard</span>
            </Button>
            {user ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/wallet')}
                  className="bg-white/10 border-white/40 text-white hover:bg-white/25 hover:text-white px-2 sm:px-3"
                  title="Wallet"
                >
                  <Wallet className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Wallet</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/admin')}
                  className="bg-white/10 border-white/40 text-white hover:bg-white/25 hover:text-white px-2 sm:px-3"
                  title="Admin Panel"
                >
                  <Shield className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Admin</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="bg-white/10 border-white/40 text-white hover:bg-white/25 hover:text-white px-2 sm:px-3"
                  title="Log Out"
                >
                  <LogOut className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Log Out</span>
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={handleLogin}
                className="bg-red-600 hover:bg-red-700 text-white font-bold shadow-md border-2 border-yellow-300 text-xs sm:text-sm px-2 sm:px-3"
              >
                Sign In / Sign Up
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section — sky-blue brand look */}
      <section className="relative overflow-hidden" style={{ backgroundColor: HERO_BG }}>
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: `url(${PATTERN_IMAGE})`, backgroundSize: '400px' }}
        />
        {/* Soft radial highlight */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 50% 20%, rgba(255,255,255,0.25), transparent 60%)',
          }}
        />
        <div className="relative max-w-5xl mx-auto px-4 py-14 sm:py-20 text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img
              src={LOGO_IMAGE}
              alt="Havagr8day!"
              className="max-w-full h-auto w-[320px] sm:w-[480px] lg:w-[560px] drop-shadow-[0_6px_0_rgba(0,0,0,0.25)]"
            />
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-4">
            <Button
              size="lg"
              onClick={handlePlay}
              className="bg-gradient-to-b from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white font-black shadow-xl hover:shadow-2xl transition-all text-2xl sm:text-3xl px-12 py-7 h-auto rounded-2xl border-4 border-yellow-300"
              style={{ textShadow: '0 2px 0 rgba(0,0,0,0.35)' }}
            >
              {user ? 'Join In Now' : 'Get Started'} →
            </Button>
            {!user && (
              <p className="text-white/90 text-sm">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={handleLogin}
                  className="font-bold text-yellow-200 hover:text-yellow-100 underline underline-offset-2"
                >
                  Sign In
                </button>
              </p>
            )}
            <div className="inline-flex items-center gap-2 bg-white/20 text-white px-4 py-1.5 rounded-full text-sm font-semibold mt-3 backdrop-blur-sm border border-white/30">
              <Star className="w-4 h-4 fill-yellow-300 text-yellow-300" /> New game starts every Monday
            </div>
          </div>
        </div>
      </section>

      {/* Prize Showcase */}
      {prize && prize.prize_image_url && (
        <section className="relative py-14 bg-gradient-to-b from-white to-rose-50">
          <div className="max-w-5xl mx-auto px-4">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-rose-100 text-rose-700 px-4 py-1.5 rounded-full text-sm font-medium mb-3">
                <Gift className="w-4 h-4" /> Prize
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
                {prize.prize_title || "This Week's Prize"}
              </h2>
              <p className="text-slate-500 mt-2 max-w-xl mx-auto">
                Complete your bingo card and you could win this.
              </p>
            </div>
            <div className="flex justify-center">
              <div className="relative group">
                <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 via-rose-400 to-emerald-400 rounded-2xl opacity-20 blur-lg group-hover:opacity-30 transition-opacity" />
                <img
                  src={prize.prize_image_url}
                  alt={prize.prize_title || 'Current prize'}
                  className="relative rounded-2xl shadow-2xl border-4 border-white max-h-[520px] object-contain bg-white"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center text-slate-800 mb-4">How It Works</h2>
        <p className="text-center text-slate-500 mb-12 max-w-2xl mx-auto">
          A simple, engaging way to build better habits and strengthen your community — one Gr8Day Deed at a time.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <Card key={i} className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="mb-4">{f.icon}</div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm">{f.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Heart className="w-5 h-5 text-indigo-400 fill-indigo-400" />
            <span className="text-white font-bold">Gr8Day Bingo</span>
          </div>
          <p className="text-sm mb-4">Building stronger communities through everyday acts of kindness.</p>
          <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
            <button onClick={() => navigate('/terms')} className="hover:text-slate-300 underline underline-offset-2">
              Terms of Service
            </button>
            <span>·</span>
            <button onClick={() => navigate('/privacy')} className="hover:text-slate-300 underline underline-offset-2">
              Privacy Policy
            </button>
            <span>·</span>
            <a href="mailto:support@havagr8day.com" className="hover:text-slate-300 underline underline-offset-2">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;