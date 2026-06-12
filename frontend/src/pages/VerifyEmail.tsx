import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

const HERO_BG = '#4FB3E8';

const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found. Please check your email for the correct link.');
      return;
    }
    apiClient.post('/auth-custom/verify-email', { token }, { skipAuth: true })
      .then(() => {
        setStatus('success');
        setMessage('Your email is verified! You can now sign in.');
      })
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'This link is invalid or has expired.');
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: HERO_BG }}>
      <Card className="w-full max-w-md shadow-2xl border-0">
        <CardContent className="pt-8 pb-8 text-center space-y-5">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mx-auto flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
            <span className="font-black tracking-wide">Havagr8day!</span>
          </button>

          {status === 'pending' && (
            <>
              <Loader2 className="mx-auto w-10 h-10 text-indigo-500 animate-spin" />
              <p className="text-slate-600">Verifying your email…</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="flex justify-center">
                <div className="bg-emerald-100 rounded-full p-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
              <p className="text-slate-800 font-semibold text-lg">Email verified!</p>
              <p className="text-slate-500 text-sm">{message}</p>
              <Button
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold border-2 border-yellow-300"
                onClick={() => navigate('/login')}
              >
                Sign In
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="flex justify-center">
                <div className="bg-red-100 rounded-full p-4">
                  <XCircle className="w-8 h-8 text-red-500" />
                </div>
              </div>
              <p className="text-slate-800 font-semibold text-lg">Verification failed</p>
              <p className="text-slate-500 text-sm">{message}</p>
              <Button
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold border-2 border-yellow-300"
                onClick={() => navigate('/register')}
              >
                Back to Sign Up
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyEmail;
