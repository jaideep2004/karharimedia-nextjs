'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import {
  ArrowForward,
  Email,
  GraphicEq,
  Insights,
  Lock,
  Public,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { useAuth } from '@/context/AppContext';
import {
  AUTH_BUTTON_GRADIENT,
  AuthLogo,
  authStyleVars,
  getAuthTokens,
} from '@/components/auth/authBrand';

const trustPoints = [
  'Release music with a cleaner artist workflow',
  'Review performance and royalty activity in one place',
  'Manage catalog, payouts, and approvals professionally',
];

const featureCards = [
  {
    icon: <Public sx={{ fontSize: 20 }} />,
    title: 'Global Reach',
    text: 'Organize releases for a distribution-ready catalog experience.',
  },
  {
    icon: <Insights sx={{ fontSize: 20 }} />,
    title: 'Artist Insights',
    text: 'Track momentum, payouts, and release activity from one dashboard.',
  },
  {
    icon: <GraphicEq sx={{ fontSize: 20 }} />,
    title: 'Catalog Control',
    text: 'Keep audio, artwork, and metadata under one operational flow.',
  },
];

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

export default function LoginPage() {
  const { login } = useAuth();
  const theme = useTheme();
  const authTokens = getAuthTokens(theme.palette.mode);

  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Login failed. Please check your credentials.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      style={authStyleVars(theme.palette.mode)}
      sx={{
        width: '100vw',
        ml: 'calc(50% - 50vw)',
        mr: 'calc(50% - 50vw)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 'calc(100vh - 96px)',
        px: { xs: 2, sm: 3, md: 5, lg: 6 },
        py: { xs: 3, md: 6 },
        background: authTokens.pageBackground,
        bgcolor: authTokens.pageBgColor,
        color: authTokens.text,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'transparent',
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          top: { xs: 72, md: 120 },
          right: { xs: -80, md: 40 },
          width: { xs: 220, md: 360 },
          height: { xs: 220, md: 360 },
          borderRadius: '50%',
          border: `1px solid ${
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'
          }`,
          opacity: 0.6,
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          bottom: { xs: -40, md: 10 },
          left: { xs: -90, md: 30 },
          width: { xs: 180, md: 280 },
          height: { xs: 180, md: 280 },
          borderRadius: '36px',
          transform: 'rotate(24deg)',
          background: 'linear-gradient(135deg, rgba(237,30,121,0.08), rgba(123,31,162,0.03))',
          border: `1px solid ${
            theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)'
          }`,
        }}
      />

      <Box
        sx={{
          maxWidth: 1360,
          mx: 'auto',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1.15fr minmax(420px, 530px)' },
            gap: { xs: 3, md: 4, lg: 5 },
            alignItems: 'stretch',
          }}
        >
          <Box
            sx={{
              borderRadius: { xs: '28px', md: '36px' },
              p: { xs: 3, sm: 4, md: 5 },
              minHeight: { xs: 'auto', lg: 720 },
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              color: authTokens.panelText,
              position: 'relative',
              overflow: 'hidden',
              background: authTokens.panelBackground,
              border: `1px solid ${authTokens.border}`,
              boxShadow: '0 28px 80px rgba(3, 10, 24, 0.34)',
              transform: mounted ? 'translateY(0)' : 'translateY(16px)',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 600ms ease, transform 600ms ease',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background:
                  authTokens.panelOverlay,
              }}
            />

            <Stack spacing={3} sx={{ position: 'relative', zIndex: 1 }}>
              <AuthLogo width={230} />

              <Box>
                <Typography
                  sx={{
                    fontSize: { xs: '2.1rem', sm: '2.8rem', md: '3.5rem' },
                    lineHeight: 1.02,
                    fontWeight: 800,
                    maxWidth: 720,
                    letterSpacing: 0,
                  }}
                >
                  Enter your private music operations suite.
                </Typography>
                <Typography
                  sx={{
                    mt: 2,
                    maxWidth: 640,
                    fontSize: { xs: '1rem', md: '1.08rem' },
                    lineHeight: 1.7,
                    color: 'var(--auth-panel-muted)',
                  }}
                >
                  Manage releases, artist workflows, royalties, and approvals inside a
                  refined command space built for serious catalog teams.
                </Typography>
              </Box>

              <Stack spacing={1.5}>
                {trustPoints.map((point) => (
                  <Box
                    key={point}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      color: 'var(--auth-panel-text)',
                    }}
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: '#00e7ff',
                        boxShadow: '0 0 0 6px rgba(237,30,121,0.14)',
                        flexShrink: 0,
                      }}
                    />
                    <Typography sx={{ fontSize: { xs: '0.98rem', md: '1.02rem' } }}>
                      {point}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Stack>

            <Box sx={{ position: 'relative', zIndex: 1, mt: { xs: 4, md: 6 } }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                  gap: 2,
                }}
              >
                {featureCards.map((card) => (
                  <Box
                    key={card.title}
                    sx={{
                      p: 2.5,
                      borderRadius: '24px',
                      background: 'var(--auth-card-bg)',
                      border: '1px solid var(--auth-card-border)',
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    <Box
                      sx={{
                        width: 42,
                        height: 42,
                        borderRadius: '14px',
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: 'rgba(237,30,121,0.14)',
                        color: '#ff7ab8',
                        mb: 1.5,
                      }}
                    >
                      {card.icon}
                    </Box>
                    <Typography sx={{ fontWeight: 700, mb: 0.75 }}>{card.title}</Typography>
                    <Typography sx={{ color: 'var(--auth-panel-muted)', lineHeight: 1.65 }}>
                      {card.text}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Box
              sx={{
                width: '100%',
                borderRadius: { xs: '28px', md: '32px' },
                p: { xs: 3, sm: 4, md: 5 },
                background: authTokens.surfaceBackground,
                border: `1px solid ${authTokens.border}`,
                boxShadow: authTokens.shadow,
                backdropFilter: 'blur(18px)',
                transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                opacity: mounted ? 1 : 0,
                transition: 'opacity 700ms ease 120ms, transform 700ms ease 120ms',
              }}
            >
              <Box component="form" onSubmit={handleSubmit}>
                <Stack spacing={3.25}>
                  <Box>
                    <Typography
                      sx={{
                        fontSize: { xs: '1.85rem', sm: '2.2rem' },
                        lineHeight: 1.1,
                        fontWeight: 800,
                        color: 'var(--auth-text)',
                        letterSpacing: 0,
                      }}
                    >
                      Welcome Back
                    </Typography>
                    <Typography
                      sx={{
                        mt: 1.25,
                        color:
                          theme.palette.mode === 'dark'
                            ? 'rgba(226, 232, 240, 0.72)'
                            : 'var(--auth-muted)',
                        lineHeight: 1.7,
                      }}
                    >
                      Sign in to continue managing catalog, payouts, and release pipeline with a secure premium workspace.
                    </Typography>
                  </Box>

                  {error ? (
                    <Alert
                      severity="error"
                      sx={{
                        borderRadius: '16px',
                        alignItems: 'center',
                      }}
                    >
                      {error}
                    </Alert>
                  ) : null}

                  <Stack spacing={2}>
                    <TextField
                      label="Email address"
                      type="email"
                      name="email"
                      autoComplete="email"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      fullWidth
                      autoFocus
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Email sx={{ color: 'var(--auth-icon)' }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={authFieldSx}
                    />

                    <TextField
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      fullWidth
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Lock sx={{ color: 'var(--auth-icon)' }} />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPassword((prev) => !prev)}
                              edge="end"
                              tabIndex={-1}
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                              {showPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                      sx={authFieldSx}
                    />
                  </Stack>

                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Typography
                      sx={{
                        color:
                          theme.palette.mode === 'dark'
                            ? 'rgba(226, 232, 240, 0.64)'
                            : 'var(--auth-muted)',
                        fontSize: '0.95rem',
                      }}
                    >
                      Secure access for artists and labels
                    </Typography>
                    <Link href="/forgot-password" style={{ color: '#00e7ff' }}>
                      Forgot password?
                    </Link>
                  </Box>

                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={isLoading}
                    endIcon={<ArrowForward />}
                    sx={{
                      minHeight: 58,
                      borderRadius: '18px',
                      fontWeight: 700,
                      fontSize: '1rem',
                      boxShadow: '0 18px 34px rgba(237,30,121,0.24)',
                      background: AUTH_BUTTON_GRADIENT,
                      '&:hover': {
                        background: AUTH_BUTTON_GRADIENT,
                        boxShadow: '0 22px 38px rgba(123,31,162,0.32)',
                      },
                    }}
                  >
                    {isLoading ? 'Signing in…' : 'Sign in'}
                  </Button>

                  <Divider />

                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 1,
                      flexWrap: 'wrap',
                    }}
                  >
                    <Typography
                      sx={{
                        color:
                          theme.palette.mode === 'dark'
                            ? 'rgba(226, 232, 240, 0.72)'
                            : 'var(--auth-muted)',
                      }}
                    >
                      Need an account?
                    </Typography>
                    <Link href="/signup" style={{ color: '#00e7ff', fontWeight: 700 }}>
                      Create an account
                    </Link>
                  </Box>
                </Stack>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
