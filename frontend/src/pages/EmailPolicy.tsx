import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Heart } from 'lucide-react';
import Footer from '@/components/Footer';

const EmailPolicy: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
          <span className="font-black text-slate-800">Havagr8day!</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6 text-slate-700">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-1">How We'll Use Your Email</h1>
          <p className="text-sm text-slate-400">A plain-language summary — see our Privacy Policy for the full legal details.</p>
        </div>

        <p>
          We know inboxes are precious. Here's exactly what you'll get from us, and nothing you won't.
        </p>

        <ul className="space-y-4">
          <li className="flex gap-3">
            <span className="text-2xl leading-none">📅</span>
            <div>
              <p className="font-semibold text-slate-900">Once a week</p>
              <p className="text-sm text-slate-600">A new game announcement, so you know your card has reset and it's time to play.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="text-2xl leading-none">💌</span>
            <div>
              <p className="font-semibold text-slate-900">1–2 times a month</p>
              <p className="text-sm text-slate-600">A Havagr8day Update — news, features, or community highlights. Never more than that.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="text-2xl leading-none">🏆</span>
            <div>
              <p className="font-semibold text-slate-900">When you win</p>
              <p className="text-sm text-slate-600">Game wins are always communicated by email, so you never miss a prize.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="text-2xl leading-none">🙏</span>
            <div>
              <p className="font-semibold text-slate-900">If you go quiet</p>
              <p className="text-sm text-slate-600">
                If you don't play for four weeks, we'll stop emailing you and remove you from the list —
                out of respect for you, not because we assume you're gone for good. Play again any time
                and you're back on it.
              </p>
            </div>
          </li>
        </ul>

        <p className="text-sm text-slate-500">
          For the full details on what we collect and how it's used and protected, see our{' '}
          <a href="/privacy" className="text-indigo-600 underline underline-offset-2">Privacy Policy</a>.
        </p>
      </div>
      <Footer tone="light" />
    </div>
  );
};

export default EmailPolicy;
