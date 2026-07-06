import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { adminUnlock } from '@/lib/game-utils';

const HERO_BG = '#4FB3E8';

const AdminUnlock: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Missing unlock token.');
      return;
    }
    adminUnlock(token)
      .then(() => setStatus('success'))
      .catch((err: any) => {
        setStatus('error');
        setErrorMessage(err?.message || 'Link invalid or already used.');
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: HERO_BG }}>
      <Card className="w-full max-w-md shadow-2xl border-0">
        <CardHeader className="text-center space-y-2 pb-4">
          <button type="button" onClick={() => navigate('/')} className="mx-auto flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
            <span className="font-black tracking-wide">Havagr8day!</span>
          </button>
          <CardTitle className="text-2xl">Admin Unlock</CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'loading' && (
            <div className="text-center py-8">
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-indigo-600" />
            </div>
          )}
          {status === 'success' && (
            <div className="text-center py-4 space-y-4">
              <div className="flex justify-center">
                <div className="bg-emerald-100 rounded-full p-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
              <p className="text-slate-700 font-semibold">Admin login unlocked</p>
              <p className="text-sm text-slate-500">You can log in now.</p>
              <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold border-2 border-yellow-300" onClick={() => navigate('/admin')}>
                Go to Admin Login
              </Button>
            </div>
          )}
          {status === 'error' && (
            <div className="text-center py-4 space-y-4">
              <div className="flex justify-center">
                <div className="bg-rose-100 rounded-full p-4">
                  <XCircle className="w-8 h-8 text-rose-600" />
                </div>
              </div>
              <p className="text-slate-700 font-semibold">Link invalid or expired</p>
              <p className="text-sm text-slate-500">{errorMessage} Request a new one.</p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/admin')}>
                Back to Admin Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUnlock;
