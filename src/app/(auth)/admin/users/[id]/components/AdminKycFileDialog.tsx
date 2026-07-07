'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Close,
  Edit,
  FactCheck,
  ImageOutlined,
  Save,
} from '@mui/icons-material';
import { adminAPI } from '@/services/api';
import { useColorMode } from '@/context/ColorModeContext';
import { resolveMediaUrl } from '@/lib/urlConfig';

const toAssetUrl = (value?: string) => {
  return resolveMediaUrl(value);
};

const formatLabel = (value: string) =>
  value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();

type EditableDetailItem = {
  label: string;
  field: string;
  value: unknown;
  options?: Array<{ value: string; label: string }>;
};

const buildKycDraft = (user: any) => {
  const payout = user?.payoutMethod || user?.onboarding?.payoutMethod || {};
  const details = payout.details || {};
  return {
    accountType: user?.accountType || user?.role || '',
    artistName: user?.artistName || '',
    legalName: user?.onboarding?.legalName || user?.onboarding?.labelLegalName || '',
    labelName: user?.onboarding?.labelName || '',
    phoneNumber: user?.onboarding?.phoneNumber || user?.verification?.phoneNumber || '',
    country: user?.onboarding?.location?.country || '',
    state: user?.onboarding?.location?.state || '',
    city: user?.onboarding?.location?.city || '',
    pincode: user?.onboarding?.location?.pincode || '',
    address: user?.onboarding?.location?.address || user?.onboarding?.legalAddress || '',
    aadhaarNumber: user?.onboarding?.aadhaarNumber || '',
    panNumber: user?.onboarding?.panNumber || '',
    idNumber: user?.onboarding?.idNumber || '',
    registrationType: user?.onboarding?.registrationType || '',
    payoutMethod: payout.method || 'bank_transfer',
    accountHolderName: details.accountHolderName || '',
    accountNumber: details.accountNumber || '',
    ifscCode: details.ifscCode || '',
    bankName: details.bankName || '',
    branch: details.branch || '',
    paypalEmail: details.paypalEmail || '',
  };
};

