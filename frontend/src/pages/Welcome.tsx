import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Heart } from 'lucide-react';
import Footer from '@/components/Footer';

const Welcome: React.FC = () => {
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

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-5 text-slate-700 leading-relaxed">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <img
            src="/CURT-circle-RED-head.jpg"
            alt="Curt Skene, founder of HavaGr8Day Bingo"
            className="w-24 h-24 rounded-full object-cover shrink-0"
          />
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">Welcome to HavaGr8Day Bingo</h1>
            <p className="text-sm text-slate-400">A note from our founder</p>
          </div>
        </div>

        <p>Hi, I'm Curt Skene, founder of HavaGr8Day Bingo.</p>

        <p>Before you start playing, I want to tell you how this all began.</p>

        <p>
          Many years ago, I started something very simple. Whenever I bought myself a beverage, I would
          occasionally buy one for someone else. Sometimes it was a friend. Often, it was a complete
          stranger. There was no plan. No organization. No prizes. No website. Just a simple belief that
          small acts of kindness can make a big difference.
        </p>

        <p>
          Over time, a handful of friends joined in. Then more people started embracing the idea.
          We discovered something unexpected. The real reward wasn't buying the drink. It wasn't the
          thank you. It wasn't even the smile.
        </p>

        <p className="text-xl font-semibold text-slate-900">
          The reward was awareness. That idea of knowing you were making a difference!
        </p>

        <p>
          Once you start looking for opportunities to make someone's day better, you begin seeing them
          everywhere.
        </p>

        <p>
          You notice the person who could use a compliment. The neighbour who needs a hand. The server
          who deserves appreciation. The friend who could use some encouragement. The stranger who simply
          needs someone to notice them.
        </p>

        <p>
          What started as a small coffee initiative among a dozen friends slowly grew into something much
          bigger.
        </p>

        <p>Today, that idea has become HavaGr8Day Bingo.</p>

        <p>My vision is simple. I want to take this idea around the world.</p>

        <p>Not because it's a game.</p>

        <p>
          Because the world could use a little more kindness, a little more gratitude, a little more
          encouragement, and a lot more people paying attention to one another.
        </p>

        <p>
          The funny thing is that HavaGr8Day Bingo disguises itself as a game. You complete challenges.
          You earn points. You fill your bingo card. You compete for prizes.
        </p>

        <p>But what is really happening is something far more important.</p>

        <p className="text-xl font-semibold text-slate-900">The game is training you to notice.</p>

        <p>To notice opportunities.</p>

        <p>To notice people.</p>

        <p>To notice moments.</p>

        <p>
          To notice that each of us has the ability to make someone else's day just a little bit better.
        </p>

        <p>
          As we grow, the game will evolve. New challenges will appear. Some will be easy. Some will push
          you outside your comfort zone. Some may even change the way you look at the world.
        </p>

        <p className="text-xl font-semibold text-slate-900">Good.</p>

        <p>That's exactly what I hope happens.</p>

        <p>
          You didn't join HavaGr8Day Bingo because you were looking for another game. You joined because
          something inside you believes that small actions matter.
        </p>

        <p>I believe that too.</p>

        <p>
          Together, let's create a movement that proves kindness is contagious, great days can be created,
          and ordinary people can make an extraordinary difference.
        </p>

        <p>Thank you for being part of this journey.</p>

        <p>
          Now get out there, have some fun, complete a few squares, make someone's day, and most
          importantly, as I like to say...
        </p>

        <p className="text-2xl font-bold text-indigo-600">Have a GR8 Day!</p>

        <div className="pt-2">
          <p className="font-semibold text-slate-900">Curt Skene</p>
          <p className="text-slate-500">Founder, HavaGr8Day Bingo</p>
        </div>

        <div className="pt-6 flex flex-wrap gap-3">
          <Button
            onClick={() => navigate('/register')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
          >
            Join the Game
          </Button>
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to Home
          </Button>
        </div>
      </div>
      <Footer tone="light" />
    </div>
  );
};

export default Welcome;
