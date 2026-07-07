'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  Switch,
  FormGroup,
  useTheme,
  Tabs,
  Tab,
  Checkbox,
  Divider,
  Stack,
  useMediaQuery,
  MenuItem,
} from '@mui/material';
import { Save, ArrowBack } from '@mui/icons-material';
import Link from 'next/link';
import { adminAPI, SUPPORT_CATEGORIES } from '@/services/api';
import useAdminAuth from '@/hooks/useAdminAuth';
import { useColorMode } from '@/context/ColorModeContext';
import ViewUser from './components/ViewUser';
import { ALL_DSP_KEYS, DSP_META_BY_KEY, DspKey } from '@/lib/platforms';
import { DspLogo } from '@/components/dsp/DspLogo';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`user-tabpanel-${index}`}
      aria-labelledby={`user-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `user-tab-${index}`,
    'aria-controls': `user-tabpanel-${index}`,
  };
}

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const theme = useTheme();
  const { mode } = useColorMode();
  const { isAdmin } = useAdminAuth();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const userId = params?.id ?? '';

  const [tabValue, setTabValue] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'artist',
    artistName: '',
    accountType: 'artist',
    adminPreset: 'users',
    permissions: [] as string[],
    supportCategories: [] as string[],
    isActive: true,
  });

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [platformKeys, setPlatformKeys] = useState<DspKey[]>(ALL_DSP_KEYS);
  const [platformsLoading, setPlatformsLoading] = useState(false);
  const [platformsError, setPlatformsError] = useState('');

  useEffect(() => {
    if (isAdmin && userId) {
      fetchUser();
    }
  }, [isAdmin, userId]);

  useEffect(() => {
    const loadPlatforms = async () => {
      if (!isAdmin || !userId) return;
      try {
        setPlatformsLoading(true);
        setPlatformsError('');
        const res = await fetch(`/api/admin/platforms/${userId}`, { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error(json?.message || 'Failed to load platforms');
        const keys = Array.isArray(json?.data?.dspKeys)
          ? (json.data.dspKeys as DspKey[])
          : ALL_DSP_KEYS;
        setPlatformKeys(keys);
      } catch (e) {
        setPlatformsError(e instanceof Error ? e.message : 'Failed to load platforms');
        setPlatformKeys(ALL_DSP_KEYS);
      } finally {
        setPlatformsLoading(false);
      }
    };
    void loadPlatforms();
  }, [isAdmin, userId]);

  const fetchUser = async (options: { silent?: boolean } = {}) => {
    try {
      if (!options.silent) setFetching(true);
      const response = await adminAPI.getUserById(userId);

      if (response.success && response.data) {
        const userData = response.data;
        const permissions = Array.isArray(userData.permissions) ? userData.permissions : [];
        const hasSupportAccess =
          userData.role === 'subadmin' &&
          (permissions.includes('support') || userData.adminPreset === 'support');
        setUser(userData);
        setFormData({
          name: userData.name || '',
          email: userData.email || '',
          role: userData.role || 'artist',
          artistName: userData.artistName || '',
          accountType: userData.accountType || (userData.role === 'label' ? 'label' : 'artist'),
          adminPreset: userData.adminPreset || 'users',
          permissions,
          supportCategories: Array.isArray(userData.supportCategories)
            ? userData.supportCategories
            : hasSupportAccess
              ? SUPPORT_CATEGORIES.map(category => category.value)
              : [],
          isActive: userData.isActive !== undefined ? userData.isActive : true,
        });
      } else {
        throw new Error(response.message || 'Failed to fetch user');
      }
    } catch (err: any) {
      console.error('Error fetching user:', err);
      setError(err.message || 'Failed to fetch user');
    } finally {
      if (!options.silent) setFetching(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'role' && (value === 'artist' || value === 'label')
        ? { accountType: value }
        : {}),
      ...(name === 'adminPreset' && value === 'support' && prev.supportCategories.length === 0
        ? { supportCategories: SUPPORT_CATEGORIES.map(category => category.value) }
        : {}),
    }));
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handlePermissionChange = (permission: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(item => item !== permission)
        : [...prev.permissions, permission],
      ...(permission === 'support' &&
      !prev.permissions.includes(permission) &&
      prev.supportCategories.length === 0
        ? { supportCategories: SUPPORT_CATEGORIES.map(category => category.value) }
        : {}),
    }));
  };

  const handleSupportCategoryChange = (category: string) => {
    setFormData(prev => ({
      ...prev,
      supportCategories: prev.supportCategories.includes(category)
        ? prev.supportCategories.filter(item => item !== category)
        : [...prev.supportCategories, category],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      // Validate form
      if (!formData.name || !formData.email) {
        throw new Error('Please fill in all required fields');
      }

      // Update user
      const response = await adminAPI.updateUser(userId, formData);

      if (response.success) {
        setSuccess(true);
        // Refresh the user data
        fetchUser();
        // Switch to view tab
        setTabValue(0);
      } else {
        throw new Error(response.message || 'Failed to update user');
      }
    } catch (err: any) {
      console.error('Error updating user:', err);
      setError(err.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleUserUpdate = () => {
    fetchUser({ silent: true });
  };

  if (isAdmin === null || fetching) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isAdmin === false) {
    router.push('/login');
    return null;
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <Typography>User not found</Typography>
      </Box>
    );
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
          <Typography color="text.primary">User Details</Typography>
        </Breadcrumbs>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
          <Typography
            variant={isMobile ? 'h5' : 'h4'}
            component="h1"
            style={{ color: mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)' }}
          >
            User Management
          </Typography>
          <Button variant="outlined" startIcon={<ArrowBack />} component={Link} href="/admin/users">
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
          User updated successfully!
        </Alert>
      )}

      <Paper
        sx={{
          borderRadius: 3,
          border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.14)'}`,
          backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
          boxShadow:
            mode === 'dark' ? '0 16px 42px rgba(0,0,0,0.28)' : '0 14px 38px rgba(15,23,42,0.08)',
          overflow: 'hidden',
        }}
      >
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="user tabs"
          sx={{
            px: 1,
            pt: 1,
            borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.12)'}`,
            '& .MuiTab-root': {
              color: mode === 'dark' ? 'rgba(255, 255, 255, 0.74)' : 'rgba(15, 23, 42, 0.72)',
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 54,
              borderRadius: 2,
              mx: 0.5,
              '&.Mui-selected': {
                color: mode === 'dark' ? '#b7c5ff' : '#2841c6',
                backgroundColor:
                  mode === 'dark' ? 'rgba(120, 141, 255, 0.14)' : 'rgba(74, 108, 247, 0.10)',
              },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: mode === 'dark' ? '#9bafff' : '#00e7ff',
              height: 3,
              borderRadius: 99,
            },
          }}
        >
          <Tab label="View User" {...a11yProps(0)} />
          <Tab label="Edit User" {...a11yProps(1)} />
          <Tab label="Platforms" {...a11yProps(2)} />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <ViewUser user={user} onUserUpdate={handleUserUpdate} onEdit={() => setTabValue(1)} />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Full Name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              margin="normal"
              required
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              margin="normal"
              required
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Artist Name"
              name="artistName"
              value={formData.artistName}
              onChange={handleChange}
              margin="normal"
              helperText="This is the public name for the artist"
              sx={{ mb: 2 }}
            />

            <FormControl component="fieldset" margin="normal" sx={{ mb: 2 }}>
              <FormLabel component="legend">Role</FormLabel>
              <RadioGroup row name="role" value={formData.role} onChange={handleChange}>
                <FormControlLabel value="artist" control={<Radio />} label="Artist" />
                <FormControlLabel value="label" control={<Radio />} label="Label" />
                <FormControlLabel value="subadmin" control={<Radio />} label="Subadmin" />
                <FormControlLabel value="admin" control={<Radio />} label="Admin" />
              </RadioGroup>
            </FormControl>

            {formData.role === 'subadmin' && (
              <Paper variant="outlined" sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
                <Stack spacing={2}>
                  <TextField
                    select
                    fullWidth
                    label="Subadmin Preset"
                    name="adminPreset"
                    value={formData.adminPreset}
                    onChange={handleChange}
                    disabled={loading}
                  >
                    {[
                      'users',
                      'review',
                      'payouts',
                      'delivery',
                      'settings',
                      'analytics',
                      'support',
                    ].map(preset => (
                      <MenuItem key={preset} value={preset}>
                        {preset.replace('_', ' ')}
                      </MenuItem>
                    ))}
                  </TextField>
                  <FormControl component="fieldset">
                    <FormLabel component="legend">Permissions</FormLabel>
                    <FormGroup row>
                      {[
                        'users',
                        'review',
                        'payouts',
                        'dsp_delivery',
                        'settings',
                        'analytics',
                        'support',
                      ].map(permission => (
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
                  {(formData.adminPreset === 'support' ||
                    formData.permissions.includes('support')) && (
                    <FormControl component="fieldset">
                      <FormLabel component="legend">Support Categories</FormLabel>
                      <FormGroup row>
                        {SUPPORT_CATEGORIES.map(category => (
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
                </Stack>
              </Paper>
            )}

            <FormControl component="fieldset" margin="normal" sx={{ mb: 3 }}>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.isActive}
                      onChange={handleChange}
                      name="isActive"
                      color="primary"
                    />
                  }
                  label="Active User"
                />
              </FormGroup>
            </FormControl>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 3 }}>
              <Button variant="outlined" component={Link} href="/admin/users" disabled={loading}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                startIcon={loading ? <CircularProgress size={20} /> : <Save />}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </Box>
          </form>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" fontWeight={700}>
                Platform Access (DSPs)
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Admin controls which distribution providers appear for this user in “Distribution
                Providers” step.
              </Typography>
            </Box>

            {platformsError && <Alert severity="error">{platformsError}</Alert>}

            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
              <Box
                sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setPlatformKeys(ALL_DSP_KEYS)}
                  disabled={platformsLoading}
                >
                  Allow all
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  onClick={() => setPlatformKeys([])}
                  disabled={platformsLoading}
                >
                  Revoke all
                </Button>
              </Box>
              <Divider sx={{ my: 2 }} />

              <Box
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
              >
                {ALL_DSP_KEYS.map(key => {
                  const checked = platformKeys.includes(key);
                  const meta = DSP_META_BY_KEY[key];
                  return (
                    <FormControlLabel
                      key={key}
                      control={
                        <Checkbox
                          checked={checked}
                          onChange={e => {
                            setPlatformKeys(prev =>
                              e.target.checked
                                ? Array.from(new Set([...prev, key]))
                                : prev.filter(k => k !== key)
                            );
                          }}
                        />
                      }
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <DspLogo value={key} alt={meta.name} size={56} sx={{ fontSize: 13 }} />
                          <Box>
                            <Typography variant="body2" fontWeight={500}>
                              {meta.name}
                            </Typography>
                          </Box>
                        </Box>
                      }
                    />
                  );
                })}
              </Box>

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <Button
                  variant="contained"
                  disabled={platformsLoading}
                  onClick={async () => {
                    try {
                      setPlatformsLoading(true);
                      setPlatformsError('');
                      const res = await fetch(`/api/admin/platforms/${userId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ dspKeys: platformKeys }),
                      });
                      const json = await res.json().catch(() => null);
                      if (!res.ok || !json?.success)
                        throw new Error(json?.message || 'Failed to save platforms');
                    } catch (e) {
                      setPlatformsError(
                        e instanceof Error ? e.message : 'Failed to save platforms'
                      );
                    } finally {
                      setPlatformsLoading(false);
                    }
                  }}
                >
                  Save platform access
                </Button>
              </Box>
            </Paper>
          </Stack>
        </TabPanel>
      </Paper>
    </Box>
  );
}
