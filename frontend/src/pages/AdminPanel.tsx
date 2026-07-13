import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DeedItem,
  PendingDeed,
  PrizeClaim,
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
  getAdminPrizeClaims,
  updatePrizeClaimStatus,
  getAdminMembers,
  MemberItem,
  adminCreatePlayer,
  adminUpdatePlayer,
  adminDeletePlayer,
  getCountries,
  getStates,
  CountryOption,
  StateOption,
  adminTriggerWeeklyReset,
  adminAnnounceGame,
  adminGetTeams,
  adminCreateTeam,
  adminUpdateTeam,
  adminDeleteTeam,
  adminAddTeamMember,
  adminRemoveTeamMember,
  DeedCategory,
  getAdminDeedCategories,
  updateAdminDeedCategory,
  DrawWinner,
  getAdminDrawResults,
  DrawLeaderboardPlayer,
  getAdminDrawLeaderboard,
  adminGetSpotlightQuickTap,
  adminSetSpotlightQuickTap,
  StreakMilestone,
  adminGetStreakMilestones,
  adminCreateStreakMilestone,
  adminUpdateStreakMilestone,
  adminDeleteStreakMilestone,
  AdminPlayerCardResult,
  AdminPlayerMatch,
  adminGetPlayerCard,
  adminSearchPlayersByLastName,
  AdminCompletedDeed,
  adminGetCompletedDeeds,
  adminReverseDeed,
  adminDrawAdjust,
  CardData,
  CellData,
  TargetingAttribute,
  getAdminTargetingAttributes,
  getAdminDeedTargetingBulk,
  getDeedTargeting,
  setDeedTargeting,
  DareYaOutcome,
  DareYaActionType,
  adminGetDareYaOutcomes,
  adminCreateDareYaOutcome,
  adminUpdateDareYaOutcome,
  adminDeleteDareYaOutcome,
  CardPickupPrompt,
  adminGetCardPickupPrompts,
  adminCreateCardPickupPrompt,
  adminUpdateCardPickupPrompt,
  adminDeleteCardPickupPrompt,
  PromptResponse,
  adminGetPromptResponses,
  adminApprovePromptResponse,
} from '@/lib/game-utils';
import BingoCell from '@/components/BingoCell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Heart, Lock, Settings, Plus, Trash2, Save, Edit2, X, Target, Inbox, Check, XCircle, Lightbulb, Gift, Upload, Download, FileSpreadsheet, Printer, Trophy, Mail, Users, Ticket, Search, Flame, Sparkles, Eye, MessageCircleQuestion } from 'lucide-react';
import Footer from '@/components/Footer';
import { TargetingGroupsInput } from '@/components/TargetingGroupsInput';

const WIN_CONDITIONS = [
  { id: 'one_line', name: 'One Line', description: 'Complete 5 in a row (horizontal, vertical, or diagonal)' },
  { id: 'two_lines', name: 'Two Lines', description: 'Complete any two full lines' },
  { id: 'four_corners', name: 'Four Corners', description: 'Complete all four corner squares' },
  { id: 'x_pattern', name: 'X Pattern', description: 'Complete both diagonals forming an X across the card' },
  { id: 'around_the_edges', name: 'Around the Edges', description: 'Complete all 16 perimeter squares around the card' },
  { id: 'fill_card', name: 'Fill the Card', description: 'Complete every square on the entire card' },
];

const ADMIN_SESSION_KEY = 'admin_authenticated';

