import { apiClient } from './apiClient';

/**
 * Retry helper for transient network/backend errors.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 600
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const errObj = err as { message?: string; status?: number };
      const msg = (errObj?.message || '').toString().toLowerCase();
      const status = errObj?.status;
      const isTransient =
        msg.includes('timeout') ||
        msg.includes('dns') ||
        msg.includes('resolve') ||
        msg.includes('network') ||
        msg.includes('failed to fetch') ||
        status === 502 ||
        status === 503 ||
        status === 504;

      if (!isTransient || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

// Types
export interface CellData {
  index: number;
  deed_text: string;
  deed_text_long?: string | null;
  deed_id: number | null;
  is_free_space: boolean;
  is_purchasable: boolean;
  purchase_price: number | null;
  is_referral_free: boolean;
  is_secret?: boolean;
  secret_reward?: number | null;
  secret_revealed?: boolean;
  quantity?: number;
  category?: string | null;
  // Blackout: a still-hidden square arrives with every deed field null and
  // this flag set — the deed content is genuinely absent from the response,
  // not just visually covered client-side.
  is_hidden?: boolean;
  // I Dare Ya — present on center cell (index 12) in classic mode
  dare_ya_outcome_type?: string | null;
  dare_ya_label?: string | null;
  dare_ya_action_value?: number | null;
  dare_ya_revealed?: boolean;
}

export interface StreakMilestone {
  id: number;
  days_required: number;
  label: string;
  message: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface StreakMilestoneHit {
  id: number;
  days_required: number;
  label: string;
  message: string;
}

export interface StreakUpdate {
  current_streak_days: number;
  longest_streak_days: number;
  new_milestones: StreakMilestoneHit[];
}

export interface StreakData {
  current_streak_days: number;
  longest_streak_days: number;
  last_valid_deed_date: string | null;
  achievements: Array<{
    days_required: number;
    label: string;
    message: string;
    achieved_at: string;
  }>;
}

export interface MarkCellResult {
  success: boolean;
  completed_cells: number[];
  is_bingo: boolean;
  secret_reward?: number;
  draw_bonus_entries?: number;
  streak_update?: StreakUpdate;
  // Bomb Square: the whole card was just rewritten instead of this one
  // square being completed. When present, these replace the card's cells/
  // purchased/referral/pick_three state wholesale.
  bomb_triggered?: boolean;
  cells?: CellData[];
  purchased_cells?: number[];
  referral_cells?: number[];
  pick_three_used?: boolean;
}

export interface BlackoutState {
  hidden_cells: number[];
  blocked_cells: number[];
  active_group: number[] | null;
  is_paused: boolean;
}

export interface CardData {
  card_id: number;
  week_year: string;
  cells: CellData[];
  win_condition: string;
  completed_cells: number[];
  purchased_cells: number[];
  referral_cells: number[];
  is_bingo: boolean;
  draw_bonus_entries?: number;
  pick_three_used?: boolean;
  game_mode?: 'classic' | 'blackout';
  blackout?: BlackoutState | null;
}

export type DareYaActionType = 'free_square' | 'refer_friend' | 'fund_credit' | 'remove_funds' | 'replace_three' | 'nothing';

export interface DareYaOutcome {
  id: number;
  label: string;
  odds_percent: number;
  action_type: DareYaActionType;
  credit_amount: number;
  remove_amount: number;
  reward_amount: number;
  is_active: boolean;
}

export interface DareYaRevealResult {
  outcome: DareYaActionType;
  label: string;
  amount: number;
  new_balance?: number;
  prompt_referral?: boolean;
  replaced?: { index: number; old_deed: string; new_deed: string }[];
  completed_cells: number[];
  is_bingo: boolean;
  draw_bonus_entries?: number;
}

export async function revealDareYa(cardId: number): Promise<DareYaRevealResult> {
  return apiClient.post<DareYaRevealResult>('/game/dare-ya-reveal', { card_id: cardId });
}

export interface DareYaReferFriendResult {
  matched: boolean;
  message?: string;
  label?: string;
  amount?: number;
  new_balance?: number;
  completed_cells?: number[];
  is_bingo?: boolean;
  draw_bonus_entries?: number;
}

export async function submitDareYaReferFriend(cardId: number, email: string): Promise<DareYaReferFriendResult> {
  return apiClient.post<DareYaReferFriendResult>('/game/dare-ya-refer-friend', { card_id: cardId, email });
}

export async function adminGetDareYaOutcomes(): Promise<{ outcomes: DareYaOutcome[] }> {
  return apiClient.get('/game/admin/dare-ya-outcomes');
}

export async function adminCreateDareYaOutcome(data: Omit<DareYaOutcome, 'id'>): Promise<{ outcome: DareYaOutcome }> {
  return apiClient.post('/game/admin/dare-ya-outcomes', data);
}

export async function adminUpdateDareYaOutcome(id: number, data: Partial<Omit<DareYaOutcome, 'id'>>): Promise<{ outcome: DareYaOutcome }> {
  return apiClient.put(`/game/admin/dare-ya-outcomes/${id}`, data);
}

export async function adminDeleteDareYaOutcome(id: number): Promise<void> {
  return apiClient.delete(`/game/admin/dare-ya-outcomes/${id}`);
}

export interface WinCondition {
  id: string;
  name: string;
  description: string;
}

export interface WalletData {
  balance: number;
  wallet_id: number;
}

export interface Transaction {
  id: number;
  amount: number;
  transaction_type: string;
  item_description: string | null;
  created_at: string | null;
  stripe_session_id?: string | null;
  status?: string | null;
}

// Alias used by WalletPage top-up flow
export type WalletTransaction = Transaction

export async function createTopup(amount: number): Promise<{ url: string }> {
  return apiClient.post<{ url: string }>('/payment/create-topup', { amount });
}

export interface DeedItem {
  id: number;
  deed_text: string;
  deed_text_long?: string | null;
  category: string;
  is_active: boolean;
  complexity?: number | null;
  quantity?: number | null;
  quick_tap_eligible?: boolean;
  quick_tap_default?: boolean;
  quick_tap_label?: string | null;
  status?: string;
}

export interface QuickTapDeed {
  id: number;
  deed_text: string;
  deed_text_long: string | null;
  category: string;
  quick_tap_label: string | null;
}

// API calls
export async function generateCard(gameMode?: 'classic' | 'blackout'): Promise<CardData> {
  return withRetry(() => apiClient.post<CardData>('/game/generate-card', gameMode ? { game_mode: gameMode } : {}));
}

export async function getMyCardStatus(): Promise<{ has_card: boolean; blackout_offered: boolean }> {
  return apiClient.get('/game/my-card-status');
}

export async function revealBlackoutCell(cellIndex: number): Promise<{ revealed: CellData[]; hidden_cells: number[]; active_group: number[] }> {
  return apiClient.post('/game/blackout/reveal', { cell_index: cellIndex });
}

export async function passBlackoutCell(cellIndex: number): Promise<{ success: boolean; blocked_cells: number[]; active_group: number[] | null }> {
  return apiClient.post('/game/blackout/pass', { cell_index: cellIndex });
}

export async function pauseBlackout(): Promise<{ success: boolean }> {
  return apiClient.post('/game/blackout/pause', {});
}

export async function resumeBlackout(): Promise<{ success: boolean }> {
  return apiClient.post('/game/blackout/resume', {});
}

export async function resetCard(): Promise<CardData> {
  return apiClient.post<CardData>('/game/reset-card', {});
}

export async function markCell(cardId: number, cellIndex: number, note?: string): Promise<MarkCellResult> {
  return apiClient.post<MarkCellResult>('/game/mark-cell', {
    card_id: cardId,
    cell_index: cellIndex,
    ...(note ? { note } : {}),
  });
}

export interface CellMarkLogEntry {
  id: number;
  user_id: string;
  card_id: number;
  cell_index: number;
  action: 'mark' | 'void';
  note: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  users?: { username: string; email: string } | null;
}

export async function adminGetCellMarkLog(limit = 100): Promise<CellMarkLogEntry[]> {
  const data = await apiClient.get<{ logs: CellMarkLogEntry[] }>(`/game/admin/cell-mark-log?limit=${limit}`);
  return data.logs;
}

export async function adminVoidCell(cardId: number, cellIndex: number, reason: string): Promise<MarkCellResult> {
  return apiClient.post<MarkCellResult>('/game/admin/void-cell', {
    card_id: cardId,
    cell_index: cellIndex,
    reason,
  });
}

export interface PrizeHistoryEntry {
  week_year: string;
  win_condition: string;
  won_at: string;
  claim: {
    id: number;
    week_year: string;
    status: string;
    full_name: string;
    email: string;
    created_at: string;
  } | null;
}

export interface CountryOption { id: number; name: string; code: string; }
export interface StateOption { id: number; name: string; code: string; }

export async function getCountries(): Promise<CountryOption[]> {
  const data = await apiClient.get<{ countries: CountryOption[] }>('/game/public/countries', { skipAuth: true } as any);
  return data.countries;
}

export async function getStates(countryId: number): Promise<StateOption[]> {
  const data = await apiClient.get<{ states: StateOption[] }>(`/game/public/states/${countryId}`, { skipAuth: true } as any);
  return data.states;
}

export async function getMyPrizeHistory(): Promise<PrizeHistoryEntry[]> {
  const data = await apiClient.get<{ history: PrizeHistoryEntry[] }>('/game/my-prize-history');
  return data.history;
}

export interface PlayerBadge {
  total_deeds: number;
  badge_name: string;
  badge_emoji: string;
  next_badge_name: string | null;
  next_badge_emoji: string | null;
  deeds_to_next_badge: number | null;
  is_captain: boolean;
  captain_of_team: { id: string; name: string } | null;
}

export async function getMyProfile(): Promise<PlayerBadge> {
  return apiClient.get<PlayerBadge>('/game/my-profile');
}

export interface PlayerProfile {
  username: string;
  player_number: number | null;
  member_since: string;
  total_deeds: number;
  badge_name: string;
  badge_emoji: string;
  next_badge_name: string | null;
  next_badge_emoji: string | null;
  deeds_to_next_badge: number | null;
  current_streak_days: number;
  longest_streak_days: number;
  country_name: string | null;
  team_name: string | null;
}

export async function getPlayerProfile(username: string): Promise<PlayerProfile> {
  return apiClient.get<PlayerProfile>(`/game/players/${encodeURIComponent(username)}`);
}

export interface QuickDeed {
  id: number;
  label: string;
  emoji: string;
  display_order: number;
}

export async function getQuickDeeds(): Promise<QuickDeed[]> {
  const res = await apiClient.get<{ quick_deeds: QuickDeed[] }>('/game/quick-deeds');
  return res.quick_deeds;
}

export async function tapQuickDeed(id: number): Promise<{ success: boolean; streak_update?: StreakUpdate }> {
  return apiClient.post<{ success: boolean; streak_update?: StreakUpdate }>(`/game/quick-deeds/${id}/tap`, {});
}

// ---------- Quick Tap v2 ----------
export async function getQuickTapEligibleDeeds(): Promise<{ deeds: QuickTapDeed[] }> {
  return apiClient.get('/game/quick-tap-deeds/eligible');
}

export async function getMyQuickTaps(): Promise<{ source: 'custom' | 'default'; deeds: QuickTapDeed[] }> {
  return apiClient.get('/game/my-quick-taps');
}

export async function setMyQuickTaps(deedIds: number[]): Promise<{ success: boolean }> {
  return apiClient.put('/game/my-quick-taps', { deed_ids: deedIds });
}

export async function tapQuickTapDeed(deedId: number): Promise<{ success: boolean; streak_update?: StreakUpdate }> {
  return apiClient.post(`/game/quick-taps/${deedId}/tap`, {});
}

// Admin Spotlight Deed — a 4th Quick Tap slot, same deed shown to every
// player at once, expires automatically at the weekly reset.
export async function getSpotlightQuickTap(): Promise<{ deed: QuickTapDeed | null }> {
  return apiClient.get('/game/spotlight-quick-tap');
}

export async function adminGetSpotlightQuickTap(): Promise<{ active: boolean; deed: { id: number; deed_text: string; category: string } | null; week_year: string | null }> {
  return apiClient.get('/game/admin/spotlight-quick-tap');
}

export async function adminSetSpotlightQuickTap(deedId: number): Promise<{ success: boolean }> {
  return apiClient.post('/game/admin/spotlight-quick-tap', { deed_id: deedId });
}

// Card-pickup reflection prompt — a short, optional self-reflection question
// shown at the mode-picker step before a card is generated. Answering is
// never required; a null id means the pool is empty and the frontend skips
// the step entirely.
export interface CardPickupPrompt {
  id: number;
  question_text: string;
  is_active: boolean;
  status: 'Draft' | 'Review' | 'Approved' | 'Retired';
}

export async function getPickupPrompt(): Promise<{ id: number | null; question_text: string | null }> {
  return apiClient.get('/game/pickup-prompt');
}

export async function submitPickupPromptResponse(promptId: number, responseText: string): Promise<{ success: boolean }> {
  return apiClient.post('/game/pickup-prompt-response', { prompt_id: promptId, response_text: responseText });
}

export async function adminGetCardPickupPrompts(): Promise<{ prompts: CardPickupPrompt[] }> {
  return apiClient.get('/game/admin/card-pickup-prompts');
}

export async function adminCreateCardPickupPrompt(data: Omit<CardPickupPrompt, 'id'>): Promise<{ prompt: CardPickupPrompt }> {
  return apiClient.post('/game/admin/card-pickup-prompts', data);
}

export async function adminUpdateCardPickupPrompt(id: number, data: Partial<Omit<CardPickupPrompt, 'id'>>): Promise<{ prompt: CardPickupPrompt }> {
  return apiClient.put(`/game/admin/card-pickup-prompts/${id}`, data);
}

export async function adminDeleteCardPickupPrompt(id: number): Promise<void> {
  return apiClient.delete(`/game/admin/card-pickup-prompts/${id}`);
}

export interface RecentDeed {
  deed_text: string;
  city: string | null;
  country_name: string | null;
  completed_at: string;
}

export async function getRecentDeeds(): Promise<{ deeds: RecentDeed[] }> {
  return apiClient.get('/game/public/recent-deeds', { skipAuth: true });
}

export interface CommunityVoice {
  question_text: string;
  response_text: string;
  username: string | null;
}

export async function getCommunityVoices(): Promise<{ voices: CommunityVoice[] }> {
  return apiClient.get('/game/public/community-voices', { skipAuth: true });
}

export interface PromptResponse {
  id: number;
  question_text: string;
  response_text: string;
  username: string | null;
  is_approved_for_display: boolean;
  created_at: string;
}

export async function adminGetPromptResponses(): Promise<{ responses: PromptResponse[] }> {
  return apiClient.get('/game/admin/prompt-responses');
}

export async function adminApprovePromptResponse(id: number, approved: boolean): Promise<{ response: PromptResponse }> {
  return apiClient.put(`/game/admin/prompt-responses/${id}`, { is_approved_for_display: approved });
}

export type ImpactStatsPeriod = 'week' | 'month' | 'quarter' | 'year' | 'all';

export interface MyImpactStats {
  period: string;
  total: number;
  top_deeds: { deed_text: string; count: number }[];
}

export async function getMyImpactStats(period: ImpactStatsPeriod): Promise<MyImpactStats> {
  return apiClient.get(`/game/my-impact-stats?period=${period}`);
}

export interface TeamMember {
  id: number;
  user_id: string;
  users: { id: string; player_number: number | null; first_name: string | null; last_name: string | null; username: string | null } | null;
}

export interface TeamItem {
  id: number;
  team_number: number;
  team_name: string;
  created_at: string;
  captain: { id: string; player_number: number | null; first_name: string | null; last_name: string | null; username: string | null } | null;
  team_members: TeamMember[];
}

export async function adminGetTeams(): Promise<TeamItem[]> {
  const data = await apiClient.get<{ teams: TeamItem[] }>('/game/admin/teams');
  return data.teams;
}

export async function adminCreateTeam(teamName: string, captainPlayerNumber?: number): Promise<void> {
  await apiClient.post('/game/admin/teams', { team_name: teamName, captain_player_number: captainPlayerNumber });
}

export async function adminUpdateTeam(teamId: number, teamName?: string, captainPlayerNumber?: number | null): Promise<void> {
  await apiClient.put(`/game/admin/teams/${teamId}`, { team_name: teamName, captain_player_number: captainPlayerNumber });
}

export async function adminDeleteTeam(teamId: number): Promise<void> {
  await apiClient.delete(`/game/admin/teams/${teamId}`);
}

export async function adminAddTeamMember(teamId: number, playerNumber: number): Promise<void> {
  await apiClient.post(`/game/admin/teams/${teamId}/members`, { player_number: playerNumber });
}

export async function adminRemoveTeamMember(teamId: number, userId: string): Promise<void> {
  await apiClient.delete(`/game/admin/teams/${teamId}/members/${userId}`);
}

export interface MyTeamMember {
  user_id: string;
  player_number: number | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  card: CardData | null;
}

export interface MyTeamData {
  id: number;
  team_number: number;
  team_name: string;
  captain: { id: string; player_number: number | null; first_name: string | null; last_name: string | null } | null;
  members: MyTeamMember[];
  week_year: string;
}

export async function getMyTeam(): Promise<{ team: MyTeamData | null }> {
  return apiClient.get<{ team: MyTeamData | null }>('/game/my-team');
}

export async function adminTriggerWeeklyReset(): Promise<{ week: string; draw: { winner_name: string | null; already_ran: boolean } }> {
  return apiClient.post('/weekly-reset', {});
}

export async function adminAnnounceGame(params: {
  prize: string
  game_type: string
  theme: string
  extra_message?: string
}): Promise<{ sent: number; failed: number }> {
  return apiClient.post('/game/admin/announce-game', params);
}

export async function unmarkCell(cardId: number, cellIndex: number): Promise<MarkCellResult> {
  return apiClient.post<MarkCellResult>('/game/unmark-cell', {
    card_id: cardId,
    cell_index: cellIndex,
  });
}

export async function purchaseCell(cardId: number, cellIndex: number) {
  return apiClient.post<{ purchased_cells: number[]; is_bingo: boolean; new_balance: number; draw_bonus_entries?: number }>(
    '/game/purchase-cell',
    { card_id: cardId, cell_index: cellIndex }
  );
}

export interface PickThreeResult {
  success: boolean;
  replaced: { index: number; old_deed: string; new_deed: string }[];
  cells: CellData[];
}

export async function pickThree(cardId: number, cellIndices: number[]) {
  return apiClient.post<PickThreeResult>('/game/pick-three', {
    card_id: cardId, cell_indices: cellIndices,
  });
}

export async function submitReferral(email: string) {
  return apiClient.post<{ success: boolean }>('/game/submit-referral', {
    referred_email: email,
  });
}

export async function getWallet(): Promise<WalletData> {
  return withRetry(() => apiClient.get<WalletData>('/game/wallet'));
}

export async function addFunds(amount: number) {
  return apiClient.post<{ new_balance: number }>('/game/wallet/add-funds', { amount });
}

export async function getTransactions(): Promise<{ transactions: Transaction[] }> {
  return apiClient.get<{ transactions: Transaction[] }>('/game/wallet/transactions');
}

export interface PrizeInfo {
  prize_image_url: string;
  prize_title: string;
}

export interface GameLeaderboardEntry {
  week_year: string;
  game_number: number;
  total_deeds: number;
  active_players: number;
  bingo_winners: number;
  is_current: boolean;
}

export interface LeaderboardData {
  current_week_year: string;
  games: GameLeaderboardEntry[];
  total_games: number;
  grand_total_deeds: number;
}

export async function getLeaderboard(): Promise<LeaderboardData> {
  return withRetry(() => apiClient.get<LeaderboardData>('/game/leaderboard'));
}

export interface PlayerRankEntry {
  user_id: string;
  display_name: string;
  username: string | null;
  player_number: number | null;
  city: string | null;
  country_name: string | null;
  country_code: string | null;
  deeds: number;
  referrals: number;
  badge_name: string;
  badge_emoji: string;
  last_played?: string | null;
}

export interface TopDeedEntry {
  deed_id: number;
  deed_text: string;
  category: string;
  count: number;
}

export interface LeaderboardRegion {
  code: string;
  name: string;
  flag: string;
  players: PlayerRankEntry[];
}

export interface PlayerLeaderboardData {
  all_time: PlayerRankEntry[];
  this_week: PlayerRankEntry[];
  regions_all_time: LeaderboardRegion[];
  regions_this_week: LeaderboardRegion[];
  current_week_year: string;
  top_deeds: TopDeedEntry[];
  promotion_threshold: number;
  this_week_deeds: number;
  last_week_deeds: number;
  week_trend: number;
  unique_countries: number;
  top_country_flags: string[];
  new_players_this_week: number;
  new_players_last_week: number;
  total_referrals: number;
  geo_tree?: GeoCountry[];
  deed_breakdown?: TopDeedEntry[];
  geo_drilldown_threshold?: number;
}

export interface GeoCity { name: string; deeds: number; players: number; }
export interface GeoState { name: string; deeds: number; players: number; cities: GeoCity[]; }
export interface GeoCountry { code: string; name: string; deeds: number; players: number; states: GeoState[]; }

export async function getPlayerLeaderboard(): Promise<PlayerLeaderboardData> {
  return withRetry(() => apiClient.get<PlayerLeaderboardData>('/game/leaderboard/players', { skipAuth: true } as any));
}

// ── Impact Board (Issue #14) ────────────────────────────────────────────────────
export type ImpactPeriod = 'month' | 'quarter' | 'year' | 'all';

export interface ImpactSummary {
  period: ImpactPeriod;
  impact: { deeds_delivered: number; bingos_achieved: number; full_cards_completed: number };
  participation: { active_players: number; lifetime_players: number; active_teams: number; lifetime_teams: number };
  reach: { cities: number; provinces: number; countries: number };
}

export async function getImpactSummary(period: ImpactPeriod): Promise<ImpactSummary> {
  return apiClient.get<ImpactSummary>(`/game/impact/summary?period=${period}`, { skipAuth: true } as any);
}

export async function getPublicPrize(): Promise<PrizeInfo> {
  return apiClient.get<PrizeInfo>('/game/public/prize', { skipAuth: true });
}

export interface PublicWinner {
  display_name: string;
  prize_title: string | null;
  prize_image_url: string | null;
  week_year: string;
  selected_at: string;
}

export async function getLatestWinner(): Promise<{ winner: PublicWinner | null }> {
  return apiClient.get<{ winner: PublicWinner | null }>('/game/public/latest-winner', { skipAuth: true } as any);
}

export async function getPastWinners(limit = 12): Promise<{ winners: PublicWinner[] }> {
  return apiClient.get<{ winners: PublicWinner[] }>(`/game/public/past-winners?limit=${limit}`, { skipAuth: true } as any);
}

// Deliberately does NOT pass skipAuth: true — a logged-in test player's
// Offline Mode exemption is checked server-side off their token, so this
// call needs to send it when one exists. Still works fine for logged-out
// visitors: apiClient only attaches the header if a token is actually stored.
export async function getOfflineStatus(): Promise<{ offline_mode: boolean; offline_until: string | null }> {
  return apiClient.get<{ offline_mode: boolean; offline_until: string | null }>('/game/public/offline-status');
}

export async function getWinConditions(): Promise<WinCondition[]> {
  const res = await apiClient.get<{ conditions: WinCondition[] }>('/game/win-conditions');
  return res.conditions;
}

export async function adminVerify(password: string) {
  return apiClient.post<{ success: boolean }>('/game/admin/verify', { password });
}

export async function adminUnlock(token: string) {
  return apiClient.get<{ success: boolean }>(`/game/admin/unlock?token=${encodeURIComponent(token)}`, { skipAuth: true } as any);
}

export async function adminRequestPasswordReset() {
  return apiClient.post<{ success: boolean }>('/game/admin/request-password-reset', {}, { skipAuth: true } as any);
}

export async function adminResetPassword(token: string, newPassword: string) {
  return apiClient.post<{ success: boolean }>('/game/admin/reset-password', { token, new_password: newPassword }, { skipAuth: true } as any);
}

export async function getAdminConfig() {
  return withRetry(() => apiClient.get<Record<string, string>>('/game/admin/config'));
}

export interface DeedCategory {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
}

export async function getAdminDeedCategories(): Promise<{ categories: DeedCategory[] }> {
  return apiClient.get('/game/admin/deed-categories');
}

export async function updateAdminDeedCategory(name: string, updates: { is_active?: boolean; description?: string }): Promise<void> {
  await apiClient.put(`/game/admin/deed-categories/${name}`, updates);
}

export async function updateAdminConfig(configs: Record<string, string>) {
  return apiClient.post<{ success: boolean }>('/game/admin/config', { configs });
}

export async function getAdminDeeds(): Promise<{ deeds: DeedItem[] }> {
  return withRetry(() => apiClient.get<{ deeds: DeedItem[] }>('/game/admin/deeds'));
}

export async function createAdminDeed(deed: {
  deed_text: string;
  deed_text_long?: string;
  category: string;
  is_active: boolean;
  complexity?: number;
  quantity?: number;
  quick_tap_eligible?: boolean;
  quick_tap_default?: boolean;
  quick_tap_label?: string | null;
  status?: string;
}) {
  return apiClient.post<DeedItem>('/game/admin/deeds', deed);
}

export async function updateAdminDeed(id: number, deed: Partial<DeedItem>) {
  return apiClient.put<DeedItem>(`/game/admin/deeds/${id}`, deed);
}

export async function bulkUpdateAdminDeedStatus(ids: number[], status: string) {
  return apiClient.post<{ success: boolean; updated: number }>('/game/admin/deeds/bulk-status', { ids, status });
}

export async function deleteAdminDeed(id: number) {
  return apiClient.delete<{ success: boolean }>(`/game/admin/deeds/${id}`);
}

export interface ImportDeedsResult {
  success: boolean;
  updated: number;
  created: number;
  skipped: number;
  total: number;
  warnings?: string[];
}

export async function importDeeds(deeds: (Partial<DeedItem> & Record<string, unknown>)[]): Promise<ImportDeedsResult> {
  return apiClient.post<ImportDeedsResult>('/game/admin/deeds/import', { deeds });
}

// ---------- Deed Targeting ----------
export interface TargetingValue {
  id: number;
  label: string;
  description: string | null;
  is_default: boolean;
  display_order: number;
}

export interface TargetingAttribute {
  id: number;
  name: string;
  display_order: number;
  values: TargetingValue[];
}

export async function getAdminTargetingAttributes(): Promise<{ attributes: TargetingAttribute[] }> {
  return apiClient.get('/game/admin/targeting-attributes');
}

export async function getAdminDeedTargetingBulk(): Promise<{ rows: { deed_id: number; targeting_value_id: number }[] }> {
  return apiClient.get('/game/admin/deeds/targeting-bulk');
}

export async function getDeedTargeting(id: number): Promise<{ targeting_value_ids: number[] }> {
  return apiClient.get(`/game/admin/deeds/${id}/targeting`);
}

export async function setDeedTargeting(id: number, targeting_value_ids: number[]): Promise<{ success: boolean }> {
  return apiClient.put(`/game/admin/deeds/${id}/targeting`, { targeting_value_ids });
}

// ---------- Player Targeting ----------
export async function getTargetingAttributes(): Promise<{ attributes: TargetingAttribute[] }> {
  return apiClient.get('/game/targeting-attributes');
}

export async function getMyTargeting(): Promise<{ targeting_value_ids: number[] }> {
  return apiClient.get('/game/my-profile/targeting');
}

export async function setMyTargeting(targeting_value_ids: number[]): Promise<{ success: boolean }> {
  return apiClient.put('/game/my-profile/targeting', { targeting_value_ids });
}

// ---------- Deed Suggestion / Approval ----------
export interface PendingDeed {
  id: number;
  deed_text: string;
  category: string | null;
  notes: string | null;
  suggested_by_name: string | null;
  status: string;
  created_at: string | null;
}

export async function suggestDeed(payload: { deed_text: string; category?: string; notes?: string }) {
  return apiClient.post<{ success: boolean; message?: string }>(
    '/game/suggest-deed',
    payload
  );
}

export async function getMySuggestions(): Promise<{ suggestions: PendingDeed[] }> {
  return apiClient.get<{ suggestions: PendingDeed[] }>('/game/my-suggestions');
}

export async function getAdminPendingDeeds(
  status: string = 'pending'
): Promise<{ pending_deeds: PendingDeed[] }> {
  return withRetry(() =>
    apiClient.get<{ pending_deeds: PendingDeed[] }>(
      `/game/admin/pending-deeds?status=${encodeURIComponent(status)}`
    )
  );
}

export async function approvePendingDeed(id: number) {
  return apiClient.post<{ success: boolean }>(
    `/game/admin/pending-deeds/${id}/approve`,
    {}
  );
}

export async function rejectPendingDeed(id: number) {
  return apiClient.post<{ success: boolean }>(
    `/game/admin/pending-deeds/${id}/reject`,
    {}
  );
}

export async function deletePendingDeed(id: number) {
  return apiClient.delete<{ success: boolean }>(`/game/admin/pending-deeds/${id}`);
}

// ---------- Prize Claims ----------
export interface PrizeClaim {
  id: number;
  user_id: string;
  week_year: string;
  full_name: string;
  email: string;
  phone: string | null;
  mailing_address: string | null;
  notes: string | null;
  status: string;
  created_at: string | null;
}

export async function submitPrizeClaim(payload: {
  full_name: string;
  email: string;
  phone?: string;
  mailing_address?: string;
  notes?: string;
}): Promise<{ success: boolean; message: string }> {
  return apiClient.post('/game/claim-prize', payload);
}

export async function getAdminPrizeClaims(): Promise<{ claims: PrizeClaim[] }> {
  return apiClient.get('/game/admin/prize-claims');
}

export async function updatePrizeClaimStatus(id: number, status: string): Promise<{ success: boolean }> {
  return apiClient.put(`/game/admin/prize-claims/${id}`, { status });
}

// ---------- Draw Results (admin) ----------
export interface DrawWinner {
  id: string;
  user_id: string;
  week_year: string;
  selected_at: string;
  odds_weight: number;
  name: string | null;
  email: string | null;
  winning_active_entries: number | null;
  total_pool_entries: number | null;
  eligible_players: number | null;
}

export async function getAdminDrawResults(): Promise<{ winners: DrawWinner[] }> {
  return apiClient.get('/game/admin/draw-results');
}

// ---------- Weekly Update Log (admin) ----------
export interface WeeklyUpdateLogEntry {
  id: number;
  player_id: string;
  sent_at: string;
  week_of: string;
  message_snapshot: string;
  name: string | null;
  email: string | null;
}

export async function getAdminWeeklyUpdates(): Promise<{ logs: WeeklyUpdateLogEntry[] }> {
  return apiClient.get('/game/admin/weekly-updates');
}

export interface DrawLeaderboardPlayer {
  user_id: string;
  player_name: string;
  this_week_entries: number;
  active_entries: number;
  lifetime_entries: number;
  last_draw_win: string | null;
  last_participation_date: string | null;
  current_week_eligible: boolean;
}

export async function getAdminDrawLeaderboard(): Promise<{ week_year: string; require_participation: boolean; players: DrawLeaderboardPlayer[] }> {
  return apiClient.get('/game/admin/draw-leaderboard');
}

// ---------- Member list (admin) ----------
export interface MemberItem {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  email: string | null;
  role: string;
  province_state: string | null;
  country: string | null;
  city: string | null;
  country_id: number | null;
  state_id: number | null;
  player_number: number | null;
  last_login: string | null;
  profile_completed: boolean;
  email_verified: boolean;
  is_trusted: boolean;
  is_test: boolean;
  is_active: boolean;
  last_valid_deed_date: string | null;
  created_at: string | null;
}

export async function getAdminMembers(): Promise<{ members: MemberItem[] }> {
  return withRetry(() => apiClient.get<{ members: MemberItem[] }>('/game/admin/members'));
}

// ---------- Registration ----------
export interface ProfileStatus {
  profile_completed: boolean;
  signup_bonus_granted: boolean;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  province_state?: string | null;
  country?: string | null;
  signup_bonus_amount?: number;
}

export interface RegisterProfileResult {
  success: boolean;
  message: string;
  bonus_granted: boolean;
  wallet_balance: number;
  first_name: string;
  last_name: string;
  email: string;
  profile_completed: boolean;
}

export async function getRegistrationStatus(): Promise<ProfileStatus> {
  return withRetry(() => apiClient.get<ProfileStatus>('/registration/status'));
}

// ── Profile editing ───────────────────────────────────────────────────────────

export interface ProfileDetails {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  email: string;
  city: string | null;
  country_id: number | null;
  state_id: number | null;
  player_number: number | null;
}

export async function getMyProfileDetails(): Promise<ProfileDetails> {
  return apiClient.get<ProfileDetails>('/game/my-profile/details');
}

export async function updateMyProfile(data: Partial<Omit<ProfileDetails, 'email' | 'player_number'>>): Promise<void> {
  await apiClient.put('/game/my-profile', data);
}

export async function changePassword(current_password: string, new_password: string): Promise<void> {
  await apiClient.post('/auth-custom/change-password', { current_password, new_password });
}

export async function deleteMyAccount(): Promise<void> {
  await apiClient.delete('/game/my-profile');
}

export async function adminCreatePlayer(data: {
  first_name?: string; last_name?: string; email: string;
  username?: string; password: string; role?: string;
}): Promise<{ user_id: string }> {
  return apiClient.post<{ user_id: string }>('/game/admin/players', data);
}

export async function adminUpdatePlayer(id: string, data: Record<string, unknown>): Promise<void> {
  await apiClient.put(`/game/admin/players/${id}`, data);
}

export async function adminDeletePlayer(id: string): Promise<void> {
  await apiClient.delete(`/game/admin/players/${id}`);
}

export async function registerProfile(payload: {
  first_name: string;
  last_name: string;
  email: string;
  city?: string;
  country_id?: number | '';
  state_id?: number | '';
  province_state?: string;
  country?: string;
}): Promise<RegisterProfileResult> {
  return apiClient.post<RegisterProfileResult>('/registration/register', payload);
}

// ---------- Square Trades ----------
export interface TradeOffer {
  id: number;
  week_year: string;
  from_user_id: string;
  to_user_id: string;
  from_card_id: number;
  to_card_id: number;
  from_cell_index: number;
  to_cell_index: number;
  from_deed_text: string;
  to_deed_text: string;
  from_deed_id: number | null;
  to_deed_id: number | null;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired' | 'voided';
  created_at: string;
  from_user?: { first_name: string | null; last_name: string | null; player_number: number | null };
  to_user?: { first_name: string | null; last_name: string | null; player_number: number | null };
}

export async function getMyTrades(): Promise<{ trades: TradeOffer[] }> {
  return apiClient.get<{ trades: TradeOffer[] }>('/game/my-team/trades');
}

export async function createTrade(payload: { to_user_id: string; from_cell_index: number; to_cell_index: number }): Promise<{ success: boolean; trade: TradeOffer }> {
  return apiClient.post<{ success: boolean; trade: TradeOffer }>('/game/my-team/trades', payload);
}

export interface AdminTradeRow extends TradeOffer {
  voided_by: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by_user?: { first_name: string | null; last_name: string | null; player_number: number | null } | null;
}

export async function adminGetTrades(opts?: { status?: string; weekYear?: string; limit?: number }): Promise<AdminTradeRow[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.weekYear) params.set('week_year', opts.weekYear);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const data = await apiClient.get<{ trades: AdminTradeRow[] }>(`/game/admin/trades${qs ? `?${qs}` : ''}`);
  return data.trades;
}

export async function adminVoidTrade(tradeId: number, reason: string): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>(`/game/admin/trades/${tradeId}/void`, { reason });
}

export async function acceptTrade(id: number): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>(`/game/my-team/trades/${id}/accept`, {});
}

export async function rejectOrCancelTrade(id: number): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>(`/game/my-team/trades/${id}/reject`, {});
}

// ── Admin: player card viewer ─────────────────────────────────────────────────

export interface AdminPlayerCardResult {
  player: {
    id: string;
    player_number: number;
    display_name: string;
    email: string | null;
    current_streak_days: number;
    longest_streak_days: number;
    last_valid_deed_date: string | null;
  };
  card: CardData | null;
}

export async function adminGetPlayerCard(playerNumber: number): Promise<AdminPlayerCardResult> {
  return apiClient.get<AdminPlayerCardResult>(`/game/admin/player-card?player_number=${playerNumber}`);
}

export interface AdminPlayerMatch {
  id: string;
  player_number: number;
  display_name: string;
  email: string | null;
}

export async function adminSearchPlayersByLastName(lastName: string): Promise<AdminPlayerMatch[]> {
  const data = await apiClient.get<{ matches: AdminPlayerMatch[] }>(`/game/admin/player-card?last_name=${encodeURIComponent(lastName)}`);
  return data.matches;
}

// ── Admin: draw entry adjustment & deed reversal ────────────────────────────

export interface AdminCompletedDeed {
  id: number;
  deed_text: string;
  source_type: 'bingo_card' | 'quick_action';
  category: string | null;
  completed_at: string;
  reversed: boolean;
}

export async function adminGetCompletedDeeds(playerId: string): Promise<{ deeds: AdminCompletedDeed[] }> {
  return apiClient.get(`/game/admin/completed-deeds?player_id=${encodeURIComponent(playerId)}`);
}

// ── Admin: Deed Log ──────────────────────────────────────────────────────

export interface DeedLogRow {
  id: number;
  completed_at: string;
  player_name: string;
  deed_text: string;
  category: string | null;
  team_name: string | null;
  square_type: 'Regular' | 'Quick Tap' | 'Blackout';
  reversed: boolean;
}

export interface DeedLogFilters {
  start?: string;
  end?: string;
  player?: string;
  category?: string;
  teamId?: number;
}

function deedLogQueryString(filters: DeedLogFilters, page?: number): string {
  const params = new URLSearchParams();
  if (filters.start) params.set('start', filters.start);
  if (filters.end) params.set('end', filters.end);
  if (filters.player) params.set('player', filters.player);
  if (filters.category) params.set('category', filters.category);
  if (filters.teamId != null) params.set('team_id', String(filters.teamId));
  if (page != null) params.set('page', String(page));
  return params.toString();
}

export async function adminGetDeedLog(
  filters: DeedLogFilters,
  page: number,
): Promise<{ rows: DeedLogRow[]; total: number; page: number; page_size: number }> {
  return apiClient.get(`/game/admin/deed-log?${deedLogQueryString(filters, page)}`);
}

/** Fetches the CSV export as text (via the authenticated apiClient, since
 *  the endpoint requires an admin Bearer token — a plain <a href> can't
 *  attach that) and returns it for the caller to trigger a Blob download. */
