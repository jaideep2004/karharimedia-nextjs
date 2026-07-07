'use client';

import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import { PremiumHeader, PremiumPanel } from '@/components/premium/PremiumSurface';

export default function PremiumPlaceholderPage({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <Box sx={{ width: '100%', py: { xs: 1, sm: 2 } }}>
      <PremiumHeader eyebrow={eyebrow} title={title} description={description} />
      <PremiumPanel sx={{ p: { xs: 3, md: 4 } }}>
        <Stack spacing={2.5}>
          <Chip label="Coming Soon" sx={{ alignSelf: 'flex-start', fontWeight: 800 }} />
          <Typography variant="h5" sx={{ fontWeight: 900 }}>
            Workspace shell ready
          </Typography>
          <Typography sx={{ color: 'text.secondary', maxWidth: 720 }}>
            This section is intentionally set up with premium placeholder content so final workflows,
            forms, and reporting can be added without changing navigation or access control later.
          </Typography>
          <Button variant="outlined" endIcon={<ArrowForward />} sx={{ alignSelf: 'flex-start' }}>
            Draft Workflow
          </Button>
        </Stack>
      </PremiumPanel>
    </Box>
  );
}
