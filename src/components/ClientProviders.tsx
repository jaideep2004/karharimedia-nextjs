'use client';

import { AppContextProvider } from '@/context/AppContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { ColorModeProvider } from '@/context/ColorModeContext';
import GlobalFooter from '@/components/GlobalFooter';
import React from 'react';
import { Toaster } from 'sonner';

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppContextProvider>
      <NotificationsProvider>
        <ColorModeProvider>
          {children}
          <GlobalFooter />
          <Toaster position="top-right" richColors closeButton />
        </ColorModeProvider>
      </NotificationsProvider>
    </AppContextProvider>
  );
}
