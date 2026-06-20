import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Save, Trash2, Trophy } from 'lucide-react';
import {
  adminGetPlayerLevels,
  adminCreatePlayerLevel,
  adminUpdatePlayerLevel,
  adminDeletePlayerLevel,
  PlayerLevel,
} from '@/lib/game-utils';
import { ApiError } from '@/lib/apiClient';

const AdminLevels: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin } = useAuth();

  const [levels, setLevels] = useState<PlayerLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLevel, setNewLevel] = useState({ level_number: '', level_name: '', required_bingos: '' });

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate('/');
  }, [authLoading, user, isAdmin, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { levels } = await adminGetPlayerLevels();
      setLevels(levels);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load levels.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const updateField = (id: number, field: keyof PlayerLevel, value: string | boolean) => {
    setLevels((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const save = async (lvl: PlayerLevel) => {
    try {
      await adminUpdatePlayerLevel(lvl.id!, {
        level_name: lvl.level_name,
        required_bingos: Number(lvl.required_bingos),
        is_active: lvl.is_active ?? true,
      });
      toast.success(`Saved ${lvl.level_name}.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed.');
    }
  };

  const remove = async (lvl: PlayerLevel) => {
    try {
      await adminDeletePlayerLevel(lvl.id!);
      setLevels((prev) => prev.filter((l) => l.id !== lvl.id));
      toast.success(`Deleted ${lvl.level_name}.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed.');
    }
  };

  const add = async () => {
    const ln = parseInt(newLevel.level_number, 10);
    const rb = parseInt(newLevel.required_bingos, 10);
    if (isNaN(ln) || isNaN(rb)) {
      toast.error('Level number and required bingos must be numbers.');
      return;
    }
    try {
      await adminCreatePlayerLevel({
        level_number: ln,
        level_name: newLevel.level_name || `Level ${ln}`,
        required_bingos: rb,
      });
      setNewLevel({ level_number: '', level_name: '', required_bingos: '' });
      toast.success('Level added.');
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Add failed.');
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate('/admin')} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Admin
        </button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5" /> Player Levels
            </CardTitle>
            <p className="text-sm text-gray-500">
              Set how many bingos unlock each level. Changes apply to future cards only.
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-gray-500">Loading…</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[60px_1fr_110px_70px_auto] gap-2 text-xs font-semibold text-gray-500 px-1">
                  <span>Level</span><span>Name</span><span>Bingos</span><span>Active</span><span></span>
                </div>
                {levels.map((lvl) => (
                  <div key={lvl.id} className="grid grid-cols-[60px_1fr_110px_70px_auto] gap-2 items-center">
                    <span className="font-semibold">{lvl.level_number}</span>
                    <Input value={lvl.level_name} onChange={(e) => updateField(lvl.id!, 'level_name', e.target.value)} />
                    <Input
                      type="number"
                      value={String(lvl.required_bingos)}
                      onChange={(e) => updateField(lvl.id!, 'required_bingos', e.target.value)}
                    />
                    <input
                      type="checkbox"
                      checked={lvl.is_active ?? true}
                      onChange={(e) => updateField(lvl.id!, 'is_active', e.target.checked)}
                      className="w-4 h-4 mx-auto"
                      aria-label={`Level ${lvl.level_number} active`}
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => save(lvl)} title="Save">
                        <Save className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => remove(lvl)} title="Delete">
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="grid grid-cols-[60px_1fr_110px_70px_auto] gap-2 items-center pt-3 border-t mt-3">
                  <Input
                    type="number"
                    placeholder="#"
                    value={newLevel.level_number}
                    onChange={(e) => setNewLevel({ ...newLevel, level_number: e.target.value })}
                  />
                  <Input
                    placeholder="Level name"
                    value={newLevel.level_name}
                    onChange={(e) => setNewLevel({ ...newLevel, level_name: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder="bingos"
                    value={newLevel.required_bingos}
                    onChange={(e) => setNewLevel({ ...newLevel, required_bingos: e.target.value })}
                  />
                  <span />
                  <Button size="sm" onClick={add}>
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminLevels;
