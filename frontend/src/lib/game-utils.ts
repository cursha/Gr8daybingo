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
  // I Bet Ya — present on center cell (index 12) in classic mode
  bet_ya_outcome_type?: string | null;
  bet_ya_label?: string | null;
  bet_ya_action_value?: number | null;
  bet_ya_revealed?: boolean;
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
  draw_entered?: boolean;
  streak_update?: StreakUpdate;
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
  draw_entered?: boolean;
}

export type BetYaActionType = 'free_square' | 'refer_friend' | 'fund_credit' | 'remove_funds' | 'replace_three' | 'nothing';

export interface BetYaOutcome {
  id: number;
  label: string;
  odds_percent: number;
  action_type: BetYaActionType;
  credit_amount: number;
  remove_amount: number;
  reward_amount: number;
  is_active: boolean;
}

export interface BetYaRevealResult {
  outcome: BetYaActionType;
  label: string;
  amount: number;
  new_balance?: number;
  prompt_referral?: boolean;
  replaced?: { index: number; old_deed: string; new_deed: string }[];
  completed_cells: number[];
  is_bingo: boolean;
  draw_entered?: boolean;
  level_up?: { previous_level: number; new_level: number };
}

export async function revealBetYa(cardId: number): Promise<BetYaRevealResult> {
  return apiClient.post<BetYaRevealResult>('/game/bet-ya-reveal', { card_id: cardId });
}

export interface BetYaReferFriendResult {
  matched: boolean;
  message?: string;
  label?: string;
  amount?: number;
  new_balance?: number;
  completed_cells?: number[];
  is_bingo?: boolean;
  draw_entered?: boolean;
  level_up?: { previous_level: number; new_level: number };
}

export async function submitBetYaReferFriend(cardId: number, email: string): Promise<BetYaReferFriendResult> {
  return apiClient.post<BetYaReferFriendResult>('/game/bet-ya-refer-friend', { card_id: cardId, email });
}

export async function adminGetBetYaOutcomes(): Promise<{ outcomes: BetYaOutcome[] }> {
  return apiClient.get('/game/admin/bet-ya-outcomes');
}

export async function adminCreateBetYaOutcome(data: Omit<BetYaOutcome, 'id'>): Promise<{ outcome: BetYaOutcome }> {
  return apiClient.post('/game/admin/bet-ya-outcomes', data);
}

export async function adminUpdateBetYaOutcome(id: number, data: Partial<Omit<BetYaOutcome, 'id'>>): Promise<{ outcome: BetYaOutcome }> {
  return apiClient.put(`/game/admin/bet-ya-outcomes/${id}`, data);
}

export async function adminDeleteBetYaOutcome(id: number): Promise<void> {
  return apiClient.delete(`/game/admin/bet-ya-outcomes/${id}`);
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
}

export interface QuickTapDeed {
  id: number;
  deed_text: string;
  deed_text_long: string | null;
  category: string;
}

// API calls
export async function generateCard(): Promise<CardData> {
  return withRetry(() => apiClient.post<CardData>('/game/generate-card', {}));
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

export async function adminTriggerWeeklyReset(): Promise<{ sent: number; failed: number; week: string }> {
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
  return apiClient.post<{ purchased_cells: number[]; is_bingo: boolean; new_balance: number }>(
    '/game/purchase-cell',
    { card_id: cardId, cell_index: cellIndex }
  );
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

export async function getWinConditions(): Promise<WinCondition[]> {
  const res = await apiClient.get<{ conditions: WinCondition[] }>('/game/win-conditions');
  return res.conditions;
}

export async function adminVerify(password: string) {
  return apiClient.post<{ success: boolean }>('/game/admin/verify', { password });
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
}) {
  return apiClient.post<DeedItem>('/game/admin/deeds', deed);
}

export async function updateAdminDeed(id: number, deed: Partial<DeedItem>) {
  return apiClient.put<DeedItem>(`/game/admin/deeds/${id}`, deed);
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
  targeting_warnings?: string[];
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
  total_entries: number;
}

export async function getAdminDrawResults(): Promise<{ winners: DrawWinner[] }> {
  return apiClient.get('/game/admin/draw-results');
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
  challenge_level: number | null;
  province_state: string | null;
  country: string | null;
  city: string | null;
  country_id: number | null;
  state_id: number | null;
  player_number: number | null;
  last_login: string | null;
  profile_completed: boolean;
  email_verified: boolean;
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
  challenge_level?: number | null;
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
  challenge_level: number | null;
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
  challenge_level?: number | null;
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
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
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

// ---------- Player Progression Levels (Issue #15) ----------
export interface PlayerLevel {
  id?: number;
  level_number: number;
  level_name: string;
  required_bingos: number;
  is_active?: boolean;
}

export interface MyLevelInfo {
  levels: PlayerLevel[];
  total_bingos: number;
  highest_unlocked: number;
  selected: number;
}

export async function getMyLevels(): Promise<MyLevelInfo> {
  return apiClient.get<MyLevelInfo>('/game/my-levels');
}

export async function setMyPlayLevel(
  level: number
): Promise<{ success: boolean; selected: number }> {
  return apiClient.post('/game/my-level', { level });
}

/**
 * Pure mirror of the backend unlock rule: the highest level a player has earned
 * for a given bingo count. Level 1 is always unlocked. Kept pure so it can be
 * unit-tested and reused for optimistic UI.
 */
export function computeHighestUnlocked(
  totalBingos: number,
  levels: PlayerLevel[]
): number {
  let highest = 1;
  for (const lv of levels) {
    if ((lv.is_active ?? true) && totalBingos >= (lv.required_bingos ?? 0)) {
      highest = Math.max(highest, lv.level_number);
    }
  }
  return highest;
}

/** The levels a player may currently select (1 .. highest unlocked). */
export function selectableLevels(highestUnlocked: number): number[] {
  return Array.from({ length: Math.max(1, highestUnlocked) }, (_, i) => i + 1);
}

// Admin CRUD for the level thresholds
export async function adminGetPlayerLevels(): Promise<{ levels: PlayerLevel[] }> {
  return apiClient.get('/game/admin/player-levels');
}

export async function adminCreatePlayerLevel(payload: {
  level_number: number;
  level_name?: string;
  required_bingos: number;
  is_active?: boolean;
}): Promise<PlayerLevel> {
  return apiClient.post('/game/admin/player-levels', payload);
}

export async function adminUpdatePlayerLevel(
  id: number,
  payload: Partial<PlayerLevel>
): Promise<PlayerLevel> {
  return apiClient.put(`/game/admin/player-levels/${id}`, payload);
}

export async function adminDeletePlayerLevel(id: number): Promise<{ success: boolean }> {
  return apiClient.delete(`/game/admin/player-levels/${id}`);
}