function EditableDetailGrid({
  items,
  draft,
  editingField,
  saving,
  onEdit,
  onCancel,
  onChange,
  onSave,
}: {
  items: EditableDetailItem[];
  draft: Record<string, string>;
  editingField: string;
  saving: boolean;
  onEdit: (field: string) => void;
  onCancel: () => void;
  onChange: (field: string) => (event: ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25 }}>
      {items.map((item) => {
        const isEditing = editingField === item.field;
        return (
          <Box key={item.field} sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'rgba(15,23,42,0.04)' }}>
            <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                  {item.label}
                </Typography>
                {isEditing ? (
                  <TextField
                    select={Boolean(item.options?.length)}
                    value={draft[item.field] || ''}
                    onChange={onChange(item.field)}
                    size="small"
                    fullWidth
                    sx={{ mt: 0.75 }}
                  >
                    {item.options?.map((option) => (
                      <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                    {String(item.value || 'Not set')}
                  </Typography>
                )}
              </Box>
              {!isEditing ? (
                <Button size="small" startIcon={<Edit />} onClick={() => onEdit(item.field)} sx={{ flexShrink: 0 }}>
                  Edit
                </Button>
              ) : null}
            </Stack>
            {isEditing ? (
              <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
                <Button size="small" onClick={onCancel} disabled={saving}>Cancel</Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <Save />}
                  onClick={onSave}
                  disabled={saving}
                >
                  Save
                </Button>
              </Stack>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

export default function AdminKycFileDialog({
  open,
  user,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: any;
  onClose: () => void;
  onSaved: (updatedUser?: any) => void;
}) {
  const { mode } = useColorMode();
  const [kycDraft, setKycDraft] = useState<Record<string, string>>(() => buildKycDraft(user));
  const [savingKycDetails, setSavingKycDetails] = useState(false);
  const [editingKycField, setEditingKycField] = useState('');
  const [kycEditError, setKycEditError] = useState('');
  const [kycEditSuccess, setKycEditSuccess] = useState('');

  useEffect(() => {
    if (!open) return;
    setKycDraft(buildKycDraft(user));
    setEditingKycField('');
    setKycEditError('');
    setKycEditSuccess('');
  }, [open, user]);

  const handleDraftChange = (field: string) => (event: ChangeEvent<HTMLInputElement>) => {
    setKycDraft((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleCancelKycFieldEdit = () => {
    setKycDraft(buildKycDraft(user));
    setEditingKycField('');
    setKycEditError('');
    setKycEditSuccess('');
  };

  const handleSaveKycDetails = async () => {
    try {
      setSavingKycDetails(true);
      setKycEditError('');
      setKycEditSuccess('');

      const nextPayoutMethod = {
        method: kycDraft.payoutMethod || 'bank_transfer',
        details: {
          accountHolderName: kycDraft.accountHolderName,
          accountNumber: kycDraft.accountNumber,
          ifscCode: kycDraft.ifscCode,
          bankName: kycDraft.bankName,
          branch: kycDraft.branch,
          paypalEmail: kycDraft.paypalEmail,
        },
      };

      const response = await adminAPI.updateUser(user._id, {
        accountType: kycDraft.accountType,
        artistName: kycDraft.artistName,
        onboarding: {
          ...(user.onboarding || {}),
          legalName: kycDraft.legalName,
          labelName: kycDraft.labelName,
          phoneNumber: kycDraft.phoneNumber,
          aadhaarNumber: kycDraft.aadhaarNumber,
          panNumber: kycDraft.panNumber,
          idNumber: kycDraft.idNumber,
          registrationType: kycDraft.registrationType,
          payoutMethod: nextPayoutMethod,
          location: {
            ...(user.onboarding?.location || {}),
            country: kycDraft.country,
            state: kycDraft.state,
            city: kycDraft.city,
            pincode: kycDraft.pincode,
            address: kycDraft.address,
          },
        },
        payoutMethod: nextPayoutMethod,
        verification: {
          ...(user.verification || {}),
          phoneNumber: kycDraft.phoneNumber,
          lastEditedByAdminAt: new Date().toISOString(),
        },
      });

      if (!response.success) {
        throw new Error(response.message || 'Failed to save KYC details');
      }

      setKycEditSuccess(editingKycField ? `${formatLabel(editingKycField)} saved.` : 'KYC details saved.');
      setEditingKycField('');
      onSaved(response.data);
    } catch (err: any) {
      setKycEditError(err?.message || 'Failed to save KYC details');
    } finally {
      setSavingKycDetails(false);
    }
  };

  if (!user) return null;

  const kycHeadingName =
    user.accountType === 'label' || user.role === 'label'
      ? user.onboarding?.legalName || user.onboarding?.labelLegalName || user.name
      : user.artistName || user.name;
  const accountTypeOptions = ['artist', 'label', 'admin', 'subadmin'].map((value) => ({ value, label: value }));
  const payoutMethodOptions = [
    { value: 'bank_transfer', label: 'Bank transfer' },
    { value: 'paypal', label: 'PayPal' },
  ];
  const editableGridProps = {
    draft: kycDraft,
    editingField: editingKycField,
    saving: savingKycDetails,
    onEdit: (field: string) => {
      setKycEditError('');
      setKycEditSuccess('');
      setEditingKycField(field);
    },
    onCancel: handleCancelKycFieldEdit,
    onChange: handleDraftChange,
    onSave: handleSaveKycDetails,
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pr: 7 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <FactCheck color="info" />
          <Box>
            <Typography variant="h6" fontWeight={900}>Manual KYC file - {kycHeadingName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {user.name} - {user.email}
            </Typography>
          </Box>
        </Stack>
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: mode === 'dark' ? '#111827' : '#f8fafc' }}>
        <Stack spacing={2.5}>
          {kycEditError ? <Alert severity="error">{kycEditError}</Alert> : null}
          {kycEditSuccess ? <Alert severity="success">{kycEditSuccess}</Alert> : null}

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography fontWeight={900} sx={{ mb: 1.5 }}>Profile and address</Typography>
            <EditableDetailGrid
              {...editableGridProps}
              items={[
                { label: 'Account type', field: 'accountType', value: kycDraft.accountType, options: accountTypeOptions },
                { label: 'Artist name', field: 'artistName', value: kycDraft.artistName },
                { label: 'Label name', field: 'labelName', value: kycDraft.labelName },
                { label: 'Legal name', field: 'legalName', value: kycDraft.legalName },
                { label: 'Phone', field: 'phoneNumber', value: kycDraft.phoneNumber },
                { label: 'Country', field: 'country', value: kycDraft.country },
                { label: 'State', field: 'state', value: kycDraft.state },
                { label: 'City', field: 'city', value: kycDraft.city },
                { label: 'Pincode', field: 'pincode', value: kycDraft.pincode },
                { label: 'Address', field: 'address', value: kycDraft.address },
              ]}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography fontWeight={900} sx={{ mb: 1.5 }}>Identity</Typography>
            <EditableDetailGrid
              {...editableGridProps}
              items={[
                { label: 'Aadhaar', field: 'aadhaarNumber', value: kycDraft.aadhaarNumber },
                { label: 'PAN', field: 'panNumber', value: kycDraft.panNumber },
                { label: 'National ID', field: 'idNumber', value: kycDraft.idNumber },
                { label: 'Registration type', field: 'registrationType', value: kycDraft.registrationType },
              ]}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography fontWeight={900} sx={{ mb: 1.5 }}>Payout</Typography>
            <EditableDetailGrid
              {...editableGridProps}
              items={[
                { label: 'Method', field: 'payoutMethod', value: kycDraft.payoutMethod, options: payoutMethodOptions },
                { label: 'Account holder', field: 'accountHolderName', value: kycDraft.accountHolderName },
                { label: 'Account number', field: 'accountNumber', value: kycDraft.accountNumber },
                { label: 'IFSC', field: 'ifscCode', value: kycDraft.ifscCode },
                { label: 'Bank', field: 'bankName', value: kycDraft.bankName },
                { label: 'Branch', field: 'branch', value: kycDraft.branch },
                { label: 'PayPal email', field: 'paypalEmail', value: kycDraft.paypalEmail },
              ]}
            />
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
              <ImageOutlined color="info" />
              <Typography fontWeight={900}>Document previews</Typography>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
              {Object.entries(user.onboarding?.documents || {}).filter(([, value]) => value).map(([key, value]) => {
                const url = toAssetUrl(String(value));
                const isPdf = url.toLowerCase().includes('.pdf');
                return (
                  <Box key={key} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, overflow: 'hidden', bgcolor: 'background.paper' }}>
                    <Box sx={{ height: 190, bgcolor: 'rgba(15,23,42,0.06)', display: 'grid', placeItems: 'center' }}>
                      {isPdf ? (
                        <Button component="a" href={url} target="_blank" rel="noreferrer" variant="outlined">Open PDF</Button>
                      ) : (
                        <Box component="img" src={url} alt={formatLabel(key)} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </Box>
                    <Divider />
                    <Typography sx={{ p: 1.25, fontWeight: 800 }}>{formatLabel(key)}</Typography>
                  </Box>
                );
              })}
              {Object.values(user.onboarding?.documents || {}).filter(Boolean).length === 0 && (
                <Typography color="text.secondary">No uploaded documents found.</Typography>
              )}
            </Box>
          </Paper>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
