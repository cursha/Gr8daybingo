import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const HERO_BG = '#4FB3E8';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from || '/game';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = email.trim();
    if (!mail || !password) {
      toast.error('Please enter both email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login({ email: mail, password });
      toast.success('Welcome back!');
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: HERO_BG }}
    >
      <Card className="w-full max-w-md shadow-2xl border-0">
        <CardHeader className="text-center space-y-2 pb-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mx-auto flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
            <span className="font-black tracking-wide">Havagr8day!</span>
          </button>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <p className="text-sm text-slate-500">
            Sign in to continue your bingo journey.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold border-2 border-yellow-300"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                'Sign In'
              )}
            </Button>
            <div className="flex items-center justify-between pt-2">
              <Link to="/forgot-password" className="text-sm text-slate-500 hover:text-indigo-600 underline underline-offset-2">
                Forgot password?
              </Link>
              <p className="text-sm text-slate-500">
                No account?{' '}
                <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-2">
                  Sign up
                </Link>
              </p>
            </div>
            <p className="text-center text-xs text-slate-400 pt-1">
              Didn't get a verification email?{' '}
              <Link to="/resend-verification" className="text-indigo-500 hover:text-indigo-700 underline underline-offset-2">
                Resend it
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;