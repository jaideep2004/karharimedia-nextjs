'use client';

import { Box, Typography, alpha, useTheme } from '@mui/material';

export default function HelpCopyrightFooter() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      component="footer"
      sx={{
        px: 2,
        py: 2.25,
        textAlign: 'center',
        bgcolor: isDark ? '#06070d' : '#ebe5d9',
        borderTop: '1px solid',
        borderColor: isDark ? alpha('#f8f0df', 0.14) : alpha('#101820', 0.12),
      }}
    >
      <Typography variant="caption" color="text.secondary" fontWeight={700}>
        Copyright 2026 Karhari Media Distribution. All rights reserved.
      </Typography>
    </Box>
  );
}
