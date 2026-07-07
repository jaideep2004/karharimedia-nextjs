import { Box } from '@mui/material';
import PublicNavBar from '@/components/PublicNavBar';
import ClientOnly from '@/components/ClientOnly';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box>
      <ClientOnly>
        <PublicNavBar />
      </ClientOnly>
      {children}
    </Box>
  );
}
