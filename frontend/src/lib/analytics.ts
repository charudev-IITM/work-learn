/**
 * Analytics helper — wraps Google Analytics 4 and Microsoft Clarity.
 * No-ops if scripts aren't loaded (safe in dev).
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

export const analytics = {
  track(event: string, params?: Record<string, unknown>) {
    try {
      window.gtag?.('event', event, params);
      window.clarity?.('event', event);
    } catch {
      // Silent fail
    }
  },

  /** Track page/screen view */
  pageView(pageName: string) {
    this.track('page_view', { page_title: pageName });
  },

  /** Onboarding-specific events */
  onboarding: {
    stepViewed(stepName: string, stepIndex: number) {
      analytics.track('onboarding_step_viewed', { step_name: stepName, step_index: stepIndex });
    },
    stepCompleted(stepName: string, durationMs: number) {
      analytics.track('onboarding_step_completed', { step_name: stepName, duration_ms: durationMs });
    },
    stepSkipped(stepName: string) {
      analytics.track('onboarding_step_skipped', { step_name: stepName });
    },
    completed(totalDurationMs: number, dealersSelected: number, commoditiesSelected: number) {
      analytics.track('onboarding_completed', {
        total_duration_ms: totalDurationMs,
        dealers_selected: dealersSelected,
        commodities_selected: commoditiesSelected,
      });
    },
  },
};
