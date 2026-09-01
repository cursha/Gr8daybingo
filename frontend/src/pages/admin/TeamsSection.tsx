import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Plus, Save, Edit2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { TeamItem, adminGetTeams, adminCreateTeam, adminUpdateTeam, adminDeleteTeam, adminAddTeamMember, adminRemoveTeamMember } from '@/lib/game-utils';

interface TeamsSectionProps {
  teams: TeamItem[];
  setTeams: React.Dispatch<React.SetStateAction<TeamItem[]>>;
}

const TeamsSection: React.FC<TeamsSectionProps> = ({ teams, setTeams }) => {
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCaptain, setNewTeamCaptain] = useState('');
  const [teamLoading, setTeamLoading] = useState(false);
  const [addMemberTeamId, setAddMemberTeamId] = useState<number | null>(null);
  const [addMemberPN, setAddMemberPN] = useState('');
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamCaptain, setEditTeamCaptain] = useState('');

  const loadTeams = async () => {
    try {
      const t = await adminGetTeams();
      setTeams(t);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) { toast.error('Team name is required.'); return; }
    setTeamLoading(true);
    try {
      const cap = newTeamCaptain.trim() ? parseInt(newTeamCaptain) : undefined;
      await adminCreateTeam(newTeamName.trim(), cap);
      toast.success('Team created.');
      setNewTeamName(''); setNewTeamCaptain('');
      loadTeams();
    } catch (err: any) { toast.error(err?.message || 'Failed to create team.'); }
    finally { setTeamLoading(false); }
  };

  const handleUpdateTeam = async (teamId: number) => {
    try {
      const cap = editTeamCaptain.trim() ? parseInt(editTeamCaptain) : null;
      await adminUpdateTeam(teamId, editTeamName.trim() || undefined, cap);
      toast.success('Team updated.');
      setEditingTeamId(null);
      loadTeams();
    } catch (err: any) { toast.error(err?.message || 'Failed to update team.'); }
  };

  const handleDeleteTeam = async (teamId: number) => {
    if (!confirm('Delete this team? Members will be removed.')) return;
    try {
      await adminDeleteTeam(teamId);
      toast.success('Team deleted.');
      loadTeams();
    } catch (err: any) { toast.error(err?.message || 'Failed to delete team.'); }
  };

  const handleAddMember = async (teamId: number) => {
    const pn = parseInt(addMemberPN);
    if (isNaN(pn)) { toast.error('Enter a valid player number.'); return; }
    try {
      await adminAddTeamMember(teamId, pn);
      toast.success('Player added to team.');
      setAddMemberTeamId(null); setAddMemberPN('');
      loadTeams();
    } catch (err: any) { toast.error(err?.message || 'Failed to add player.'); }
  };

  const handleRemoveMember = async (teamId: number, userId: string) => {
    try {
      await adminRemoveTeamMember(teamId, userId);
      toast.success('Player removed.');
      loadTeams();
    } catch (err: any) { toast.error(err?.message || 'Failed to remove player.'); }
  };

  return (
    <section id="section-teams">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            Teams ({teams.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Create new team */}
          <div className="border rounded-lg p-3 space-y-2 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New Team</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Team name" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
              <Input placeholder="Captain player # (optional)" value={newTeamCaptain} onChange={(e) => setNewTeamCaptain(e.target.value)} />
            </div>
            <Button size="sm" onClick={handleCreateTeam} disabled={teamLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Plus className="w-4 h-4 mr-1" /> Create Team
            </Button>
          </div>

          {/* Team list */}
          {teams.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No teams yet.</p>
          ) : (
            <div className="space-y-3">
              {teams.map((team) => (
                <div key={team.id} className="border rounded-lg p-3 space-y-2">
                  {editingTeamId === team.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} placeholder="Team name" />
                        <Input value={editTeamCaptain} onChange={(e) => setEditTeamCaptain(e.target.value)} placeholder="Captain player #" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdateTeam(team.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                          <Save className="w-3.5 h-3.5 mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingTeamId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs text-slate-400 mr-2">T-{team.team_number}</span>
                        <span className="font-semibold text-slate-800">{team.team_name}</span>
                        {team.captain && (
                          <span className="ml-2 text-xs text-slate-500">
                            Captain: {team.captain.first_name ?? team.captain.username ?? '—'}
                            {team.captain.player_number && <span className="ml-1 font-mono">(GR8-{team.captain.player_number})</span>}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditingTeamId(team.id);
                          setEditTeamName(team.team_name);
                          setEditTeamCaptain(team.captain?.player_number?.toString() ?? '');
                        }}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteTeam(team.id)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Members */}
                  <div className="pl-1 space-y-1">
                    {(team.team_members ?? []).map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">
                          {m.users?.first_name ?? m.users?.username ?? m.user_id.slice(0, 8)}
                          {m.users?.player_number && <span className="ml-1.5 font-mono text-xs text-slate-400">GR8-{m.users.player_number}</span>}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => handleRemoveMember(team.id, m.user_id)}
                          className="h-6 px-2 text-red-400 hover:text-red-600">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    {(team.team_members ?? []).length < 4 && (
                      addMemberTeamId === team.id ? (
                        <div className="flex gap-2 mt-1">
                          <Input className="h-7 text-xs" placeholder="Player #" value={addMemberPN}
                            onChange={(e) => setAddMemberPN(e.target.value)} />
                          <Button size="sm" className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => handleAddMember(team.id)}>Add</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => { setAddMemberTeamId(null); setAddMemberPN(''); }}>Cancel</Button>
                        </div>
                      ) : (
                        <button onClick={() => { setAddMemberTeamId(team.id); setAddMemberPN(''); }}
                          className="text-xs text-indigo-500 hover:text-indigo-700 mt-1">
                          + Add player ({4 - (team.team_members ?? []).length} spot{4 - (team.team_members ?? []).length !== 1 ? 's' : ''} left)
                        </button>
                      )
                    )}
                    {(team.team_members ?? []).length === 0 && addMemberTeamId !== team.id && (
                      <p className="text-xs text-slate-400">No members yet.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default TeamsSection;
