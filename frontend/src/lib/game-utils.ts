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
}

export interface MarkCellResult {
  success: boolean;
  completed_cells: number[];
  is_bingo: boolean;
  secret_reward?: number;
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
}

export interface DeedItem {
  id: number;
  deed_text: string;
  deed_text_long?: string | null;
  category: string;
  is_active: boolean;
  complexity?: number | null;
  quantity?: number | null;
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

export async function getMyPrizeHistory(): Promise<PrizeHistoryEntry[]> {
  const data = await apiClient.get<{ history: PrizeHistoryEntry[] }>('/game/my-prize-history');
  return data.history;
}

export async function adminTriggerWeeklyReset(): Promise<{ sent: number; failed: number; week: string }> {
  return apiClient.post('/weekly-reset', {});
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
}

export async function importDeeds(deeds: Partial<DeedItem>[]): Promise<ImportDeedsResult> {
  return apiClient.post<ImportDeedsResult>('/game/admin/deeds/import', { deeds });
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
  last_login: string | null;
  profile_completed: boolean;
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

export async function registerProfile(payload: {
  first_name: string;
  last_name: string;
  email: string;
  province_state?: string;
  country?: string;
  challenge_level?: number | null;
}): Promise<RegisterProfileResult> {
  return apiClient.post<RegisterProfileResult>('/registration/register', payload);
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