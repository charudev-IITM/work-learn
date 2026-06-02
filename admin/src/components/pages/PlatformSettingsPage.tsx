import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Settings, Loader2, Save, CheckCircle, Power, AlertTriangle } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { adminService } from '../../services/admin'

// --- IST ↔ UTC helpers for datetime-local inputs ---
// IST is always UTC+5:30 (no DST)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** UTC ISO string → "YYYY-MM-DDTHH:mm" in IST (for datetime-local input value) */
function utcToIstLocal(iso: string | undefined): string {
  if (!iso) return ''
  try {
    const utc = new Date(iso)
    if (isNaN(utc.getTime())) return ''
    const ist = new Date(utc.getTime() + IST_OFFSET_MS)
    return ist.toISOString().slice(0, 16)
  } catch {
    return ''
  }
}

/** "YYYY-MM-DDTHH:mm" in IST → UTC ISO string (for storage) */
function istLocalToUtc(localStr: string): string {
  if (!localStr) return ''
  const asUtc = new Date(localStr + ':00.000Z')
  const utc = new Date(asUtc.getTime() - IST_OFFSET_MS)
  return utc.toISOString()
}

interface SettingField {
  key: string
  label: string
  description: string
  type: 'text' | 'number' | 'boolean' | 'datetime'
}

const SETTING_FIELDS: SettingField[] = [
  {
    key: 'trial_promo_start',
    label: 'Trial Promo Start',
    description: 'When the trial promo becomes active (IST)',
    type: 'datetime',
  },
  {
    key: 'trial_promo_end',
    label: 'Trial Promo End',
    description: 'When the trial promo ends (IST)',
    type: 'datetime',
  },
  {
    key: 'trial_duration_days',
    label: 'Trial Duration (days)',
    description: 'Number of days the free trial lasts when claimed (1–365)',
    type: 'number',
  },
  {
    key: 'preview_enabled',
    label: '10-Minute Preview',
    description: 'Enable the 10-minute app preview during onboarding (shelved during promo)',
    type: 'boolean',
  },
]

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const togglingRef = useRef(false)
  const [togglingPromo, setTogglingPromo] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await adminService.getPlatformSettings()
      setSettings(data)
      setDraft(data)
    } catch (err) {
      setError('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /** Validate a field value before saving. Returns error message or null. */
  const validate = (key: string, value: string): string | null => {
    if (key === 'trial_duration_days') {
      const n = Number(value)
      if (!value || isNaN(n)) return 'Duration is required'
      if (!Number.isInteger(n)) return 'Must be a whole number'
      if (n < 1) return 'Must be at least 1 day'
      if (n > 365) return 'Must be 365 days or less'
    }
    return null
  }

  const handleSave = async (key: string) => {
    if (draft[key] === settings[key]) return
    const validationError = validate(key, draft[key])
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(key)
    setError(null)
    try {
      await adminService.updatePlatformSetting(key, draft[key])
      setSettings(prev => ({ ...prev, [key]: draft[key] }))
      setSaved(key)
      setTimeout(() => setSaved(null), 2000)
    } catch {
      setError(`Failed to update ${key}`)
    } finally {
      setSaving(null)
    }
  }

  const isPromoActive = useMemo(() => {
    const start = draft.trial_promo_start
    const end = draft.trial_promo_end
    if (!start || !end) return false
    try {
      const now = new Date()
      return new Date(start) <= now && now <= new Date(end)
    } catch {
      return false
    }
  }, [draft.trial_promo_start, draft.trial_promo_end])

  // Warn if start > end (inverted range)
  const datesInverted = useMemo(() => {
    const start = draft.trial_promo_start
    const end = draft.trial_promo_end
    if (!start || !end) return false
    try {
      return new Date(start) > new Date(end)
    } catch {
      return false
    }
  }, [draft.trial_promo_start, draft.trial_promo_end])

  const handleTogglePromo = async () => {
    // Ref guard: prevents rapid-fire clicks that bypass React's async state batch
    if (togglingRef.current) return
    togglingRef.current = true
    setTogglingPromo(true)
    setError(null)
    try {
      if (isPromoActive) {
        const now = new Date().toISOString()
        await adminService.updatePlatformSetting('trial_promo_end', now)
        const updated = { ...settings, trial_promo_end: now }
        setSettings(updated)
        setDraft(updated)
      } else {
        // Atomic: single batch PUT for both dates
        const now = new Date()
        const oneYearLater = new Date(now)
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1)
        const startStr = now.toISOString()
        const endStr = oneYearLater.toISOString()
        await adminService.batchUpdatePlatformSettings({
          trial_promo_start: startStr,
          trial_promo_end: endStr,
        })
        const updated = { ...settings, trial_promo_start: startStr, trial_promo_end: endStr }
        setSettings(updated)
        setDraft(updated)
      }
    } catch {
      setError('Failed to toggle trial promo')
    } finally {
      setTogglingPromo(false)
      togglingRef.current = false
    }
  }

  const handleDatetimeChange = (key: string, localValue: string) => {
    const utcIso = localValue ? istLocalToUtc(localValue) : ''
    setDraft(prev => ({ ...prev, [key]: utcIso }))
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading settings...
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Platform Settings</h1>
          <p className="text-sm text-muted-foreground">Feature flags and promo configuration</p>
        </div>
      </div>

      {/* Promo toggle card */}
      <div className={`mb-6 p-4 rounded-xl border-2 ${
        isPromoActive
          ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20'
          : 'border-border bg-muted/30'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isPromoActive
                ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                : 'bg-muted text-muted-foreground'
            }`}>
              <Power className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {isPromoActive ? 'Trial Promo is ACTIVE' : 'Trial Promo is INACTIVE'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isPromoActive
                  ? `Ends ${new Date(draft.trial_promo_end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST`
                  : 'New users cannot claim free trials'}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={isPromoActive ? 'destructive' : 'default'}
            onClick={handleTogglePromo}
            disabled={togglingPromo}
          >
            {togglingPromo ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isPromoActive ? (
              'Turn Off'
            ) : (
              'Turn On'
            )}
          </Button>
        </div>
      </div>

      {/* Date range warning */}
      {datesInverted && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Promo start is after end date — the promo will never activate.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {SETTING_FIELDS.map(field => (
          <div key={field.key} className="p-4 rounded-xl border bg-card">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">{field.label}</label>
              {saved === field.key && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle className="w-3 h-3" /> Saved
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">{field.description}</p>

            <div className="flex items-center gap-2">
              {field.type === 'boolean' ? (
                <button
                  onClick={() => {
                    const newVal = draft[field.key] === 'true' ? 'false' : 'true'
                    setDraft(prev => ({ ...prev, [field.key]: newVal }))
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    draft[field.key] === 'true' ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    draft[field.key] === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              ) : field.type === 'datetime' ? (
                <input
                  type="datetime-local"
                  value={utcToIstLocal(draft[field.key])}
                  onChange={e => handleDatetimeChange(field.key, e.target.value)}
                  className="flex-1 text-sm rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              ) : (
                <Input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={draft[field.key] ?? ''}
                  onChange={e => setDraft(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="flex-1 text-sm"
                  {...(field.type === 'number' ? { min: 1, max: 365 } : {})}
                />
              )}

              {draft[field.key] !== settings[field.key] && (
                <Button
                  size="sm"
                  onClick={() => handleSave(field.key)}
                  disabled={saving === field.key}
                >
                  {saving === field.key ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3" />
                  )}
                  <span className="ml-1">Save</span>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
