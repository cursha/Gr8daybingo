import React from 'react';
import { Heart } from 'lucide-react';

const HERO_BG = '#4FB3E8';

const OfflineScreen: React.FC = () => (
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
        We're updating Gr8Day Bingo — back soon!
      </h1>
      <p className="text-slate-500 text-sm">
        We're refreshing our Gr8Day Deeds. Thanks for your patience — check back shortly.
      </p>
    </div>
  </div>
);

export default OfflineScreen;
