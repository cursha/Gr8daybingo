import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DeedItem,
  PendingDeed,
  PrizeClaim,
  CellMarkLogEntry,
  adminVerify,
  getAdminConfig,
  updateAdminConfig,
  getAdminDeeds,
  createAdminDeed,
  updateAdminDeed,
  deleteAdminDeed,
  getAdminPendingDeeds,
  approvePendingDeed,
  rejectPendingDeed,
  deletePendingDeed,
  importDeeds,
  getAdminPrizeClaims,
  updatePrizeClaimStatus,
  getAdminMembers,
  MemberItem,
  adminGetCellMarkLog,
  adminVoidCell,
} from '@/lib/game-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Heart, Lock, Settings, Plus, Trash2, Save, Edit2, X, Target, Inbox, Check, XCircle, Lightbulb, Gift, Upload, Download, FileSpreadsheet, Printer, Trophy, Mail, Users } from 'lucide-react';

const WIN_CONDITIONS = [
  { id: 'one_line', name: 'One Line', description: 'Complete 5 in a row (horizontal, vertical, or diagonal)' },
  { id: 'two_lines', name: 'Two Lines', description: 'Complete any two full lines' },
  { id: 'four_corners', name: 'Four Corners', description: 'Complete all four corner squares' },
  { id: 'x_pattern', name: 'X Pattern', description: 'Complete both diagonals forming an X across the card' },
  { id: 'around_the_edges', name: 'Around the Edges', description: 'Complete all 16 perimeter squares around the card' },
  { id: 'fill_card', name: 'Fill the Card', description: 'Complete every square on the entire card' },
];

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Config state
  const [configs, setConfigs] = useState<Record<string, { value: string; description: string }>>({});
  const [editConfigs, setEditConfigs] = useState<Record<string, string>>({});

  // Deeds state
  const [deeds, setDeeds] = useState<DeedItem[]>([]);
  const [newDeed, setNewDeed] = useState({ deed_text: '', deed_text_long: '', category: '', complexity: '', quantity: '1' });
  const [editingDeed, setEditingDeed] = useState<number | null>(null);
  const [editDeedData, setEditDeedData] = useState({ deed_text: '', deed_text_long: '', category: '', complexity: '', quantity: '1' });

  // Export / import state
  const [exportCategoryFilter, setExportCategoryFilter] = useState('all');
  const [exportComplexityFilter, setExportComplexityFilter] = useState('all');
  const [exportSortBy, setExportSortBy] = useState<'category' | 'az'>('category');
  const [importLoading, setImportLoading] = useState(false);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  // Pending deed suggestions state
  const [pendingDeeds, setPendingDeeds] = useState<PendingDeed[]>([]);
  const [pendingFilter, setPendingFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Prize claims state
  const [prizeClaims, setPrizeClaims] = useState<PrizeClaim[]>([]);

  // Member list state
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [memberChallengeFilter, setMemberChallengeFilter] = useState('all');

  // Void cell state
  const [markLogs, setMarkLogs] = useState<CellMarkLogEntry[]>([]);
  const [voidCardId, setVoidCardId] = useState('');
  const [voidCellIndex, setVoidCellIndex] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);

  const handleLogin = async () => {
    setAuthLoading(true);
    try {
      await adminVerify(password);
      setAuthenticated(true);
      toast.success('Admin access granted');
    } catch {
      toast.error('Invalid password');
    } finally {
      setAuthLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [configData, deedsData] = await Promise.all([getAdminConfig(), getAdminDeeds()]);
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
      setDeeds(deedsData.deeds || []);
    } catch (err: any) {
      toast.error('Failed to load admin data');
    }
  };

  const loadPendingDeeds = async (filter: 'pending' | 'approved' | 'rejected' | 'all' = pendingFilter) => {
    try {
      const res = await getAdminPendingDeeds(filter);
      setPendingDeeds(res.pending_deeds || []);
    } catch {
      toast.error('Failed to load Gr8Day Deed suggestions');
    }
  };

  const loadPrizeClaims = async () => {
    try {
      const res = await getAdminPrizeClaims();
      setPrizeClaims(res.claims || []);
    } catch {
      // silent
    }
  };

  const handleUpdateClaimStatus = async (id: number, status: string) => {
    try {
      await updatePrizeClaimStatus(id, status);
      toast.success('Claim status updated');
      await loadPrizeClaims();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update claim');
    }
  };

  const loadMembers = async () => {
    try {
      const res = await getAdminMembers();
      setMembers(res.members || []);
    } catch {
      // silent
    }
  };

  const loadMarkLogs = async () => {
    try {
      const logs = await adminGetCellMarkLog(100);
      setMarkLogs(logs);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    if (authenticated) {
      loadData();
      loadPendingDeeds('pending');
      loadPrizeClaims();
      loadMembers();
      loadMarkLogs();
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) {
      loadPendingDeeds(pendingFilter);
    }
  }, [pendingFilter]);

  const handleVoidCell = async () => {
    const cardId = parseInt(voidCardId.trim());
    const cellIndex = parseInt(voidCellIndex.trim());
    if (isNaN(cardId) || isNaN(cellIndex)) {
      toast.error('Card ID and cell index must be numbers.');
      return;
    }
    if (!voidReason.trim()) {
      toast.error('Please enter a reason for voiding this cell.');
      return;
    }
    setVoidLoading(true);
    try {
      await adminVoidCell(cardId, cellIndex, voidReason.trim());
      toast.success(`Cell ${cellIndex} on card ${cardId} voided.`);
      setVoidCardId('');
      setVoidCellIndex('');
      setVoidReason('');
      loadMarkLogs();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to void cell.');
    } finally {
      setVoidLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approvePendingDeed(id);
      toast.success('Gr8Day Deed approved and added to the active pool!');
      await Promise.all([loadPendingDeeds(pendingFilter), loadData()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to approve suggestion');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectPendingDeed(id);
      toast.success('Suggestion rejected');
      await loadPendingDeeds(pendingFilter);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject suggestion');
    }
  };

  const handleDeletePending = async (id: number) => {
    try {
      await deletePendingDeed(id);
      toast.success('Suggestion removed');
      await loadPendingDeeds(pendingFilter);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete suggestion');
    }
  };

  const handleSaveConfig = async () => {
    try {
      await updateAdminConfig(editConfigs);
      toast.success('Configuration saved!');
      await loadData();
    } catch {
      toast.error('Failed to save config');
    }
  };

  const handleAddDeed = async () => {
    if (!newDeed.deed_text.trim()) {
      toast.error('Gr8Day Deed text is required');
      return;
    }
    try {
      await createAdminDeed({
        deed_text: newDeed.deed_text.trim(),
        deed_text_long: newDeed.deed_text_long.trim() || undefined,
        category: newDeed.category.trim(),
        is_active: true,
        complexity: newDeed.complexity ? parseInt(newDeed.complexity) : undefined,
        quantity: newDeed.quantity ? parseInt(newDeed.quantity) : 1,
      });
      setNewDeed({ deed_text: '', deed_text_long: '', category: '', complexity: '', quantity: '1' });
      toast.success('Gr8Day Deed added!');
      await loadData();
    } catch {
      toast.error('Failed to add Gr8Day Deed');
    }
  };

  const handleUpdateDeed = async (id: number) => {
    try {
      await updateAdminDeed(id, {
        ...editDeedData,
        complexity: editDeedData.complexity ? parseInt(editDeedData.complexity) : null,
        quantity: editDeedData.quantity ? parseInt(editDeedData.quantity) : 1,
      });
      setEditingDeed(null);
      toast.success('Gr8Day Deed updated!');
      await loadData();
    } catch {
      toast.error('Failed to update Gr8Day Deed');
    }
  };

  const handleDeleteDeed = async (id: number) => {
    try {
      await deleteAdminDeed(id);
      toast.success('Gr8Day Deed deleted');
      await loadData();
    } catch {
      toast.error('Failed to delete Gr8Day Deed');
    }
  };

  const handleToggleActive = async (deed: DeedItem) => {
    try {
      await updateAdminDeed(deed.id, { is_active: !deed.is_active });
      toast.success(deed.is_active ? 'Gr8Day Deed deactivated' : 'Gr8Day Deed activated');
      await loadData();
    } catch {
      toast.error('Failed to toggle Gr8Day Deed');
    }
  };

  // ── CSV helpers ──────────────────────────────────────────────────────────────

  function toCsvField(value: string | number | boolean | null | undefined): string {
    const s = String(value ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function getFilteredSortedDeeds(): DeedItem[] {
    let result = [...deeds];
    if (exportCategoryFilter && exportCategoryFilter !== 'all') result = result.filter((d) => d.category === exportCategoryFilter);
    if (exportComplexityFilter && exportComplexityFilter !== 'all') {
      const num = parseInt(exportComplexityFilter);
      result = result.filter((d) => (d.complexity ?? null) === num);
    }
    if (exportSortBy === 'category') {
      result.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.deed_text.localeCompare(b.deed_text));
    } else {
      result.sort((a, b) => a.deed_text.localeCompare(b.deed_text));
    }
    return result;
  }

  function handleDownloadCsv() {
    const filtered = getFilteredSortedDeeds();
    const header = ['id', 'category', 'complexity', 'quantity', 'deed_text', 'deed_text_long', 'is_active'].join(',');
    const rows = filtered.map((d) =>
      [
        toCsvField(d.id),
        toCsvField(d.category),
        toCsvField(d.complexity),
        toCsvField(d.quantity ?? 1),
        toCsvField(d.deed_text),
        toCsvField(d.deed_text_long),
        toCsvField(d.is_active),
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gr8day-deeds-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filtered.length} deed${filtered.length !== 1 ? 's' : ''}`);
  }

  function handlePrint() {
    const filtered = getFilteredSortedDeeds();
    const complexityLabel = (c: number | null | undefined) => {
      if (c === 1) return 'Easy';
      if (c === 3) return 'Medium';
      if (c === 5) return 'Hard';
      if (c != null) return String(c);
      return '—';
    };

    const filterDesc: string[] = [];
    if (exportCategoryFilter && exportCategoryFilter !== 'all') filterDesc.push(`Category: ${exportCategoryFilter}`);
    if (exportComplexityFilter && exportComplexityFilter !== 'all') filterDesc.push(`Complexity: ${complexityLabel(parseInt(exportComplexityFilter))}`);
    filterDesc.push(`Sorted: ${exportSortBy === 'category' ? 'By Category' : 'A – Z'}`);

    const rows = filtered.map((d) => `
      <tr>
        <td>${d.category || '—'}</td>
        <td class="complexity-cell">${complexityLabel(d.complexity)}</td>
        <td>${d.deed_text}</td>
        <td class="desc">${d.deed_text_long || ''}</td>
        <td class="active-cell">${d.is_active ? '✓' : '✗'}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Gr8Day Deeds</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 20px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { font-size: 10px; color: #64748b; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .complexity-cell { width: 60px; white-space: nowrap; }
    .active-cell { width: 40px; text-align: center; }
    .desc { font-size: 10px; color: #64748b; }
    tr:nth-child(even) td { background: #f8fafc; }
    @media print {
      body { padding: 0; }
      @page { margin: 15mm; }
    }
  </style>
</head>
<body>
  <h1>Gr8Day Deeds</h1>
  <p class="meta">${filtered.length} deeds &nbsp;·&nbsp; ${filterDesc.join(' &nbsp;·&nbsp; ')} &nbsp;·&nbsp; ${new Date().toLocaleDateString()}</p>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Complexity</th>
        <th>Deed</th>
        <th>Description</th>
        <th>Active</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked — please allow pop-ups and try again'); return; }
    win.document.write(html);
    win.document.close();
  }

  function parseCsv(text: string): Record<string, string>[] {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const result: string[][] = [[]];
    let i = 0;
    let field = '';
    let inQuotes = false;
    while (i < normalized.length) {
      const ch = normalized[i];
      if (inQuotes) {
        if (ch === '"' && normalized[i + 1] === '"') { field += '"'; i += 2; }
        else if (ch === '"') { inQuotes = false; i++; }
        else { field += ch; i++; }
      } else {
        if (ch === '"') { inQuotes = true; i++; }
        else if (ch === ',') { result[result.length - 1].push(field); field = ''; i++; }
        else if (ch === '\n') { result[result.length - 1].push(field); field = ''; result.push([]); i++; }
        else { field += ch; i++; }
      }
    }
    result[result.length - 1].push(field);
    const rows = result.filter((r) => r.some((f) => f.trim() !== ''));
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = (row[idx] ?? '').trim(); });
      return obj;
    });
  }

  async function handleImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportLoading(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) { toast.error('No valid rows found in CSV'); return; }
      const deeds = rows.map((row) => ({
        id: row['id'] ? parseInt(row['id']) || undefined : undefined,
        deed_text: row['deed_text'] ?? '',
        deed_text_long: row['deed_text_long'] || null,
        category: row['category'] || '',
        complexity: row['complexity'] ? parseInt(row['complexity']) || null : null,
        quantity: row['quantity'] ? parseInt(row['quantity']) || 1 : 1,
        is_active: (row['is_active'] ?? '').trim().toLowerCase() !== 'false',
      }));
      const result = await importDeeds(deeds);
      toast.success(`Import complete — ${result.updated} updated, ${result.created} created${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  }

  const getFilteredMembers = (): MemberItem[] => {
    let result = [...members];
    if (memberChallengeFilter === 'none') {
      result = result.filter((m) => m.challenge_level == null);
    } else if (memberChallengeFilter !== 'all') {
      const lvl = parseInt(memberChallengeFilter);
      result = result.filter((m) => m.challenge_level === lvl);
    }
    return result;
  };

  function handlePrintMembers() {
    const list = getFilteredMembers();
    const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');
    const filterDesc =
      memberChallengeFilter === 'all' ? 'All members'
      : memberChallengeFilter === 'none' ? 'No challenge level set'
      : `Challenge level ${memberChallengeFilter}`;
    const rows = list.map((m) => `
      <tr>
        <td>${esc(m.name) || '—'}</td>
        <td>${esc(m.email) || '—'}</td>
        <td>${esc(m.province_state) || '—'}</td>
        <td>${esc(m.country) || '—'}</td>
        <td class="ctr">${m.challenge_level ?? '—'}</td>
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
  <h1>Gr8Day Members</h1>
  <p class="meta">${list.length} member${list.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${filterDesc} &nbsp;·&nbsp; ${new Date().toLocaleDateString()}</p>
  <table>
    <thead><tr><th>Name</th><th>Email</th><th>Province / State</th><th>Country</th><th>Challenge</th><th>Last Active</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload=function(){window.print();}</script>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) { toast.error('Pop-up blocked — please allow pop-ups and try again'); return; }
    win.document.write(html);
    win.document.close();
  }

  const uniqueCategories = [...new Set(deeds.map((d) => d.category).filter(Boolean))].sort();

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
            <Input
              type="password"
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
          </CardContent>
        </Card>
      </div>
    );
  }

  const configFields = [
    { key: 'signup_bonus_amount', label: 'Signup Bonus Amount ($)', type: 'number' },
    { key: 'dollar1_pct', label: '$0.50 Square Percentage', type: 'number' },
    { key: 'dollar2_pct', label: '$1.00 Square Percentage', type: 'number' },
    { key: 'dollar5_pct', label: '$2.00 Square Percentage', type: 'number' },
    { key: 'secret_reward_1_pct', label: 'Secret Square: $1 Reward %', type: 'number' },
    { key: 'secret_reward_2_pct', label: 'Secret Square: $2 Reward %', type: 'number' },
    { key: 'secret_reward_5_pct', label: 'Secret Square: $5 Reward %', type: 'number' },
  ];

  const prizeImageUrl = editConfigs['prize_image_url'] || '';
  const prizeTitle = editConfigs['prize_title'] || '';

  const currentWinCondition = editConfigs['win_condition'] || 'one_line';
  const selectedWC = WIN_CONDITIONS.find((wc) => wc.id === currentWinCondition);

  return (
    <div className="min-h-screen bg-slate-50">
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

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Member List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-2">
                <Users className="w-5 h-5 text-sky-500" />
                Members ({members.length})
              </span>
              <div className="flex items-center gap-2">
                <Select value={memberChallengeFilter} onValueChange={setMemberChallengeFilter}>
                  <SelectTrigger className="w-44 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All challenge levels</SelectItem>
                    <SelectItem value="1">Level 1 - Easiest</SelectItem>
                    <SelectItem value="2">Level 2 - Easy</SelectItem>
                    <SelectItem value="3">Level 3 - Medium</SelectItem>
                    <SelectItem value="4">Level 4 - Hard</SelectItem>
                    <SelectItem value="5">Level 5 - Hardest</SelectItem>
                    <SelectItem value="none">No level set</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handlePrintMembers} disabled={members.length === 0}>
                  <Printer className="w-4 h-4 mr-1" /> Print / PDF
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500 mb-3">
              Every registered player. {getFilteredMembers().length} shown with the current filter.
            </p>
            {members.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm flex flex-col items-center gap-2">
                <Users className="w-8 h-8 text-slate-300" />
                No members yet.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Location</th>
                        <th className="px-3 py-2 text-center">Challenge</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {getFilteredMembers().map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <span className="font-medium text-slate-800">{m.name || '—'}</span>
                            {m.role === 'admin' && (
                              <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">admin</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {m.email ? <a href={`mailto:${m.email}`} className="text-indigo-600 hover:underline">{m.email}</a> : '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {[m.province_state, m.country].filter(Boolean).join(', ') || '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {m.challenge_level != null ? (
                              <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-semibold">{m.challenge_level}</span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Void Cell */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              Void a Cell
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              Remove a marked cell from a player's card. This cannot be undone and is logged for audit purposes.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Card ID</label>
                <Input
                  placeholder="e.g. 42"
                  value={voidCardId}
                  onChange={(e) => setVoidCardId(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Cell Index (0–24)</label>
                <Input
                  placeholder="e.g. 12"
                  value={voidCellIndex}
                  onChange={(e) => setVoidCellIndex(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Reason (required)</label>
              <Input
                placeholder="e.g. Player admitted they didn't complete the deed"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              />
            </div>
            <Button
              onClick={handleVoidCell}
              disabled={voidLoading}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {voidLoading ? 'Voiding…' : 'Void Cell'}
            </Button>

            {markLogs.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">Recent mark activity (last 100)</p>
                <div className="max-h-64 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left">When</th>
                        <th className="px-2 py-1.5 text-left">Player</th>
                        <th className="px-2 py-1.5 text-left">Card</th>
                        <th className="px-2 py-1.5 text-left">Cell</th>
                        <th className="px-2 py-1.5 text-left">Action</th>
                        <th className="px-2 py-1.5 text-left">Note / Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {markLogs.map((log) => (
                        <tr key={log.id} className={log.action === 'void' ? 'bg-red-50' : 'hover:bg-slate-50'}>
                          <td className="px-2 py-1.5 text-slate-500">{new Date(log.created_at).toLocaleString()}</td>
                          <td className="px-2 py-1.5">{log.users?.username ?? log.user_id.slice(0, 8)}</td>
                          <td className="px-2 py-1.5">{log.card_id}</td>
                          <td className="px-2 py-1.5">{log.cell_index}</td>
                          <td className="px-2 py-1.5">
                            <span className={`font-semibold ${log.action === 'void' ? 'text-red-600' : 'text-emerald-600'}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-slate-500">{log.note ?? log.void_reason ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Game Mode Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-violet-500" />
              Game Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              Choose the active game mode for all players. This determines the win condition for everyone's bingo card.
            </p>
            <Select
              value={currentWinCondition}
              onValueChange={(value) =>
                setEditConfigs((prev) => ({ ...prev, win_condition: value }))
              }
            >
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder="Select game mode" />
              </SelectTrigger>
              <SelectContent>
                {WIN_CONDITIONS.map((wc) => (
                  <SelectItem key={wc.id} value={wc.id}>
                    {wc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedWC && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-700">
                <strong>{selectedWC.name}:</strong> {selectedWC.description}
              </div>
            )}
            <Button onClick={handleSaveConfig} className="bg-violet-600 hover:bg-violet-700 text-white">
              <Save className="w-4 h-4 mr-1" /> Save Game Mode
            </Button>
          </CardContent>
        </Card>

        {/* Prize Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-rose-500" />
              Prize
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              Showcase this game's prize on the homepage and game board. Paste a direct image URL (PNG/JPG/WebP). Recommended size around 800×600.
            </p>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Prize Title</label>
              <Input
                type="text"
                placeholder="e.g. This Week's Prize: $100 Amazon Gift Card"
                value={prizeTitle}
                onChange={(e) =>
                  setEditConfigs((prev) => ({ ...prev, prize_title: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Prize Image URL</label>
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://example.com/prize.png"
                  value={prizeImageUrl}
                  onChange={(e) =>
                    setEditConfigs((prev) => ({ ...prev, prize_image_url: e.target.value }))
                  }
                  className="flex-1"
                />
                {prizeImageUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setEditConfigs((prev) => ({ ...prev, prize_image_url: '' }))}
                    title="Clear"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Upload className="w-3 h-3" /> Host your image anywhere (e.g. Imgur, Cloudinary, S3) and paste the direct link here.
              </p>
            </div>

            {prizeImageUrl && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-xs font-medium text-slate-500 mb-2">Preview</p>
                <div className="flex justify-center">
                  <img
                    src={prizeImageUrl}
                    alt="Prize preview"
                    className="max-h-48 rounded-lg shadow-md border border-white"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.opacity = '0.3';
                    }}
                  />
                </div>
              </div>
            )}

            <Button onClick={handleSaveConfig} className="bg-rose-600 hover:bg-rose-700 text-white">
              <Save className="w-4 h-4 mr-1" /> Save Prize
            </Button>
          </CardContent>
        </Card>

        {/* Game Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-500" />
              Game Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-sm text-sky-700">
              <strong>Note:</strong> Each player's card now gets a randomized number of <em>purchasable squares</em> (1–3) and <em>referral-free squares</em> (0–2) automatically, so those counts are no longer configurable here.
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {configFields.map((field) => (
                <div key={field.key}>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">{field.label}</label>
                  <Input
                    type={field.type}
                    value={editConfigs[field.key] || ''}
                    onChange={(e) =>
                      setEditConfigs((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                  />
                  {configs[field.key]?.description && (
                    <p className="text-xs text-slate-400 mt-1">{configs[field.key].description}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              <strong>Note:</strong> $0.50 + $1.00 + $2.00 percentages should add up to 100%. These control the price distribution of purchasable squares.
            </div>
            <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-lg p-3 text-sm text-fuchsia-700">
              <strong>Secret Square:</strong> Every card has one hidden square that secretly awards $1, $2, or $5 to the player's wallet the first time it's marked. The three percentages above should add up to 100%.
            </div>
            <Button onClick={handleSaveConfig} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Save className="w-4 h-4 mr-1" /> Save Configuration
            </Button>
          </CardContent>
        </Card>

        {/* Prize Claims */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Prize Claims ({prizeClaims.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500 mb-3">
              Players who won bingo and submitted a claim. Update the status after contacting them.
            </p>
            {prizeClaims.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm flex flex-col items-center gap-2">
                <Trophy className="w-8 h-8 text-slate-300" />
                No prize claims yet.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto divide-y">
                  {prizeClaims.map((claim) => (
                    <div key={claim.id} className="px-3 py-3 text-sm hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <p className="font-semibold text-slate-800">{claim.full_name}</p>
                          <p className="text-slate-500 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <a href={`mailto:${claim.email}`} className="text-indigo-600 hover:underline">{claim.email}</a>
                          </p>
                          {claim.phone && <p className="text-slate-500 text-xs">📞 {claim.phone}</p>}
                          {claim.mailing_address && <p className="text-slate-500 text-xs">📍 {claim.mailing_address}</p>}
                          {claim.notes && <p className="text-slate-400 italic text-xs">"{claim.notes}"</p>}
                          <p className="text-xs text-slate-400">
                            Week {claim.week_year} · {claim.created_at ? new Date(claim.created_at).toLocaleDateString() : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <select
                            value={claim.status}
                            onChange={(e) => handleUpdateClaimStatus(claim.id, e.target.value)}
                            className={`text-xs border rounded px-2 py-1 font-semibold ${
                              claim.status === 'fulfilled' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              claim.status === 'contacted' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              claim.status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            <option value="pending">Pending</option>
                            <option value="contacted">Contacted</option>
                            <option value="fulfilled">Fulfilled</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gr8Day Deed Suggestions (Pending Approval) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-2">
                <Inbox className="w-5 h-5 text-amber-500" />
                Gr8Day Deed Suggestions ({pendingDeeds.length})
              </span>
              <Select value={pendingFilter} onValueChange={(v) => setPendingFilter(v as any)}>
                <SelectTrigger className="w-36 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500 mb-3">
              Users can suggest new Gr8Day Deeds from the game page. Approve to add them to the active Gr8Day Deed pool,
              or reject/remove unwanted suggestions.
            </p>
            {pendingDeeds.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm flex flex-col items-center gap-2">
                <Lightbulb className="w-8 h-8 text-slate-300" />
                No {pendingFilter === 'all' ? '' : pendingFilter} suggestions at the moment.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[360px] overflow-y-auto divide-y">
                  {pendingDeeds.map((p) => (
                    <div key={p.id} className="px-3 py-2.5 text-sm hover:bg-slate-50">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-800 font-medium">{p.deed_text}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                            {p.category && (
                              <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                                {p.category}
                              </span>
                            )}
                            {p.suggested_by_name && <span>by {p.suggested_by_name}</span>}
                            {p.created_at && (
                              <span>{new Date(p.created_at).toLocaleDateString()}</span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded font-bold ${
                                p.status === 'approved'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : p.status === 'rejected'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {p.status}
                            </span>
                          </div>
                          {p.notes && (
                            <p className="text-xs text-slate-500 italic mt-1">Note: {p.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {p.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleApprove(p.id)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2"
                              >
                                <Check className="w-3.5 h-3.5 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReject(p.id)}
                                className="h-8 px-2 text-rose-600 border-rose-200 hover:bg-rose-50"
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeletePending(p.id)}
                            className="h-8 w-8 p-0"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deeds Export / Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
              Deeds Export / Import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              Download all deeds as a CSV file, edit in Excel (set complexity, fix text, reorder), then re-upload to save your changes.
            </p>

            {/* Filters */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Category</label>
                <Select value={exportCategoryFilter} onValueChange={setExportCategoryFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {uniqueCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Complexity</label>
                <Select value={exportComplexityFilter} onValueChange={setExportComplexityFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All complexities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All complexities</SelectItem>
                    <SelectItem value="1">Easy (1)</SelectItem>
                    <SelectItem value="3">Medium (3)</SelectItem>
                    <SelectItem value="5">Hard (5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Sort by</label>
                <Select value={exportSortBy} onValueChange={(v) => setExportSortBy(v as 'category' | 'az')}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="az">A – Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row count preview */}
            <p className="text-xs text-slate-500">
              {getFilteredSortedDeeds().length} deed{getFilteredSortedDeeds().length !== 1 ? 's' : ''} match the current filters
            </p>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleDownloadCsv}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={deeds.length === 0}
              >
                <Download className="w-4 h-4 mr-1" /> Download CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => importInputRef.current?.click()}
                disabled={importLoading}
              >
                <Upload className="w-4 h-4 mr-1" />
                {importLoading ? 'Importing…' : 'Upload CSV'}
              </Button>
              <Button
                variant="outline"
                onClick={handlePrint}
                disabled={deeds.length === 0}
              >
                <Printer className="w-4 h-4 mr-1" /> Print / PDF
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleImportCsv}
              />
            </div>

            {/* CSV column guide */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700">CSV columns (do not rename headers):</p>
              <p><span className="font-mono bg-white px-1 rounded">id</span> — leave as-is to update existing rows. If blank, we match by <strong>deed_text</strong>: a deed with the same name is updated, not duplicated. A brand-new name creates a new deed.</p>
              <p><span className="font-mono bg-white px-1 rounded">category</span> — e.g. Generosity, Community, Charity</p>
              <p><span className="font-mono bg-white px-1 rounded">complexity</span> — 1=Easy, 3=Medium, 5=Hard (or leave blank)</p>
              <p><span className="font-mono bg-white px-1 rounded">quantity</span> — how many times the player must do it (1 or more). Use 1 for normal deeds, or 2, 3, 5, 10… for "do it multiple times" deeds.</p>
              <p><span className="font-mono bg-white px-1 rounded">deed_text</span> — short text shown on the bingo square (required)</p>
              <p><span className="font-mono bg-white px-1 rounded">deed_text_long</span> — long description shown on hover (optional)</p>
              <p><span className="font-mono bg-white px-1 rounded">is_active</span> — true or false (TRUE/FALSE in any case works)</p>
            </div>
          </CardContent>
        </Card>

        {/* Gr8Day Deeds Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500" />
                Gr8Day Deeds ({deeds.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Add new Gr8Day Deed */}
            <div className="mb-4 space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50/60">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Add a new Gr8Day Deed
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Short Gr8Day Deed text (shown on the bingo square)"
                  value={newDeed.deed_text}
                  onChange={(e) => setNewDeed((prev) => ({ ...prev, deed_text: e.target.value }))}
                  className="flex-1"
                />
                <Input
                  placeholder="Category"
                  value={newDeed.category}
                  onChange={(e) => setNewDeed((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-32 sm:w-40"
                />
                <select
                  value={newDeed.complexity}
                  onChange={(e) => setNewDeed((prev) => ({ ...prev, complexity: e.target.value }))}
                  className="w-28 sm:w-32 border border-input rounded-md bg-background px-2 text-sm"
                >
                  <option value="">Complexity</option>
                  <option value="1">1 – Easy</option>
                  <option value="2">2</option>
                  <option value="3">3 – Medium</option>
                  <option value="4">4</option>
                  <option value="5">5 – Hard</option>
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500 whitespace-nowrap">Do it</span>
                  <Input
                    type="number"
                    min={1}
                    value={newDeed.quantity}
                    onChange={(e) => setNewDeed((prev) => ({ ...prev, quantity: e.target.value }))}
                    className="w-16"
                    title="How many times the player must do this deed"
                  />
                  <span className="text-xs text-slate-500">×</span>
                </div>
              </div>
              <Textarea
                placeholder="Long description (shown when a player hovers the square — optional but recommended)"
                value={newDeed.deed_text_long}
                onChange={(e) =>
                  setNewDeed((prev) => ({ ...prev, deed_text_long: e.target.value }))
                }
                className="min-h-[64px] text-sm"
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleAddDeed}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Gr8Day Deed
                </Button>
              </div>
            </div>

            {/* Gr8Day Deeds list */}
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto divide-y">
                {deeds.map((deed) => (
                  <div
                    key={deed.id}
                    className={`px-3 py-2.5 text-sm ${
                      !deed.is_active ? 'bg-slate-50 opacity-60' : 'bg-white'
                    }`}
                  >
                    {editingDeed === deed.id ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            value={editDeedData.deed_text}
                            onChange={(e) =>
                              setEditDeedData((prev) => ({ ...prev, deed_text: e.target.value }))
                            }
                            className="flex-1 h-8 text-sm"
                            placeholder="Short deed text"
                          />
                          <Input
                            value={editDeedData.category}
                            onChange={(e) =>
                              setEditDeedData((prev) => ({ ...prev, category: e.target.value }))
                            }
                            className="w-28 h-8 text-sm"
                            placeholder="Category"
                          />
                          <select
                            value={editDeedData.complexity}
                            onChange={(e) => setEditDeedData((prev) => ({ ...prev, complexity: e.target.value }))}
                            className="w-24 h-8 text-sm border border-input rounded-md bg-background px-2"
                          >
                            <option value="">Complexity</option>
                            <option value="1">1 – Easy</option>
                            <option value="2">2</option>
                            <option value="3">3 – Medium</option>
                            <option value="4">4</option>
                            <option value="5">5 – Hard</option>
                          </select>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500 whitespace-nowrap">Do it</span>
                            <Input
                              type="number"
                              min={1}
                              value={editDeedData.quantity}
                              onChange={(e) => setEditDeedData((prev) => ({ ...prev, quantity: e.target.value }))}
                              className="w-14 h-8 text-sm"
                              title="How many times the player must do this deed"
                            />
                            <span className="text-xs text-slate-500">×</span>
                          </div>
                        </div>
                        <Textarea
                          value={editDeedData.deed_text_long}
                          onChange={(e) =>
                            setEditDeedData((prev) => ({
                              ...prev,
                              deed_text_long: e.target.value,
                            }))
                          }
                          placeholder="Long description (shown on hover)"
                          className="min-h-[60px] text-xs"
                        />
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUpdateDeed(deed.id)}
                          >
                            <Save className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingDeed(null)}>
                            <X className="w-3.5 h-3.5 mr-1" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-800 font-medium">{deed.deed_text}</p>
                          {deed.deed_text_long ? (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                              {deed.deed_text_long}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-600 italic mt-0.5">
                              No long description yet — add one so players see context on hover.
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            {deed.category && (
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                                {deed.category}
                              </span>
                            )}
                            {deed.complexity != null && (
                              <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                                Complexity {deed.complexity}
                              </span>
                            )}
                            {(deed.quantity ?? 1) > 1 && (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">
                                Do it {deed.quantity}×
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleActive(deed)}
                            className={`h-8 px-2 ${
                              deed.is_active ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                          >
                            {deed.is_active ? 'Active' : 'Inactive'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setEditingDeed(deed.id);
                              setEditDeedData({
                                deed_text: deed.deed_text,
                                deed_text_long: deed.deed_text_long || '',
                                category: deed.category || '',
                                complexity: deed.complexity != null ? String(deed.complexity) : '',
                                quantity: deed.quantity != null ? String(deed.quantity) : '1',
                              });
                            }}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => handleDeleteDeed(deed.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPanel;