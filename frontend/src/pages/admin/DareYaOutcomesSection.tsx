import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Ticket, Edit2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DareYaOutcome, DareYaActionType, adminGetDareYaOutcomes, adminCreateDareYaOutcome, adminUpdateDareYaOutcome, adminDeleteDareYaOutcome } from '@/lib/game-utils';

const VALID_ACTION_TYPES: DareYaActionType[] = ['free_square', 'refer_friend', 'fund_credit', 'remove_funds', 'replace_three', 'nothing'];
const ACTION_TYPE_LABELS: Record<DareYaActionType, string> = {
  free_square: 'Free Square', refer_friend: 'Refer a Friend',
  fund_credit: 'Fund Credit', remove_funds: 'Remove Funds',
  replace_three: 'Replace Three', nothing: 'Nothing',
};

const DareYaOutcomesSection: React.FC = () => {
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

  useEffect(() => {
    adminGetDareYaOutcomes()
      .then(res => setDareYaOutcomes(res.outcomes || []))
      .catch(() => {});
  }, []);

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

  return (
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
  );
};

export default DareYaOutcomesSection;