export async function adminExportDeedLogCsv(filters: DeedLogFilters): Promise<string> {
  return apiClient.get(`/game/admin/deed-log/export?${deedLogQueryString(filters)}`);
}

// ── Admin: Founder Notes log ─────────────────────────────────────────────

export interface FounderNoteRow {
  id: number;
  player_name: string;
  deed_text_snapshot: string;
  generated_message: string | null;
  scheduled_send_at: string;
  sent_at: string | null;
  status: 'pending' | 'sent' | 'failed';
}

export async function adminGetFounderNotes(
  page: number,
): Promise<{ rows: FounderNoteRow[]; total: number; page: number; page_size: number }> {
  return apiClient.get(`/game/admin/founder-notes?page=${page}`);
}

export async function adminReverseDeed(completedDeedId: number, reason?: string): Promise<{ success: boolean; deed_entry_reversed: boolean; bingo_bonus_reversed: boolean }> {
  return apiClient.post('/game/admin/reverse-deed', { completed_deed_id: completedDeedId, reason });
}

export async function adminDrawAdjust(playerId: string, amount: number, reason: string): Promise<{ success: boolean }> {
  return apiClient.post('/game/admin/draw-adjust', { player_id: playerId, amount, reason });
}

// ── Streak API ────────────────────────────────────────────────────────────────

