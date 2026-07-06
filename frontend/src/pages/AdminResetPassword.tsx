import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Heart, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { adminResetPassword } from '@/lib/game-utils';

const HERO_BG = '#4FB3E8';

const AdminResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: HERO_BG }}>
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardContent className="pt-8 text-center space-y-4">
            <p className="text-slate-700 font-semibold">Invalid or expired reset link.</p>
            <Button className="w-full" onClick={() => navigate('/admin')}>Back to Admin Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    setSubmitting(true);
    try {
      await adminResetPassword(token, password);
      setDone(true);
      toast.success('Admin password updated successfully!');
    } catch (err: any) {
      toast.error(err?.message || 'Reset link is invalid or expired. Please request a new one.');
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
          <CardTitle className="text-2xl">Reset Admin Password</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="text-center py-4 space-y-4">
              <div className="flex justify-center">
                <div className="bg-emerald-100 rounded-full p-4">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
              <p className="text-slate-700 font-semibold">Password updated!</p>
              <p className="text-sm text-slate-500">You can now log in to the admin panel with your new password.</p>
              <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold border-2 border-yellow-300" onClick={() => navigate('/admin')}>
                Go to Admin Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">New Admin Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" disabled={submitting} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold border-2 border-yellow-300">
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating…</> : 'Set New Password'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminResetPassword;
