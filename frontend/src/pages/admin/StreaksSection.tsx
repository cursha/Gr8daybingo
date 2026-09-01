import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, X, Edit2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { StreakMilestone, adminGetStreakMilestones, adminCreateStreakMilestone, adminUpdateStreakMilestone, adminDeleteStreakMilestone, updateAdminConfig } from '@/lib/game-utils';

interface StreaksSectionProps {
  editConfigs: Record<string, string>;
  setEditConfigs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

const StreaksSection: React.FC<StreaksSectionProps> = ({ editConfigs, setEditConfigs }) => {
  const [streakMilestones, setStreakMilestones] = useState<StreakMilestone[]>([]);
  const [newMilestone, setNewMilestone] = useState({ days_required: '', label: '', message: '', display_order: '' });
  const [editingMilestoneId, setEditingMilestoneId] = useState<number | null>(null);
  const [editMilestoneData, setEditMilestoneData] = useState({ days_required: '', label: '', message: '', display_order: '' });
  const [milestoneLoading, setMilestoneLoading] = useState(false);

  const loadStreakMilestones = async () => {
    try {
      const milestones = await adminGetStreakMilestones();
      setStreakMilestones(milestones);
    } catch { /* silent */ }
  };

  useEffect(() => {
    loadStreakMilestones();
  }, []);

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

  return (
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
  );
};

export default StreaksSection;
