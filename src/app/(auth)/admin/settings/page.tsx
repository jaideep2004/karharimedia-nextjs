'use client';
import { useState, useEffect, useMemo } from 'react';
import { Alert, Checkbox, Chip, Stack } from '@mui/material';
import { DeleteForever } from '@mui/icons-material';
import { releaseAPI } from '@/services/api';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Divider,
  Tabs,
  Tab,
  CircularProgress,
  useTheme,
} from '@mui/material';
import { Save, Security, Notifications, Payment, Person } from '@mui/icons-material';
import { adminAPI } from '@/services/api';
import useAdminAuth from '@/hooks/useAdminAuth';
import { useColorMode } from '@/context/ColorModeContext';
import { PremiumHeader, premiumSurfaceSx } from '@/components/premium/PremiumSurface';
import { toast } from 'sonner';

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
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `settings-tab-${index}`,
    'aria-controls': `settings-tabpanel-${index}`,
  };
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const { isAdmin } = useAdminAuth();
  const theme = useTheme();

  const [tabValue, setTabValue] = useState(0);
  const [deleteReleaseSearch, setDeleteReleaseSearch] = useState('');
  const [deleteReleaseId, setDeleteReleaseId] = useState('');
  const [selectedDeleteReleaseIds, setSelectedDeleteReleaseIds] = useState<string[]>([]);
  const [deleteReleaseConfirm, setDeleteReleaseConfirm] = useState('');
  const [deleteReleases, setDeleteReleases] = useState<any[]>([]);
  const [deleteReleasesLoading, setDeleteReleasesLoading] = useState(false);
  const [deletingRelease, setDeletingRelease] = useState(false);
  const [settings, setSettings] = useState({
    siteName: '',
    siteDescription: '',
    maintenanceMode: false,
    allowRegistrations: true,
    enableEmailNotifications: true,
    currency: 'USD',
    paymentGateway: 'paypal',
    minPayoutAmount: 100,
    maxUploadSize: 50, // MB
    allowedFileTypes: ['mp3', 'wav', 'aac', 'flac'],
  });

  const [signupEnabled, setSignupEnabled] = useState(true);
  const { mode } = useColorMode();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      fetchSettings();
    }
  }, [isAdmin]);

  const fetchSettings = async () => {
    try {
      setLoading(true);

      const settingsResponse = await adminAPI.getSettings();
      const rows = Array.isArray(settingsResponse.data) ? settingsResponse.data : [];
      const byKey = new Map(rows.map((setting: any) => [setting.key, setting.value]));

      setSignupEnabled(byKey.has('signupEnabled') ? byKey.get('signupEnabled') === true : true);
      setSettings((prev) => ({
        ...prev,
        siteName: String(byKey.get('siteName') || prev.siteName),
        siteDescription: String(byKey.get('siteDescription') || prev.siteDescription),
        maintenanceMode: byKey.get('maintenanceMode') === true,
        allowRegistrations: byKey.has('signupEnabled') ? byKey.get('signupEnabled') === true : true,
        enableEmailNotifications: byKey.has('enableEmailNotifications')
          ? byKey.get('enableEmailNotifications') === true
          : prev.enableEmailNotifications,
        currency: ['USD', 'INR'].includes(String(byKey.get('currency') || '').toUpperCase())
          ? String(byKey.get('currency')).toUpperCase()
          : prev.currency,
        paymentGateway: ['paypal', 'bank_transfer'].includes(String(byKey.get('paymentGateway') || '').toLowerCase())
          ? String(byKey.get('paymentGateway')).toLowerCase()
          : prev.paymentGateway,
        minPayoutAmount: Number(byKey.get('minPayoutAmount') || 100),
        maxUploadSize: Number(byKey.get('maxUploadSize') || prev.maxUploadSize),
      }));
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const selectedDeleteRelease = useMemo(
    () => deleteReleases.find((release) => String(release._id) === deleteReleaseId),
    [deleteReleases, deleteReleaseId]
  );

  const selectedDeleteReleases = useMemo(
    () => deleteReleases.filter((release) => selectedDeleteReleaseIds.includes(String(release._id))),
    [deleteReleases, selectedDeleteReleaseIds]
  );

  const filteredDeleteReleases = useMemo(() => {
    const query = deleteReleaseSearch.trim().toLowerCase();
    const list = !query
      ? deleteReleases
      : deleteReleases.filter((release) => {
          const haystack = [
            release.releaseTitle,
            release.title,
            release.primaryArtist,
            release.artist,
            release.label,
            release.upc,
            release.ownerEmail,
            release.userEmail,
            release._id,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(query);
        });
    return list.slice(0, 50);
  }, [deleteReleases, deleteReleaseSearch]);

  const filteredDeleteReleaseIds = useMemo(
    () => filteredDeleteReleases.map((release) => String(release._id)),
    [filteredDeleteReleases]
  );

  const allFilteredDeleteReleasesSelected =
    filteredDeleteReleaseIds.length > 0 &&
    filteredDeleteReleaseIds.every((id) => selectedDeleteReleaseIds.includes(id));

  const toggleDeleteReleaseSelection = (id: string) => {
    setSelectedDeleteReleaseIds((current) =>
      current.includes(id) ? current.filter((releaseId) => releaseId !== id) : [...current, id]
    );
    setDeleteReleaseId('');
    setDeleteReleaseConfirm('');
  };

  const toggleAllFilteredDeleteReleases = () => {
    setSelectedDeleteReleaseIds((current) => {
      if (allFilteredDeleteReleasesSelected) {
        return current.filter((id) => !filteredDeleteReleaseIds.includes(id));
      }
      return Array.from(new Set([...current, ...filteredDeleteReleaseIds]));
    });
    setDeleteReleaseConfirm('');
  };

  const fetchDeleteReleases = async () => {
    setDeleteReleasesLoading(true);
    try {
      const response = await releaseAPI.getReleases({ summary: '1' });
      if (!response.success) {
        throw new Error(response.error || 'Failed to load releases');
      }
      setDeleteReleases(Array.isArray(response.data) ? response.data : []);
      setSelectedDeleteReleaseIds([]);
      setDeleteReleaseId('');
      setDeleteReleaseConfirm('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to load releases');
    } finally {
      setDeleteReleasesLoading(false);
    }
  };

  const handleDeleteRelease = async () => {
    if (selectedDeleteReleaseIds.length === 0 || deleteReleaseConfirm.trim() !== 'DELETE') {
      toast.error('Select releases and type DELETE to confirm');
      return;
    }

    setDeletingRelease(true);
    try {
      const results = await Promise.all(
        selectedDeleteReleaseIds.map(async (id) => {
          const response = await fetch(`/api/admin/releases/${id}`, {
            method: 'DELETE',
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.success) {
            throw new Error(payload.error || payload.message || `Failed to delete release ${id}`);
          }
          return id;
        })
      );

      const deletedCount = results.length;
      toast.success(`${deletedCount} release${deletedCount === 1 ? '' : 's'} deleted from database`);
      setDeleteReleases((current) => current.filter((release) => !selectedDeleteReleaseIds.includes(String(release._id))));
      setSelectedDeleteReleaseIds([]);
      setDeleteReleaseId('');
      setDeleteReleaseConfirm('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete selected releases');
      if (selectedDeleteReleaseIds.length > 0) {
        await fetchDeleteReleases();
      }
    } finally {
      setDeletingRelease(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    if (newValue === 4 && deleteReleases.length === 0 && !deleteReleasesLoading) {
      void fetchDeleteReleases();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleNumberInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: value === '' ? '' : Number(value),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setSaving(true);

      const writes = [
        ['signupEnabled', signupEnabled],
        ['siteName', settings.siteName],
        ['siteDescription', settings.siteDescription],
        ['maintenanceMode', settings.maintenanceMode],
        ['enableEmailNotifications', settings.enableEmailNotifications],
        ['currency', settings.currency],
        ['paymentGateway', settings.paymentGateway],
        ['minPayoutAmount', settings.minPayoutAmount],
        ['maxUploadSize', Math.min(200, Math.max(1, Number(settings.maxUploadSize) || 1))],
      ] as const;
      const responses = await Promise.all(writes.map(([key, value]) => adminAPI.updateSetting(key, value)));

      if (responses.some((response) => !response.success)) {
        throw new Error('Failed to update one or more settings');
      }

      toast.success('Settings saved successfully.');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      const message = error?.message || 'Failed to save settings';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (isAdmin === null) {
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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <PremiumHeader
        eyebrow="System"
        title="Settings"
        description="Configure platform behavior, security, notifications, payment policy, and admin preferences."
      />

      <Paper
        sx={{
          mb: 3,
          ...premiumSurfaceSx(theme),
          overflow: 'hidden',
        }}
      >
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="settings tabs"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 1,
            pt: 1,
            borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)'}`,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 54,
              borderRadius: 2,
              mx: 0.5,
              color: mode === 'dark' ? 'rgba(255,255,255,0.74)' : 'rgba(15,23,42,0.72)',
              '&.Mui-selected': {
                color: mode === 'dark' ? '#b7c5ff' : '#2841c6',
                backgroundColor: mode === 'dark' ? 'rgba(120,141,255,0.14)' : 'rgba(74,108,247,0.10)',
              },
            },
            '& .MuiTabs-indicator': {
              height: 3,
              borderRadius: 999,
              backgroundColor: mode === 'dark' ? '#9bafff' : '#00e7ff',
            },
          }}
        >
          <Tab icon={<Person />} label="General" {...a11yProps(0)} />
            <Tab icon={<Security />} label="Security" {...a11yProps(1)} />
            <Tab icon={<Notifications />} label="Notifications" {...a11yProps(2)} />
            <Tab icon={<Payment />} label="Payments" {...a11yProps(3)} />
            <Tab icon={<DeleteForever />} label="Delete Releases" {...a11yProps(4)} />
          </Tabs>

        <form onSubmit={handleSubmit}>
          <TabPanel value={tabValue} index={0}>
            <Typography variant="h6" gutterBottom>
              General Settings
            </Typography>
            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                label="Site Name"
                name="siteName"
                value={settings.siteName}
                onChange={handleInputChange}
                margin="normal"
              />
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Site Description"
                name="siteDescription"
                value={settings.siteDescription}
                onChange={handleInputChange}
                margin="normal"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.maintenanceMode}
                    onChange={handleInputChange}
                    name="maintenanceMode"
                    color="primary"
                  />
                }
                label="Maintenance Mode"
                sx={{ mt: 2, display: 'block' }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={signupEnabled}
                      onChange={e => setSignupEnabled(e.target.checked)}
                      name="signupEnabled"
                      color="primary"
                      disabled={saving}
                    />
                  }
                  label="Allow new user registrations"
                />
                {saving && <CircularProgress size={24} sx={{ ml: 2 }} />}
              </Box>
              <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                {signupEnabled
                  ? 'New users can create accounts on the signup page.'
                  : 'New user registrations are currently disabled. Only administrators can create new accounts.'}
              </Typography>
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={1}>
            <Typography variant="h6" gutterBottom>
              Security Settings
            </Typography>
            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                type="number"
                label="Maximum Upload Size (MB)"
                name="maxUploadSize"
                value={settings.maxUploadSize}
                onChange={handleNumberInputChange}
                margin="normal"
                inputProps={{ min: 1, max: 200 }}
                helperText="Admins can set audio upload limits up to 200 MB."
              />
              <TextField
                fullWidth
                label="Allowed File Types"
                name="allowedFileTypes"
                value={settings.allowedFileTypes.join(', ')}
                onChange={e => {
                  const types = e.target.value.split(',').map(t => t.trim().toLowerCase());
                  setSettings(prev => ({
                    ...prev,
                    allowedFileTypes: types,
                  }));
                }}
                margin="normal"
                helperText="Separate file types with commas (e.g., mp3, wav, aac)"
              />
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={2}>
            <Typography variant="h6" gutterBottom>
              Notification Settings
            </Typography>
            <Box sx={{ mb: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.enableEmailNotifications}
                    onChange={handleInputChange}
                    name="enableEmailNotifications"
                    color="primary"
                  />
                }
                label="Enable Email Notifications"
                sx={{ mt: 1, display: 'block' }}
              />
            </Box>
          </TabPanel>

          <TabPanel value={tabValue} index={3}>
            <Typography variant="h6" gutterBottom>
            Payment Settings
          </Typography>
            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                select
                label="Payment Gateway"
                name="paymentGateway"
                value={settings.paymentGateway}
                onChange={handleInputChange}
                margin="normal"
                SelectProps={{
                  native: true,
                }}
              >
                <option value="paypal">PayPal</option>
                <option value="bank_transfer">Bank Transfer</option>
              </TextField>
              <TextField
                fullWidth
                type="number"
                label="Minimum Payout Amount"
                name="minPayoutAmount"
                value={settings.minPayoutAmount}
                onChange={handleNumberInputChange}
                margin="normal"
                InputProps={{
                  startAdornment: <span style={{ marginRight: 8 }}>$</span>,
                }}
                inputProps={{ min: 10, step: 5 }}
              />
              <TextField
                fullWidth
                select
                label="Default Currency"
                name="currency"
                value={settings.currency}
                onChange={handleInputChange}
                margin="normal"
                SelectProps={{
                  native: true,
                }}
              >
                <option value="USD">US Dollar (USD)</option>
                <option value="INR">Indian Rupee (INR)</option>
              </TextField>
            </Box>
          </TabPanel>

          {tabValue !== 4 && (
            <>
              <Divider />

              <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button variant="outlined" onClick={() => fetchSettings()} disabled={saving}>
              Reset
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              startIcon={saving ? <CircularProgress size={20} /> : <Save />}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
              </Box>
            </>
          )}
        <TabPanel value={tabValue} index={4}>
          <Typography variant="h5" fontWeight="bold" mb={3}>
            Delete Releases
          </Typography>

          <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
            This permanently deletes the release record from the database. Delivery history and audit logs stay saved. Embedded release tracks are soft-deleted.
          </Alert>

          <Stack spacing={3}>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr auto' } }}>
              <TextField
                fullWidth
                label="Search by title, artist, UPC, email, or ID"
                value={deleteReleaseSearch}
                onChange={(event) => setDeleteReleaseSearch(event.target.value)}
              />
              <Button
                type="button"
                variant="outlined"
                onClick={fetchDeleteReleases}
                disabled={deleteReleasesLoading}
                sx={{ minWidth: 140 }}
              >
                {deleteReleasesLoading ? <CircularProgress size={20} /> : 'Refresh'}
              </Button>
            </Box>

            <Paper variant="outlined" sx={{ overflow: 'hidden', bgcolor: 'background.default', borderRadius: 2 }}>
              <Box
                sx={{
                  px: 2,
                  py: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)'}`,
                }}
              >
                <Box>
                  <Typography fontWeight={700}>Select releases</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Showing {filteredDeleteReleases.length} of {deleteReleases.length}. Selected {selectedDeleteReleaseIds.length}.
                  </Typography>
                </Box>
                <Button
                  type="button"
                  size="small"
                  variant="outlined"
                  onClick={toggleAllFilteredDeleteReleases}
                  disabled={filteredDeleteReleases.length === 0 || deleteReleasesLoading}
                >
                  {allFilteredDeleteReleasesSelected ? 'Clear shown' : 'Select shown'}
                </Button>
              </Box>

              <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
                {deleteReleasesLoading ? (
                  <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : filteredDeleteReleases.length === 0 ? (
                  <Box sx={{ p: 3 }}>
                    <Typography color="text.secondary">No releases found.</Typography>
                  </Box>
                ) : (
                  filteredDeleteReleases.map((release) => {
                    const id = String(release._id);
                    const title = release.releaseTitle || release.title || 'Untitled release';
                    const artist = release.primaryArtist || release.artist || 'Unknown artist';
                    const selected = selectedDeleteReleaseIds.includes(id);
                    return (
                      <Box
                        key={id}
                        onClick={() => toggleDeleteReleaseSelection(id)}
                        sx={{
                          px: 2,
                          py: 1.5,
                          display: 'grid',
                          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                          gap: 1.5,
                          alignItems: 'center',
                          cursor: 'pointer',
                          borderBottom: `1px solid ${mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}`,
                          bgcolor: selected
                            ? mode === 'dark'
                              ? 'rgba(244,63,94,0.14)'
                              : 'rgba(220,38,38,0.08)'
                            : 'transparent',
                          '&:hover': {
                            bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
                          },
                        }}
                      >
                        <Checkbox
                          checked={selected}
                          color="error"
                          onChange={() => toggleDeleteReleaseSelection(id)}
                          onClick={(event) => event.stopPropagation()}
                          inputProps={{ 'aria-label': `Select ${title}` }}
                        />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography fontWeight={700} noWrap title={title}>
                            {title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" noWrap title={`${artist} | ${id}`}>
                            {artist} | ID {id}
                          </Typography>
                        </Box>
                        <Stack direction="row" gap={1} flexWrap="wrap" justifyContent="flex-end">
                          <Chip label={release.status || 'unknown'} size="small" />
                          {release.upc && <Chip label={`UPC ${release.upc}`} size="small" />}
                        </Stack>
                      </Box>
                    );
                  })
                )}
              </Box>
            </Paper>

            {selectedDeleteReleases.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                <Typography fontWeight={700} mb={1}>
                  {selectedDeleteReleases.length} release{selectedDeleteReleases.length === 1 ? '' : 's'} selected for deletion
                </Typography>
                <Stack direction="row" gap={1} flexWrap="wrap">
                  {selectedDeleteReleases.slice(0, 8).map((release) => (
                    <Chip
                      key={String(release._id)}
                      label={release.releaseTitle || release.title || String(release._id)}
                      onDelete={() => toggleDeleteReleaseSelection(String(release._id))}
                      size="small"
                    />
                  ))}
                  {selectedDeleteReleases.length > 8 && (
                    <Chip label={`+${selectedDeleteReleases.length - 8} more`} size="small" />
                  )}
                </Stack>
              </Paper>
            )}

            <TextField
              fullWidth
              label="Type DELETE to confirm"
              value={deleteReleaseConfirm}
              onChange={(event) => setDeleteReleaseConfirm(event.target.value)}
              disabled={selectedDeleteReleaseIds.length === 0 || deletingRelease}
            />

            <Box>
              <Button
                type="button"
                variant="contained"
                color="error"
                startIcon={deletingRelease ? <CircularProgress size={18} color="inherit" /> : <DeleteForever />}
                disabled={selectedDeleteReleaseIds.length === 0 || deleteReleaseConfirm.trim() !== 'DELETE' || deletingRelease}
                onClick={handleDeleteRelease}
              >
                Delete {selectedDeleteReleaseIds.length || ''} Release{selectedDeleteReleaseIds.length === 1 ? '' : 's'} From Database
              </Button>
            </Box>
          </Stack>
        </TabPanel>
      </form>
      </Paper>
    </Box>
  );
}
