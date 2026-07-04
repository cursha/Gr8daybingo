import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { getOfflineStatus } from '@/lib/game-utils';
import OfflineScreen from '@/components/OfflineScreen';
import Index from './pages/Index';
import GameBoard from './pages/GameBoard';
import Wallet from './pages/Wallet';
import AdminPanel from './pages/AdminPanel';
import Leaderboard from './pages/Leaderboard';
import Login from './pages/Login';
import Register from './pages/Register';
import AuthCallback from './pages/AuthCallback';
import AuthError from './pages/AuthError';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import ResendVerification from './pages/ResendVerification';
import PrizeHistory from './pages/PrizeHistory';
import TradeSquares from './pages/TradeSquares';
import TeamPage from './pages/TeamPage';
import Profile from './pages/Profile';
import Welcome from './pages/Welcome';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient();

const AppRoutes = () => {
  const location = useLocation();
  // /login is exempt alongside /admin: without it, an admin whose session
  // expires while maintenance mode is on has no way to get a fresh login —
  // /admin's own password screen never issues a real session token, only
  // /login does. Every other route still shows the maintenance screen.
  const isExemptPath = location.pathname.startsWith('/admin') || location.pathname.startsWith('/login');
  const [offline, setOffline] = useState(false); // fail-open: default false
  const [offlineUntil, setOfflineUntil] = useState<string | null>(null);

  useEffect(() => {
    // Exempt paths never even make this call — access to them can never
    // depend on this fetch's timing, success, or the offline_mode value itself.
    if (isExemptPath) return;
    getOfflineStatus()
      .then((r) => { setOffline(r.offline_mode); setOfflineUntil(r.offline_until); })
      .catch(() => {}); // fail-open: leave false on any error
  }, [isExemptPath]);

  if (offline && !isExemptPath) {
    return <OfflineScreen until={offlineUntil} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/game" element={<GameBoard />} />
      <Route path="/wallet" element={<Wallet />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route path="/admin" element={<AdminPanel />} />
      {/* <Route path="/blog/*" element={<BlogRoutes />} /> */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/auth/error" element={<AuthError />} />
      <Route path="/terms" element={<TermsOfService />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/resend-verification" element={<ResendVerification />} />
      <Route path="/prize-history" element={<PrizeHistory />} />
      <Route path="/trade" element={<TradeSquares />} />
      <Route path="/team" element={<TeamPage />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/welcome" element={<Welcome />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
export { AppRoutes };