'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Divider,
  TextField,
} from '@mui/material';
import { jwtDecode } from 'jwt-decode';
import Cookies from 'js-cookie';
import axios from 'axios';
import Link from 'next/link';
import { removeAuthTokenCookie, setAuthTokenCookie } from '@/lib/authCookie';

export default function AdminCheck() {
  const [token, setToken] = useState<string | null>(null);
  const [decodedToken, setDecodedToken] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [email, setEmail] = useState('admin@gmail.com');
  const [password, setPassword] = useState('Admin@123!');

  // Get token on mount
  useEffect(() => {
    checkToken();
  }, []);

  // Check token from cookies
  const checkToken = () => {
    try {
      const token = Cookies.get('token');
      setToken(token || null);

      if (token) {
        const decoded = jwtDecode<any>(token);
        setDecodedToken(decoded);
        console.log('Decoded token:', decoded);
      } else {
        setDecodedToken(null);
      }
    } catch (err) {
      console.error('Error decoding token:', err);
      setError('Failed to decode token');
    }
  };

  // Login as admin function
  const loginAsAdmin = async () => {
    setIsLoading(true);
    setError(null);
    setApiResponse(null);

    try {
      const response = await axios.post('/api/auth/login', {
        email,
        password,
      });

      console.log('Login response:', response.data);
      setApiResponse(response.data);

      if (response.data.success && response.data.data.token) {
        // Save token to cookies
        setAuthTokenCookie(response.data.data.token);
        
        // Update token state
        setToken(response.data.data.token);
        
        // Decode token
        const decoded = jwtDecode<any>(response.data.data.token);
        setDecodedToken(decoded);
        
        // If admin, redirect to admin dashboard
        if (decoded.role === 'admin') {
          setTimeout(() => {
            window.location.href = '/admin/dashboard';
          }, 1000);
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Test API access
  const testApiAccess = async () => {
    setIsLoading(true);
    setError(null);
    setApiResponse(null);

    try {
      // Add token to headers
      const config = token ? {
        headers: {
          Authorization: `Bearer ${token}`
        }
      } : {};

      const response = await axios.get('/api/auth/me', config);
      
      console.log('API response:', response.data);
      setApiResponse(response.data);
      
      // Check if user is admin
      if (response.data.data?.role === 'admin') {
        setApiResponse({
          ...response.data,
          adminMessage: 'You have admin privileges!'
        });
      }
    } catch (err: any) {
      console.error('API error:', err);
      setError(err.response?.data?.message || 'API request failed');
      setApiResponse(err.response?.data || null);
    } finally {
      setIsLoading(false);
    }
  };

  // Clear token
  const clearToken = () => {
    removeAuthTokenCookie();
    setToken(null);
    setDecodedToken(null);
    checkToken();
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Admin Authentication Debug
        </Typography>
        
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Token Status
          </Typography>
          <Alert severity={token ? 'info' : 'warning'}>
            {token ? 'Token Found' : 'No Token Found'}
          </Alert>
        </Box>

        {decodedToken && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Token Data
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f5f5f5', overflow: 'auto' }}>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(decodedToken, null, 2)}
              </pre>
            </Paper>
            
            <Alert 
              severity={decodedToken.role === 'admin' ? 'success' : 'warning'} 
              sx={{ mt: 2 }}
            >
              User Role: {decodedToken.role || 'unknown'}
              {decodedToken.role === 'admin' && (
                <Box mt={1}>
                  <Button 
                    variant="contained" 
                    color="primary" 
                    component={Link} 
                    href="/admin/dashboard"
                    size="small"
                  >
                    Go to Admin Dashboard
                  </Button>
                </Box>
              )}
            </Alert>
          </Box>
        )}

        <Divider sx={{ my: 3 }} />

        <Typography variant="h6" gutterBottom>
          Login as Admin
        </Typography>

        <Box sx={{ mb: 3 }}>
          <TextField
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            margin="normal"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            margin="normal"
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={loginAsAdmin}
            disabled={isLoading}
          >
            {isLoading ? <CircularProgress size={24} /> : 'Login as Admin'}
          </Button>
          <Button 
            variant="contained" 
            color="secondary" 
            onClick={testApiAccess}
            disabled={isLoading}
          >
            Test API Access
          </Button>
          <Button 
            variant="outlined" 
            color="error" 
            onClick={clearToken}
            disabled={!token || isLoading}
          >
            Clear Token
          </Button>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Typography variant="h6" gutterBottom>
          API Response
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {apiResponse && (
          <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f5f5f5', overflow: 'auto' }}>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(apiResponse, null, 2)}
            </pre>
          </Paper>
        )}

        <Divider sx={{ my: 3 }} />

        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button component={Link} href="/" variant="outlined">
            Home
          </Button>
          <Button component={Link} href="/admin/dashboard" variant="contained" color="primary">
            Go to Admin Dashboard
          </Button>
        </Box>
      </Paper>
    </Container>
  );
} 
