import { SxProps, Theme } from '@mui/material/styles';

export const fieldSx: SxProps<Theme> = {
  '& .MuiOutlinedInput-root': {
    minHeight: 60,
    borderRadius: '16px',
    backgroundColor: 'var(--auth-field-bg, rgba(255,255,255,0.035))',
    '& fieldset': { borderColor: 'var(--auth-field-border, rgba(255,255,255,0.12))' },
    '&:hover fieldset': { borderColor: 'var(--auth-field-hover-border, rgba(237,30,121,0.38))' },
    '&.Mui-focused fieldset': { borderColor: '#00e7ff' },
  },
  '& .MuiInputLabel-root': { color: 'var(--auth-field-label, rgba(255,255,255,0.52))' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#00e7ff' },
  '& .MuiInputBase-input': { color: 'var(--auth-field-text, #f8fafc)' },
  '& .MuiSvgIcon-root': { color: 'var(--auth-icon, rgba(255,255,255,0.4))' },
  '& .MuiSelect-icon': { color: 'var(--auth-icon, rgba(255,255,255,0.4))' },
};

export const multilineFieldSx: SxProps<Theme> = {
  ...fieldSx,
  '& .MuiOutlinedInput-root': {
    ...(fieldSx as Record<string, any>)['& .MuiOutlinedInput-root'],
    minHeight: 'unset',
  },
};

export const twoColumnGridSx: SxProps<Theme> = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
  gap: 2,
};

export const formSectionSx: SxProps<Theme> = {
  p: { xs: 2, sm: 2.5 },
  borderRadius: '20px',
  background: 'var(--auth-card-bg, rgba(255,255,255,0.025))',
  border: '1px solid var(--auth-card-border, rgba(255,255,255,0.08))',
};

export const sectionTitleSx: SxProps<Theme> = {
  fontWeight: 700,
  color: 'var(--auth-text, #f8fafc)',
  mb: 0.5,
};

export const sectionCaptionSx: SxProps<Theme> = {
  color: 'var(--auth-muted, rgba(255,255,255,0.52))',
};

export const compactToggleGroupSx: SxProps<Theme> = {
  width: '100%',
  gap: 1.5,
  flexWrap: 'wrap',
  '& .MuiToggleButton-root': {
    minHeight: 44,
    color: 'var(--auth-muted, rgba(255,255,255,0.58))',
    borderColor: 'var(--auth-field-border, rgba(255,255,255,0.12))',
    borderRadius: '12px !important',
    px: 2.5,
    py: 1,
    textTransform: 'none',
    fontWeight: 600,
    '&.Mui-selected': {
      color: '#ff7ab8',
      background: 'rgba(237, 30, 121, 0.14)',
      borderColor: '#00e7ff !important',
    },
  },
};
