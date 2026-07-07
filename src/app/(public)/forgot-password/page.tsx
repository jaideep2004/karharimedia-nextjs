'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, InputAdornment, Stack, TextField, Typography, useTheme } from '@mui/material';
import { Email, KeyboardBackspace } from '@mui/icons-material';
import {
  AUTH_BUTTON_GRADIENT,
  AuthLogo,
  authStyleVars,
  getAuthTokens,
} from '@/components/auth/authBrand';

const authFieldSx = {
  '& .MuiOutlinedInput-root': {
    minHeight: 60,
    borderRadius: '18px',
    backgroundColor: 'var(--auth-field-bg, rgba(255,255,255,0.035))',
    '& fieldset': { borderColor: 'var(--auth-field-border, rgba(255,255,255,0.12))' },
    '&:hover fieldset': { borderColor: 'var(--auth-field-hover-border, rgba(237,30,121,0.38))' },
    '&.Mui-focused fieldset': { borderColor: '#00e7ff' },
  },
  '& .MuiInputLabel-root': { color: 'var(--auth-field-label, rgba(255,255,255,0.58))' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#00e7ff' },
  '& .MuiInputBase-input': { color: 'var(--auth-field-text, #f8fafc)' },
  '& .MuiSvgIcon-root': { color: 'var(--auth-icon, rgba(255,255,255,0.42))' },
};

export default function ForgotPasswordPage() {
  const theme = useTheme();
  const authTokens = getAuthTokens(theme.palette.mode);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'Unable to send reset link');
      setMessage(payload.message || 'Reset instructions sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      style={authStyleVars(theme.palette.mode)}
      sx={{
        width: '100vw',
        ml: 'calc(50% - 50vw)',
        mr: 'calc(50% - 50vw)',
        minHeight: 'calc(100vh - 96px)',
        display: 'grid',
        placeItems: 'center',
        px: { xs: 2, sm: 3 },
        py: { xs: 3, md: 6 },
        background: authTokens.pageBackground,
        bgcolor: authTokens.pageBgColor,
        color: authTokens.text,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Box
        component="form"
        onSubmit={submit}
        sx={{
          width: '100%',
          maxWidth: 500,
          p: { xs: 3, sm: 4.5 },
          borderRadius: { xs: '28px', md: '32px' },
          background: authTokens.surfaceBackground,
          color: 'var(--auth-text)',
          border: `1px solid ${authTokens.border}`,
          boxShadow: authTokens.shadow,
          backdropFilter: 'blur(18px)',
        }}
      >
        <Stack spacing={2.75}>
          <Box>
            <AuthLogo width={210} mb={3} />
            <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: 0 }}>
              Reset Password
            </Typography>
            <Typography sx={{ mt: 1.25, color: 'var(--auth-muted)', lineHeight: 1.7 }}>
              Enter your account email. We will send a secure reset link.
            </Typography>
          </Box>
          {message && <Alert severity="success">{message}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Email Address"
            type="email"
            name="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            fullWidth
            sx={authFieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Email sx={{ color: 'var(--auth-icon)' }} />
                </InputAdornment>
              ),
            }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{
              minHeight: 56,
              borderRadius: '18px',
              background: AUTH_BUTTON_GRADIENT,
              fontWeight: 800,
              boxShadow: '0 18px 34px rgba(237,30,121,0.24)',
              '&:hover': {
                background: AUTH_BUTTON_GRADIENT,
                boxShadow: '0 22px 38px rgba(123,31,162,0.32)',
              },
            }}
          >
            {loading ? 'Sending…' : 'Send Reset Link'}
          </Button>
          <Button
            component={Link}
            href="/login"
            variant="text"
            startIcon={<KeyboardBackspace />}
            sx={{ color: '#00e7ff', fontWeight: 700 }}
          >
            Back to Login
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
