import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart, Home } from 'lucide-react';

const HERO_BG = '#4FB3E8';

const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: HERO_BG }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-12 max-w-md w-full text-center">
        <div className="flex justify-center mb-4">
          <Heart className="w-10 h-10 text-rose-500 fill-rose-500" />
        </div>
        <h1 className="text-6xl font-black text-indigo-600 mb-2">404</h1>
        <p className="text-lg font-bold text-slate-800 mb-1">Page not found</p>
        <p className="text-sm text-slate-500 mb-6">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={() => navigate('/')}
            className="bg-red-600 hover:bg-red-700 text-white font-bold border-2 border-yellow-300"
          >
            <Home className="w-4 h-4 mr-1" /> Go Home
          </Button>
          <Button variant="outline" onClick={() => navigate('/game')}>
            Go to My Card
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
