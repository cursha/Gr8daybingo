import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MyTeamData, PlayerBadge, getMyTeam, getMyProfile, TeamMemberCard } from '@/lib/game-utils';
import { downloadTeamCardsPdf } from '@/lib/bingo-pdf';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, Users, Crown, Printer, ArrowLeftRight, Heart } from 'lucide-react';
import Footer from '@/components/Footer';

const WIN_CONDITION_LABELS: Record<string, string> = {
  one_line: 'One Line',
  two_lines: 'Two Lines',
  four_corners: 'Four Corners',
  full_card: 'Full Card',
};

function displayName(m: { first_name: string | null; last_name: string | null; username?: string | null; player_number: number | null }): string {
  const name = [m.first_name, m.last_name].filter(Boolean).join(' ');
  return name || m.username || (m.player_number ? `GR8-${m.player_number}` : 'Member');
}

const BADGE_COLORS: Record<string, string> = {
  Newcomer: 'text-slate-400',
  Starter: 'text-yellow-500',
  Builder: 'text-orange-500',
  Champion: 'text-amber-500',
  Hero: 'text-blue-500',
  Legend: 'text-purple-500',
  Expert: 'text-emerald-500',
};

const TeamPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam] = useState<MyTeamData | null>(null);
  const [badge, setBadge] = useState<PlayerBadge | null>(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    Promise.all([getMyTeam(), getMyProfile()])
      .then(([teamRes, profileRes]) => {
        setTeam(teamRes.team);
        setBadge(profileRes);
      })
      .catch(() => toast.error('Could not load team data'))
      .finally(() => setLoading(false));
  }, [user, navigate]);

  const handlePrintTeam = async () => {
    if (!team) return;
    setPrinting(true);
    try {
      const membersWithCards: TeamMemberCard[] = (team.members ?? [])
        .filter(m => m.card && m.card.cells?.length > 0)
        .map(m => ({
          playerName: displayName(m),
          playerNumber: m.player_number ?? 0,
          cells: m.card!.cells as any,
          completedCells: m.card!.completed_cells ?? [],
          purchasedCells: m.card!.purchased_cells ?? [],
          referralCells: m.card!.referral_cells ?? [],
          weekYear: m.card!.week_year,
        }));
      if (membersWithCards.length === 0) {
        toast.error('No team members have cards yet.');
        return;
      }
      const winLabel = team.members[0]?.card?.win_condition
        ? WIN_CONDITION_LABELS[team.members[0].card.win_condition] || team.members[0].card.win_condition
        : undefined;
      downloadTeamCardsPdf(team.team_name, membersWithCards, { winConditionLabel: winLabel });
      toast.success('Team card PDF downloading…');
    } catch {
      toast.error('Could not generate team PDF.');
    } finally {
      setPrinting(false);
    }
  };

  const isCaptain = badge?.is_captain && badge?.captain_of_team?.id === String(team?.id);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button onClick={() => navigate('/game')} className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-1.5 text-white font-bold text-sm">
          <Heart className="w-4 h-4 text-rose-400 fill-rose-400" />
          Havagr8day Bingo
        </div>
        <div className="w-16" />
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-4">
        {loading ? (
          <div className="text-white/50 text-center py-16">Loading team…</div>
        ) : !team ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/50 text-sm">You're not on a team yet.</p>
            <p className="text-white/30 text-xs mt-1">Ask an admin to add you to a team.</p>
          </div>
        ) : (
          <>
            {/* Team header */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Users className="w-5 h-5 text-indigo-300" />
                <h1 className="text-xl font-black text-white">{team.team_name}</h1>
              </div>
              <p className="text-white/40 text-xs">Team #{team.team_number} · {team.week_year}</p>
              {team.captain && (
                <div className="flex items-center justify-center gap-1 mt-2 text-amber-300 text-xs font-semibold">
                  <Crown className="w-3.5 h-3.5" />
                  Captain: {displayName(team.captain)}
                </div>
              )}
            </div>

            {/* Members */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <h2 className="text-sm font-bold text-white/80 uppercase tracking-wider">Members ({team.members.length})</h2>
              </div>
              <div className="divide-y divide-white/5">
                {team.members.map(m => {
                  const completed = (m.card?.completed_cells ?? []).length;
                  const isMe = m.user_id === (user as any)?.sub || m.user_id === (user as any)?.id;
                  const isCap = team.captain?.id === m.user_id;
                  return (
                    <div key={m.user_id} className={`flex items-center justify-between px-4 py-3 ${isMe ? 'bg-indigo-500/10' : ''}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-700/40 flex items-center justify-center text-xs font-black text-indigo-300">
                          {m.player_number ?? '?'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-white">{displayName(m)}</span>
                            {isCap && <Crown className="w-3 h-3 text-amber-400" />}
                            {isMe && <span className="text-[10px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded font-bold">You</span>}
                          </div>
                          <p className="text-xs text-white/40">{m.card ? `${completed} squares done` : 'No card yet'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={handlePrintTeam}
                disabled={printing}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
              >
                <Printer className="w-4 h-4 mr-2" />
                {printing ? 'Generating PDF…' : 'Print Team Card (2×2)'}
              </Button>
              <Button
                onClick={() => navigate('/trade')}
                variant="outline"
                className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10"
              >
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                Trade Squares
              </Button>
            </div>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default TeamPage;
