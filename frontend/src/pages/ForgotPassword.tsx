import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Loader2, ArrowLeft, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/apiClient';

const HERO_BG = '#4FB3E8';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    if (!mail) { toast.error('Please enter your email address.'); return; }
    setSubmitting(true);
    try {
      await apiClient.post('/game/request-password-reset', { email: mail }, { skipAuth: true });
      setSent(true);
    } catch (err: any) {
      // Always show success to prevent email enumeration
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: HERO_BG }}>
      <Card className="w-full max-w-md shadow-2xl border-0">
        <CardHeader className="text-center space-y-2 pb-4">
          <button type="button" onClick={() => navigate('/')} className="mx-auto flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
            <span className="font-black tracking-wide">Havagr8day!</span>
          </button>
          <CardTitle className="text-2xl">Forgot Password</CardTitle>
          <p className="text-sm text-slate-500">Enter your email and we'll send you a reset link.</p>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-center py-4 space-y-4">
              <div className="flex justify-center">
                <div className="bg-emerald-100 rounded-full p-4">
                  <Mail className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
              <p className="text-slate-700 font-semibold">Check your inbox</p>
              <p className="text-sm text-slate-500">
                If an account exists for <strong>{email}</strong>, you'll receive a password reset
                link within a few minutes.
              </p>
              <Button variant="outline" className="w-full mt-2" onClick={() => navigate('/login')}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold border-2 border-yellow-300">
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : 'Send Reset Link'}
              </Button>
              <p className="text-center text-sm text-slate-500 pt-2">
                Remembered it?{' '}
                <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-2">
                  Sign In
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