const isoToLocalInput = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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
  const [spotlightDeed, setSpotlightDeed] = useState<{ id: number; deed_text: string; category: string } | null>(null);
  const [spotlightActive, setSpotlightActive] = useState(false);
  const [spotlightSelection, setSpotlightSelection] = useState('');
  const [spotlightLoading, setSpotlightLoading] = useState(false);

  // Blackout mode: reveal-probability table is a compound JSON config value,
  // edited as 4 separate fields with its own sum-must-be-100 save gate —
  // same pattern as the I Dare Ya odds table.
  const [blackoutWeights, setBlackoutWeights] = useState<Record<'0' | '1' | '2' | '3', string>>({ '0': '55', '1': '25', '2': '15', '3': '5' });
  const [blackoutWeightsLoaded, setBlackoutWeightsLoaded] = useState(false);
  const [blackoutWeightsSaving, setBlackoutWeightsSaving] = useState(false);
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
  const [prizeClaims, setPrizeClaims] = useState<PrizeClaim[]>([]);

  // Draw results state
  const [drawWinners, setDrawWinners] = useState<DrawWinner[]>([]);

  // Draw entry leaderboard state
  const [drawLeaderboard, setDrawLeaderboard] = useState<DrawLeaderboardPlayer[]>([]);
  const [drawLeaderboardWeek, setDrawLeaderboardWeek] = useState<string>('');
  const [drawLeaderboardLoading, setDrawLeaderboardLoading] = useState(false);

  // Member list state
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [memberCountryFilter, setMemberCountryFilter] = useState('all');
  const [memberStateFilter, setMemberStateFilter] = useState('all');

  // Player management state
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [playerStates, setPlayerStates] = useState<StateOption[]>([]);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [playerForm, setPlayerForm] = useState({ first_name: '', last_name: '', email: '', username: '', password: '', role: 'user', city: '', country_id: '' as string | number, state_id: '' as string | number, is_trusted: false, is_test: false });
  const [playerFormLoading, setPlayerFormLoading] = useState(false);


  // Weekly reset state
  const [weeklyResetLoading, setWeeklyResetLoading] = useState(false);

  // Game announcement state
  const [announceLoading, setAnnounceLoading] = useState(false);
  const [announcePrize, setAnnouncePrize] = useState('');
  const [announceGameType, setAnnounceGameType] = useState('');
  const [announceTheme, setAnnounceTheme] = useState('');
  const [announceExtra, setAnnounceExtra] = useState('');

  // Deed categories state
  const [deedCategories, setDeedCategories] = useState<DeedCategory[]>([]);

  // Player card viewer state
  const [cardViewerPN, setCardViewerPN] = useState('');
  const [cardViewerLastName, setCardViewerLastName] = useState('');
  const [cardViewerResult, setCardViewerResult] = useState<AdminPlayerCardResult | null>(null);
  const [cardViewerMatches, setCardViewerMatches] = useState<AdminPlayerMatch[]>([]);
  const [cardViewerLoading, setCardViewerLoading] = useState(false);

  // Draw entry adjustment & deed reversal (for the currently-viewed player)
  const [completedDeeds, setCompletedDeeds] = useState<AdminCompletedDeed[]>([]);
  const [completedDeedsLoading, setCompletedDeedsLoading] = useState(false);
  const [reversingDeedId, setReversingDeedId] = useState<number | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);

  // Streak milestones state
  const [streakMilestones, setStreakMilestones] = useState<StreakMilestone[]>([]);
  const [newMilestone, setNewMilestone] = useState({ days_required: '', label: '', message: '', display_order: '' });
  const [editingMilestoneId, setEditingMilestoneId] = useState<number | null>(null);
  const [editMilestoneData, setEditMilestoneData] = useState({ days_required: '', label: '', message: '', display_order: '' });
  const [milestoneLoading, setMilestoneLoading] = useState(false);

  // I Dare Ya outcomes state
  const VALID_ACTION_TYPES: DareYaActionType[] = ['free_square','refer_friend','fund_credit','remove_funds','replace_three','nothing'];
  const ACTION_TYPE_LABELS: Record<DareYaActionType, string> = {
    free_square: 'Free Square', refer_friend: 'Refer a Friend',
    fund_credit: 'Fund Credit', remove_funds: 'Remove Funds',
    replace_three: 'Replace Three', nothing: 'Nothing',
  };
  const [dareYaOutcomes, setDareYaOutcomes] = useState<DareYaOutcome[]>([]);
  const [newDareYa, setNewDareYa] = useState({ label: '', odds_percent: '', action_type: 'nothing' as DareYaActionType, credit_amount: '0', remove_amount: '0', reward_amount: '5', is_active: true });
  const [editingDareYaId, setEditingDareYaId] = useState<number | null>(null);
  const [editDareYaData, setEditDareYaData] = useState({ label: '', odds_percent: '', action_type: 'nothing' as DareYaActionType, credit_amount: '0', remove_amount: '0', reward_amount: '5', is_active: true });
  const [dareYaLoading, setDareYaLoading] = useState(false);

  // Predicts the active-odds total if a pending add/edit were saved, so the
  // Save button can be gated on landing at exactly 100% (server enforces the
  // same rule — this is just the UI-side mirror of it).
  const predictDareYaActiveTotal = (excludeId: number | null, pendingIsActive: boolean, pendingPercent: number) => {
    const base = dareYaOutcomes
      .filter(o => o.id !== excludeId && o.is_active)
      .reduce((s, o) => s + Number(o.odds_percent), 0);
    return pendingIsActive ? base + pendingPercent : base;
  };

  // Card-pickup reflection prompts state
  const PROMPT_STATUSES = ['Draft', 'Review', 'Approved', 'Retired'] as const;
  const [pickupPrompts, setPickupPrompts] = useState<CardPickupPrompt[]>([]);
  const [newPickupPrompt, setNewPickupPrompt] = useState({ question_text: '', status: 'Approved' as CardPickupPrompt['status'], is_active: true });
  const [editingPromptId, setEditingPromptId] = useState<number | null>(null);
  const [editPromptData, setEditPromptData] = useState({ question_text: '', status: 'Approved' as CardPickupPrompt['status'], is_active: true });
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptResponses, setPromptResponses] = useState<PromptResponse[]>([]);
  const [responseApprovalLoading, setResponseApprovalLoading] = useState<number | null>(null);

  // Teams state
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCaptain, setNewTeamCaptain] = useState('');
  const [teamLoading, setTeamLoading] = useState(false);
  const [addMemberTeamId, setAddMemberTeamId] = useState<number | null>(null);
  const [addMemberPN, setAddMemberPN] = useState('');
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamCaptain, setEditTeamCaptain] = useState('');

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

      // Load streak milestones
      try {
        const milestones = await adminGetStreakMilestones();
        setStreakMilestones(milestones);
      } catch { /* silent */ }

      // Load targeting attributes
      try {
        const taRes = await getAdminTargetingAttributes();
        setTargetingAttributes(taRes.attributes || []);
      } catch { /* silent */ }

      // Load I Dare Ya outcomes
      try {
        const byRes = await adminGetDareYaOutcomes();
        setDareYaOutcomes(byRes.outcomes || []);
      } catch { /* silent */ }

      // Load card-pickup reflection prompts
      try {
        const ppRes = await adminGetCardPickupPrompts();
        setPickupPrompts(ppRes.prompts || []);
      } catch { /* silent */ }

      // Load card-pickup reflection responses (review queue)
      try {
        const prRes = await adminGetPromptResponses();
        setPromptResponses(prRes.responses || []);
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

  const loadPrizeClaims = async () => {
    try {
      const res = await getAdminPrizeClaims();
      setPrizeClaims(res.claims || []);
    } catch {
      // silent
    }
  };

  const loadDrawResults = async () => {
    try {
      const res = await getAdminDrawResults();
      setDrawWinners(res.winners || []);
    } catch {
      // silent
    }
  };

  const loadDrawLeaderboard = async () => {
    setDrawLeaderboardLoading(true);
    try {
      const res = await getAdminDrawLeaderboard();
      setDrawLeaderboard(res.players || []);
      setDrawLeaderboardWeek(res.week_year);
    } catch {
      // silent
    } finally {
      setDrawLeaderboardLoading(false);
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

  // ── I Dare Ya CRUD handlers ───────────────────────────────────────────────
  const activeDareYaTotal = dareYaOutcomes.filter(o => o.is_active).reduce((s, o) => s + Number(o.odds_percent), 0);

  const handleAddDareYa = async () => {
    const pct = parseFloat(newDareYa.odds_percent);
    if (!newDareYa.label.trim() || isNaN(pct)) { toast.error('Label and odds % are required'); return; }
    if (Math.abs(predictDareYaActiveTotal(null, newDareYa.is_active, pct) - 100) > 0.01) {
      toast.error('Active outcome percentages must sum to exactly 100% to save');
      return;
    }
    setDareYaLoading(true);
    try {
      const res = await adminCreateDareYaOutcome({
        label: newDareYa.label.trim(), odds_percent: pct, action_type: newDareYa.action_type,
        credit_amount: parseFloat(newDareYa.credit_amount) || 0,
        remove_amount: parseFloat(newDareYa.remove_amount) || 0,
        reward_amount: parseFloat(newDareYa.reward_amount) || 0,
        is_active: newDareYa.is_active,
      });
      setDareYaOutcomes(prev => [...prev, res.outcome]);
      setNewDareYa({ label: '', odds_percent: '', action_type: 'nothing', credit_amount: '0', remove_amount: '0', reward_amount: '5', is_active: true });
      toast.success('Outcome added');
    } catch (e: any) { toast.error(e?.message || 'Failed to add outcome'); }
    finally { setDareYaLoading(false); }
  };

  const handleUpdateDareYa = async (id: number) => {
    const pct = parseFloat(editDareYaData.odds_percent);
    if (!editDareYaData.label.trim() || isNaN(pct)) { toast.error('Label and odds % are required'); return; }
    if (Math.abs(predictDareYaActiveTotal(id, editDareYaData.is_active, pct) - 100) > 0.01) {
      toast.error('Active outcome percentages must sum to exactly 100% to save');
      return;
    }
    setDareYaLoading(true);
    try {
      const res = await adminUpdateDareYaOutcome(id, {
        label: editDareYaData.label.trim(), odds_percent: pct, action_type: editDareYaData.action_type,
        credit_amount: parseFloat(editDareYaData.credit_amount) || 0,
        remove_amount: parseFloat(editDareYaData.remove_amount) || 0,
        reward_amount: parseFloat(editDareYaData.reward_amount) || 0,
        is_active: editDareYaData.is_active,
      });
      setDareYaOutcomes(prev => prev.map(o => o.id === id ? res.outcome : o));
      setEditingDareYaId(null);
      toast.success('Outcome updated');
    } catch (e: any) { toast.error(e?.message || 'Failed to update outcome'); }
    finally { setDareYaLoading(false); }
  };

  const handleDeleteDareYa = async (id: number) => {
    if (!confirm('Delete this outcome?')) return;
    setDareYaLoading(true);
    try {
      await adminDeleteDareYaOutcome(id);
      setDareYaOutcomes(prev => prev.filter(o => o.id !== id));
      toast.success('Outcome deleted');
    } catch (e: any) { toast.error(e?.message || 'Failed to delete outcome'); }
    finally { setDareYaLoading(false); }
  };

  // ── Card-pickup reflection prompt CRUD handlers ──────────────────────────
  const handleAddPickupPrompt = async () => {
    if (!newPickupPrompt.question_text.trim()) { toast.error('Question text is required'); return; }
    setPromptLoading(true);
    try {
      const res = await adminCreateCardPickupPrompt({
        question_text: newPickupPrompt.question_text.trim(),
        status: newPickupPrompt.status,
        is_active: newPickupPrompt.is_active,
      });
      setPickupPrompts(prev => [...prev, res.prompt]);
      setNewPickupPrompt({ question_text: '', status: 'Approved', is_active: true });
      toast.success('Prompt added');
    } catch (e: any) { toast.error(e?.message || 'Failed to add prompt'); }
    finally { setPromptLoading(false); }
  };

  const handleUpdatePickupPrompt = async (id: number) => {
    if (!editPromptData.question_text.trim()) { toast.error('Question text is required'); return; }
    setPromptLoading(true);
    try {
      const res = await adminUpdateCardPickupPrompt(id, {
        question_text: editPromptData.question_text.trim(),
        status: editPromptData.status,
        is_active: editPromptData.is_active,
      });
      setPickupPrompts(prev => prev.map(p => p.id === id ? res.prompt : p));
      setEditingPromptId(null);
      toast.success('Prompt updated');
    } catch (e: any) { toast.error(e?.message || 'Failed to update prompt'); }
    finally { setPromptLoading(false); }
  };

  const handleDeletePickupPrompt = async (id: number) => {
    if (!confirm('Delete this prompt?')) return;
    setPromptLoading(true);
    try {
      await adminDeleteCardPickupPrompt(id);
      setPickupPrompts(prev => prev.filter(p => p.id !== id));
      toast.success('Prompt deleted');
    } catch (e: any) { toast.error(e?.message || 'Failed to delete prompt'); }
    finally { setPromptLoading(false); }
  };

  const handleToggleResponseApproval = async (id: number, approved: boolean) => {
    setResponseApprovalLoading(id);
    try {
      const res = await adminApprovePromptResponse(id, approved);
      setPromptResponses(prev => prev.map(r => r.id === id ? res.response : r));
      toast.success(approved ? 'Response approved for Community Voices' : 'Response hidden');
    } catch (e: any) { toast.error(e?.message || 'Failed to update response'); }
    finally { setResponseApprovalLoading(null); }
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

  const loadTeams = async () => {
    try {
      const t = await adminGetTeams();
      setTeams(t);
    } catch {
      // silent
    }
  };

  const handleCardViewerLookup = async () => {
    const pn = parseInt(cardViewerPN.trim());
    if (isNaN(pn)) { toast.error('Enter a valid player number'); return; }
    setCardViewerLoading(true);
    setCardViewerResult(null);
    setCardViewerMatches([]);
    try {
      const result = await adminGetPlayerCard(pn);
      setCardViewerResult(result);
    } catch (err: any) {
      toast.error(err?.message || 'Player not found');
    } finally {
      setCardViewerLoading(false);
    }
  };

  const handleCardViewerLastNameSearch = async () => {
    const q = cardViewerLastName.trim();
    if (!q) { toast.error('Enter a last name to search'); return; }
    setCardViewerLoading(true);
    setCardViewerResult(null);
    setCardViewerMatches([]);
    try {
      const matches = await adminSearchPlayersByLastName(q);
      if (matches.length === 0) toast.info('No players found with that last name');
      setCardViewerMatches(matches);
    } catch (err: any) {
      toast.error(err?.message || 'Search failed');
    } finally {
      setCardViewerLoading(false);
    }
  };

  const handleCardViewerSelectMatch = async (pn: number) => {
    setCardViewerMatches([]);
    setCardViewerLoading(true);
    setCardViewerResult(null);
    try {
      const result = await adminGetPlayerCard(pn);
      setCardViewerResult(result);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load card');
    } finally {
      setCardViewerLoading(false);
    }
  };

  const loadCompletedDeeds = async (playerId: string) => {
    setCompletedDeedsLoading(true);
    try {
      const res = await adminGetCompletedDeeds(playerId);
      setCompletedDeeds(res.deeds || []);
    } catch {
      // silent
    } finally {
      setCompletedDeedsLoading(false);
    }
  };

  // Load this player's deed history whenever a new player card is viewed.
  useEffect(() => {
    if (cardViewerResult?.player.id) {
      loadCompletedDeeds(cardViewerResult.player.id);
    } else {
      setCompletedDeeds([]);
    }
  }, [cardViewerResult?.player.id]);

  const handleReverseDeed = async (deedId: number) => {
    if (!confirm('Reverse this completed deed? This removes its draw entry (and the bingo bonus, if reversing it un-completes the card) and hides it from the Impact Board.')) return;
    setReversingDeedId(deedId);
    try {
      const res = await adminReverseDeed(deedId);
      toast.success(
        res.bingo_bonus_reversed
          ? 'Deed reversed — bingo bonus also reversed'
          : res.deed_entry_reversed
          ? 'Deed reversed'
          : 'Deed hidden (no draw entry existed to reverse)'
      );
      if (cardViewerResult?.player.id) await loadCompletedDeeds(cardViewerResult.player.id);
      await loadDrawLeaderboard();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reverse deed');
    } finally {
      setReversingDeedId(null);
    }
  };

  const handleDrawAdjust = async () => {
    if (!cardViewerResult?.player.id) return;
    const amount = parseInt(adjustAmount.trim());
    if (!Number.isFinite(amount) || amount === 0) { toast.error('Enter a non-zero whole number'); return; }
    if (!adjustReason.trim()) { toast.error('A reason is required'); return; }
    setAdjustLoading(true);
    try {
      await adminDrawAdjust(cardViewerResult.player.id, amount, adjustReason.trim());
      toast.success(`Draw entries ${amount > 0 ? 'added' : 'removed'}`);
      setAdjustAmount('');
      setAdjustReason('');
      await loadDrawLeaderboard();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to adjust draw entries');
    } finally {
      setAdjustLoading(false);
    }
  };

  const loadStreakMilestones = async () => {
    try {
      const milestones = await adminGetStreakMilestones();
      setStreakMilestones(milestones);
    } catch { /* silent */ }
  };

  const handleCreateMilestone = async () => {
    const days = parseInt(newMilestone.days_required);
    if (!days || !newMilestone.label.trim() || !newMilestone.message.trim()) {
      toast.error('Days, label, and message are required');
      return;
    }
    setMilestoneLoading(true);
    try {
      await adminCreateStreakMilestone({
        days_required: days,
        label: newMilestone.label.trim(),
        message: newMilestone.message.trim(),
        display_order: parseInt(newMilestone.display_order) || 0,
      });
      toast.success('Milestone created');
      setNewMilestone({ days_required: '', label: '', message: '', display_order: '' });
      await loadStreakMilestones();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create milestone');
    } finally {
      setMilestoneLoading(false);
    }
  };

  const handleUpdateMilestone = async (id: number) => {
    setMilestoneLoading(true);
    try {
      await adminUpdateStreakMilestone(id, {
        days_required: parseInt(editMilestoneData.days_required) || undefined,
        label: editMilestoneData.label.trim() || undefined,
        message: editMilestoneData.message.trim() || undefined,
        display_order: parseInt(editMilestoneData.display_order) || undefined,
      });
      toast.success('Milestone updated');
      setEditingMilestoneId(null);
      await loadStreakMilestones();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update milestone');
    } finally {
      setMilestoneLoading(false);
    }
  };

  const handleToggleMilestone = async (id: number, isActive: boolean) => {
    try {
      await adminUpdateStreakMilestone(id, { is_active: isActive });
      await loadStreakMilestones();
    } catch { toast.error('Failed to update milestone'); }
  };

  const handleDeleteMilestone = async (id: number) => {
    if (!confirm('Delete this milestone? Player achievements for this milestone will also be removed.')) return;
    setMilestoneLoading(true);
    try {
      await adminDeleteStreakMilestone(id);
      toast.success('Milestone deleted');
      await loadStreakMilestones();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete milestone');
    } finally {
      setMilestoneLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      loadData();
      loadPendingDeeds('pending');
      loadPrizeClaims();
      loadDrawResults();
      loadDrawLeaderboard();
      loadMembers();
      loadTeams();
      loadSpotlightQuickTap();
      getCountries().then(setCountries).catch(() => {});
    }
  }, [authenticated]);

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
      setPlayerForm({ first_name: '', last_name: '', email: '', username: '', password: '', role: 'user', city: '', country_id: '', state_id: '', is_trusted: false, is_test: false });
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
    setPlayerForm({ first_name: m.first_name ?? '', last_name: m.last_name ?? '', email: m.email ?? '', username: m.username ?? '', password: '', role: m.role ?? 'user', city: (m as any).city ?? '', country_id: (m as any).country_id ?? '', state_id: (m as any).state_id ?? '', is_trusted: m.is_trusted ?? false, is_test: m.is_test ?? false });
    setEditingPlayer(m.id);
    if ((m as any).country_id) getStates(Number((m as any).country_id)).then(setPlayerStates).catch(() => {});
  };

  useEffect(() => {
    if (authenticated) {
      loadPendingDeeds(pendingFilter);
    }
  }, [pendingFilter]);

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

  const handleWeeklyReset = async () => {
    setWeeklyResetLoading(true);
    try {
      const res = await adminTriggerWeeklyReset();
      toast.success(`New week emails sent: ${res.sent} delivered, ${res.failed} failed.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send weekly emails.');
    } finally {
      setWeeklyResetLoading(false);
    }
  };

  const handleAnnounceGame = async () => {
    if (!announcePrize.trim() || !announceGameType.trim()) {
      toast.error('Prize and Game Type are required.');
      return;
    }
    setAnnounceLoading(true);
    try {
      const res = await adminAnnounceGame({
        prize: announcePrize.trim(),
        game_type: announceGameType.trim(),
        theme: announceTheme.trim(),
        extra_message: announceExtra.trim() || undefined,
      });
      toast.success(`Game announcement sent: ${res.sent} delivered, ${res.failed} failed.`);
      setAnnouncePrize('');
      setAnnounceGameType('');
      setAnnounceTheme('');
      setAnnounceExtra('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send game announcement.');
    } finally {
      setAnnounceLoading(false);
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

  const handleSaveBlackoutWeights = async () => {
    setBlackoutWeightsSaving(true);
    try {
      const value = JSON.stringify({
        '0': Number(blackoutWeights['0']) || 0, '1': Number(blackoutWeights['1']) || 0,
        '2': Number(blackoutWeights['2']) || 0, '3': Number(blackoutWeights['3']) || 0,
      });
      await updateAdminConfig({ blackout_reveal_probability: value });
      setEditConfigs((prev) => ({ ...prev, blackout_reveal_probability: value }));
      toast.success('Reveal odds saved');
    } catch {
      toast.error('Failed to save reveal odds');
    } finally {
      setBlackoutWeightsSaving(false);
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

  const getFilteredMembers = (): MemberItem[] => {
    let result = [...members];
    if (memberCountryFilter !== 'all') {
      result = result.filter((m) => (m.country ?? '').toLowerCase() === memberCountryFilter.toLowerCase());
    }
    if (memberStateFilter !== 'all') {
      result = result.filter((m) => (m.province_state ?? '').toLowerCase() === memberStateFilter.toLowerCase());
    }
    return result;
  };

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
    <thead><tr><th>#</th><th>Name</th><th>Email</th><th>City</th><th>Province / State</th><th>Country</th><th>Verified</th><th>Last Active</th></tr></thead>
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

  const configFields = [
    { key: 'signup_bonus_amount', label: 'Signup Bonus Amount (Gr8Day Bucks)', type: 'number' },
    { key: 'referral_bonus_amount', label: 'Referral Bonus Amount (Gr8Day Bucks)', type: 'number' },
    { key: 'dollar1_pct', label: '0.50 Bucks Square Percentage', type: 'number' },
    { key: 'dollar2_pct', label: '1.00 Bucks Square Percentage', type: 'number' },
    { key: 'dollar5_pct', label: '2.00 Bucks Square Percentage', type: 'number' },
    { key: 'secret_reward_1_pct', label: 'Secret Square: 1 Buck Reward %', type: 'number' },
    { key: 'secret_reward_2_pct', label: 'Secret Square: 2 Bucks Reward %', type: 'number' },
    { key: 'secret_reward_5_pct', label: 'Secret Square: 5 Bucks Reward %', type: 'number' },
    { key: 'geo_drilldown_threshold', label: 'Leaderboard: players before a region drills to cities', type: 'number' },
    { key: 'non_referred_daily_deed_limit', label: 'Non-referred players: max Gr8Day Deeds per 24h (0 = no limit)', type: 'number' },
    { key: 'blackout_min_hidden_remaining', label: 'Blackout: minimum hidden squares remaining (reveal trims back once hit)', type: 'number' },
  ];

  const weeklyUpdatePercentage = editConfigs['weekly_update_percentage'] || '';
  const weeklyUpdatePrompt = editConfigs['weekly_update_prompt'] || '';

  const blackoutWeightsSum = (['0', '1', '2', '3'] as const).reduce((s, k) => s + (parseFloat(blackoutWeights[k]) || 0), 0);

  const prizeImageUrl = editConfigs['prize_image_url'] || '';
  const prizeTitle = editConfigs['prize_title'] || '';
  const prizeVoucherCode = editConfigs['prize_voucher_code'] || '';
  const gameAnnouncementPromptTemplate = editConfigs['game_announcement_prompt_template'] || '';

  const currentWinCondition = editConfigs['win_condition'] || 'one_line';
  const selectedWC = WIN_CONDITIONS.find((wc) => wc.id === currentWinCondition);

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
              { id: 'section-game-settings', label: 'Game Settings', icon: <Settings className="w-3.5 h-3.5" /> },
              { id: 'section-streaks', label: 'Streaks', icon: <Flame className="w-3.5 h-3.5" /> },
              { id: 'section-deeds', label: 'Deeds', icon: <Target className="w-3.5 h-3.5" /> },
              { id: 'section-draw', label: 'Draw', icon: <Ticket className="w-3.5 h-3.5" /> },
              { id: 'section-prize-claims', label: 'Prize Claims', icon: <Gift className="w-3.5 h-3.5" /> },
              { id: 'section-announce', label: 'Announce', icon: <Mail className="w-3.5 h-3.5" /> },
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
        {/* Player Card Viewer */}
        <section id="section-card-viewer">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-500" />
              View Player Card
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">Look up any player's current bingo card by player number or last name. Read-only view.</p>

            {/* Search by last name */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">Search by last name</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Last name (e.g. Smith)"
                  value={cardViewerLastName}
                  onChange={(e) => setCardViewerLastName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCardViewerLastNameSearch()}
                  className="max-w-xs"
                />
                <Button
                  onClick={handleCardViewerLastNameSearch}
                  disabled={cardViewerLoading}
                  variant="outline"
                >
                  {cardViewerLoading ? 'Searching…' : <><Search className="w-4 h-4 mr-1" /> Search</>}
                </Button>
              </div>
            </div>

            {/* Last name matches */}
            {cardViewerMatches.length > 0 && (
              <div className="border rounded-lg overflow-hidden divide-y">
                {cardViewerMatches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => handleCardViewerSelectMatch(m.player_number)}
                    className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-medium text-slate-800 text-sm">{m.display_name}</span>
                      {m.email && <span className="text-xs text-slate-400 ml-2">{m.email}</span>}
                    </div>
                    <span className="text-xs text-slate-400 font-mono">GR8-{m.player_number}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="flex-1 border-t" /><span>or</span><div className="flex-1 border-t" />
            </div>

            {/* Search by player number */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">Look up by player number</p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Player number (e.g. 10001)"
                  value={cardViewerPN}
                  onChange={(e) => setCardViewerPN(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCardViewerLookup()}
                  className="max-w-xs"
                />
                <Button
                  onClick={handleCardViewerLookup}
                  disabled={cardViewerLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {cardViewerLoading ? 'Loading…' : 'View Card'}
                </Button>
                {cardViewerResult && (
                  <Button variant="ghost" onClick={() => { setCardViewerResult(null); setCardViewerMatches([]); }}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {cardViewerResult && (
              <div className="space-y-4">
                {/* Player summary */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex flex-wrap gap-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">Player</p>
                    <p className="font-semibold text-slate-800">{cardViewerResult.player.display_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">GR8 Number</p>
                    <p className="font-mono font-semibold text-slate-800">GR8-{cardViewerResult.player.player_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Email</p>
                    <p className="text-slate-700">{cardViewerResult.player.email ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 flex items-center gap-1"><Flame className="w-3 h-3 text-orange-400" /> Current Streak</p>
                    <p className="font-semibold text-orange-600">{cardViewerResult.player.current_streak_days} days</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Best Streak</p>
                    <p className="font-semibold text-indigo-600">{cardViewerResult.player.longest_streak_days} days</p>
                  </div>
                </div>

                {/* Draw entry manual adjustment */}
                <div className="border border-purple-200 bg-purple-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Adjust Draw Entries</p>
                  <div className="flex flex-wrap gap-2 items-start">
                    <Input
                      type="number"
                      placeholder="Amount (+/-)"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      className="w-36 h-8 text-sm bg-white"
                    />
                    <Input
                      placeholder="Reason (required)"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      className="flex-1 min-w-[180px] h-8 text-sm bg-white"
                    />
                    <Button
                      size="sm"
                      onClick={handleDrawAdjust}
                      disabled={adjustLoading || !adjustAmount.trim() || !adjustReason.trim()}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {adjustLoading ? 'Applying…' : 'Apply'}
                    </Button>
                  </div>
                  <p className="text-xs text-purple-600">Positive adds entries, negative removes them (floored at zero). Every adjustment is logged with the reason above.</p>
                </div>

                {/* Recent completed deeds — reverse-deed UI */}
                <div className="border rounded-lg overflow-hidden">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider px-3 pt-3 pb-1">Recent Completed Deeds</p>
                  {completedDeedsLoading ? (
                    <div className="text-center py-6 text-slate-400 text-sm">Loading…</div>
                  ) : completedDeeds.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-sm">No completed deeds yet.</div>
                  ) : (
                    <div className="max-h-[280px] overflow-y-auto divide-y">
                      {completedDeeds.map((d) => (
                        <div key={d.id} className={`px-3 py-2 text-sm flex items-center justify-between gap-3 ${d.reversed ? 'opacity-50' : ''}`}>
                          <div className="min-w-0">
                            <p className="text-slate-800 truncate">{d.deed_text}</p>
                            <p className="text-xs text-slate-400">
                              {d.source_type === 'quick_action' ? 'Quick Tap' : 'Bingo card'}
                              {d.category ? ` · ${d.category}` : ''} · {new Date(d.completed_at).toLocaleString()}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={d.reversed || reversingDeedId === d.id}
                            onClick={() => handleReverseDeed(d.id)}
                            className="flex-shrink-0 text-rose-600 hover:text-rose-700"
                          >
                            {d.reversed ? 'Reversed' : reversingDeedId === d.id ? 'Reversing…' : 'Reverse'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {cardViewerResult.card === null ? (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    No card generated for the current week.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Week: <strong className="text-slate-700">{cardViewerResult.card.week_year}</strong></span>
                      <span>
                        Completed: <strong className="text-slate-700">{cardViewerResult.card.completed_cells.length + cardViewerResult.card.purchased_cells.length}</strong> squares
                        {cardViewerResult.card.is_bingo && <span className="ml-2 text-emerald-600 font-bold">🎉 BINGO!</span>}
                      </span>
                    </div>

                    {/* Bingo grid — locked/read-only */}
                    <div className="bg-indigo-950 rounded-xl p-3">
                      {/* Column headers */}
                      <div className="grid grid-cols-5 gap-1 mb-1">
                        {['GR', '8', 'D', 'A', 'Y'].map((l, i) => (
                          <div key={i} className="text-center text-xs font-black text-white/60 py-1">{l}</div>
                        ))}
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {cardViewerResult.card.cells.map((cell: CellData) => (
                          <BingoCell
                            key={cell.index}
                            cell={cell}
                            completedCells={cardViewerResult.card!.completed_cells}
                            purchasedCells={cardViewerResult.card!.purchased_cells}
                            referralCells={cardViewerResult.card!.referral_cells}
                            onMark={() => {}}
                            onUnmark={() => {}}
                            onPurchase={() => {}}
                            locked={true}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500 pt-1">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Completed deed</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Purchased square</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-400 inline-block" /> Referral free</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border inline-block" /> Uncompleted</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        </section>

        {/* Players */}
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
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">Location</th>
                        <th className="px-3 py-2 text-center">Verified</th>
                        <th className="px-3 py-2 text-center">Actions</th>
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
                              <span className="font-medium text-slate-800">{m.name || '—'}</span>
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
                            <td className="px-3 py-2 text-center">
                              {m.email_verified
                                ? <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-semibold">Y</span>
                                : <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-semibold">N</span>}
                            </td>
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              <button onClick={() => editingPlayer === m.id ? setEditingPlayer(null) : startEditPlayer(m)} className="text-indigo-600 hover:text-indigo-800 text-xs mr-2 font-medium">{editingPlayer === m.id ? 'Cancel' : 'Edit'}</button>
                              <button onClick={() => handleDeletePlayer(m.id, m.name || m.email || '')} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                            </td>
                          </tr>
                          {editingPlayer === m.id && (
                            <tr className="bg-indigo-50">
                              <td colSpan={6} className="px-4 py-4">
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

        {/* Teams */}
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

        {/* Game Settings */}
        <section id="section-game-settings">
        {/* Maintenance Mode */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-500" />
              Maintenance Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">
              When on, every player-facing page shows a "back soon" screen instead of the app. The Admin Panel stays accessible so you can turn it back off.
            </p>
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <span className="text-sm font-medium text-slate-700 flex-1">Site Status</span>
              <select
                value={editConfigs['offline_mode'] ?? 'false'}
                onChange={async (e) => {
                  const val = e.target.value;
                  setEditConfigs(prev => ({ ...prev, offline_mode: val }));
                  try {
                    await updateAdminConfig({ offline_mode: val });
                    toast.success(val === 'true' ? 'Site is now in maintenance mode' : 'Site is back online');
                  } catch { toast.error('Failed to save'); }
                }}
                className="border rounded px-2 py-1 text-sm font-semibold"
              >
                <option value="false">🟢 Online</option>
                <option value="true">🔴 Maintenance Mode</option>
              </select>
            </div>
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <span className="text-sm font-medium text-slate-700 flex-1">Back Online At (optional)</span>
              <input
                type="datetime-local"
                value={isoToLocalInput(editConfigs['offline_until'])}
                onChange={async (e) => {
                  const iso = e.target.value ? new Date(e.target.value).toISOString() : '';
                  setEditConfigs(prev => ({ ...prev, offline_until: iso }));
                  try {
                    await updateAdminConfig({ offline_until: iso });
                    toast.success('Maintenance ETA saved');
                  } catch { toast.error('Failed to save'); }
                }}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
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

        {/* Blackout Mode */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-slate-700" />
              Blackout Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              A fog-of-war layer on top of the same card and win condition above — not a separate mode switch for
              everyone. When on, players choose Regular or Blackout for themselves before their card generates.
              When off, every card generates as Regular, exactly as before this feature existed.
            </p>
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-sm font-medium text-slate-700 flex-1">Offer Blackout this cycle</span>
              <select
                value={editConfigs['blackout_enabled'] ?? 'false'}
                onChange={async (e) => {
                  const val = e.target.value;
                  setEditConfigs(prev => ({ ...prev, blackout_enabled: val }));
                  try {
                    await updateAdminConfig({ blackout_enabled: val });
                    toast.success(val === 'true' ? 'Blackout is now offered as a choice' : 'Blackout is off — every new card is Regular');
                  } catch { toast.error('Failed to save'); }
                }}
                className="border rounded px-2 py-1 text-sm font-semibold"
              >
                <option value="false">Off — Regular only</option>
                <option value="true">On — players choose</option>
              </select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Reveal odds — extra squares beyond the one clicked</p>
              <p className="text-xs text-slate-500">Must sum to exactly 100%. Any weight can be zero.</p>
              <div className="grid grid-cols-4 gap-2">
                {(['0', '1', '2', '3'] as const).map((k) => (
                  <div key={k}>
                    <label className="text-xs text-slate-500 font-medium">+{k} extra</label>
                    <input
                      type="number" min="0" max="100" step="1"
                      value={blackoutWeights[k]}
                      onChange={(e) => setBlackoutWeights((prev) => ({ ...prev, [k]: e.target.value }))}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className={`text-sm font-bold px-3 py-1.5 rounded ${Math.abs(blackoutWeightsSum - 100) < 0.01 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>
                Total: {blackoutWeightsSum.toFixed(0)}%{Math.abs(blackoutWeightsSum - 100) >= 0.01 ? ' — must be 100%' : ' ✓'}
              </div>
              <Button
                onClick={handleSaveBlackoutWeights}
                disabled={blackoutWeightsSaving || Math.abs(blackoutWeightsSum - 100) >= 0.01}
                className="bg-slate-700 hover:bg-slate-800 text-white"
              >
                {blackoutWeightsSaving ? 'Saving…' : 'Save Reveal Odds'}
              </Button>
            </div>
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

            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Prize Voucher Code</label>
              <Input
                type="text"
                placeholder="e.g. HAVAGR8-XXXX-XXXX"
                value={prizeVoucherCode}
                onChange={(e) =>
                  setEditConfigs((prev) => ({ ...prev, prize_voucher_code: e.target.value }))
                }
              />
              <p className="text-xs text-slate-400 mt-1">
                Private — never shown publicly. Emailed automatically to the winner the moment you mark their
                prize claim "Fulfilled" below.
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
              <strong>Note:</strong> 0.50 + 1.00 + 2.00 Bucks percentages should add up to 100%. These control the price distribution of purchasable squares.
            </div>
            <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-lg p-3 text-sm text-fuchsia-700">
              <strong>Secret Square:</strong> Every card has one hidden square that secretly awards 1, 2, or 5 Gr8Day Bucks to the player's wallet the first time it's marked. The three percentages above should add up to 100%.
            </div>
            <Button onClick={handleSaveConfig} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Save className="w-4 h-4 mr-1" /> Save Configuration
            </Button>
          </CardContent>
        </Card>

        {/* Weekly Member Update */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-sky-500" />
              Weekly Member Update
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">
              Every Wednesday, a rotating slice of active members (least-recently-contacted first) gets a
              short update written by Claude, covering this week's community stats and the current Admin
              Spotlight Deed. Requires an <code>ANTHROPIC_API_KEY</code> secret to actually send — safely
              skips the run and alerts admins otherwise.
            </p>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Weekly Update % of Members (0 = off)</label>
              <Input
                type="number"
                min="0"
                max="100"
                value={weeklyUpdatePercentage}
                onChange={(e) => setEditConfigs((prev) => ({ ...prev, weekly_update_percentage: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Weekly Update Writing Style</label>
              <Textarea
                placeholder="Write in a warm, encouraging tone. Keep it under 100 words. Sound like a friendly community update, not a corporate newsletter."
                value={weeklyUpdatePrompt}
                onChange={(e) => setEditConfigs((prev) => ({ ...prev, weekly_update_prompt: e.target.value }))}
                className="min-h-[80px] text-sm"
              />
              <p className="text-xs text-slate-400 mt-1">
                1-2 sentences of tone/style guidance for the AI. The structure (subject + body, this week's
                stats, the personal deed count) is fixed in code and always applied — this only shapes how it
                sounds. Leave blank to use the placeholder text above as the default.
              </p>
            </div>
            <Button onClick={handleSaveConfig} className="bg-sky-600 hover:bg-sky-700 text-white">
              <Save className="w-4 h-4 mr-1" /> Save Weekly Update Settings
            </Button>
          </CardContent>
        </Card>

        {/* Deed Categories */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-500" />
              Deed Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500 mb-3">
              Turn categories on or off to control which deed types appear on new cards next week. Cards already in play are not affected.
            </p>
            <div className="space-y-2">
              {deedCategories.map(cat => (
                <div key={cat.name} className="flex items-center justify-between p-3 border rounded-lg bg-slate-50">
                  <div>
                    <span className="font-black text-sm tracking-widest text-slate-800">{cat.name}</span>
                    <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-slate-500">{cat.is_active ? 'Active' : 'Off'}</span>
                    <input
                      type="checkbox"
                      checked={cat.is_active}
                      onChange={async (e) => {
                        const newVal = e.target.checked;
                        setDeedCategories(prev => prev.map(c => c.name === cat.name ? { ...c, is_active: newVal } : c));
                        try {
                          await updateAdminDeedCategory(cat.name, { is_active: newVal });
                          toast.success(`${cat.name} ${newVal ? 'activated' : 'deactivated'}`);
                        } catch {
                          toast.error('Failed to update category');
                          setDeedCategories(prev => prev.map(c => c.name === cat.name ? { ...c, is_active: !newVal } : c));
                        }
                      }}
                      className="w-4 h-4 accent-emerald-500"
                    />
                  </label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        </section>

        {/* Streak Milestones */}
        <section id="section-streaks">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-lg">🔥</span>
              Daily Streak Milestones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">
              Milestones are awarded when a player's current streak reaches the specified number of days. Each milestone is awarded once per player. Deleting a milestone also removes player achievements for it.
            </p>

            {/* Streak enabled toggle in config */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
              <span className="text-sm font-medium text-slate-700 flex-1">Streak Tracker Enabled</span>
              <select
                value={editConfigs['streak_enabled'] ?? 'true'}
                onChange={async (e) => {
                  const val = e.target.value;
                  setEditConfigs(prev => ({ ...prev, streak_enabled: val }));
                  try {
                    await updateAdminConfig({ streak_enabled: val });
                    toast.success('Streak setting saved');
                  } catch { toast.error('Failed to save'); }
                }}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>

            {/* Existing milestones */}
            {streakMilestones.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No milestones configured.</p>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden">
                {streakMilestones.map((m) => (
                  <div key={m.id} className="p-3 text-sm">
                    {editingMilestoneId === m.id ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-slate-500">Days Required</label>
                            <Input
                              type="number"
                              value={editMilestoneData.days_required}
                              onChange={(e) => setEditMilestoneData(p => ({ ...p, days_required: e.target.value }))}
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Display Order</label>
                            <Input
                              type="number"
                              value={editMilestoneData.display_order}
                              onChange={(e) => setEditMilestoneData(p => ({ ...p, display_order: e.target.value }))}
                              className="text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Label</label>
                          <Input
                            value={editMilestoneData.label}
                            onChange={(e) => setEditMilestoneData(p => ({ ...p, label: e.target.value }))}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500">Message</label>
                          <Textarea
                            value={editMilestoneData.message}
                            onChange={(e) => setEditMilestoneData(p => ({ ...p, message: e.target.value }))}
                            className="text-sm"
                            rows={2}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleUpdateMilestone(m.id)} disabled={milestoneLoading}>
                            <Save className="w-3 h-3 mr-1" /> Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingMilestoneId(null)}>
                            <X className="w-3 h-3 mr-1" /> Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${m.is_active ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400'}`}>
                              {m.days_required}d
                            </span>
                            <span className="font-semibold text-slate-800 truncate">{m.label}</span>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2">{m.message}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleToggleMilestone(m.id, !m.is_active)}
                            className={`text-xs px-2 py-0.5 rounded border ${m.is_active ? 'border-emerald-300 text-emerald-700' : 'border-slate-300 text-slate-400'}`}
                            title={m.is_active ? 'Disable' : 'Enable'}
                          >
                            {m.is_active ? 'On' : 'Off'}
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingMilestoneId(m.id);
                              setEditMilestoneData({
                                days_required: String(m.days_required),
                                label: m.label,
                                message: m.message,
                                display_order: String(m.display_order),
                              });
                            }}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteMilestone(m.id)} className="text-red-500 hover:text-red-700">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add new milestone */}
            <div className="border rounded-lg p-3 bg-slate-50 space-y-2">
              <p className="text-xs font-semibold text-slate-600">Add New Milestone</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500">Days Required *</label>
                  <Input
                    type="number"
                    placeholder="e.g. 30"
                    value={newMilestone.days_required}
                    onChange={(e) => setNewMilestone(p => ({ ...p, days_required: e.target.value }))}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Display Order</label>
                  <Input
                    type="number"
                    placeholder="e.g. 30"
                    value={newMilestone.display_order}
                    onChange={(e) => setNewMilestone(p => ({ ...p, display_order: e.target.value }))}
                    className="text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Label *</label>
                <Input
                  placeholder="e.g. 30-Day Streak"
                  value={newMilestone.label}
                  onChange={(e) => setNewMilestone(p => ({ ...p, label: e.target.value }))}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Message *</label>
                <Textarea
                  placeholder="Celebration message shown to player..."
                  value={newMilestone.message}
                  onChange={(e) => setNewMilestone(p => ({ ...p, message: e.target.value }))}
                  className="text-sm"
                  rows={2}
                />
              </div>
              <Button
                size="sm"
                onClick={handleCreateMilestone}
                disabled={milestoneLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Plus className="w-3 h-3 mr-1" /> Add Milestone
              </Button>
            </div>
          </CardContent>
        </Card>
        </section>

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
                <select
                  value={newDeed.category}
                  onChange={(e) => setNewDeed((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-32 sm:w-40 border border-input rounded-md bg-background px-2 text-sm"
                >
                  <option value="">Category</option>
                  {deedCategories.map((c) => (
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
                          <select
                            value={editDeedData.category}
                            onChange={(e) =>
                              setEditDeedData((prev) => ({ ...prev, category: e.target.value }))
                            }
                            className="w-28 h-8 text-sm border border-input rounded-md bg-background px-2"
                          >
                            <option value="">Category</option>
                            {deedCategories.map((c) => (
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

        {/* Draw Results */}
        <section id="section-draw">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-purple-500" />
              Weekly Draw Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500 mb-3">
              Every completed deed earns a weekly-draw entry, and a bingo earns a configurable bonus on top. The draw runs weekly.
            </p>
            {drawWinners.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm flex flex-col items-center gap-2">
                <Ticket className="w-8 h-8 text-slate-300" />
                No draw results yet.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[360px] overflow-y-auto divide-y">
                  {drawWinners.map((w) => (
                    <div key={w.id} className="px-3 py-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-800">{w.name ?? 'Unknown'}</p>
                          {w.email && (
                            <p className="text-slate-500 text-xs">
                              <a href={`mailto:${w.email}`} className="text-indigo-600 hover:underline">{w.email}</a>
                            </p>
                          )}
                          <p className="text-xs text-slate-400">
                            {w.week_year} · won with {w.winning_active_entries ?? '?'} of {w.total_pool_entries ?? '?'} pool entries
                            {w.eligible_players != null ? ` (${w.eligible_players} eligible players)` : ''} · drawn {new Date(w.selected_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${w.odds_weight < 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {w.odds_weight < 0.5 ? 'Repeat winner' : 'Winner'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </section>

        {/* Draw Entry Leaderboard */}
        <section id="section-draw-leaderboard">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-purple-500" />
              Draw Entry Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500 mb-3">
              Per-player draw-entry balances for week {drawLeaderboardWeek || '—'}. Active entries are what's actually weighted in the draw; lifetime is a running total that never decreases.
            </p>
            {drawLeaderboardLoading ? (
              <div className="text-center py-8 text-slate-400 text-sm">Loading…</div>
            ) : drawLeaderboard.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm flex flex-col items-center gap-2">
                <Ticket className="w-8 h-8 text-slate-300" />
                No players have earned draw entries yet.
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[420px] overflow-y-auto divide-y">
                  {drawLeaderboard.map((p) => (
                    <div key={p.user_id} className="px-3 py-2.5 text-sm flex items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{p.player_name}</p>
                        <p className="text-xs text-slate-400">
                          {p.this_week_entries} this week · {p.lifetime_entries} lifetime
                          {p.last_draw_win ? ` · last won ${new Date(p.last_draw_win).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs font-bold px-2 py-1 rounded ${p.current_week_eligible ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {p.current_week_eligible ? 'Eligible' : 'Not eligible'}
                        </span>
                        <span className="text-sm font-bold text-purple-600 w-14 text-right">{p.active_entries}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </section>

        {/* Prize Claims */}
        <section id="section-prize-claims">
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
        </section>

        {/* Game Announcement */}
        <section id="section-announce">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-emerald-500" />
              Announce New Game to All Players
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">
              Send an email to all verified players announcing a new game. Include the prize, game type, and optional theme. A button overview is automatically included at the bottom of every announcement.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Prize <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="e.g. $50 Amazon Gift Card"
                value={announcePrize}
                onChange={(e) => setAnnouncePrize(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Game Type <span className="text-red-500">*</span></label>
              <input
                type="text"
                placeholder="e.g. One Line, Four Corners, Full Card"
                value={announceGameType}
                onChange={(e) => setAnnounceGameType(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Theme <span className="text-slate-400 text-xs">(optional)</span></label>
              <input
                type="text"
                placeholder="e.g. Summer of Kindness"
                value={announceTheme}
                onChange={(e) => setAnnounceTheme(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Additional Message <span className="text-slate-400 text-xs">(optional — leave blank to have Claude write one)</span></label>
              <textarea
                placeholder="Leave blank and Claude will write a short warm note from the Prize/Game Type/Theme above, using the AI Prompt Template below."
                value={announceExtra}
                onChange={(e) => setAnnounceExtra(e.target.value)}
                rows={3}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
              />
            </div>
            <Button
              onClick={handleAnnounceGame}
              disabled={announceLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              {announceLoading ? 'Sending…' : 'Send Announcement to All Players'}
            </Button>

            <div className="pt-3 mt-3 border-t border-slate-200 space-y-2">
              <label className="text-sm font-medium text-slate-700 block">AI Prompt Template <span className="text-slate-400 text-xs">(optional)</span></label>
              <Textarea
                placeholder="Leave blank to use the built-in default prompt."
                value={gameAnnouncementPromptTemplate}
                onChange={(e) => setEditConfigs((prev) => ({ ...prev, game_announcement_prompt_template: e.target.value }))}
                className="min-h-[140px] font-mono text-xs"
              />
              <p className="text-xs text-slate-400">
                Used only when Additional Message above is left blank, and only if an <code>ANTHROPIC_API_KEY</code>{' '}
                secret is configured — otherwise the email just sends with no extra message. Include{' '}
                <code>{'{{PRIZE}}'}</code>, <code>{'{{GAME_TYPE}}'}</code>, and <code>{'{{THEME}}'}</code> so Claude
                knows this week's details.
              </p>
              <Button onClick={handleSaveConfig} variant="outline" size="sm">
                <Save className="w-4 h-4 mr-1" /> Save AI Prompt
              </Button>
            </div>
          </CardContent>
        </Card>
        </section>

        {/* I Dare Ya Outcomes */}
        <section id="section-dare-ya">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-amber-500" />
              I Dare Ya! Outcomes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              Configure the weighted outcomes for the centre square. Active outcomes must sum to exactly 100%.
              The outcome is snapshotted at card generation — players reveal it by clicking the centre cell.
            </p>

            {/* Running total */}
            <div className={`flex items-center gap-2 text-sm font-bold px-3 py-2 rounded-lg border ${Math.abs(activeDareYaTotal - 100) < 0.01 ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-rose-50 border-rose-300 text-rose-700'}`}>
              <span>Active total: {activeDareYaTotal.toFixed(2)}%</span>
              {Math.abs(activeDareYaTotal - 100) < 0.01
                ? <span className="text-emerald-500">✓ Sums to 100%</span>
                : <span className="text-rose-500">⚠ Must sum to 100% before new cards are generated correctly</span>}
            </div>

            {/* Outcome list */}
            <div className="space-y-2">
              {dareYaOutcomes.map(outcome => (
                <div key={outcome.id} className={`border rounded-lg p-3 ${outcome.is_active ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                  {editingDareYaId === outcome.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-slate-500 font-medium">Label</label>
                          <Input value={editDareYaData.label} onChange={e => setEditDareYaData(d => ({ ...d, label: e.target.value }))} className="h-8 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 font-medium">Odds %</label>
                          <Input type="number" min="0" max="100" step="0.01" value={editDareYaData.odds_percent} onChange={e => setEditDareYaData(d => ({ ...d, odds_percent: e.target.value }))} className="h-8 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 font-medium">Action Type</label>
                          <select value={editDareYaData.action_type} onChange={e => setEditDareYaData(d => ({ ...d, action_type: e.target.value as DareYaActionType, credit_amount: '0', remove_amount: '0', reward_amount: '5' }))} className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm h-8">
                            {VALID_ACTION_TYPES.map(t => <option key={t} value={t}>{ACTION_TYPE_LABELS[t]}</option>)}
                          </select>
                        </div>
                        {editDareYaData.action_type === 'fund_credit' && (
                          <div>
                            <label className="text-xs text-slate-500 font-medium">Credit Amount (Gr8Day Bucks)</label>
                            <Input type="number" min="0" step="0.01" value={editDareYaData.credit_amount} onChange={e => setEditDareYaData(d => ({ ...d, credit_amount: e.target.value }))} className="h-8 text-sm" />
                          </div>
                        )}
                        {editDareYaData.action_type === 'remove_funds' && (
                          <div>
                            <label className="text-xs text-slate-500 font-medium">Remove Amount (Gr8Day Bucks)</label>
                            <Input type="number" min="0" step="0.01" value={editDareYaData.remove_amount} onChange={e => setEditDareYaData(d => ({ ...d, remove_amount: e.target.value }))} className="h-8 text-sm" />
                          </div>
                        )}
                        {editDareYaData.action_type === 'refer_friend' && (
                          <div>
                            <label className="text-xs text-slate-500 font-medium">Reward Amount (Gr8Day Bucks)</label>
                            <Input type="number" min="0" step="0.01" value={editDareYaData.reward_amount} onChange={e => setEditDareYaData(d => ({ ...d, reward_amount: e.target.value }))} className="h-8 text-sm" />
                          </div>
                        )}
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={editDareYaData.is_active} onChange={e => setEditDareYaData(d => ({ ...d, is_active: e.target.checked }))} />
                        Active
                      </label>
                      {Math.abs(predictDareYaActiveTotal(outcome.id, editDareYaData.is_active, parseFloat(editDareYaData.odds_percent) || 0) - 100) > 0.01 && (
                        <p className="text-xs text-rose-600">Saving this would leave active outcomes at {predictDareYaActiveTotal(outcome.id, editDareYaData.is_active, parseFloat(editDareYaData.odds_percent) || 0).toFixed(2)}% — must be exactly 100%.</p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleUpdateDareYa(outcome.id)}
                          disabled={dareYaLoading || Math.abs(predictDareYaActiveTotal(outcome.id, editDareYaData.is_active, parseFloat(editDareYaData.odds_percent) || 0) - 100) > 0.01}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingDareYaId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-800">{outcome.label}</span>
                          <span className="text-xs bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">{ACTION_TYPE_LABELS[outcome.action_type]}</span>
                          {outcome.action_type === 'fund_credit' && outcome.credit_amount > 0 && (
                            <span className="text-xs text-slate-500">{Number(outcome.credit_amount).toFixed(2)} Bucks</span>
                          )}
                          {outcome.action_type === 'remove_funds' && outcome.remove_amount > 0 && (
                            <span className="text-xs text-slate-500">{Number(outcome.remove_amount).toFixed(2)} Bucks</span>
                          )}
                          {outcome.action_type === 'refer_friend' && outcome.reward_amount > 0 && (
                            <span className="text-xs text-slate-500">{Number(outcome.reward_amount).toFixed(2)} Bucks</span>
                          )}
                        </div>
                        <span className="text-sm font-bold text-amber-600">{Number(outcome.odds_percent).toFixed(2)}%</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="outline" onClick={() => {
                          setEditingDareYaId(outcome.id);
                          setEditDareYaData({
                            label: outcome.label, odds_percent: String(outcome.odds_percent), action_type: outcome.action_type,
                            credit_amount: String(outcome.credit_amount), remove_amount: String(outcome.remove_amount), reward_amount: String(outcome.reward_amount),
                            is_active: outcome.is_active,
                          });
                        }}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteDareYa(outcome.id)} className="text-rose-600 hover:text-rose-700">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add new outcome */}
            <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Add Outcome</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 font-medium">Label</label>
                  <Input placeholder="e.g. Fund Credit!" value={newDareYa.label} onChange={e => setNewDareYa(d => ({ ...d, label: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">Odds %</label>
                  <Input type="number" min="0" max="100" step="0.01" placeholder="25" value={newDareYa.odds_percent} onChange={e => setNewDareYa(d => ({ ...d, odds_percent: e.target.value }))} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium">Action Type</label>
                  <select value={newDareYa.action_type} onChange={e => setNewDareYa(d => ({ ...d, action_type: e.target.value as DareYaActionType, credit_amount: '0', remove_amount: '0', reward_amount: '5' }))} className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm h-8">
                    {VALID_ACTION_TYPES.map(t => <option key={t} value={t}>{ACTION_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                {newDareYa.action_type === 'fund_credit' && (
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Credit Amount (Gr8Day Bucks)</label>
                    <Input type="number" min="0" step="0.01" placeholder="0.00" value={newDareYa.credit_amount} onChange={e => setNewDareYa(d => ({ ...d, credit_amount: e.target.value }))} className="h-8 text-sm" />
                  </div>
                )}
                {newDareYa.action_type === 'remove_funds' && (
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Remove Amount (Gr8Day Bucks)</label>
                    <Input type="number" min="0" step="0.01" placeholder="0.00" value={newDareYa.remove_amount} onChange={e => setNewDareYa(d => ({ ...d, remove_amount: e.target.value }))} className="h-8 text-sm" />
                  </div>
                )}
                {newDareYa.action_type === 'refer_friend' && (
                  <div>
                    <label className="text-xs text-slate-500 font-medium">Reward Amount (Gr8Day Bucks)</label>
                    <Input type="number" min="0" step="0.01" placeholder="5.00" value={newDareYa.reward_amount} onChange={e => setNewDareYa(d => ({ ...d, reward_amount: e.target.value }))} className="h-8 text-sm" />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newDareYa.is_active} onChange={e => setNewDareYa(d => ({ ...d, is_active: e.target.checked }))} />
                Active
              </label>
              {newDareYa.odds_percent && Math.abs(predictDareYaActiveTotal(null, newDareYa.is_active, parseFloat(newDareYa.odds_percent) || 0) - 100) > 0.01 && (
                <p className="text-xs text-rose-600">Adding this would leave active outcomes at {predictDareYaActiveTotal(null, newDareYa.is_active, parseFloat(newDareYa.odds_percent) || 0).toFixed(2)}% — must be exactly 100%.</p>
              )}
              <Button
                size="sm"
                onClick={handleAddDareYa}
                disabled={dareYaLoading || !newDareYa.label.trim() || !newDareYa.odds_percent || Math.abs(predictDareYaActiveTotal(null, newDareYa.is_active, parseFloat(newDareYa.odds_percent) || 0) - 100) > 0.01}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Plus className="w-3 h-3 mr-1" /> Add Outcome
              </Button>
            </div>
          </CardContent>
        </Card>
        </section>

        {/* Card-Pickup Reflection Prompts */}
        <section id="section-pickup-prompts">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircleQuestion className="w-5 h-5 text-violet-500" />
              Card-Pickup Reflection Prompts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              A short, optional self-reflection question shown when a player picks up a new card, drawn at random from
              the active/Approved rows below. Answering is never required and never blocks card generation.
            </p>

            {/* Prompt list */}
            <div className="space-y-2">
              {pickupPrompts.map(prompt => (
                <div key={prompt.id} className={`border rounded-lg p-3 ${prompt.is_active ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                  {editingPromptId === prompt.id ? (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-slate-500 font-medium">Question</label>
                        <Textarea value={editPromptData.question_text} onChange={e => setEditPromptData(d => ({ ...d, question_text: e.target.value }))} className="text-sm min-h-[60px]" maxLength={300} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-slate-500 font-medium">Status</label>
                          <select value={editPromptData.status} onChange={e => setEditPromptData(d => ({ ...d, status: e.target.value as CardPickupPrompt['status'] }))} className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm h-8">
                            {PROMPT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm mt-5">
                          <input type="checkbox" checked={editPromptData.is_active} onChange={e => setEditPromptData(d => ({ ...d, is_active: e.target.checked }))} />
                          Active
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdatePickupPrompt(prompt.id)} disabled={promptLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingPromptId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{prompt.question_text}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{prompt.status}{!prompt.is_active && ' · Inactive'}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => { setEditingPromptId(prompt.id); setEditPromptData({ question_text: prompt.question_text, status: prompt.status, is_active: prompt.is_active }); }}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeletePickupPrompt(prompt.id)} className="text-rose-600 hover:text-rose-700">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {pickupPrompts.length === 0 && (
                <p className="text-sm text-slate-400 italic">No prompts yet — add one below.</p>
              )}
            </div>

            {/* Add new prompt */}
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <label className="text-xs text-slate-500 font-medium">New Prompt</label>
              <Textarea
                placeholder="e.g. What deed are you most proud of?"
                value={newPickupPrompt.question_text}
                onChange={e => setNewPickupPrompt(d => ({ ...d, question_text: e.target.value }))}
                className="text-sm min-h-[60px]"
                maxLength={300}
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 font-medium">Status</label>
                  <select value={newPickupPrompt.status} onChange={e => setNewPickupPrompt(d => ({ ...d, status: e.target.value as CardPickupPrompt['status'] }))} className="w-full border border-slate-300 rounded-md px-2 py-1 text-sm h-8">
                    {PROMPT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm mt-5">
                  <input type="checkbox" checked={newPickupPrompt.is_active} onChange={e => setNewPickupPrompt(d => ({ ...d, is_active: e.target.checked }))} />
                  Active
                </label>
              </div>
              <Button
                size="sm"
                onClick={handleAddPickupPrompt}
                disabled={promptLoading || !newPickupPrompt.question_text.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                <Plus className="w-3 h-3 mr-1" /> Add Prompt
              </Button>
            </div>

            {/* Response review queue — nothing a player typed goes public until approved here */}
            <div className="border-t border-slate-200 pt-3 space-y-2">
              <label className="text-xs text-slate-500 font-medium">
                Player Responses — approve to show on the Kindness Dashboard's Community Voices (username shown, never a real name)
              </label>
              {promptResponses.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No responses yet.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {promptResponses.map(r => (
                    <div key={r.id} className={`border rounded-lg p-3 ${r.is_approved_for_display ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                      <p className="text-xs text-slate-500 font-medium">{r.question_text}</p>
                      <p className="text-sm text-slate-800 mt-0.5">{r.response_text}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-slate-400">@{r.username ?? 'unknown'}</p>
                        <Button
                          size="sm"
                          variant={r.is_approved_for_display ? 'outline' : 'default'}
                          onClick={() => handleToggleResponseApproval(r.id, !r.is_approved_for_display)}
                          disabled={responseApprovalLoading === r.id}
                          className={r.is_approved_for_display ? '' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
                        >
                          {r.is_approved_for_display ? 'Hide' : 'Approve'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        </section>

        {/* Weekly Reset */}
        <section id="section-reset">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-sky-500" />
              Weekly New Card Email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">
              Sends a "your new card is ready" email to all verified players. This runs automatically every Monday at 8am UTC. Use the button below to send it manually at any time.
            </p>
            <Button
              onClick={handleWeeklyReset}
              disabled={weeklyResetLoading}
              className="bg-sky-600 hover:bg-sky-700 text-white font-bold"
            >
              {weeklyResetLoading ? 'Sending…' : 'Send Now to All Players'}
            </Button>
          </CardContent>
        </Card>
        </section>
      </div>
      <Footer tone="light" />
    </div>
  );
};

export default AdminPanel;
