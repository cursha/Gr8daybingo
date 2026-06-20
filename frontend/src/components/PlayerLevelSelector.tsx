import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Trophy, Lock } from 'lucide-react';
import { getMyLevels, setMyPlayLevel, selectableLevels, MyLevelInfo } from '@/lib/game-utils';

/**
 * Player Progression Levels (Issue #15). Shows the player's unlocked level and
 * lets them choose the difficulty to play. The chosen level applies to their
 * NEXT card; existing cards never change. Renders nothing if levels aren't
 * available (e.g. the feature table isn't deployed yet), so it's safe to mount.
 */
const PlayerLevelSelector: React.FC = () => {
  const [info, setInfo] = useState<MyLevelInfo | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyLevels()
      .then(setInfo)
      .catch(() => {
        /* levels are optional UI; if the endpoint isn't available, hide it */
      });
  }, []);

  if (!info) return null;

  const options = selectableLevels(info.highest_unlocked);
  const nextLocked = info.levels.find((l) => l.level_number === info.highest_unlocked + 1);

  const onChange = async (level: number) => {
    if (level === info.selected) return;
    setSaving(true);
    try {
      const res = await setMyPlayLevel(level);
      setInfo({ ...info, selected: res.selected });
      toast.success(`Play level set to ${level}. It applies to your next card.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change level.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="w-5 h-5 text-amber-500" /> Your Level
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">
          You've unlocked <strong>Level {info.highest_unlocked}</strong> with{' '}
          <strong>{info.total_bingos}</strong> bingo{info.total_bingos === 1 ? '' : 's'}. Pick the
          difficulty you want to play. New cards use your chosen level.
        </p>
        <div className="flex flex-wrap gap-2">
          {options.map((lvl) => (
            <button
              key={lvl}
              disabled={saving}
              onClick={() => onChange(lvl)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                info.selected === lvl
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400'
              }`}
            >
              Level {lvl}
            </button>
          ))}
        </div>
        {nextLocked && (
          <p className="flex items-center gap-1 text-xs text-gray-400">
            <Lock className="w-3 h-3" /> Level {nextLocked.level_number} unlocks at{' '}
            {nextLocked.required_bingos} bingos.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default PlayerLevelSelector;
