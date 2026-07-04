import React from 'react';
import { Heart } from 'lucide-react';

const HERO_BG = '#4FB3E8';

interface OfflineScreenProps {
  until?: string | null;
}

const formatUntil = (iso: string): string | null => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const OfflineScreen: React.FC<OfflineScreenProps> = ({ until }) => {
  const formatted = until ? formatUntil(until) : null;
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: HERO_BG }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Heart className="w-7 h-7 text-rose-500 fill-rose-500" />
          <span className="font-black tracking-wide text-lg text-slate-800">Havagr8day!</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">
          We're refreshing our Gr8Day Deeds and adding more awesome!! Thanks for your patience — check back shortly.
        </h1>
        {formatted && (
          <p className="text-slate-500 text-sm">(Back online: {formatted})</p>
        )}
      </div>
    </div>
  );
};

export default OfflineScreen;
