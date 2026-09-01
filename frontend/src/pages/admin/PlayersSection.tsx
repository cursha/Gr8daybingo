import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Users, Plus, Printer, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import {
  MemberItem,
  getAdminMembers,
  adminCreatePlayer,
  adminUpdatePlayer,
  adminDeletePlayer,
  getCountries,
  getStates,
  CountryOption,
  StateOption,
} from '@/lib/game-utils';

const NEW_MEMBER_WINDOW_HOURS = 35;
const isNewMember = (createdAt: string | null): boolean => {
  if (!createdAt) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs >= 0 && ageMs < NEW_MEMBER_WINDOW_HOURS * 60 * 60 * 1000;
};

type MemberSortColumn = 'player_number' | 'name' | 'email' | 'location' | 'email_verified' | 'is_active';

interface PlayersSectionProps {
  // Read-only — used only to show the current inactive-days threshold in a
  // help string; that config value is owned/edited by the Game Settings section.
  editConfigs: Record<string, string>;
}

const PlayersSection: React.FC<PlayersSectionProps> = ({ editConfigs }) => {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [memberCountryFilter, setMemberCountryFilter] = useState('all');
  const [memberStateFilter, setMemberStateFilter] = useState('all');
  const [memberActiveFilter, setMemberActiveFilter] = useState('all');
  const [memberSortColumn, setMemberSortColumn] = useState<MemberSortColumn | null>(null);
  const [memberSortDirection, setMemberSortDirection] = useState<'asc' | 'desc'>('asc');

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [playerStates, setPlayerStates] = useState<StateOption[]>([]);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [playerForm, setPlayerForm] = useState({ first_name: '', last_name: '', email: '', username: '', password: '', role: 'user', city: '', country_id: '' as string | number, state_id: '' as string | number, is_trusted: false, is_test: false, is_active: true, excluded_from_draw: false });
  const [playerFormLoading, setPlayerFormLoading] = useState(false);

  const loadMembers = async () => {
    try {
      const res = await getAdminMembers();
      setMembers(res.members || []);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    loadMembers();
    getCountries().then(setCountries).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlayerCountryChange = (countryId: string | number) => {
    setPlayerForm(f => ({ ...f, country_id: countryId, state_id: '' }));
    if (countryId) getStates(Number(countryId)).then(setPlayerStates).catch(() => setPlayerStates([]));
    else setPlayerStates([]);
  };

  const handleAddPlayer = async () => {
    setPlayerFormLoading(true);
    try {
      await adminCreatePlayer({ ...playerForm, country_id: playerForm.country_id ? Number(playerForm.country_id) : undefined, state_id: playerForm.state_id ? Number(playerForm.state_id) : undefined } as any);
      toast.success('Player created');
      setShowAddPlayer(false);
      setPlayerForm({ first_name: '', last_name: '', email: '', username: '', password: '', role: 'user', city: '', country_id: '', state_id: '', is_trusted: false, is_test: false, is_active: true, excluded_from_draw: false });
      await loadMembers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create player');
    } finally {
      setPlayerFormLoading(false);
    }
  };

  const handleEditPlayer = async (id: string) => {
    setPlayerFormLoading(true);
    try {
      await adminUpdatePlayer(id, { ...playerForm, country_id: playerForm.country_id ? Number(playerForm.country_id) : null, state_id: playerForm.state_id ? Number(playerForm.state_id) : null });
      toast.success('Player updated');
      setEditingPlayer(null);
      await loadMembers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update player');
    } finally {
      setPlayerFormLoading(false);
    }
  };

  const handleDeletePlayer = async (id: string, name: string) => {
    if (!window.confirm(`Delete player ${name}? This cannot be undone.`)) return;
    try {
      await adminDeletePlayer(id);
      toast.success('Player deleted');
      await loadMembers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete player');
    }
  };

  const startEditPlayer = (m: MemberItem) => {
    setPlayerForm({ first_name: m.first_name ?? '', last_name: m.last_name ?? '', email: m.email ?? '', username: m.username ?? '', password: '', role: m.role ?? 'user', city: (m as any).city ?? '', country_id: (m as any).country_id ?? '', state_id: (m as any).state_id ?? '', is_trusted: m.is_trusted ?? false, is_test: m.is_test ?? false, is_active: m.is_active ?? true, excluded_from_draw: m.excluded_from_draw ?? false });
    setEditingPlayer(m.id);
    if ((m as any).country_id) getStates(Number((m as any).country_id)).then(setPlayerStates).catch(() => {});
  };

  const getFilteredMembers = (): MemberItem[] => {
    let result = [...members];
    if (memberCountryFilter !== 'all') {
      result = result.filter((m) => (m.country ?? '').toLowerCase() === memberCountryFilter.toLowerCase());
    }
    if (memberStateFilter !== 'all') {
      result = result.filter((m) => (m.province_state ?? '').toLowerCase() === memberStateFilter.toLowerCase());
    }
    if (memberActiveFilter !== 'all') {
      result = result.filter((m) => m.is_active === (memberActiveFilter === 'active'));
    }
    if (memberSortColumn) {
      const dir = memberSortDirection === 'asc' ? 1 : -1;
      const sortValue = (m: MemberItem): string | number => {
        switch (memberSortColumn) {
          case 'player_number': return m.player_number ?? -Infinity;
          case 'name': return (m.name ?? '').toLowerCase();
          case 'email': return (m.email ?? '').toLowerCase();
          case 'location': return [m.city, m.province_state, m.country].filter(Boolean).join(', ').toLowerCase();
          case 'email_verified': return m.email_verified ? 1 : 0;
          case 'is_active': return m.is_active ? 1 : 0;
        }
      };
      result.sort((a, b) => {
        const aVal = sortValue(a);
        const bVal = sortValue(b);
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    }
    return result;
  };

  const handleMemberSort = (column: MemberSortColumn) => {
    if (memberSortColumn === column) {
      setMemberSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setMemberSortColumn(column);
      setMemberSortDirection('asc');
    }
  };

  const MemberSortHeader = ({ column, label, align, tight }: { column: MemberSortColumn; label: string; align?: 'center'; tight?: boolean }) => (
    <th className={`${tight ? 'px-1.5' : 'px-3'} py-2${align === 'center' ? ' text-center' : ''}`}>
      <button
        onClick={() => handleMemberSort(column)}
        className={`flex items-center gap-1 hover:text-slate-800 ${align === 'center' ? 'mx-auto' : ''}`}
      >
        {label}
        {memberSortColumn === column ? (
          memberSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </th>
  );

  const memberCountries = [...new Set(members.map((m) => m.country).filter(Boolean))].sort() as string[];
  const memberStates = [...new Set(
    members
      .filter((m) => memberCountryFilter === 'all' || (m.country ?? '').toLowerCase() === memberCountryFilter.toLowerCase())
      .map((m) => m.province_state)
      .filter(Boolean)
  )].sort() as string[];

  function handlePrintMembers() {
    const list = getFilteredMembers();
    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');
    const filterParts: string[] = [];
    if (memberCountryFilter !== 'all') filterParts.push(memberCountryFilter);
    if (memberStateFilter !== 'all') filterParts.push(memberStateFilter);
    if (memberActiveFilter !== 'all') filterParts.push(memberActiveFilter === 'active' ? 'Active only' : 'Inactive only');
    const filterDesc = filterParts.length > 0 ? filterParts.join(' · ') : 'All players';
    const rows = list.map((m) => `
      <tr>
        <td>${esc(m.name) || '—'}</td>
        <td>${esc(m.email) || '—'}</td>
        <td>${m.player_number ? `GR8-${m.player_number}` : '—'}</td>
        <td>${esc(m.city) || '—'}</td>
        <td>${esc(m.province_state) || '—'}</td>
        <td>${esc(m.country) || '—'}</td>
        <td class="ctr">${m.email_verified ? 'Y' : 'N'}</td>
        <td>${fmtDate(m.last_login)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>Gr8Day Members</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:20px}
  h1{font-size:18px;margin-bottom:4px}
  .meta{font-size:10px;color:#64748b;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  th{background:#f1f5f9;text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e2e8f0}
  td{padding:5px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
  .ctr{text-align:center}
  tr:nth-child(even) td{background:#f8fafc}
  @media print{body{padding:0}@page{margin:15mm}}
</style></head>
<body>
  <h1>Gr8Day Players</h1>
  <p class="meta">${list.length} player${list.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${filterDesc} &nbsp;·&nbsp; ${new Date().toLocaleDateString()}</p>
  <table>
    <thead><tr><th>#</th><th>User</th><th>Email</th><th>City</th><th>Province / State</th><th>Country</th><th>Verified</th><th>Last Active</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=function(){window.print();}</script>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked — please allow pop-ups and try again'); return; }
    win.document.write(html);
    win.document.close();
  }

  return (
    <section id="section-players">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-500" />
              Players ({members.length})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={memberCountryFilter} onValueChange={(v) => { setMemberCountryFilter(v); setMemberStateFilter('all'); }}>
                <SelectTrigger className="w-36 h-8 text-sm">
                  <SelectValue placeholder="All countries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All countries</SelectItem>
                  {memberCountries.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {memberStates.length > 0 && (
                <Select value={memberStateFilter} onValueChange={setMemberStateFilter}>
                  <SelectTrigger className="w-36 h-8 text-sm">
                    <SelectValue placeholder="All states" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All states</SelectItem>
                    {memberStates.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={memberActiveFilter} onValueChange={setMemberActiveFilter}>
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue placeholder="All players" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All players</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handlePrintMembers} disabled={members.length === 0}>
                <Printer className="w-4 h-4 mr-1" /> Print / PDF
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-3">
            <p className="text-xs text-slate-500">Every registered player. {getFilteredMembers().length} shown with the current filter.</p>
            <button onClick={() => { setShowAddPlayer(!showAddPlayer); setEditingPlayer(null); }} className="flex items-center gap-1 text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium">
              <Plus className="w-3.5 h-3.5" /> Add Player
            </button>
          </div>
          {showAddPlayer && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4 space-y-3">
              <p className="text-sm font-semibold text-emerald-800">New Player</p>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="First name" className="border rounded px-2 py-1.5 text-sm" value={playerForm.first_name} onChange={e => setPlayerForm(f => ({ ...f, first_name: e.target.value }))} />
                <input placeholder="Last name" className="border rounded px-2 py-1.5 text-sm" value={playerForm.last_name} onChange={e => setPlayerForm(f => ({ ...f, last_name: e.target.value }))} />
                <input placeholder="Email *" type="email" className="border rounded px-2 py-1.5 text-sm" value={playerForm.email} onChange={e => setPlayerForm(f => ({ ...f, email: e.target.value }))} />
                <input placeholder="Username" className="border rounded px-2 py-1.5 text-sm" value={playerForm.username} onChange={e => setPlayerForm(f => ({ ...f, username: e.target.value }))} />
                <input placeholder="Password *" type="password" className="border rounded px-2 py-1.5 text-sm" value={playerForm.password} onChange={e => setPlayerForm(f => ({ ...f, password: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm text-slate-700 col-span-2">
                  <input type="checkbox" checked={playerForm.role === 'admin'} onChange={e => setPlayerForm(f => ({ ...f, role: e.target.checked ? 'admin' : 'user' }))} />
                  Admin
                </label>
                <input placeholder="City" className="border rounded px-2 py-1.5 text-sm" value={playerForm.city} onChange={e => setPlayerForm(f => ({ ...f, city: e.target.value }))} />
                <select className="border rounded px-2 py-1.5 text-sm" value={playerForm.country_id} onChange={e => handlePlayerCountryChange(e.target.value)}>
                  <option value="">Country…</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {playerStates.length > 0 && (
                  <select className="border rounded px-2 py-1.5 text-sm" value={playerForm.state_id} onChange={e => setPlayerForm(f => ({ ...f, state_id: e.target.value }))}>
                    <option value="">Province/State…</option>
                    {playerStates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddPlayer} disabled={playerFormLoading} className="bg-emerald-600 text-white text-xs px-4 py-1.5 rounded font-medium disabled:opacity-50">{playerFormLoading ? 'Creating…' : 'Create Player'}</button>
                <button onClick={() => setShowAddPlayer(false)} className="text-xs px-4 py-1.5 rounded border font-medium">Cancel</button>
              </div>
            </div>
          )}
          {members.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm flex flex-col items-center gap-2">
              <Users className="w-8 h-8 text-slate-300" />
              No players yet.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                      <MemberSortHeader column="player_number" label="#" />
                      <MemberSortHeader column="name" label="User" />
                      <MemberSortHeader column="email" label="Email" />
                      <MemberSortHeader column="location" label="Location" />
                      <MemberSortHeader column="email_verified" label="Ver" align="center" tight />
                      <MemberSortHeader column="is_active" label="Act" align="center" tight />
                      <th className="px-2 py-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {getFilteredMembers().map((m) => (
                      <React.Fragment key={m.id}>
                        <tr className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-xs text-slate-400 font-mono whitespace-nowrap">
                            {m.player_number ? `GR8-${m.player_number}` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {isNewMember(m.created_at) && (
                              <span className="text-rose-500 font-bold mr-1" title={`Joined within the last ${NEW_MEMBER_WINDOW_HOURS} hours`}>*</span>
                            )}
                            <span className="font-medium text-slate-800 truncate max-w-[15ch] inline-block align-bottom" title={m.name || undefined}>{m.name || '—'}</span>
                            {m.role === 'admin' && (
                              <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">admin</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {m.email ? <a href={`mailto:${m.email}`} className="text-indigo-600 hover:underline">{m.email}</a> : '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {[m.city, m.province_state, m.country].filter(Boolean).join(', ') || '—'}
                          </td>
                          <td className="px-1.5 py-2 text-center">
                            {m.email_verified
                              ? <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">Y</span>
                              : <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold">N</span>}
                          </td>
                          <td className="px-1.5 py-2 text-center" title={m.last_valid_deed_date ? `Last deed: ${m.last_valid_deed_date}` : 'No deed on record'}>
                            {m.is_active
                              ? <span className="text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">Y</span>
                              : <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">N</span>}
                          </td>
                          <td className="px-2 py-2 text-center whitespace-nowrap">
                            <button onClick={() => editingPlayer === m.id ? setEditingPlayer(null) : startEditPlayer(m)} className="text-indigo-600 hover:text-indigo-800 text-xs mr-2 font-medium">{editingPlayer === m.id ? 'Cancel' : 'Edit'}</button>
                            <button onClick={() => handleDeletePlayer(m.id, m.name || m.email || '')} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                          </td>
                        </tr>
                        {editingPlayer === m.id && (
                          <tr className="bg-indigo-50">
                            <td colSpan={7} className="px-4 py-4">
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <input placeholder="First name" className="border rounded px-2 py-1.5 text-sm" value={playerForm.first_name} onChange={e => setPlayerForm(f => ({ ...f, first_name: e.target.value }))} />
                                <input placeholder="Last name" className="border rounded px-2 py-1.5 text-sm" value={playerForm.last_name} onChange={e => setPlayerForm(f => ({ ...f, last_name: e.target.value }))} />
                                <input placeholder="Email" type="email" className="border rounded px-2 py-1.5 text-sm" value={playerForm.email} onChange={e => setPlayerForm(f => ({ ...f, email: e.target.value }))} />
                                <input placeholder="Username" className="border rounded px-2 py-1.5 text-sm" value={playerForm.username} onChange={e => setPlayerForm(f => ({ ...f, username: e.target.value }))} />
                                <input placeholder="City" className="border rounded px-2 py-1.5 text-sm" value={playerForm.city} onChange={e => setPlayerForm(f => ({ ...f, city: e.target.value }))} />
                                <label className="flex items-center gap-2 text-sm text-slate-700 col-span-2">
                                  <input type="checkbox" checked={playerForm.role === 'admin'} onChange={e => setPlayerForm(f => ({ ...f, role: e.target.checked ? 'admin' : 'user' }))} />
                                  Admin
                                </label>
                                <label className="flex items-center gap-2 text-sm text-slate-700 col-span-2">
                                  <input type="checkbox" checked={playerForm.is_trusted} onChange={e => setPlayerForm(f => ({ ...f, is_trusted: e.target.checked }))} />
                                  Trusted (exempt from the daily deed limit)
                                </label>
                                <label className="flex items-center gap-2 text-sm text-slate-700 col-span-2">
                                  <input type="checkbox" checked={playerForm.is_test} onChange={e => setPlayerForm(f => ({ ...f, is_test: e.target.checked }))} />
                                  Test player (can keep playing while Offline Mode is on)
                                </label>
                                <label className="flex items-center gap-2 text-sm text-slate-700 col-span-2">
                                  <input type="checkbox" checked={playerForm.is_active} onChange={e => setPlayerForm(f => ({ ...f, is_active: e.target.checked }))} />
                                  Active (daily sweep sets this to false after {editConfigs['inactive_days_threshold'] || '30'} days without a deed, and back to true once they're playing again)
                                </label>
                                <label className="flex items-center gap-2 text-sm text-slate-700 col-span-2">
                                  <input type="checkbox" checked={playerForm.excluded_from_draw} onChange={e => setPlayerForm(f => ({ ...f, excluded_from_draw: e.target.checked }))} />
                                  Excluded from weekly draw (won't be selected as a winner, even with ballots)
                                </label>
                                <select className="border rounded px-2 py-1.5 text-sm" value={playerForm.country_id} onChange={e => handlePlayerCountryChange(e.target.value)}>
                                  <option value="">Country…</option>
                                  {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                                <select className="border rounded px-2 py-1.5 text-sm" value={playerForm.state_id} onChange={e => setPlayerForm(f => ({ ...f, state_id: e.target.value }))} disabled={playerStates.length === 0}>
                                  <option value="">Province/State…</option>
                                  {playerStates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                              </div>
                              <div className="mt-3 flex gap-2">
                                <button onClick={() => handleEditPlayer(m.id)} disabled={playerFormLoading} className="bg-indigo-600 text-white text-xs px-4 py-1.5 rounded font-medium disabled:opacity-50">{playerFormLoading ? 'Saving…' : 'Save'}</button>
                                <button onClick={() => setEditingPlayer(null)} className="text-xs px-4 py-1.5 rounded border font-medium">Cancel</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default PlayersSection;
