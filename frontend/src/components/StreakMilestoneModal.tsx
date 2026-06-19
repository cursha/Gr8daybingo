import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StreakMilestoneHit } from '@/lib/game-utils';

interface Props {
  milestones: StreakMilestoneHit[];
  onClose: () => void;
}

const StreakMilestoneModal: React.FC<Props> = ({ milestones, onClose }) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (milestones.length === 0) return null;

  const top = milestones[milestones.length - 1];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-3xl shadow-2xl p-8 mx-4 max-w-sm w-full text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center">
              <Flame className="w-10 h-10 text-orange-500" />
            </div>
            <div className="absolute -top-1 -right-1 text-2xl">🏅</div>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-800 mb-1">Streak Milestone!</h2>
        <p className="text-indigo-600 font-semibold text-lg mb-3">{top.label}</p>
        <p className="text-slate-600 text-sm leading-relaxed mb-6">{top.message}</p>

        {milestones.length > 1 && (
          <p className="text-xs text-slate-400 mb-4">
            You also unlocked: {milestones.slice(0, -1).map((m) => m.label).join(', ')}
          </p>
        )}

        <Button
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
          onClick={onClose}
        >
          Keep it up! 🔥
        </Button>
      </div>
    </div>,
    document.body
  );
};

export default StreakMilestoneModal;
