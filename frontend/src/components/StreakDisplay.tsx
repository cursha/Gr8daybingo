import React from 'react';
import { Flame, Trophy, Calendar } from 'lucide-react';
import { StreakData } from '@/lib/game-utils';

interface Props {
  streak: StreakData;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const StreakDisplay: React.FC<Props> = ({ streak }) => {
  const isActive = streak.current_streak_days > 0;

  return (
    <div className="rounded-2xl border border-indigo-100 bg-white/80 backdrop-blur-sm p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Flame className={`w-5 h-5 ${isActive ? 'text-orange-500' : 'text-slate-300'}`} />
        <span className="font-semibold text-slate-700 text-sm">Daily Streak</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Current Streak */}
        <div className="flex flex-col items-center bg-orange-50 rounded-xl p-3">
          <Flame className={`w-6 h-6 mb-1 ${isActive ? 'text-orange-500' : 'text-slate-300'}`} />
          <span className={`text-2xl font-bold ${isActive ? 'text-orange-600' : 'text-slate-400'}`}>
            {streak.current_streak_days}
          </span>
          <span className="text-xs text-slate-500 text-center mt-0.5">Current<br />Streak</span>
        </div>

        {/* Longest Streak */}
        <div className="flex flex-col items-center bg-indigo-50 rounded-xl p-3">
          <Trophy className="w-6 h-6 mb-1 text-indigo-400" />
          <span className="text-2xl font-bold text-indigo-600">{streak.longest_streak_days}</span>
          <span className="text-xs text-slate-500 text-center mt-0.5">Best<br />Streak</span>
        </div>

        {/* Last Deed Date */}
        <div className="flex flex-col items-center bg-emerald-50 rounded-xl p-3">
          <Calendar className="w-6 h-6 mb-1 text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-700 text-center leading-tight mt-1">
            {formatDate(streak.last_valid_deed_date)}
          </span>
          <span className="text-xs text-slate-500 text-center mt-0.5">Last<br />Deed</span>
        </div>
      </div>

      {streak.achievements.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-1.5 font-medium">Milestones Achieved</p>
          <div className="flex flex-wrap gap-1.5">
            {streak.achievements.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5"
                title={a.message}
              >
                🏅 {a.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StreakDisplay;
