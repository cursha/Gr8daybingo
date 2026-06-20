/**
 * Battle test for Issue #15 — Player Progression Levels.
 *
 * Pins the unlock rule (a pure mirror of the backend logic) and the level
 * selector helper, plus the API calls. The card-generation filtering and the
 * threshold table run on the backend (Supabase edge + DB) and are verified by
 * the integration smoke test in MANUAL_TESTING.md (TEST-004).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getAuthToken: vi.fn(),
  setAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
}));

import { apiClient } from '@/lib/apiClient';
import {
  computeHighestUnlocked,
  selectableLevels,
  getMyLevels,
  setMyPlayLevel,
  PlayerLevel,
} from '@/lib/game-utils';

// Curt's default thresholds.
const LEVELS: PlayerLevel[] = [
  { level_number: 1, level_name: 'Level 1', required_bingos: 0 },
  { level_number: 2, level_name: 'Level 2', required_bingos: 1 },
  { level_number: 3, level_name: 'Level 3', required_bingos: 5 },
  { level_number: 4, level_name: 'Level 4', required_bingos: 15 },
  { level_number: 5, level_name: 'Level 5', required_bingos: 30 },
];

describe('computeHighestUnlocked (Issue #15)', () => {
  it('starts everyone at Level 1 with zero bingos', () => {
    expect(computeHighestUnlocked(0, LEVELS)).toBe(1);
  });

  it('unlocks the exact level when the threshold is met (>=)', () => {
    expect(computeHighestUnlocked(1, LEVELS)).toBe(2);
    expect(computeHighestUnlocked(5, LEVELS)).toBe(3);
    expect(computeHighestUnlocked(15, LEVELS)).toBe(4);
    expect(computeHighestUnlocked(30, LEVELS)).toBe(5);
  });

  it('does not unlock the next level until its threshold is reached', () => {
    expect(computeHighestUnlocked(4, LEVELS)).toBe(2); // needs 5 for L3
    expect(computeHighestUnlocked(14, LEVELS)).toBe(3); // needs 15 for L4
  });

  it('caps at the highest defined level', () => {
    expect(computeHighestUnlocked(999, LEVELS)).toBe(5);
  });

  it('always returns at least Level 1, even with no level table', () => {
    expect(computeHighestUnlocked(50, [])).toBe(1);
  });

  it('ignores inactive levels', () => {
    const withInactive: PlayerLevel[] = [
      ...LEVELS.slice(0, 4),
      { level_number: 5, level_name: 'Level 5', required_bingos: 30, is_active: false },
    ];
    expect(computeHighestUnlocked(100, withInactive)).toBe(4);
  });
});

describe('selectableLevels (Issue #15)', () => {
  it('lists 1..highest', () => {
    expect(selectableLevels(1)).toEqual([1]);
    expect(selectableLevels(3)).toEqual([1, 2, 3]);
  });
  it('never returns fewer than [1]', () => {
    expect(selectableLevels(0)).toEqual([1]);
    expect(selectableLevels(-2)).toEqual([1]);
  });
});

describe('player level API (Issue #15)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getMyLevels reads /game/my-levels', async () => {
    const payload = { levels: LEVELS, total_bingos: 6, highest_unlocked: 3, selected: 2 };
    vi.mocked(apiClient.get).mockResolvedValueOnce(payload);
    const res = await getMyLevels();
    expect(apiClient.get).toHaveBeenCalledWith('/game/my-levels');
    expect(res).toEqual(payload);
  });

  it('setMyPlayLevel posts the chosen level to /game/my-level', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ success: true, selected: 3 });
    const res = await setMyPlayLevel(3);
    expect(apiClient.post).toHaveBeenCalledWith('/game/my-level', { level: 3 });
    expect(res.selected).toBe(3);
  });
});