export async function getMyStreak(): Promise<StreakData> {
  return apiClient.get<StreakData>('/game/my-streak');
}

export interface StreakLeaderboard {
  current_streak_leaders: Array<{ username: string | null; name: string | null; current_streak_days: number; last_valid_deed_date?: string | null }>;
  longest_streak_leaders: Array<{ username: string | null; name: string | null; longest_streak_days: number; last_valid_deed_date?: string | null }>;
  average_streak: number | null;
}

export async function getStreakLeaderboard(): Promise<StreakLeaderboard> {
  return apiClient.get<StreakLeaderboard>('/game/leaderboard/streaks', { skipAuth: true } as any);
}

export interface TeamRankEntry {
  team_id: number;
  team_number: number | null;
  team_name: string;
  deeds: number;
  active_members: number;
  total_members: number;
}

export async function getTeamLeaderboard(): Promise<{ teams: TeamRankEntry[] }> {
  return apiClient.get<{ teams: TeamRankEntry[] }>('/game/leaderboard/teams', { skipAuth: true } as any);
}

export async function adminGetStreakMilestones(): Promise<StreakMilestone[]> {
  const data = await apiClient.get<{ milestones: StreakMilestone[] }>('/game/admin/streak-milestones');
  return data.milestones;
}

export async function adminCreateStreakMilestone(payload: { days_required: number; label: string; message: string; display_order?: number }): Promise<void> {
  await apiClient.post('/game/admin/streak-milestones', payload);
}

export async function adminUpdateStreakMilestone(id: number, payload: Partial<{ days_required: number; label: string; message: string; is_active: boolean; display_order: number }>): Promise<void> {
  await apiClient.put(`/game/admin/streak-milestones/${id}`, payload);
}

export async function adminDeleteStreakMilestone(id: number): Promise<void> {
  await apiClient.delete(`/game/admin/streak-milestones/${id}`);
}

// Helper: Check if a cell is "completed" (marked, purchased, referral free, or free space)
export function isCellCompleted(
  cellIndex: number,
  completedCells: number[],
  purchasedCells: number[],
  referralCells: number[],
  isFreeSpace: boolean
): boolean {
  if (isFreeSpace) return true;
  return (
    completedCells.includes(cellIndex) ||
    purchasedCells.includes(cellIndex) ||
    referralCells.includes(cellIndex)
  );
}

