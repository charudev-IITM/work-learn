import { authenticatedApi } from './auth'

// ── Types ────────────────────────────────────────────────────────────────

export interface AdminSubscriptionInfo {
  id: string
  status: string
  plan_type: string | null
  razorpay_subscription_id: string | null
  current_period_start: string | null
  current_period_end: string | null
}

export interface AdminUser {
  id: string
  phone: string | null
  name: string | null
  business: string | null
  is_admin: boolean
  is_active: boolean
  onboarding_complete: boolean
  created_at: string | null
  last_login: string | null
  ban_reason: string | null
  banned_at: string | null
  subscription: AdminSubscriptionInfo | null
  abuse_score: number | null
  trial_status: 'active' | 'expired' | 'not_claimed' | null
  trial_days_left: number | null
  is_online: boolean
}

export interface GrantSubscriptionRequest {
  plan_type: 'annual' | 'monthly'
  duration_days?: number
}

export interface AdminOverview {
  total_users: number
  active_subscriptions: number
  online_users: number
  total_scrapers: number
  pending_dealer_requests: number
}

export interface AdminSessionInfo {
  id: string
  device_hint: string | null
  ip_address: string | null
  created_at: string | null
  revoked_at: string | null
  revoke_reason: string | null
}

export interface AdminWatchlistInfo {
  id: string
  name: string
  script_count: number
}

export interface AdminAlertInfo {
  id: string
  dealer_name: string
  script_name: string
  condition: string
  rate_type: string
  threshold: number
  is_active: boolean
}

export interface AdminAbuseEvent {
  id: string
  signal: string
  score_delta: number
  total_score: number
  client_ip: string | null
  occurred_at: string | null
}

export interface AdminUserDetail {
  user: AdminUser
  trial_started_at: string | null
  trial_ends_at: string | null
  sessions: AdminSessionInfo[]
  watchlists: AdminWatchlistInfo[]
  alerts: AdminAlertInfo[]
  abuse_score: number | null
  abuse_events: AdminAbuseEvent[]
}

export interface AdminDealerRequest {
  id: string
  dealer_name: string
  dealer_url: string
  notes: string | null
  user_name: string | null
  user_phone: string | null
  created_at: string | null
}

export interface PaginatedUsers {
  users: AdminUser[]
  total: number
  has_more: boolean
}

// ── New types ────────────────────────────────────────────────────────────

export interface SubscriptionAnalytics {
  total_active: number
  total_cancelled: number
  total_created: number
  by_plan: Record<string, number>
  mrr_estimate: number
  recent_events: Array<{
    event_type: string
    user_phone: string | null
    plan_type: string | null
    processed_at: string | null
  }>
  new_last_7d: number
  new_last_30d: number
  cancelled_last_7d: number
  cancelled_last_30d: number
}

export interface AuditLogEntry {
  id: string
  admin_name: string | null
  admin_phone: string | null
  action: string
  target_user_name: string | null
  target_user_phone: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface PaginatedAuditLog {
  entries: AuditLogEntry[]
  total: number
  has_more: boolean
}

export interface BroadcastRequest {
  message: string
  type: 'info' | 'warning' | 'maintenance'
}

export interface JourneyStats {
  signed_up: number
  onboarded: number
  trial_claimed: number
  trial_active: number
  subscribed: number
  online_now: number
}

export interface OnlineHistoryPoint { t: number; v: number }
export interface OnlineHistory {
  points: OnlineHistoryPoint[]
  range: 'today' | '7d'
}

// ── Service ──────────────────────────────────────────────────────────────

export const adminService = {
  // Existing endpoints (ported from frontend)
  async listUsers(search?: string, filter?: string, limit = 50, offset = 0): Promise<PaginatedUsers> {
    const params: Record<string, string | number> = { limit, offset }
    if (search) params.search = search
    if (filter) params.filter = filter
    const { data } = await authenticatedApi.get('/api/admin/users', { params })
    return data
  },

  async getUser(userId: string): Promise<AdminUser> {
    const { data } = await authenticatedApi.get(`/api/admin/users/${userId}`)
    return data
  },

  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    const { data } = await authenticatedApi.get(`/api/admin/users/${userId}/detail`)
    return data
  },

  async grantSubscription(userId: string, body: GrantSubscriptionRequest): Promise<AdminUser> {
    const { data } = await authenticatedApi.post(`/api/admin/users/${userId}/subscription`, body)
    return data
  },

  async revokeSubscription(userId: string): Promise<AdminUser> {
    const { data } = await authenticatedApi.delete(`/api/admin/users/${userId}/subscription`)
    return data
  },

  async banUser(userId: string, reason: string): Promise<AdminUser> {
    const { data } = await authenticatedApi.post(`/api/admin/users/${userId}/ban`, { reason })
    return data
  },

  async unbanUser(userId: string): Promise<AdminUser> {
    const { data } = await authenticatedApi.post(`/api/admin/users/${userId}/unban`)
    return data
  },

  async forceLogout(userId: string): Promise<AdminUser> {
    const { data } = await authenticatedApi.post(`/api/admin/users/${userId}/force-logout`)
    return data
  },

  async getOverview(): Promise<AdminOverview> {
    const { data } = await authenticatedApi.get('/api/admin/overview')
    return data
  },

  async getDealerRequests(): Promise<AdminDealerRequest[]> {
    const { data } = await authenticatedApi.get('/api/admin/dealer-requests')
    return data
  },

  async dismissDealerRequest(requestId: string): Promise<void> {
    await authenticatedApi.delete(`/api/admin/dealer-requests/${requestId}`)
  },

  // New endpoints
  async getSubscriptionAnalytics(): Promise<SubscriptionAnalytics> {
    const { data } = await authenticatedApi.get('/api/admin/subscriptions/analytics')
    return data
  },

  async getAuditLog(limit = 50, offset = 0): Promise<PaginatedAuditLog> {
    const { data } = await authenticatedApi.get('/api/admin/audit-log', { params: { limit, offset } })
    return data
  },

  async broadcast(body: BroadcastRequest): Promise<void> {
    await authenticatedApi.post('/api/admin/broadcast', body)
  },

  async getPlatformSettings(): Promise<Record<string, string>> {
    const { data } = await authenticatedApi.get('/api/admin/platform-settings')
    return data.settings
  },

  async updatePlatformSetting(key: string, value: string): Promise<void> {
    await authenticatedApi.put(`/api/admin/platform-settings/${key}`, { value })
  },

  async batchUpdatePlatformSettings(settings: Record<string, string>): Promise<void> {
    await authenticatedApi.put('/api/admin/platform-settings', { settings })
  },

  async getJourneyStats(since?: '1d' | '7d' | '30d'): Promise<JourneyStats> {
    const params: Record<string, string> = {}
    if (since) params.since = since
    const { data } = await authenticatedApi.get('/api/admin/journey-stats', { params })
    return data
  },

  async getOnlineHistory(range: 'today' | '7d' = 'today'): Promise<OnlineHistory> {
    const { data } = await authenticatedApi.get('/api/admin/online-history', { params: { range } })
    return data
  },

  async exportUsers(columns: string[], search?: string, filter?: string): Promise<void> {
    const params: Record<string, string> = { columns: columns.join(',') }
    if (search) params.search = search
    if (filter) params.filter = filter
    const { data } = await authenticatedApi.get('/api/admin/users/export', {
      params,
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `users_export_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },
}
