'use client';

import React from 'react';
import { Chip, ChipProps } from '@mui/material';
import { getNormalizedReleaseStatus, getReleaseStatusLabel } from '@/lib/releaseStatus';

type StatusBadgeProps = {
  status?: string;
  size?: ChipProps['size'];
  sx?: ChipProps['sx'];
} & Omit<ChipProps, 'label' | 'color' | 'size'>;

const statusColorMap: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  approved: 'success',
  rejected: 'error',
  pending: 'warning',
  in_process: 'info',
  other: 'default',
};

export default function StatusBadge({ status, size = 'small', sx, ...rest }: StatusBadgeProps) {
  const normalized = getNormalizedReleaseStatus(status);
  const label = getReleaseStatusLabel(status);
  const color = statusColorMap[normalized] || 'default';

  return (
    <Chip
      label={label}
      size={size}
      color={color}
      sx={{ height: 26, fontWeight: 600, ...sx }}
      {...rest}
    />
  );
}
