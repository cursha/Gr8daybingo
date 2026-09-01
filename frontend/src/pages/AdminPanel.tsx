import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TeamItem,
  adminVerify,
  adminRequestPasswordReset,
  getAdminConfig,
  updateAdminConfig,
  DeedCategory,
  getAdminDeedCategories,
} from '@/lib/game-utils';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Heart, Lock, Settings, Target, Gift, Trophy, Mail, Users, Ticket, Search, Flame, MessageCircleQuestion, ClipboardList, PenLine, ArrowLeftRight } from 'lucide-react';
import Footer from '@/components/Footer';
import FounderNotesSection from '@/pages/admin/FounderNotesSection';
import WeeklyUpdateEmailsSection from '@/pages/admin/WeeklyUpdateEmailsSection';
import WeeklyDrawResetSection from '@/pages/admin/WeeklyDrawResetSection';
import DrawLeaderboardSection from '@/pages/admin/DrawLeaderboardSection';
import PrizeClaimsSection from '@/pages/admin/PrizeClaimsSection';
import StreaksSection from '@/pages/admin/StreaksSection';
import GameAnnouncementSection from '@/pages/admin/GameAnnouncementSection';
import SquareTradesSection from '@/pages/admin/SquareTradesSection';
import DeedLogSection from '@/pages/admin/DeedLogSection';
import TeamsSection from '@/pages/admin/TeamsSection';
import DrawResultsSection from '@/pages/admin/DrawResultsSection';
import DareYaOutcomesSection from '@/pages/admin/DareYaOutcomesSection';
import CardPickupPromptsSection from '@/pages/admin/CardPickupPromptsSection';
import CardViewerSection from '@/pages/admin/CardViewerSection';
import PlayersSection from '@/pages/admin/PlayersSection';
import GameSettingsSection from '@/pages/admin/GameSettingsSection';
import DeedsSection from '@/pages/admin/DeedsSection';

