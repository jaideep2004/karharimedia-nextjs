'use client';

import { Box, useTheme } from '@mui/material';
import { PaletteMode } from '@mui/material/styles';
import type { CSSProperties } from 'react';

export const AUTH_BACKGROUND = `
  radial-gradient(900px 520px at 78% 22%, rgba(0, 231, 255, 0.20), transparent 62%),
  radial-gradient(760px 520px at 14% 14%, rgba(67, 29, 140, 0.36), transparent 64%),
  linear-gradient(rgba(0, 231, 255, 0.085) 1px, transparent 1px),
  linear-gradient(90deg, rgba(0, 231, 255, 0.085) 1px, transparent 1px),
  linear-gradient(135deg, #08061a 0%, #100725 45%, #061426 100%)
`;

export const AUTH_LIGHT_BACKGROUND = `
  radial-gradient(900px 520px at 78% 18%, rgba(0, 153, 199, 0.11), transparent 62%),
  linear-gradient(rgba(0, 153, 199, 0.06) 1px, transparent 1px),
  linear-gradient(90deg, rgba(0, 153, 199, 0.06) 1px, transparent 1px),
  #f3f8fb
`;

export const AUTH_BUTTON_GRADIENT = 'linear-gradient(135deg,#00e7ff,#d6d70d)';

export const AUTH_PANEL_GRADIENT =
  'linear-gradient(150deg, rgba(8,6,26,0.96) 0%, rgba(18,10,42,0.92) 48%, rgba(6,20,38,0.96) 100%)';

export const AUTH_SURFACE_GRADIENT =
  'linear-gradient(180deg, rgba(18,10,42,0.94), rgba(6,20,38,0.9))';

export const getAuthTokens = (mode: PaletteMode) => {
  const isDark = mode === 'dark';

  return {
    isDark,
    pageBackground: isDark ? AUTH_BACKGROUND : AUTH_LIGHT_BACKGROUND,
    pageBgColor: isDark ? '#08061a' : '#f3f8fb',
    panelBackground: isDark
      ? AUTH_PANEL_GRADIENT
      : 'linear-gradient(150deg, rgba(255,255,255,0.94) 0%, rgba(232,251,255,0.92) 46%, rgba(248,250,225,0.96) 100%)',
    panelOverlay: isDark
      ? 'radial-gradient(circle at top right, rgba(0,231,255,0.24), transparent 24%), radial-gradient(circle at bottom left, rgba(214,215,13,0.14), transparent 22%)'
      : 'radial-gradient(circle at top right, rgba(0,153,199,0.16), transparent 25%), radial-gradient(circle at bottom left, rgba(214,215,13,0.16), transparent 24%)',
    surfaceBackground: isDark
      ? AUTH_SURFACE_GRADIENT
      : 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,247,252,0.94))',
    panelText: isDark ? '#f8fafc' : '#16111a',
    panelMuted: isDark ? 'rgba(226,232,240,0.72)' : 'rgba(55,45,62,0.72)',
    text: isDark ? '#f8fafc' : '#15111a',
    muted: isDark ? 'rgba(226,232,240,0.68)' : 'rgba(64,56,72,0.68)',
    faint: isDark ? 'rgba(255,255,255,0.36)' : 'rgba(49,35,56,0.48)',
    border: isDark ? 'rgba(0,231,255,0.12)' : 'rgba(0,153,199,0.16)',
    cardBg: isDark ? 'rgba(0,231,255,0.06)' : 'rgba(255,255,255,0.72)',
    cardBorder: isDark ? 'rgba(0,231,255,0.12)' : 'rgba(0,153,199,0.18)',
    fieldBg: isDark ? 'rgba(0,231,255,0.035)' : 'rgba(255,255,255,0.82)',
    fieldBorder: isDark ? 'rgba(0,231,255,0.14)' : 'rgba(0,153,199,0.18)',
    fieldHoverBorder: isDark ? 'rgba(0,231,255,0.42)' : 'rgba(0,153,199,0.42)',
    fieldLabel: isDark ? 'rgba(255,255,255,0.58)' : 'rgba(42,35,49,0.68)',
    fieldText: isDark ? '#f8fafc' : '#15111a',
    icon: isDark ? 'rgba(255,255,255,0.42)' : 'rgba(42,35,49,0.58)',
    divider: isDark ? 'rgba(0,231,255,0.12)' : 'rgba(0,153,199,0.14)',
    shadow: isDark ? '0 24px 60px rgba(2,8,23,0.42)' : '0 24px 60px rgba(0,153,199,0.12)',
  };
};

export const authStyleVars = (mode: PaletteMode): CSSProperties => {
  const tokens = getAuthTokens(mode);

  return {
    '--auth-text': tokens.text,
    '--auth-muted': tokens.muted,
    '--auth-faint': tokens.faint,
    '--auth-panel-text': tokens.panelText,
    '--auth-panel-muted': tokens.panelMuted,
    '--auth-card-bg': tokens.cardBg,
    '--auth-card-border': tokens.cardBorder,
    '--auth-field-bg': tokens.fieldBg,
    '--auth-field-border': tokens.fieldBorder,
    '--auth-field-hover-border': tokens.fieldHoverBorder,
    '--auth-field-label': tokens.fieldLabel,
    '--auth-field-text': tokens.fieldText,
    '--auth-icon': tokens.icon,
    '--auth-divider': tokens.divider,
  } as CSSProperties;
};

export function AuthLogo({
  width = 220,
  mb = 0,
}: {
  width?: number;
  mb?: number;
}) {
  const theme = useTheme();

  return (
    <Box
      component="img"
      src={theme.palette.mode === 'dark' ? '/images/karhari-media-b1.png' : '/images/karhari-media-b1.png'}
      alt="Karhari Media Distribution"
      translate="no"
      sx={{
        width,
        maxWidth: '76%',
        height: 'auto',
        mb,
        display: 'block',
      }}
    />
  );
}
