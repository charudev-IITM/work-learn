import React, { createContext, useContext } from 'react';
import { usePreviewTimer, type UsePreviewTimerReturn } from '../hooks/usePreviewTimer';
import { useAuth } from './AuthContext';

const DISABLED: UsePreviewTimerReturn = {
  remainingSeconds: 0,
  isPaused: false,
  showResumeOverlay: false,
  onResumeTap: () => {},
  isLoading: false,
};

const PreviewTimerContext = createContext<UsePreviewTimerReturn>(DISABLED);

export function PreviewTimerProvider({ children }: { children: React.ReactNode }) {
  const { flowStep } = useAuth();
  const isPreview = flowStep === 'app_preview';

  const previewTimer = usePreviewTimer({
    enabled: isPreview,
    onExpire: () => window.dispatchEvent(new CustomEvent('preview:expired')),
  });

  return (
    <PreviewTimerContext.Provider value={previewTimer}>
      {children}
    </PreviewTimerContext.Provider>
  );
}

export const usePreviewTimerContext = () => useContext(PreviewTimerContext);
