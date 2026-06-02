import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Bell, BellOff, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Skeleton } from '../ui/skeleton';
import { formatCurrency, getRelativeTime } from '@comp-intel/shared/lib/formatters';
import { cn } from '../../lib/cn';
import { alertService } from '@comp-intel/shared/services/alerts';
import { PriceAlert } from '@comp-intel/shared/types/alerts';
import { AlertDialog } from './AlertDialog';

export function ManageAlerts() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editAlert, setEditAlert] = useState<PriceAlert | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      setError('');
      const data = await alertService.getAlerts();
      setAlerts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleToggleActive = async (alert: PriceAlert) => {
    try {
      const updated = await alertService.updateAlert(alert.id, { isActive: !alert.isActive });
      setAlerts(prev => prev.map(a => a.id === updated.id ? updated : a));
    } catch (err: any) {
      setError(err.message || 'Failed to update alert');
    }
  };

  const handleDelete = async (alertId: string) => {
    try {
      await alertService.deleteAlert(alertId);
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      setExpandedId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete alert');
    }
  };

  const handleEditSuccess = () => {
    fetchAlerts();
    setEditAlert(null);
  };

  const conditionText = (alert: PriceAlert) => {
    const type = alert.rateType.charAt(0).toUpperCase() + alert.rateType.slice(1);
    return `${type} ${alert.condition} ${formatCurrency(alert.threshold)}`;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="sticky top-0 bg-background/95 backdrop-blur border-b p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { window.location.hash = ''; }}
            className="w-9 h-9 p-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Price Alerts</h1>
            <p className="text-xs text-muted-foreground">
              {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setLoading(true); fetchAlerts(); }} className="w-9 h-9 p-0">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {error && (
          <div className="m-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-3 sm:p-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card rounded-xl ring-1 ring-gray-200/50 dark:ring-gray-700/50 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3.5 w-28" />
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No Alerts</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              Create price alerts from the watchlist by tapping on a script and using the bell button.
            </p>
            <Button variant="outline" onClick={() => { window.location.hash = ''; }}>
              Go to Watchlist
            </Button>
          </div>
        ) : (
          <div className="p-3 sm:p-4 space-y-3">
            {alerts.map(alert => (
              <div
                key={alert.id}
                className={cn(
                  "bg-card rounded-xl shadow-sm",
                  "backdrop-blur-sm bg-white/95 dark:bg-gray-900/95",
                  "ring-1 ring-gray-200/50 dark:ring-gray-700/50",
                  !alert.isActive && "opacity-60"
                )}
              >
                {/* Main row */}
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base truncate">{alert.dealerName}</p>
                      <p className="text-sm text-muted-foreground truncate">{alert.scriptName}</p>
                      <p className={cn(
                        "text-sm font-medium mt-1",
                        alert.condition === 'above' ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                      )}>
                        {conditionText(alert)}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Status badge */}
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                        alert.isActive
                          ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 ring-1 ring-green-200 dark:ring-green-800"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 ring-1 ring-gray-200 dark:ring-gray-700"
                      )}>
                        {alert.isActive ? (
                          <>
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                            Active
                          </>
                        ) : (
                          <>
                            <BellOff className="w-3 h-3" />
                            Inactive
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Last triggered */}
                  {alert.lastTriggeredAt && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Last triggered {getRelativeTime(alert.lastTriggeredAt)}
                    </p>
                  )}
                </div>

                {/* Expanded actions */}
                {expandedId === alert.id && (
                  <div className="border-t border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30 p-4 space-y-3">
                    {/* Details */}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Mode</span>
                        <p className="font-medium">{alert.triggerMode === 'one_shot' ? 'One-shot' : 'Persistent'}</p>
                      </div>
                      {alert.triggerMode === 'persistent' && (
                        <div>
                          <span className="text-muted-foreground">Cooldown</span>
                          <p className="font-medium">{alert.cooldownMinutes} min</p>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Created</span>
                        <p className="font-medium">{getRelativeTime(alert.createdAt)}</p>
                      </div>
                    </div>

                    {/* Active toggle */}
                    <div className="flex items-center justify-between py-1">
                      <span className="text-sm font-medium">Active</span>
                      <Switch
                        checked={alert.isActive}
                        onCheckedChange={() => handleToggleActive(alert)}
                      />
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditAlert(alert);
                          setEditDialogOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(alert.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      {editAlert && (
        <AlertDialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditAlert(null);
          }}
          dealerName={editAlert.dealerName}
          scriptName={editAlert.scriptName}
          currentBuyRate={0}
          currentSellRate={0}
          existingAlert={editAlert}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
