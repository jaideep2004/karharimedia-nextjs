'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';

const authBackground = `
  radial-gradient(ellipse 80% 50% at 80% 20%, rgba(214,215,13,0.16) 0%, transparent 60%),
  radial-gradient(ellipse 60% 40% at 10% 80%, rgba(237,30,121,0.10) 0%, transparent 60%),
  radial-gradient(ellipse 50% 60% at 50% 50%, rgba(83,12,195,0.07) 0%, transparent 70%),
  #05050A
`;

const authButtonGradient = 'linear-gradient(135deg,#00e7ff,#d6d70d)';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: searchParams.get('email'),
          token: searchParams.get('token'),
          password,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Unable to reset password');
      router.push('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: 'calc(100vh - 96px)', display: 'grid', placeItems: 'center', px: 2, background: authBackground, bgcolor: '#05050a' }}>
      <Box component="form" onSubmit={submit} sx={{ width: '100%', maxWidth: 460, p: 4, borderRadius: 4, bgcolor: 'rgba(17,24,39,0.92)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 60px rgba(2,8,23,0.38)' }}>
        <Stack spacing={2.5}>
          <Typography variant="h4" sx={{ fontWeight: 900 }}>Create New Password</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="New Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus fullWidth />
          <Button type="submit" variant="contained" disabled={loading} sx={{ background: authButtonGradient, fontWeight: 800, '&:hover': { background: authButtonGradient } }}>{loading ? 'Saving...' : 'Save Password'}</Button>
        </Stack>
      </Box>
    </Box>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