const ADMIN_SESSION_KEY = 'admin_authenticated';

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem(ADMIN_SESSION_KEY) === 'true'
  );
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Config state
  const [configs, setConfigs] = useState<Record<string, { value: string; description: string }>>({});
  const [editConfigs, setEditConfigs] = useState<Record<string, string>>({});

  // Blackout mode: reveal-probability table is a compound JSON config value,
  // edited as 4 separate fields with its own sum-must-be-100 save gate —
  // same pattern as the I Dare Ya odds table.
  const [blackoutWeights, setBlackoutWeights] = useState<Record<'0' | '1' | '2' | '3', string>>({ '0': '55', '1': '25', '2': '15', '3': '5' });
  const [blackoutWeightsLoaded, setBlackoutWeightsLoaded] = useState(false);

  // Deed categories state
  const [deedCategories, setDeedCategories] = useState<DeedCategory[]>([]);

  const [drawLeaderboardRefreshKey, setDrawLeaderboardRefreshKey] = useState(0);

  // Teams state
  const [teams, setTeams] = useState<TeamItem[]>([]);

  const handleLogin = async () => {
    setAuthLoading(true);
    try {
      await adminVerify(password);
      setAuthenticated(true);
      sessionStorage.setItem(ADMIN_SESSION_KEY, 'true');
      toast.success('Admin access granted');
    } catch (err: any) {
      if (err?.status === 423) {
        toast.error('Too many failed attempts — check your email for an unlock link.');
      } else {
        toast.error('Invalid password');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const handleForgotPassword = async () => {
    setForgotPasswordLoading(true);
    try {
      await adminRequestPasswordReset();
    } catch {
      // Always show the same generic confirmation below — nothing to enumerate here.
    } finally {
      setForgotPasswordLoading(false);
      toast.success('If an admin alert email is configured, a reset link was just sent to it.');
    }
  };

  const loadData = async () => {
    try {
      const configData = await getAdminConfig();
      setConfigs(configData.configs || {});
      const initial: Record<string, string> = {};
      Object.entries(configData.configs || {}).forEach(([key, val]: [string, any]) => {
        initial[key] = val.value;
      });
      // Ensure win_condition has a default
      if (!initial['win_condition']) {
        initial['win_condition'] = 'one_line';
      }
      // Ensure signup_bonus_amount has a default
      if (initial['signup_bonus_amount'] === undefined || initial['signup_bonus_amount'] === '') {
        initial['signup_bonus_amount'] = '15';
      }
      setEditConfigs(initial);
      if (initial['blackout_reveal_probability']) {
        try {
          const parsed = JSON.parse(initial['blackout_reveal_probability']);
          setBlackoutWeights({
            '0': String(parsed['0'] ?? 55), '1': String(parsed['1'] ?? 25),
            '2': String(parsed['2'] ?? 15), '3': String(parsed['3'] ?? 5),
          });
        } catch { /* keep defaults */ }
      }
      setBlackoutWeightsLoaded(true);

      // Load deed categories
      try {
        const catRes = await getAdminDeedCategories();
        setDeedCategories(catRes.categories || []);
      } catch { /* silent */ }

    } catch (err: any) {
      toast.error('Failed to load admin data');
    }
  };

  useEffect(() => {
    if (authenticated) {
      loadData();
    }
  }, [authenticated]);

  const handleSaveConfig = async () => {
    try {
      await updateAdminConfig(editConfigs);
      toast.success('Configuration saved!');
      await loadData();
    } catch {
      toast.error('Failed to save config');
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="w-full max-w-sm mx-4">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <div className="bg-indigo-100 rounded-full p-3">
                <Lock className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
            <CardTitle>Gr8Day Admin Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PasswordInput
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleLogin}
              disabled={authLoading}
            >
              {authLoading ? 'Verifying...' : 'Login'}
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Home
            </Button>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={forgotPasswordLoading}
              className="w-full text-center text-sm text-indigo-600 hover:text-indigo-700 underline underline-offset-2"
            >
              Forgot password?
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Heart className="w-6 h-6 text-indigo-600 fill-indigo-600" />
          <span className="text-lg font-bold text-slate-800">Gr8Day Admin Panel</span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/game')}
              className="text-indigo-700 border-indigo-200 hover:bg-indigo-50"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to My Card
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="text-slate-500"
            >
              Home
            </Button>
          </div>
        </div>
      </header>

      {/* Section Nav */}
      <nav className="bg-white border-b border-slate-200 sticky top-[57px] z-30">
        <div className="max-w-4xl mx-auto px-4 py-2 overflow-x-auto">
          <div className="flex gap-1 w-max">
            {[
              { id: 'section-card-viewer', label: 'Card Viewer', icon: <Search className="w-3.5 h-3.5" /> },
              { id: 'section-players', label: 'Players', icon: <Users className="w-3.5 h-3.5 text-sky-500" /> },
              { id: 'section-teams', label: 'Teams', icon: <Users className="w-3.5 h-3.5 text-indigo-500" /> },
              { id: 'section-deed-log', label: 'Deed Log', icon: <ClipboardList className="w-3.5 h-3.5 text-emerald-500" /> },
              { id: 'section-trades', label: 'Trades', icon: <ArrowLeftRight className="w-3.5 h-3.5 text-amber-500" /> },
              { id: 'section-founder-notes', label: 'Founder Notes', icon: <PenLine className="w-3.5 h-3.5 text-rose-500" /> },
              { id: 'section-game-settings', label: 'Game Settings', icon: <Settings className="w-3.5 h-3.5" /> },
              { id: 'section-streaks', label: 'Streaks', icon: <Flame className="w-3.5 h-3.5" /> },
              { id: 'section-deeds', label: 'Deeds', icon: <Target className="w-3.5 h-3.5" /> },
              { id: 'section-draw', label: 'Draw', icon: <Ticket className="w-3.5 h-3.5" /> },
              { id: 'section-prize-claims', label: 'Prize Claims', icon: <Gift className="w-3.5 h-3.5" /> },
              { id: 'section-announce', label: 'Announce', icon: <Mail className="w-3.5 h-3.5" /> },
              { id: 'section-weekly-updates', label: 'Weekly Updates', icon: <Mail className="w-3.5 h-3.5 text-teal-500" /> },
              { id: 'section-reset', label: 'Reset', icon: <Settings className="w-3.5 h-3.5" /> },
            ].map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 transition-colors"
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <CardViewerSection onDrawEntriesChanged={() => setDrawLeaderboardRefreshKey(k => k + 1)} />

        <PlayersSection editConfigs={editConfigs} />

        <TeamsSection teams={teams} setTeams={setTeams} />

        <DeedLogSection deedCategories={deedCategories} teams={teams} />

        <SquareTradesSection />

        <FounderNotesSection editConfigs={editConfigs} setEditConfigs={setEditConfigs} onSaveConfig={handleSaveConfig} />

        <GameSettingsSection
          editConfigs={editConfigs}
          setEditConfigs={setEditConfigs}
          onSaveConfig={handleSaveConfig}
          configs={configs}
          blackoutWeights={blackoutWeights}
          setBlackoutWeights={setBlackoutWeights}
          deedCategories={deedCategories}
          setDeedCategories={setDeedCategories}
        />

        <StreaksSection editConfigs={editConfigs} setEditConfigs={setEditConfigs} />

        <DeedsSection deedCategories={deedCategories} />

        <DrawResultsSection />

        <DrawLeaderboardSection refreshKey={drawLeaderboardRefreshKey} />

        <PrizeClaimsSection />

        <GameAnnouncementSection editConfigs={editConfigs} setEditConfigs={setEditConfigs} onSaveConfig={handleSaveConfig} />

        <DareYaOutcomesSection />

        <CardPickupPromptsSection />

        <WeeklyUpdateEmailsSection />

        <WeeklyDrawResetSection />
      </div>
      <Footer tone="light" />
    </div>
  );
};

export default AdminPanel;
