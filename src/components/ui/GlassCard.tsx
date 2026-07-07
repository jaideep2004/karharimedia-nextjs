'use client';
import { ReactNode } from 'react';
import { Box, SxProps, Theme } from '@mui/material';

interface GlassCardProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
  className?: string;
}

export default function GlassCard({ children, sx, className }: GlassCardProps) {
  return (
    <Box
      className={className}
      sx={{
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1px',
          bottom: 0,
          background: 'linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}
