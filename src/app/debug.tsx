'use client';
import { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Paper, 
  Button, 
  Box, 
  Alert,
  Divider,
  TextField,
  Stack
} from '@mui/material';
import { jwtDecode } from 'jwt-decode';
import Cookies from 'js-cookie';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { removeAuthTokenCookie, setAuthTokenCookie } from '@/lib/authCookie';

export default function DebugPage() {
  const [tokenData, setTokenData] = useState<any>(null);
  const [hasToken, setHasToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Get token and decode it
  useEffect(() => {
    try {
      const token = Cookies.get('token');
      setHasToken(!!token);
      
      if (token) {
        const decoded = jwtDecode<any>(token);
        setTokenData(decoded);
        console.log('Decoded token:', decoded);
      }
    } catch (err) {
      console.error('Error decoding token:', err);
      setError('Failed to decode token');
    }
  }, []);

  // Function to manually force role to admin in the token
  const setAdminRole = () => {
    try {
      const token = Cookies.get('token');
      if (!token) {
        setError('No token found');
        return;
      }

      // Decode token to get data
      const decoded = jwtDecode<any>(token);
      
      // Create a new token with admin role (this is a mock implementation)
      // In a real app, you would need to get a new token from the server
      const tokenParts = token.split('.');
      const header = JSON.parse(atob(tokenParts[0]));
      const payload = JSON.parse(atob(tokenParts[1]));
      
      // Modify the payload
      payload.role = 'admin';
      
      // This is just for testing - normally you would get a new signed token from the server
      // WARNING: This modified token will not pass server validation, but can help with client-side debugging
      const modifiedToken = `${btoa(JSON.stringify(header))}.${btoa(JSON.stringify(payload))}.${tokenParts[2]}`;
      
      // Save the modified token
      setAuthTokenCookie(modifiedToken);
      
      // Update state
      setTokenData(payload);
      
      // Force reload to apply changes
      window.location.reload();
    } catch (err) {
      console.error('Error setting admin role:', err);
      setError('Failed to set admin role');
    }
  };

  const forceNavigateToAdmin = () => {
    router.push('/admin/dashboard');
  };

  const clearToken = () => {
    removeAuthTokenCookie();
    setHasToken(false);
    setTokenData(null);
    window.location.reload();
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Authentication Debug
        </Typography>
        
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Token Status
          </Typography>
          <Alert severity={hasToken ? "success" : "warning"}>
            {hasToken ? "Token Found" : "No Token Found"}
          </Alert>
        </Box>
        
        {tokenData && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom>
              Token Data
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f5f5f5', overflow: 'auto' }}>
              <pre>{JSON.stringify(tokenData, null, 2)}</pre>
            </Paper>
            
            <Alert 
              severity={tokenData.role === 'admin' ? "success" : "info"} 
              sx={{ mt: 2 }}
            >
              User Role: <strong>{tokenData.role || 'unknown'}</strong>
            </Alert>
          </Box>
        )}
        
        <Divider sx={{ my: 3 }} />
        
        <Typography variant="h6" gutterBottom>
          Debug Actions
        </Typography>
        
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          {hasToken && (
            <Button 
              variant="outlined" 
              color="error" 
              onClick={clearToken}
            >
              Clear Token
            </Button>
          )}
          
          {hasToken && tokenData && tokenData.role !== 'admin' && (
            <Button 
              variant="contained" 
              color="warning"
              onClick={setAdminRole}
            >
              Force Admin Role (Client-side only)
            </Button>
          )}
          
          <Button 
            variant="contained" 
            color="primary"
            onClick={forceNavigateToAdmin}
          >
            Force Navigate to Admin Dashboard
          </Button>
        </Stack>
        
        <Divider sx={{ my: 3 }} />
        
        <Typography variant="h6" gutterBottom>
          Direct Navigation Links
        </Typography>
        
        <Stack direction="row" spacing={2}>
          <Button 
            variant="outlined" 
            color="primary" 
            component={Link}
            href="/dashboard"
          >
            Artist Dashboard
          </Button>
          
          <Button 
            variant="outlined" 
            color="secondary"
            component={Link}
            href="/admin/dashboard"
          >
            Admin Dashboard
          </Button>
          
          <Button 
            variant="outlined"
            component={Link}
            href="/login"
          >
            Login Page
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
} 
