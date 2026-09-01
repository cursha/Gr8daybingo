import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Lock, Target, Ticket, Eye, Gift, Upload, X, Settings, Mail, Save } from 'lucide-react';
import { DeedCategory, updateAdminConfig, updateAdminDeedCategory } from '@/lib/game-utils';

const WIN_CONDITIONS = [
  { id: 'one_line', name: 'One Line', description: 'Complete 5 in a row (horizontal, vertical, or diagonal)' },
  { id: 'two_lines', name: 'Two Lines', description: 'Complete any two full lines' },
  { id: 'four_corners', name: 'Four Corners', description: 'Complete all four corner squares' },
  { id: 'one_line_or_corners', name: 'One Line or Four Corners', description: 'Complete a full line (horizontal or vertical) OR all four corners — whichever comes first' },
  { id: 'x_pattern', name: 'X Pattern', description: 'Complete both diagonals forming an X across the card' },
  { id: 'around_the_edges', name: 'Around the Edges', description: 'Complete all 16 perimeter squares around the card' },
  { id: 'fill_card', name: 'Fill the Card', description: 'Complete every square on the entire card' },
];

const isoToLocalInput = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const configFields = [
  { key: 'signup_bonus_amount', label: 'Signup Bonus Amount (Gr8Day Bucks)', type: 'number' },
  { key: 'referral_bonus_amount', label: 'Referral Bonus Amount (Gr8Day Bucks)', type: 'number' },
  { key: 'dollar1_pct', label: '0.50 Bucks Square Percentage', type: 'number' },
  { key: 'dollar2_pct', label: '1.00 Bucks Square Percentage', type: 'number' },
  { key: 'dollar5_pct', label: '2.00 Bucks Square Percentage', type: 'number' },
  { key: 'secret_reward_1_pct', label: 'Secret Square: 1 Buck Reward %', type: 'number' },
  { key: 'secret_reward_2_pct', label: 'Secret Square: 2 Bucks Reward %', type: 'number' },
  { key: 'secret_reward_5_pct', label: 'Secret Square: 5 Bucks Reward %', type: 'number' },
  { key: 'bomb_square_probability_pct', label: 'Bomb Square Odds % (classic cards)', type: 'number' },
  { key: 'geo_drilldown_threshold', label: 'Leaderboard: players before a region drills to cities', type: 'number' },
  { key: 'non_referred_daily_deed_limit', label: 'Non-referred players: max Gr8Day Deeds per 24h (0 = no limit)', type: 'number' },
  { key: 'inactive_days_threshold', label: 'Days idle before a player is flagged inactive', type: 'number' },
  { key: 'blackout_min_hidden_remaining', label: 'Blackout: minimum hidden squares remaining (reveal trims back once hit)', type: 'number' },
];

interface GameSettingsSectionProps {
  editConfigs: Record<string, string>;
  setEditConfigs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSaveConfig: () => Promise<void>;
  // Raw fetched config values (with descriptions) and the blackout reveal
  // weights are both populated by the parent's shared initial config fetch
  // alongside editConfigs, so they're passed down rather than re-fetched.
  configs: Record<string, { value: string; description: string }>;
  blackoutWeights: Record<'0' | '1' | '2' | '3', string>;
  setBlackoutWeights: React.Dispatch<React.SetStateAction<Record<'0' | '1' | '2' | '3', string>>>;
  deedCategories: DeedCategory[];
  setDeedCategories: React.Dispatch<React.SetStateAction<DeedCategory[]>>;
}

const GameSettingsSection: React.FC<GameSettingsSectionProps> = ({
  editConfigs, setEditConfigs, onSaveConfig, configs, blackoutWeights, setBlackoutWeights, deedCategories, setDeedCategories,
}) => {
  const [blackoutWeightsSaving, setBlackoutWeightsSaving] = useState(false);

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

  const weeklyUpdatePercentage = editConfigs['weekly_update_percentage'] || '';
  const weeklyUpdatePrompt = editConfigs['weekly_update_prompt'] || '';
  const blackoutWeightsSum = (['0', '1', '2', '3'] as const).reduce((s, k) => s + (parseFloat(blackoutWeights[k]) || 0), 0);
  const prizeImageUrl = editConfigs['prize_image_url'] || '';
  const prizeTitle = editConfigs['prize_title'] || '';
  const prizeVoucherCode = editConfigs['prize_voucher_code'] || '';
  const currentWinCondition = editConfigs['win_condition'] || 'one_line';
  const selectedWC = WIN_CONDITIONS.find((wc) => wc.id === currentWinCondition);

  return (
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
          <Button onClick={onSaveConfig} className="bg-violet-600 hover:bg-violet-700 text-white">
            <Save className="w-4 h-4 mr-1" /> Save Game Mode
          </Button>
        </CardContent>
      </Card>

      {/* Bonus Scoring Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-fuchsia-500" />
            Bonus Scoring Table
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Independent of whichever win condition is active above — a player earns these draw-entry bonuses for
            any of these six patterns they reach on a card, and can earn more than one on the same card (e.g.
            completing two lines pays both the One Line and Two Lines bonus). Each pays once per card. Bonus ={' '}
            <strong>real deed squares in the pattern × a random roll from 1 to 4</strong> — purchased, referral,
            and free-space squares never count toward the square total, only ones actually earned by doing a deed.
            This table is a formula, not admin-editable numbers.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2">Pattern</th>
                  <th className="px-3 py-2 text-center">Squares</th>
                  <th className="px-3 py-2 text-center">Bonus Range</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  { name: 'One Line', squares: 5 },
                  { name: 'Two Lines', squares: 10 },
                  { name: 'Four Corners', squares: 4 },
                  { name: 'X Pattern', squares: 9 },
                  { name: 'Around the Outside', squares: 16 },
                  { name: 'Full Page', squares: 25 },
                ].map((row) => (
                  <tr key={row.name}>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.name}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{row.squares}</td>
                    <td className="px-3 py-2 text-center text-slate-600">{row.squares}–{row.squares * 4}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

          <Button onClick={onSaveConfig} className="bg-rose-600 hover:bg-rose-700 text-white">
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
          <Button onClick={onSaveConfig} className="bg-indigo-600 hover:bg-indigo-700 text-white">
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
          <Button onClick={onSaveConfig} className="bg-sky-600 hover:bg-sky-700 text-white">
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
  );
};

export default GameSettingsSection;
