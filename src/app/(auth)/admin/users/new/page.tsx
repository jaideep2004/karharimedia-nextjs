'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  CircularProgress,
  Breadcrumbs,
  Link as MuiLink,
  Checkbox,
  FormGroup,
  MenuItem,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Save, ArrowBack, Visibility, VisibilityOff } from '@mui/icons-material';
import Link from 'next/link';
import { adminAPI, SUPPORT_CATEGORIES } from '@/services/api';
import useAdminAuth from '@/hooks/useAdminAuth';

export default function NewUserPage() {
  const router = useRouter();
  const { isAdmin } = useAdminAuth();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'artist',
    artistName: '',
    accountType: 'artist',
    adminPreset: 'users',
    permissions: [] as string[],
    supportCategories: [] as string[],
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'role' && (value === 'artist' || value === 'label') ? { accountType: value } : {}),
      ...(name === 'adminPreset' && value === 'support' && prev.supportCategories.length === 0
        ? { supportCategories: SUPPORT_CATEGORIES.map((category) => category.value) }
        : {}),
    }));
    
    // Auto-fill artist name if empty when name changes
    if (name === 'name' && !formData.artistName) {
      setFormData(prev => ({
        ...prev,
        artistName: value
      }));
    }
  };

  const handlePermissionChange = (permission: string) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((item) => item !== permission)
        : [...prev.permissions, permission],
      ...(permission === 'support' && !prev.permissions.includes(permission) && prev.supportCategories.length === 0
        ? { supportCategories: SUPPORT_CATEGORIES.map((category) => category.value) }
        : {}),
    }));
  };

  const handleSupportCategoryChange = (category: string) => {
    setFormData((prev) => ({
      ...prev,
      supportCategories: prev.supportCategories.includes(category)
        ? prev.supportCategories.filter((item) => item !== category)
        : [...prev.supportCategories, category],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // Validate form
      if (!formData.name || !formData.email || !formData.password) {
        throw new Error('Please fill in all required fields');
      }
      
      // Create user
      const response = await adminAPI.createUser({
        ...formData,
        // If artistName is empty, use the name
        artistName: formData.artistName || formData.name
      });
      
      if (response.success) {
        setSuccess(true);
        // Reset form
        setFormData({
          name: '',
          email: '',
          password: '',
          role: 'artist',
          artistName: '',
          accountType: 'artist',
          adminPreset: 'users',
          permissions: [],
          supportCategories: [],
        });
        
        // Redirect after a short delay
        setTimeout(() => {
          router.push('/admin/users');
        }, 1500);
      } else {
        throw new Error(response.message || 'Failed to create user');
      }
    } catch (err: any) {
      console.error('Error creating user:', err);
      setError(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  if (isAdmin === null) {
    return <CircularProgress />;
  }

  if (isAdmin === false) {
    router.push('/login');
    return null;
  }

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Breadcrumbs aria-label="breadcrumb">
          <MuiLink component={Link} href="/admin/dashboard">
            Dashboard
          </MuiLink>
          <MuiLink component={Link} href="/admin/users">
            Users
          </MuiLink>
          <Typography color="text.primary">Add New User</Typography>
        </Breadcrumbs>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
          <Typography variant="h4" component="h1" color="text.primary" fontWeight={900}>
            Add New User
          </Typography>
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            component={Link}
            href="/admin/users"
          >
            Back to Users
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          User created successfully! Redirecting...
        </Alert>
      )}

      <Paper sx={{ p: 4 }}>
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            margin="normal"
            required
            disabled={loading}
          />
          
          <TextField
            fullWidth
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            margin="normal"
            required
            disabled={loading}
          />
          
          <TextField
            fullWidth
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={handleChange}
            margin="normal"
            required
            disabled={loading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    edge="end"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          
          <FormControl component="fieldset" margin="normal">
            <FormLabel component="legend">Role</FormLabel>
            <RadioGroup
              row
              name="role"
              value={formData.role}
              onChange={handleChange}
            >
              <FormControlLabel value="artist" control={<Radio />} label="Artist" />
              <FormControlLabel value="label" control={<Radio />} label="Label" />
              <FormControlLabel value="subadmin" control={<Radio />} label="Subadmin" />
              <FormControlLabel value="admin" control={<Radio />} label="Admin" />
            </RadioGroup>
          </FormControl>

          {formData.role === 'subadmin' && (
            <Box sx={{ my: 2 }}>
              <TextField
                select
                fullWidth
                label="Subadmin Preset"
                name="adminPreset"
                value={formData.adminPreset}
                onChange={handleChange}
                disabled={loading}
              >
                {['users', 'review', 'payouts', 'delivery', 'settings', 'analytics', 'support'].map((preset) => (
                  <MenuItem key={preset} value={preset}>
                    {preset.replace('-', ' ')}
                  </MenuItem>
                ))}
              </TextField>
              <FormControl component="fieldset" sx={{ mt: 2 }}>
                <FormLabel component="legend">Extra Permissions</FormLabel>
                <FormGroup row>
                  {['users', 'review', 'payouts', 'dsp_delivery', 'settings', 'analytics', 'support'].map((permission) => (
                    <FormControlLabel
                      key={permission}
                      control={
                        <Checkbox
                          checked={formData.permissions.includes(permission)}
                          onChange={() => handlePermissionChange(permission)}
                        />
                      }
                      label={permission.replace('_', ' ')}
                    />
                  ))}
                </FormGroup>
              </FormControl>
              {(formData.adminPreset === 'support' || formData.permissions.includes('support')) && (
                <FormControl component="fieldset" sx={{ mt: 2 }}>
                  <FormLabel component="legend">Support Categories</FormLabel>
                  <FormGroup row>
                    {SUPPORT_CATEGORIES.map((category) => (
                      <FormControlLabel
                        key={category.value}
                        control={
                          <Checkbox
                            checked={formData.supportCategories.includes(category.value)}
                            onChange={() => handleSupportCategoryChange(category.value)}
                          />
                        }
                        label={category.label}
                      />
                    ))}
                  </FormGroup>
                </FormControl>
              )}
            </Box>
          )}
          
          <TextField
            fullWidth
            label="Artist Name (optional)"
            name="artistName"
            value={formData.artistName}
            onChange={handleChange}
            margin="normal"
            disabled={loading}
            helperText="Leave blank to use the same as Name"
          />
          
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              color="primary"
              type="submit"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Save />}
            >
              {loading ? 'Creating...' : 'Create User'}
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  );
} 
