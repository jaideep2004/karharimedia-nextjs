'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  InputAdornment,
  IconButton,
  Alert,
  useTheme,
  useMediaQuery,
  Divider,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  AdminPanelSettings,
  LockOutlined,
  EmailOutlined,
} from '@mui/icons-material';
import { useAuth } from '@/context/AppContext';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(email, password);
      // Successful login will redirect in the login function
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Grid container component="main" sx={{ height: '100vh' }}>
      {/* Left side - Admin branding */}
      {!isMobile && (
        <Grid
          size={{ xs: false, sm: 4, md: 6 }}
          sx={{
            backgroundImage: 'url(/admin-login-bg.jpg)',
            backgroundRepeat: 'no-repeat',
            backgroundColor: theme.palette.mode === 'dark' 
              ? theme.palette.grey[900] 
              : theme.palette.primary.dark,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
            },
          }}
        >
          <Box 
            sx={{ 
              position: 'relative', 
              zIndex: 1, 
              textAlign: 'center',
              p: 4,
              maxWidth: '80%',
            }}
          >
            <AdminPanelSettings sx={{ fontSize: 60, mb: 2 }} />
            <Typography component="h1" variant="h3" fontWeight="bold" gutterBottom>
              Admin Portal
            </Typography>
            <Typography variant="h6">
              Manage your music distribution platform with powerful admin tools
            </Typography>
          </Box>
        </Grid>
      )}

      {/* Right side - Login form */}
      <Grid size={{ xs: 12, sm: 8, md: 6 }} component={Paper} elevation={6} square>
        <Box
          sx={{
            my: 8,
            mx: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}
        >
          <Box sx={{ mb: 3, display: 'flex', alignItems: 'center' }}>
            <AdminPanelSettings sx={{ fontSize: 40, mr: 1, color: 'primary.main' }} />
            <Typography component="h1" variant="h4" fontWeight="bold">
              Admin Login
            </Typography>
          </Box>

          <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 3 }}>
            Sign in to access the administrator dashboard
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3, width: '100%' }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%', maxWidth: 400 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailOutlined color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlined color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2, py: 1.5 }}
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>

            <Divider sx={{ my: 3 }}>
              <Typography variant="body2" color="text.secondary">
                Not an admin?
              </Typography>
            </Divider>

            <Button
              component={Link}
              href="/login"
              fullWidth
              variant="outlined"
            >
              Go to Artist Login
            </Button>
          </Box>
        </Box>
      </Grid>
    </Grid>
  );
} 
