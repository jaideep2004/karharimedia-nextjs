import './globals.css';
import type { Metadata } from 'next';
import ClientProviders from '@/components/ClientProviders';
import ThemeRegistry from '@/app/ThemeRegistry';

export const metadata: Metadata = {
  title: 'Karhari Media Distribution - Music Distribution Platform',
  description: 'Distribute your music worldwide with Karhari Media Distribution',
  icons: {
    icon: '/images/favicon-s3.png',
    shortcut: '/images/favicon-s3.png',
    apple: '/images/favicon-s3.png',
  }, 
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (  
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeRegistry>
          <ClientProviders>{children}</ClientProviders>
        </ThemeRegistry>
      </body>
    </html>
  );
}
