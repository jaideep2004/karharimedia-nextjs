"use client";

import { AppContextProvider } from '@/context/AppContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { ColorModeProvider } from '@/context/ColorModeContext';
import { CssBaseline } from '@mui/material';
import React from 'react';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppContextProvider>
      <NotificationsProvider>
        <ColorModeProvider>
          <CssBaseline />
          {children}
        </ColorModeProvider>
      </NotificationsProvider>
    </AppContextProvider>
  );
}
