"use client";
import Providers from '@/components/Providers';
import { Box } from '@mui/material';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </Box>
    </Providers>
  );
}
