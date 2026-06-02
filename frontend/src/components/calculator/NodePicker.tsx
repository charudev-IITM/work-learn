import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { cn } from '../../lib/cn';
import { getAllRates } from '@comp-intel/shared/stores/rateStore';
import { useGlobalRateVersion } from '../../hooks/useRateVersion';
import { nodeId } from '@comp-intel/shared/calculator/astOps';
import { formatCalcValue } from '@comp-intel/shared/calculator/formatValue';
import type { ASTNode, RateRefNode, LiteralNode } from '@comp-intel/shared/types/calculator';

interface NodePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (node: ASTNode) => void;
}

type Tab = 'rate' | 'number';

export function NodePicker({ open, onClose, onSelect }: NodePickerProps) {
  const [tab, setTab] = useState<Tab>('rate');
  const [search, setSearch] = useState('');
  const [rateType, setRateType] = useState<'buy' | 'sell'>('buy');
  const [numberValue, setNumberValue] = useState('');

  // Subscribe to rate updates so the list shows current values
  const rateVersion = useGlobalRateVersion();

  const allRates = useMemo(() => {
    const rates = getAllRates();
    // Deduplicate by competitor+script
    const seen = new Set<string>();
    return rates.filter(r => {
      const key = `${r.competitor}:${r.script}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => {
      const cmp = a.competitor.localeCompare(b.competitor);
      return cmp !== 0 ? cmp : a.script.localeCompare(b.script);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateVersion]);

  const filteredRates = useMemo(() => {
    if (!search.trim()) return allRates;
    const q = search.toLowerCase();
    return allRates.filter(r =>
      r.competitor.toLowerCase().includes(q) ||
      r.script.toLowerCase().includes(q) ||
      (r.script_name && r.script_name.toLowerCase().includes(q))
    );
  }, [allRates, search]);

  const handleSelectRate = (competitor: string, symbol: string, scriptName?: string) => {
    const displayName = `${competitor} · ${scriptName || symbol} ${rateType === 'buy' ? 'Buy' : 'Sell'}`;
    const node: RateRefNode = {
      kind: 'rate_ref',
      id: nodeId(),
      competitor,
      symbol,
      rateType,
      displayName,
    };
    onSelect(node);
    setSearch('');
  };

  const handleSelectNumber = () => {
    const val = parseFloat(numberValue);
    if (isNaN(val)) return;
    const node: LiteralNode = { kind: 'literal', id: nodeId(), value: val };
    onSelect(node);
    setNumberValue('');
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      setSearch('');
      setNumberValue('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="top-auto bottom-0 translate-y-0 translate-x-[-50%] max-h-[75vh] sm:top-[50%] sm:bottom-auto sm:translate-y-[-50%] rounded-t-xl rounded-b-none sm:rounded-lg flex flex-col p-0 gap-0">
        <DialogHeader className="p-3 pb-0">
          <DialogTitle className="text-base">
            {tab === 'rate' ? 'Select Rate' : 'Enter Number'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Pick a rate reference or enter a constant number
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex border-b px-3 gap-1">
          <TabButton active={tab === 'rate'} onClick={() => setTab('rate')}>
            Rate
          </TabButton>
          <TabButton active={tab === 'number'} onClick={() => setTab('number')}>
            Number
          </TabButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          {tab === 'rate' && (
            <div>
              {/* Search + Buy/Sell toggle */}
              <div className="p-3 space-y-2 sticky top-0 bg-background z-10">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search dealers or scripts..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    variant={rateType === 'buy' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={() => setRateType('buy')}
                  >
                    Buy
                  </Button>
                  <Button
                    variant={rateType === 'sell' ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 h-7 text-xs"
                    onClick={() => setRateType('sell')}
                  >
                    Sell
                  </Button>
                </div>
              </div>

              {/* Rate list */}
              <div className="px-3 pb-3 space-y-0.5">
                {filteredRates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {search ? 'No matching rates' : 'No rates available'}
                  </p>
                ) : (
                  filteredRates.map(rate => {
                    const value = rateType === 'buy' ? rate.buy_rate : rate.sell_rate;
                    return (
                      <button
                        key={`${rate.competitor}:${rate.script}`}
                        className="w-full flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-muted/50 active:bg-muted transition-colors text-left"
                        onClick={() => handleSelectRate(rate.competitor, rate.script, rate.script_name)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{rate.competitor}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {rate.script_name || rate.script}
                          </div>
                        </div>
                        <span className="text-sm font-mono text-muted-foreground shrink-0">
                          {value != null ? formatCalcValue(value) : 'N/A'}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {tab === 'number' && (
            <div className="p-3 space-y-3">
              <Input
                type="number"
                inputMode="decimal"
                placeholder="Enter a number (e.g. 100, 1.03, 0.032151)"
                value={numberValue}
                onChange={e => setNumberValue(e.target.value)}
                className="h-12 text-lg font-mono text-center"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSelectNumber(); }}
              />
              <div className="grid grid-cols-4 gap-1.5">
                {['1', '2', '3', '+', '4', '5', '6', '-', '7', '8', '9', '.', 'C', '0', '⌫', '✓'].map(key => (
                  <Button
                    key={key}
                    variant={key === '✓' ? 'default' : key === 'C' ? 'destructive' : 'outline'}
                    className="h-11 text-lg font-mono"
                    onClick={() => {
                      if (key === 'C') setNumberValue('');
                      else if (key === '⌫') setNumberValue(prev => prev.slice(0, -1));
                      else if (key === '✓') handleSelectNumber();
                      else if (key === '-') {
                        setNumberValue(prev => prev.startsWith('-') ? prev.slice(1) : '-' + prev);
                      }
                      else if (key === '+') {
                        setNumberValue(prev => prev.startsWith('-') ? prev.slice(1) : prev);
                      }
                      else setNumberValue(prev => prev + key);
                    }}
                  >
                    {key}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                {[0.5, 1, 2, 10, 100, 1000, 1.03, 0.032151].map(preset => (
                  <Button
                    key={preset}
                    variant="outline"
                    size="sm"
                    className="text-xs font-mono"
                    onClick={() => {
                      const node: LiteralNode = { kind: 'literal', id: nodeId(), value: preset };
                      onSelect(node);
                    }}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={cn(
        'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
