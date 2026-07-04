import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Loader2, MailWarning } from 'lucide-react';
import { toast } from 'sonner';
import Footer from '@/components/Footer';

const HERO_BG = '#4FB3E8';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginAnonymous } = useAuth();
  const [mode, setMode] = useState<'standard' | 'anonymous'>('standard');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [needVerify, setNeedVerify] = useState(false);

  const isAnon = mode === 'anonymous';
  const redirectTo = (location.state as { from?: string } | null)?.from || '/game';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ident = email.trim();
    if (!ident || !password) {
      toast.error(isAnon ? 'Please enter both nickname and password.' : 'Please enter both email and password.');
      return;
    }
    setSubmitting(true);
    setLoginError(null);
    setNeedVerify(false);
    try {
      if (isAnon) {
        await loginAnonymous({ nickname: ident, password });
        toast.success('Welcome back!');
      } else {
        const { first_name } = await login({ email: ident, password });
        toast.success(first_name ? `Welcome back, ${first_name}!` : 'Welcome back!');
      }
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      const isVerify = !isAnon && msg.toLowerCase().includes('verify');
      setNeedVerify(isVerify);
      setLoginError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: HERO_BG }}
    >
      <div className="flex-1 flex items-center justify-center p-4">
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
          {/* Standard vs Anonymous selector (Issue #17) */}
          <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => { setMode('standard'); setLoginError(null); }}
              className={`text-sm font-semibold py-2 rounded-md transition-colors ${!isAnon ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => { setMode('anonymous'); setLoginError(null); }}
              className={`text-sm font-semibold py-2 rounded-md transition-colors ${isAnon ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              Anonymous
            </button>
          </div>
          {loginError && (
            <div
              className={`mb-4 rounded-lg border p-3 text-sm ${
                needVerify
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              <div className="flex items-start gap-2">
                <MailWarning className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p>{loginError}</p>
                  {needVerify && (
                    <button
                      type="button"
                      onClick={() => navigate('/resend-verification', { state: { email: email.trim() } })}
                      className="mt-2 inline-block font-semibold underline underline-offset-2 hover:text-amber-900"
                    >
                      Resend verification email
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">{isAnon ? 'Nickname' : 'Email'}</Label>
              <Input
                id="email"
                type={isAnon ? 'text' : 'email'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isAnon ? 'e.g. HappyMoose27' : 'you@example.com'}
                autoComplete={isAnon ? 'username' : 'email'}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
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
              {!isAnon ? (
                <Link to="/forgot-password" className="text-sm text-slate-500 hover:text-indigo-600 underline underline-offset-2">
                  Forgot password?
                </Link>
              ) : (
                <span className="text-xs text-slate-400">Anonymous logins can't be recovered.</span>
              )}
              <p className="text-sm text-slate-500">
                No account?{' '}
                <Link to="/register" className="font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-2">
                  Sign up
                </Link>
              </p>
            </div>
            {!isAnon && (
              <p className="text-center text-xs text-slate-400 pt-1">
                Didn't get a verification email?{' '}
                <Link to="/resend-verification" className="text-indigo-500 hover:text-indigo-700 underline underline-offset-2">
                  Resend it
                </Link>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
      </div>
      <Footer tone="dark" />
    </div>
  );
};

export default Login;