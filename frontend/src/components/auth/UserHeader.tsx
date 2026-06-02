import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/cn';

interface UserHeaderProps {
  className?: string;
}

export function UserHeader({ className }: UserHeaderProps) {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className={cn("min-w-0", className)}>
      <h1 className="text-lg sm:text-xl font-bold truncate">Spot Compare</h1>
      <p className="text-xs sm:text-sm text-muted-foreground truncate">Real-time bullion rates</p>
    </div>
  );
}
