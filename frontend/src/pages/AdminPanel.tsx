import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DeedItem,
  PendingDeed,
  TeamItem,
  adminVerify,
  adminRequestPasswordReset,
  getAdminConfig,
  updateAdminConfig,
  getAdminDeeds,
  createAdminDeed,
  updateAdminDeed,
  bulkUpdateAdminDeedStatus,
  deleteAdminDeed,
  getAdminPendingDeeds,
  approvePendingDeed,
  rejectPendingDeed,
  deletePendingDeed,
  importDeeds,
  DeedCategory,
  getAdminDeedCategories,
  adminGetSpotlightQuickTap,
  adminSetSpotlightQuickTap,
  CardData,
  TargetingAttribute,
  getAdminTargetingAttributes,
  getAdminDeedTargetingBulk,
  getDeedTargeting,
  setDeedTargeting,
} from '@/lib/game-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Heart, Lock, Settings, Plus, Trash2, Save, Edit2, X, Target, Inbox, Check, XCircle, Lightbulb, Gift, Upload, Download, FileSpreadsheet, Printer, Trophy, Mail, Users, Ticket, Search, Flame, Sparkles, Eye, MessageCircleQuestion, ClipboardList, PenLine, ArrowLeftRight, Ban, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import Footer from '@/components/Footer';
import { TargetingGroupsInput } from '@/components/TargetingGroupsInput';
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

  // Deeds state
  const [deeds, setDeeds] = useState<DeedItem[]>([]);
  const [deedSearchQuery, setDeedSearchQuery] = useState('');
  const [spotlightDeed, setSpotlightDeed] = useState<{ id: number; deed_text: string; category: string } | null>(null);
  const [spotlightActive, setSpotlightActive] = useState(false);
  const [spotlightSelection, setSpotlightSelection] = useState('');
  const [spotlightLoading, setSpotlightLoading] = useState(false);

  // Blackout mode: reveal-probability table is a compound JSON config value,
  // edited as 4 separate fields with its own sum-must-be-100 save gate —
  // same pattern as the I Dare Ya odds table.
  const [blackoutWeights, setBlackoutWeights] = useState<Record<'0' | '1' | '2' | '3', string>>({ '0': '55', '1': '25', '2': '15', '3': '5' });
  const [blackoutWeightsLoaded, setBlackoutWeightsLoaded] = useState(false);
  const [newDeed, setNewDeed] = useState({ deed_text: '', deed_text_long: '', category: '', complexity: '', quantity: '1', quick_tap_eligible: false, quick_tap_default: false, quick_tap_label: '', status: 'Draft' });
  const [editingDeed, setEditingDeed] = useState<number | null>(null);
  const [editDeedData, setEditDeedData] = useState({ deed_text: '', deed_text_long: '', category: '', complexity: '', quantity: '1', quick_tap_eligible: false, quick_tap_default: false, quick_tap_label: '', status: 'Draft' });
  const [targetingAttributes, setTargetingAttributes] = useState<TargetingAttribute[]>([]);
  const [newDeedTargeting, setNewDeedTargeting] = useState<Set<number>>(new Set());
  const [editDeedTargeting, setEditDeedTargeting] = useState<Set<number>>(new Set());
  const [selectedDeedIds, setSelectedDeedIds] = useState<Set<number>>(new Set());
  const [bulkStatusValue, setBulkStatusValue] = useState('Approved');
  const [bulkStatusLoading, setBulkStatusLoading] = useState(false);

  // Export / import state
  const [exportCategoryFilter, setExportCategoryFilter] = useState('all');
  const [exportComplexityFilter, setExportComplexityFilter] = useState('all');
  const [exportStatusFilter, setExportStatusFilter] = useState('all');
  const [exportSortBy, setExportSortBy] = useState<'category' | 'az' | 'status'>('category');
  const [importLoading, setImportLoading] = useState(false);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  // Pending deed suggestions state
  const [pendingDeeds, setPendingDeeds] = useState<PendingDeed[]>([]);
  const [pendingFilter, setPendingFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Prize claims state

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
      setDeeds(deedsData.deeds || []);

      // Load deed categories
      try {
        const catRes = await getAdminDeedCategories();
        setDeedCategories(catRes.categories || []);
      } catch { /* silent */ }

      // Load targeting attributes
      try {
        const taRes = await getAdminTargetingAttributes();
        setTargetingAttributes(taRes.attributes || []);
      } catch { /* silent */ }

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

  const loadSpotlightQuickTap = async () => {
    try {
      const res = await adminGetSpotlightQuickTap();
      setSpotlightActive(res.active);
      setSpotlightDeed(res.active ? res.deed : null);
    } catch {
      // silent
    }
  };

  const handleSetSpotlight = async () => {
    const deedId = parseInt(spotlightSelection);
    if (!Number.isFinite(deedId)) { toast.error('Choose a deed first'); return; }
    setSpotlightLoading(true);
    try {
      await adminSetSpotlightQuickTap(deedId);
      toast.success('Spotlight deed set for this week');
      setSpotlightSelection('');
      await loadSpotlightQuickTap();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to set spotlight deed');
    } finally {
      setSpotlightLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      loadData();
      loadPendingDeeds('pending');
      loadSpotlightQuickTap();
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) {
      loadPendingDeeds(pendingFilter);
    }
  }, [pendingFilter]);

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
    const quickTapLabel = newDeed.quick_tap_label.trim();
    if (quickTapLabel.length > 36) {
      toast.error('Quick Tap label must be 36 characters or fewer');
      return;
    }
    if (newDeed.quick_tap_eligible && !quickTapLabel) {
      toast.error('Quick Tap label is required when Quick Tap eligible is on');
      return;
    }
    try {
      const created = await createAdminDeed({
        deed_text: newDeed.deed_text.trim(),
        deed_text_long: newDeed.deed_text_long.trim() || undefined,
        category: newDeed.category.trim(),
        is_active: true,
        complexity: newDeed.complexity ? parseInt(newDeed.complexity) : undefined,
        quantity: newDeed.quantity ? parseInt(newDeed.quantity) : 1,
        quick_tap_eligible: newDeed.quick_tap_eligible,
        quick_tap_default: newDeed.quick_tap_default,
        quick_tap_label: quickTapLabel || null,
        status: newDeed.status,
      });
      await setDeedTargeting(created.id, [...newDeedTargeting]);
      setNewDeed({ deed_text: '', deed_text_long: '', category: '', complexity: '', quantity: '1', quick_tap_eligible: false, quick_tap_default: false, quick_tap_label: '', status: 'Draft' });
      setNewDeedTargeting(new Set());
      toast.success('Gr8Day Deed added!');
      await loadData();
    } catch {
      toast.error('Failed to add Gr8Day Deed');
    }
  };

  const handleBulkStatusUpdate = async () => {
    if (selectedDeedIds.size === 0) return;
    setBulkStatusLoading(true);
    try {
      await bulkUpdateAdminDeedStatus([...selectedDeedIds], bulkStatusValue);
      toast.success(`${selectedDeedIds.size} deed${selectedDeedIds.size !== 1 ? 's' : ''} set to ${bulkStatusValue}`);
      setSelectedDeedIds(new Set());
      await loadData();
    } catch {
      toast.error('Failed to bulk-update status');
    } finally {
      setBulkStatusLoading(false);
    }
  };

  const handleUpdateDeed = async (id: number) => {
    const quickTapLabel = editDeedData.quick_tap_label.trim();
    if (quickTapLabel.length > 36) {
      toast.error('Quick Tap label must be 36 characters or fewer');
      return;
    }
    if (editDeedData.quick_tap_eligible && !quickTapLabel) {
      toast.error('Quick Tap label is required when Quick Tap eligible is on');
      return;
    }
    try {
      await updateAdminDeed(id, {
        ...editDeedData,
        complexity: editDeedData.complexity ? parseInt(editDeedData.complexity) : null,
        quantity: editDeedData.quantity ? parseInt(editDeedData.quantity) : 1,
        quick_tap_eligible: editDeedData.quick_tap_eligible,
        quick_tap_default: editDeedData.quick_tap_default,
        quick_tap_label: quickTapLabel || null,
      });
      await setDeedTargeting(id, [...editDeedTargeting]);
      setEditingDeed(null);
      setEditDeedTargeting(new Set());
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

  const STATUS_ORDER: Record<string, number> = { Draft: 0, Review: 1, Approved: 2, Retired: 3 };

  function getFilteredSortedDeeds(): DeedItem[] {
    let result = [...deeds];
    if (exportCategoryFilter && exportCategoryFilter !== 'all') result = result.filter((d) => d.category === exportCategoryFilter);
    if (exportComplexityFilter && exportComplexityFilter !== 'all') {
      const num = parseInt(exportComplexityFilter);
      result = result.filter((d) => (d.complexity ?? null) === num);
    }
    if (exportStatusFilter && exportStatusFilter !== 'all') {
      result = result.filter((d) => (d.status ?? 'Draft') === exportStatusFilter);
    }
    if (exportSortBy === 'category') {
      result.sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.deed_text.localeCompare(b.deed_text));
    } else if (exportSortBy === 'status') {
      result.sort((a, b) => (STATUS_ORDER[a.status ?? 'Draft'] ?? 0) - (STATUS_ORDER[b.status ?? 'Draft'] ?? 0) || a.deed_text.localeCompare(b.deed_text));
    } else {
      result.sort((a, b) => a.deed_text.localeCompare(b.deed_text));
    }
    return result;
  }

  async function handleDownloadCsv() {
    const filtered = getFilteredSortedDeeds();

    // Fetch targeting data in parallel with attribute definitions.
    const [{ attributes }, { rows: targetingRows }] = await Promise.all([
      getAdminTargetingAttributes(),
      getAdminDeedTargetingBulk(),
    ]);

    // Build value_id → { attrSlug, label } lookup.
    const valueInfo = new Map<number, { attrSlug: string; label: string }>();
    for (const attr of attributes) {
      const slug = 'targeting_' + attr.name.toLowerCase().replace(/\s+/g, '_');
      for (const v of attr.values) valueInfo.set(v.id, { attrSlug: slug, label: v.label });
    }

    // Build deed_id → Map<attrSlug, labels[]>.
    const deedTargeting = new Map<number, Map<string, string[]>>();
    for (const row of targetingRows) {
      const info = valueInfo.get(row.targeting_value_id);
      if (!info) continue;
      if (!deedTargeting.has(row.deed_id)) deedTargeting.set(row.deed_id, new Map());
      const attrMap = deedTargeting.get(row.deed_id)!;
      if (!attrMap.has(info.attrSlug)) attrMap.set(info.attrSlug, []);
      attrMap.get(info.attrSlug)!.push(info.label);
    }

    // Targeting column slugs in display_order (matches import expectation).
    const targetingCols = attributes.map((a) => 'targeting_' + a.name.toLowerCase().replace(/\s+/g, '_'));

    const header = ['id', 'category', 'complexity', 'quantity', 'deed_text', 'deed_text_long', 'is_active', 'status', 'quick_tap_eligible', 'quick_tap_default', 'quick_tap_label', ...targetingCols].join(',');
    const rows = filtered.map((d) => {
      const deedAttrs = deedTargeting.get(d.id);
      const targetingFields = targetingCols.map((slug) => toCsvField((deedAttrs?.get(slug) ?? []).join('|')));
      return [
        toCsvField(d.id),
        toCsvField(d.category),
        toCsvField(d.complexity),
        toCsvField(d.quantity ?? 1),
        toCsvField(d.deed_text),
        toCsvField(d.deed_text_long),
        toCsvField(d.is_active),
        toCsvField(d.status ?? 'Draft'),
        toCsvField(d.quick_tap_eligible),
        toCsvField(d.quick_tap_default),
        toCsvField(d.quick_tap_label),
        ...targetingFields,
      ].join(',');
    });

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
      const targetingKeys = Object.keys(rows[0] ?? {}).filter((k) => k.startsWith('targeting_'));
      const parseStrictBool = (v: string | undefined): boolean => (v ?? '').trim().toLowerCase() === 'true';
      const deeds = rows.map((row) => {
        const deed: Record<string, unknown> = {
          id: row['id'] ? parseInt(row['id']) || undefined : undefined,
          deed_text: row['deed_text'] ?? '',
          deed_text_long: row['deed_text_long'] || null,
          category: row['category'] || '',
          complexity: row['complexity'] ? parseInt(row['complexity']) || null : null,
          quantity: row['quantity'] ? parseInt(row['quantity']) || 1 : 1,
          is_active: parseStrictBool(row['is_active']),
          status: row['status'] || '',
          quick_tap_eligible: parseStrictBool(row['quick_tap_eligible']),
          quick_tap_default: parseStrictBool(row['quick_tap_default']),
          quick_tap_label: row['quick_tap_label'] || '',
        };
        for (const k of targetingKeys) deed[k] = row[k] ?? '';
        return deed;
      });
      const result = await importDeeds(deeds);
      toast.success(`Import complete — ${result.updated} updated, ${result.created} created${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`);
      if (result.warnings && result.warnings.length > 0) {
        toast.warning(`Import warnings:\n${result.warnings.join('\n')}`);
      }
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  }

  const uniqueCategories = [...new Set(deeds.map((d) => d.category).filter(Boolean))].sort();

  // Live client-side filter over the already-loaded deeds list — matches by
  // deed code (numeric id, substring so partial typing still narrows down)
  // or by name (deed_text / deed_text_long, case-insensitive substring).
  const deedSearchQueryTrimmed = deedSearchQuery.trim().toLowerCase();
  const filteredDeeds = deedSearchQueryTrimmed
    ? deeds.filter((d) =>
        String(d.id).includes(deedSearchQueryTrimmed) ||
        d.deed_text.toLowerCase().includes(deedSearchQueryTrimmed) ||
        (d.deed_text_long ?? '').toLowerCase().includes(deedSearchQueryTrimmed)
      )
    : deeds;

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

        {/* Deeds */}
        <section id="section-deeds">
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
            <div className="grid sm:grid-cols-4 gap-3">
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
                <label className="text-xs font-medium text-slate-600 mb-1 block">Status</label>
                <Select value={exportStatusFilter} onValueChange={setExportStatusFilter}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Review">Review</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Sort by</label>
                <Select value={exportSortBy} onValueChange={(v) => setExportSortBy(v as 'category' | 'az' | 'status')}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="category">Category</SelectItem>
                    <SelectItem value="az">A – Z</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
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
              <p><span className="font-mono bg-white px-1 rounded">is_active</span>, <span className="font-mono bg-white px-1 rounded">quick_tap_eligible</span>, <span className="font-mono bg-white px-1 rounded">quick_tap_default</span> — must be the literal word <strong>true</strong> or <strong>false</strong> (any case, e.g. TRUE/False both work). Any other value (1, yes, blank, etc.) is treated as false.</p>
              <p><span className="font-mono bg-white px-1 rounded">status</span> — one of <strong>Draft</strong>, <strong>Review</strong>, <strong>Approved</strong>, <strong>Retired</strong>. Only <strong>Approved</strong> deeds (with is_active true) are ever eligible for card generation or Quick Tap. Leaving this blank on a <strong>new</strong> row (new deed_text or id) defaults it to Draft. Leaving it blank on an <strong>existing</strong> row leaves that deed's current status unchanged — it does not reset it to Draft.</p>
              <p className="font-semibold text-slate-700 pt-1">Optional targeting columns (add these headers to restrict a deed to specific players):</p>
              <p><span className="font-mono bg-white px-1 rounded">targeting_age_bracket</span> — Teen, Early Adult, Adult, Senior (pipe-separated for multiple, e.g. <span className="font-mono">Adult|Senior</span>; blank = all ages)</p>
              <p><span className="font-mono bg-white px-1 rounded">targeting_relationship</span> — Single, Partnered (blank = all)</p>
              <p><span className="font-mono bg-white px-1 rounded">targeting_kids</span> — Yes, No (blank = all)</p>
              <p><span className="font-mono bg-white px-1 rounded">targeting_place_of_employment</span> — Home, Office, NA (blank = all)</p>
            </div>
          </CardContent>
        </Card>

        {/* This Week's Spotlight Deed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              This Week's Spotlight Deed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              A 4th Quick Tap slot shown to every player at once, on top of their own 3. Auto-expires at the weekly
              reset — pick a new one each week, or leave it blank to skip.
            </p>
            {spotlightActive && spotlightDeed ? (
              <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-amber-900">{spotlightDeed.deed_text}</p>
                  <p className="text-xs text-amber-600">{spotlightDeed.category} · active this week</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No spotlight deed set for this week.</p>
            )}
            <div className="flex gap-2">
              <select
                value={spotlightSelection}
                onChange={(e) => setSpotlightSelection(e.target.value)}
                className="flex-1 border border-input rounded-md bg-background px-2 h-9 text-sm"
              >
                <option value="">{spotlightActive ? 'Replace with…' : 'Choose a deed…'}</option>
                {deeds
                  .filter((d) => d.quick_tap_eligible && d.is_active && d.status === 'Approved')
                  .map((d) => (
                    <option key={d.id} value={d.id}>{d.deed_text}</option>
                  ))}
              </select>
              <Button
                size="sm"
                onClick={handleSetSpotlight}
                disabled={spotlightLoading || !spotlightSelection}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {spotlightLoading ? 'Saving…' : 'Set Spotlight'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Gr8Day Deeds Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-rose-500" />
                Gr8Day Deeds ({filteredDeeds.length}{deedSearchQueryTrimmed ? ` of ${deeds.length}` : ''})
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
                <select
                  value={newDeed.category}
                  onChange={(e) => setNewDeed((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-32 sm:w-40 border border-input rounded-md bg-background px-2 text-sm"
                >
                  <option value="">Category</option>
                  {deedCategories.filter((c) => c.is_active).map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
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
                <select
                  value={newDeed.status}
                  onChange={(e) => setNewDeed((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-28 border border-input rounded-md bg-background px-2 text-sm"
                >
                  <option value="Draft">Draft</option>
                  <option value="Review">Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Retired">Retired</option>
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
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={newDeed.quick_tap_eligible} onChange={(e) => setNewDeed((prev) => ({ ...prev, quick_tap_eligible: e.target.checked, quick_tap_default: e.target.checked ? prev.quick_tap_default : false }))} className="accent-emerald-600" />
                  Quick Tap eligible
                </label>
                {newDeed.quick_tap_eligible && (
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={newDeed.quick_tap_default} onChange={(e) => setNewDeed((prev) => ({ ...prev, quick_tap_default: e.target.checked }))} className="accent-indigo-600" />
                    Default
                  </label>
                )}
              </div>
              {newDeed.quick_tap_eligible && (
                <div className="space-y-1">
                  <Input
                    placeholder="Quick Tap label (short — shown on the button itself)"
                    value={newDeed.quick_tap_label}
                    onChange={(e) => setNewDeed((prev) => ({ ...prev, quick_tap_label: e.target.value }))}
                    className={newDeed.quick_tap_label.length > 36 ? 'border-red-500 focus-visible:ring-red-500' : ''}
                  />
                  <p className={`text-xs text-right ${newDeed.quick_tap_label.length > 36 ? 'text-red-600' : 'text-slate-400'}`}>
                    {newDeed.quick_tap_label.length}/36
                  </p>
                </div>
              )}
              <TargetingGroupsInput attributes={targetingAttributes} targeting={newDeedTargeting} onChange={setNewDeedTargeting} />
              <div className="flex justify-end">
                <Button
                  onClick={handleAddDeed}
                  disabled={newDeed.quick_tap_label.length > 36}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Gr8Day Deed
                </Button>
              </div>
            </div>

            {/* Search deeds by code (id) or name */}
            <div className="mb-3 relative max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search by deed code or name…"
                value={deedSearchQuery}
                onChange={(e) => setDeedSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>

            {/* Bulk status update */}
            {selectedDeedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <span className="text-sm font-medium text-indigo-800">
                  {selectedDeedIds.size} deed{selectedDeedIds.size !== 1 ? 's' : ''} selected
                </span>
                <select
                  value={bulkStatusValue}
                  onChange={(e) => setBulkStatusValue(e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="Draft">Draft</option>
                  <option value="Review">Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Retired">Retired</option>
                </select>
                <Button size="sm" onClick={handleBulkStatusUpdate} disabled={bulkStatusLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {bulkStatusLoading ? 'Updating…' : `Set to ${bulkStatusValue}`}
                </Button>
                <button
                  type="button"
                  onClick={() => setSelectedDeedIds(new Set())}
                  className="text-xs text-indigo-600 hover:underline ml-auto"
                >
                  Clear selection
                </button>
              </div>
            )}

            {/* Gr8Day Deeds list */}
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[500px] overflow-y-auto divide-y">
                {filteredDeeds.length === 0 && deedSearchQueryTrimmed && (
                  <p className="px-3 py-6 text-sm text-slate-400 text-center">
                    No deeds match "{deedSearchQuery.trim()}"
                  </p>
                )}
                {filteredDeeds.map((deed) => (
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
                          <select
                            value={editDeedData.category}
                            onChange={(e) =>
                              setEditDeedData((prev) => ({ ...prev, category: e.target.value }))
                            }
                            className="w-28 h-8 text-sm border border-input rounded-md bg-background px-2"
                          >
                            <option value="">Category</option>
                            {deedCategories.filter((c) => c.is_active).map((c) => (
                              <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                          </select>
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
                          <select
                            value={editDeedData.status}
                            onChange={(e) => setEditDeedData((prev) => ({ ...prev, status: e.target.value }))}
                            className="w-24 h-8 text-sm border border-input rounded-md bg-background px-2"
                          >
                            <option value="Draft">Draft</option>
                            <option value="Review">Review</option>
                            <option value="Approved">Approved</option>
                            <option value="Retired">Retired</option>
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
                        <TargetingGroupsInput attributes={targetingAttributes} targeting={editDeedTargeting} onChange={setEditDeedTargeting} />
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={editDeedData.quick_tap_eligible} onChange={(e) => setEditDeedData((prev) => ({ ...prev, quick_tap_eligible: e.target.checked, quick_tap_default: e.target.checked ? prev.quick_tap_default : false }))} className="accent-emerald-600" />
                            Quick Tap eligible
                          </label>
                          {editDeedData.quick_tap_eligible && (
                            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                              <input type="checkbox" checked={editDeedData.quick_tap_default} onChange={(e) => setEditDeedData((prev) => ({ ...prev, quick_tap_default: e.target.checked }))} className="accent-indigo-600" />
                              Default
                            </label>
                          )}
                        </div>
                        {editDeedData.quick_tap_eligible && (
                          <div className="space-y-1">
                            <Input
                              placeholder="Quick Tap label (short — shown on the button itself)"
                              value={editDeedData.quick_tap_label}
                              onChange={(e) => setEditDeedData((prev) => ({ ...prev, quick_tap_label: e.target.value }))}
                              className={`h-8 text-sm ${editDeedData.quick_tap_label.length > 36 ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                            />
                            <p className={`text-xs text-right ${editDeedData.quick_tap_label.length > 36 ? 'text-red-600' : 'text-slate-400'}`}>
                              {editDeedData.quick_tap_label.length}/36
                            </p>
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUpdateDeed(deed.id)}
                            disabled={editDeedData.quick_tap_label.length > 36}
                          >
                            <Save className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingDeed(null); setEditDeedTargeting(new Set()); }}>
                            <X className="w-3.5 h-3.5 mr-1" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedDeedIds.has(deed.id)}
                          onChange={(e) => {
                            setSelectedDeedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(deed.id); else next.delete(deed.id);
                              return next;
                            });
                          }}
                          className="mt-1 accent-indigo-600"
                        />
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
                            <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                              #{deed.id}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              deed.status === 'Approved' ? 'bg-emerald-50 text-emerald-700'
                              : deed.status === 'Review' ? 'bg-amber-50 text-amber-700'
                              : deed.status === 'Retired' ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                            }`}>
                              {deed.status ?? 'Draft'}
                            </span>
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
                            {deed.quick_tap_eligible && (
                              <span className="text-[10px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-semibold">
                                Quick Tap{deed.quick_tap_default ? ' · Default' : ''}
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
                            onClick={async () => {
                              setEditingDeed(deed.id);
                              setEditDeedData({
                                deed_text: deed.deed_text,
                                deed_text_long: deed.deed_text_long || '',
                                category: deed.category || '',
                                complexity: deed.complexity != null ? String(deed.complexity) : '',
                                quantity: deed.quantity != null ? String(deed.quantity) : '1',
                                quick_tap_eligible: deed.quick_tap_eligible ?? false,
                                quick_tap_default: deed.quick_tap_default ?? false,
                                quick_tap_label: deed.quick_tap_label ?? '',
                                status: deed.status ?? 'Draft',
                              });
                              try {
                                const res = await getDeedTargeting(deed.id);
                                setEditDeedTargeting(new Set(res.targeting_value_ids));
                              } catch { setEditDeedTargeting(new Set()); }
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
        </section>

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
