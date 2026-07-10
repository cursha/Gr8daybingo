import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Loader2, MailCheck } from 'lucide-react';
import { toast } from 'sonner';
import Footer from '@/components/Footer';

const HERO_BG = '#4FB3E8';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { register, registerAnonymous } = useAuth();
  const [mode, setMode] = useState<'standard' | 'anonymous'>('standard');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  const isAnon = mode === 'anonymous';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uname = username.trim();
    const mail = email.trim();
    if (uname.length < 3) {
      toast.error(isAnon ? 'Nickname must be at least 3 characters.' : 'Username must be at least 3 characters.');
      return;
    }
    if (!isAnon) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(mail)) {
        toast.error('Please enter a valid email address.');
        return;
      }
    }
    const minLen = isAnon ? 6 : 8;
    if (password.length < minLen) {
      toast.error(`Password must be at least ${minLen} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (isAnon) {
        // Anonymous accounts are usable immediately (no email to verify), so
        // we drop the player straight into the game.
        await registerAnonymous({ nickname: uname, password });
        navigate('/game');
      } else {
        await register({ username: uname, email: mail, password });
        setRegistered(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: HERO_BG }}>
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardContent className="pt-8 pb-8 text-center space-y-5">
            <button type="button" onClick={() => navigate('/')} className="mx-auto flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors">
              <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
              <span className="font-black tracking-wide">Havagr8day!</span>
            </button>
            <div className="flex justify-center">
              <div className="bg-indigo-100 rounded-full p-4">
                <MailCheck className="w-8 h-8 text-indigo-600" />
              </div>
            </div>
            <p className="text-slate-800 font-semibold text-lg">Check your email</p>
            <p className="text-slate-500 text-sm">
              We sent a verification link to <strong>{email}</strong>.<br />
              Click the link to activate your account.
            </p>
            <p className="text-slate-400 text-xs">The link expires in 24 hours.</p>
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold border-2 border-yellow-300" onClick={() => navigate('/login')}>
              Go to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <p className="text-sm text-slate-500">
            Sign up to start completing Gr8Day Deeds.
          </p>
        </CardHeader>
        <CardContent>
          {/* Standard vs Anonymous selector (Issue #17) */}
          <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('standard')}
              className={`text-sm font-semibold py-2 rounded-md transition-colors ${!isAnon ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setMode('anonymous')}
              className={`text-sm font-semibold py-2 rounded-md transition-colors ${isAnon ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
            >
              Anonymous
            </button>
          </div>

          {isAnon && (
            <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
              Play with just a nickname and password. No name or email needed.
              Anonymous players are not eligible for prizes (we have no way to
              contact you), and a forgotten password cannot be recovered automatically.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">{isAnon ? 'Nickname' : 'Username'}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isAnon ? 'e.g. HappyMoose27' : 'Choose a username'}
                autoComplete="username"
                required
              />
            </div>
            {!isAnon && (
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
                <p className="text-xs text-slate-500">
                  <a href="/email-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline underline-offset-2">
                    See how we'll use your email
                  </a> — weekly game announcements, occasional updates, and win notifications only.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isAnon ? 'At least 6 characters' : 'At least 8 characters'}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <PasswordInput
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account…
                </>
              ) : (
                'Sign Up'
              )}
            </Button>
            <p className="text-center text-sm text-slate-500 pt-2">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-semibold text-indigo-600 hover:text-indigo-700 underline underline-offset-2"
              >
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
      </div>
      <Footer tone="dark" />
    </div>
  );
};

export default Register;