import { TrendingUp, ArrowRight, MapPin, BarChart3, Zap } from 'lucide-react';
import { Button } from '../../ui/button';
import { useStats } from '../../../hooks/useStats';

interface WelcomeStepProps {
  onNext: () => void;
}

const CITIES = [
  'Mumbai', 'Chennai', 'Ahmedabad', 'Delhi', 'Jaipur',
  'Kolkata', 'Bangalore', 'Surat', 'Hyderabad', 'Pune',
];

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const stats = useStats();

  return (
    <div className="flex-1 flex flex-col px-6 pb-8 pt-4">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        {/* Logo */}
        <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-amber-500/25">
          <TrendingUp className="w-8 h-8 text-white" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">
          Welcome to SpotCompare
        </h1>
        <p className="text-muted-foreground text-base max-w-xs mb-8">
          Compare live bullion rates from{' '}
          <span className="text-amber-500 font-semibold">{stats.dealers}+ dealers</span>
          {' '}— all in one place
        </p>

        {/* Stats */}
        <div className="w-full max-w-sm grid grid-cols-3 gap-3 mb-8">
          <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            <span className="text-lg font-bold text-foreground">{stats.dealers}+</span>
            <span className="text-[11px] text-muted-foreground">Dealers</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
            <MapPin className="w-5 h-5 text-blue-500" />
            <span className="text-lg font-bold text-foreground">{stats.cities}+</span>
            <span className="text-[11px] text-muted-foreground">Cities</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-green-500/5 border border-green-500/10">
            <Zap className="w-5 h-5 text-green-500" />
            <span className="text-lg font-bold text-foreground">1s</span>
            <span className="text-[11px] text-muted-foreground">Updates</span>
          </div>
        </div>

        {/* Cities */}
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">
              Cities covered
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {CITIES.map((city) => (
              <span
                key={city}
                className="text-xs px-2.5 py-1 rounded-full bg-muted/50 text-muted-foreground border border-border/50"
              >
                {city}
              </span>
            ))}
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
              +{stats.cities - 10} more
            </span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="shrink-0">
        <Button
          onClick={onNext}
          className="w-full h-14 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold text-base rounded-xl shadow-lg shadow-amber-500/25 active:scale-[0.98] transition-all"
        >
          Get Started
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
        <p className="text-center text-xs text-muted-foreground mt-3">
          Setup takes less than 60 seconds
        </p>
      </div>
    </div>
  );
}
