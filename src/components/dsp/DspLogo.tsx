'use client';

import Avatar from '@mui/material/Avatar';
import type { SxProps, Theme } from '@mui/material/styles';
import Store from '@mui/icons-material/Store';
import { getDspDisplayName, getDspInitials, getDspMeta } from '@/lib/platforms';

type DspLogoProps = {
  value?: string | null;
  alt?: string;
  size?: number;
  padding?: number;
  className?: string;
  sx?: SxProps<Theme>;
};

export function DspLogo({ value, alt, size = 24, padding = 0.35, className, sx }: DspLogoProps) {
  const meta = getDspMeta(value);
  const label = alt || meta?.name || getDspDisplayName(value);
  const baseSx: SxProps<Theme> = {
    width: size,
    height: size,
    borderRadius: '13px',
    bgcolor: 'background.default', 

    // p: meta?.logo ? padding : 0,
    color: 'text.secondary', 
    fontSize: Math.max(10, Math.floor(size * 0.22)),
    fontWeight: 900,
    flex: '0 0 auto',
    '& img': {
      objectFit: 'contain',
    },
  };

  return (
    <Avatar
      src={meta?.logo || undefined}
      alt={label}
      className={className}
      variant="rounded"
      sx={sx ? (Array.isArray(sx) ? [baseSx, ...sx] : [baseSx, sx]) : baseSx}
    >
      {meta?.logo ? null : value ? (
        getDspInitials(value)
      ) : (
        <Store sx={{ fontSize: Math.max(14, Math.floor(size * 0.58)) }} />
      )}
    </Avatar>
  );
}
