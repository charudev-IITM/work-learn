import { useState } from 'react'
import { LogOut, Sun, Moon, Monitor, Store, CreditCard, Loader2, ChevronRight } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useSubscription } from '../../contexts/SubscriptionContext'
import { SubscriptionBadge } from '../billing/SubscriptionBadge'
import { RequestDealerDialog } from '../dealer/RequestDealerDialog'
import { getUserInitials } from '@comp-intel/shared/lib/getUserInitials'
import { PLANS } from '@comp-intel/shared/types/billing'
import { cn } from '../../lib/cn'

interface ProfileSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileSheet({ open, onOpenChange }: ProfileSheetProps) {
  const { user, logout } = useAuth()
  const { theme, setTheme, actualTheme } = useTheme()
  const { subscription, cancelSubscription } = useSubscription()
  const [requestDealerOpen, setRequestDealerOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  if (!user) return null

  const initials = getUserInitials(user)

  const cycleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  }

  const ThemeIcon = theme === 'system' ? Monitor : actualTheme === 'dark' ? Moon : Sun
  const themeLabel = theme === 'system' ? `System (${actualTheme})` : theme.charAt(0).toUpperCase() + theme.slice(1)

  const handleLogout = async () => {
    onOpenChange(false)
    try { await logout() } catch { /* handled by auth context */ }
  }

  const handleManageSubscription = () => {
    onOpenChange(false)
    setCancelError(null)
    setCancelDialogOpen(true)
  }

  const handleCancelSubscription = async () => {
    setIsCancelling(true)
    setCancelError(null)
    try {
      await cancelSubscription(true)
      setCancelDialogOpen(false)
    } catch {
      setCancelError('Failed to cancel. Please try again.')
    } finally {
      setIsCancelling(false)
    }
  }

  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : null

  const planLabel = subscription?.plan_type ? PLANS[subscription.plan_type].label : null

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh]" style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}>
          <SheetHeader className="pb-4 border-b text-left">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-base font-bold text-primary shrink-0 mt-0.5">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <SheetTitle className="text-left text-base truncate">{user.name || user.username}</SheetTitle>
                  <SubscriptionBadge />
                </div>
                <SheetDescription className="text-left text-xs mt-0.5">
                  {user.phone || user.username}
                  {user.createdAt && (
                    <span className="text-muted-foreground/60"> · Since {new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
                  )}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="py-4 space-y-1">
            {/* Theme toggle */}
            <button
              onClick={cycleTheme}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 active:bg-muted/70 transition-colors text-left"
            >
              <ThemeIcon className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">Theme</span>
              <span className="text-sm text-muted-foreground">{themeLabel}</span>
            </button>

            {/* Request Dealer */}
            <button
              onClick={() => { onOpenChange(false); setRequestDealerOpen(true) }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 active:bg-muted/70 transition-colors text-left"
            >
              <Store className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">Request Dealer</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
            </button>

            {/* Manage Subscription */}
            {subscription?.has_subscription && subscription?.status !== 'admin_exempt' && (
              <button
                onClick={handleManageSubscription}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 active:bg-muted/70 transition-colors text-left"
              >
                <CreditCard className="w-5 h-5 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">Manage Subscription</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
              </button>
            )}

            <div className="pt-2 border-t">
              <button
                onClick={handleLogout}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left",
                  "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                )}
              >
                <LogOut className="w-5 h-5" />
                <span className="text-sm font-medium">Sign Out</span>
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground pt-2 pb-1">
              Made with ❤️ by <a href="https://zettatech.in" target="_blank" rel="noopener noreferrer" className="font-medium hover:text-foreground transition-colors">Zetta Tech</a>
              <span className="mx-1">·</span>
              <button onClick={() => setDisclaimerOpen(true)} className="underline underline-offset-2 hover:text-foreground transition-colors">Disclaimer</button>
            </p>
          </div>
        </SheetContent>
      </Sheet>

      <RequestDealerDialog
        open={requestDealerOpen}
        onOpenChange={setRequestDealerOpen}
      />

      {/* Cancel Subscription Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-sm mx-auto rounded-xl">
          <DialogHeader className="text-left">
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              {subscription?.status === 'cancelled'
                ? 'Your subscription is already set to cancel.'
                : renewalDate
                  ? <>You'll keep access until <span className="font-medium text-foreground">{renewalDate}</span>. After that, you'll need to resubscribe.</>
                  : 'Your access will continue until the end of your current billing period.'}
            </DialogDescription>
          </DialogHeader>

          {planLabel && renewalDate && subscription?.status !== 'cancelled' && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{planLabel}</span>
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-muted-foreground">Renews</span>
                <span className="font-medium">{renewalDate}</span>
              </div>
            </div>
          )}

          {cancelError && (
            <p className="text-sm text-destructive">{cancelError}</p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {subscription?.status === 'cancelled' ? (
              <Button variant="outline" onClick={() => setCancelDialogOpen(false)} className="w-full sm:w-auto">
                Close
              </Button>
            ) : (
              <>
                <Button
                  variant="destructive"
                  onClick={handleCancelSubscription}
                  disabled={isCancelling}
                  className="w-full sm:w-auto"
                >
                  {isCancelling ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cancelling...</> : 'Cancel Subscription'}
                </Button>
                <Button variant="outline" onClick={() => setCancelDialogOpen(false)} className="w-full sm:w-auto">
                  Keep Subscription
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disclaimer Dialog */}
      <Dialog open={disclaimerOpen} onOpenChange={setDisclaimerOpen}>
        <DialogContent className="max-w-sm mx-auto rounded-xl">
          <DialogHeader className="text-left">
            <DialogTitle>Disclaimer</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            SpotCompare provides gold &amp; silver prices obtained from various sources believed to be reliable, but we do not guarantee their accuracy. Our gold, silver and other price data are provided without warranty or claim of reliability. It is accepted by the site visitor on the condition that errors or omissions shall not be made the basis for any claim, demand or cause for action.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisclaimerOpen(false)} className="w-full sm:w-auto">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
