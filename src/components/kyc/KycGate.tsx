'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import {
  AccountBalance,
  BadgeOutlined,
  CheckCircle,
  CloudUploadOutlined,
  DescriptionOutlined,
  HourglassTop,
  LocationOnOutlined,
  PaymentsOutlined,
  ShieldOutlined,
  TravelExplore,
} from '@mui/icons-material';
import { useAuth } from '@/context/AppContext';

type Region = 'india' | 'international';
type AccountType = 'artist' | 'label';

type CountryOption = { name: string; iso2: string };
type StateOption = { name: string; iso2: string };
type CityOption = { name: string };
type PostOffice = { Name: string; District: string; State: string; Country: string; Pincode: string };

const steps = ['Profile', 'Address', 'Identity', 'Payout'];
const KYC_DRAFT_PREFIX = 'karharimedia.kycDraft.v1.';
const KYC_DRAFT_BACKUP_KEY = `${KYC_DRAFT_PREFIX}latest`;
const fileFields = [
  'aadhaarFrontFile',
  'aadhaarBackFile',
  'panCardFile',
  'nationalIdFrontFile',
  'nationalIdBackFile',
] as const;

type FileField = typeof fileFields[number];
type KycFiles = Partial<Record<FileField, File>>;

const isArtistOrLabel = (role?: string) => role === 'artist' || role === 'label';
const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const aadhaarPattern = /^\d{12}$/;
const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function userNeedsKyc(user: ReturnType<typeof useAuth>['user']) {
  if (!user || !isArtistOrLabel(user.role)) return false;
  const status = user.verification?.status || 'pending';
  return status === 'pending' || status === 'rejected';
}

export function userKycUnderReview(user: ReturnType<typeof useAuth>['user']) {
  return Boolean(user && isArtistOrLabel(user.role) && user.verification?.status === 'submitted');
}

const readLookup = async <T,>(url: string, fallback: T): Promise<T> => {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  return response.ok && json?.success !== false ? (json?.data as T) : fallback;
};

const FieldShell = ({ title, children }: { title: string; children: ReactNode }) => (
  <Box>
    <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 900, letterSpacing: 0.5 }}>
      {title}
    </Typography>
    <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
      {children}
    </Box>
  </Box>
);

const UploadBox = ({
  label,
  value,
  restoredFileName,
  required,
  onChange,
}: {
  label: string;
  value?: File;
  restoredFileName?: string;
  required?: boolean;
  onChange: (file?: File) => void;
}) => {
  const [previewUrl, setPreviewUrl] = useState('');
  const displayName = value?.name || restoredFileName || '';

  useEffect(() => {
    if (!value || !value.type.startsWith('image/')) {
      setPreviewUrl('');
      return undefined;
    }

    const nextUrl = URL.createObjectURL(value);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [value]);

  return (
    <Button
      component="label"
      variant="outlined"
      startIcon={!value ? <CloudUploadOutlined /> : undefined}
      sx={{
        minHeight: value ? 132 : 62,
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        borderRadius: 2,
        textAlign: 'left',
        px: 1.25,
        py: 1.25,
        color: value ? 'success.main' : restoredFileName ? 'warning.main' : 'text.primary',
        borderStyle: value ? 'solid' : 'dashed',
        fontWeight: 800,
        overflow: 'hidden',
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
        {value && (
          <Box
            sx={{
              width: 96,
              height: 96,
              flex: '0 0 auto',
              borderRadius: 1.5,
              overflow: 'hidden',
              bgcolor: 'rgba(15,23,42,0.06)',
              display: 'grid',
              placeItems: 'center',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            {previewUrl ? (
              <Box component="img" src={previewUrl} alt={label} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <DescriptionOutlined sx={{ color: 'text.secondary', fontSize: 34 }} />
            )}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 850, fontSize: 14, lineHeight: 1.2 }}>
            {label}{required ? ' *' : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayName || 'JPG, PNG, or PDF under 10 MB'}
          </Typography>
          {!value && restoredFileName && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontWeight: 800 }}>
              Re-upload required before submit
            </Typography>
          )}
          {value && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontWeight: 800 }}>
              Click to replace
            </Typography>
          )}
        </Box>
      </Stack>
      <input
        hidden
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        onChange={(event) => onChange(event.target.files?.[0])}
      />
    </Button>
  );
};

export default function KycGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [lookupLoading, setLookupLoading] = useState('');
  const [error, setError] = useState('');
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [postOffices, setPostOffices] = useState<PostOffice[]>([]);
  const [files, setFiles] = useState<KycFiles>({});
  const [form, setForm] = useState({
    region: 'india' as Region,
    accountType: (user?.accountType || (user?.role === 'label' ? 'label' : 'artist')) as AccountType,
    artistName: user?.artistName || user?.name || '',
    labelName: user?.artistName || user?.name || '',
    legalName: user?.name || '',
    phoneNumber: user?.verification?.phoneNumber || '',
    country: 'India',
    countryIso: 'IN',
    state: '',
    stateIso: '',
    city: '',
    pincode: '',
    address: '',
    aadhaarNumber: '',
    panNumber: '',
    nationalIdNumber: '',
    registrationType: 'individual',
    numberOfTracks: '0',
    numberOfReleases: '0',
    totalArtists: '0',
    totalRevenue: '0',
    catalogSize: '0',
    rightsType: 'non_exclusive',
    accountHolderName: user?.name || '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifscCode: '',
    bankName: '',
    bankBranch: '',
    bankCity: '',
    bankState: '',
    paypalEmail: '',
    kycConsent: Boolean(user?.verification?.consent),
  });

  const status = user?.verification?.status || 'pending';
  const needsKyc = userNeedsKyc(user);
  const isIndia = form.region === 'india';
  const kycDraftKey = `${KYC_DRAFT_PREFIX}${user?.id || 'anonymous'}`;
  const kycDraftRestoredRef = useRef(false);
  const kycDraftServerSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [kycDraftReady, setKycDraftReady] = useState(false);
  const [hasKycDraft, setHasKycDraft] = useState(false);
  const [restoredFileNames, setRestoredFileNames] = useState<Partial<Record<FileField, string>>>({});

  const buildKycDraft = () => ({
    status: 'draft',
    updatedAt: new Date().toISOString(),
    activeStep,
    form,
    fileNames: Object.fromEntries(
      fileFields.map((key) => [key, files[key]?.name || restoredFileNames[key] || ''])
    ),
  });

  const persistKycDraftLocally = (draft = buildKycDraft()) => {
    const serializedDraft = JSON.stringify(draft);
    localStorage.setItem(kycDraftKey, serializedDraft);
    localStorage.setItem(KYC_DRAFT_BACKUP_KEY, serializedDraft);
    return serializedDraft;
  };

  const saveKycDraftToServer = (draft = buildKycDraft(), keepalive = false) =>
    fetch('/api/auth/me/kyc-draft', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
      keepalive,
    }).catch(() => undefined);

  const statusMeta = useMemo(() => {
    if (status === 'submitted') return { label: 'Submitted for review', color: 'warning' as const };
    if (hasKycDraft) return { label: 'Draft', color: 'default' as const };
    if (status === 'rejected') return { label: 'Rejected', color: 'error' as const };
    return { label: 'KYC required', color: 'info' as const };
  }, [hasKycDraft, status]);

  useEffect(() => {
    if (form.region !== 'international' || countries.length) return;
    void readLookup<CountryOption[]>('/api/geo/countries', []).then(setCountries);
  }, [countries.length, form.region]);

  useEffect(() => {
    if (form.region !== 'international' || !form.countryIso) return;
    setStates([]);
    setCities([]);
    void readLookup<StateOption[]>(`/api/geo/states/${form.countryIso}`, []).then(setStates);
  }, [form.countryIso, form.region]);

  useEffect(() => {
    if (form.region !== 'international' || !form.countryIso || !form.stateIso) return;
    setCities([]);
    void readLookup<CityOption[]>(`/api/geo/cities/${form.countryIso}/${form.stateIso}`, []).then(setCities);
  }, [form.countryIso, form.region, form.stateIso]);

  useEffect(() => {
    if (!needsKyc || kycDraftRestoredRef.current || typeof window === 'undefined') return;
    kycDraftRestoredRef.current = true;

    const applyDraft = (draft: any) => {
      if (draft?.status !== 'draft' || !draft.form) {
        return;
      }
      setActiveStep(Math.min(steps.length - 1, Math.max(0, Number(draft.activeStep || 0))));
      setForm((prev) => ({ ...prev, ...draft.form }));
      setRestoredFileNames(draft.fileNames || {});
      setHasKycDraft(true);
    };

    const loadDraft = async () => {
      try {
        const response = await fetch('/api/auth/me/kyc-draft', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (response.ok && payload?.success && payload?.draft?.status === 'draft') {
          applyDraft(payload.draft);
          return;
        }

        const keys = [kycDraftKey, KYC_DRAFT_BACKUP_KEY, `${KYC_DRAFT_PREFIX}anonymous`];
        const draftEntry = keys
          .map((key) => ({ key, raw: localStorage.getItem(key) }))
          .find((entry) => Boolean(entry.raw));

        if (!draftEntry?.raw) return;

        try {
          const draft = JSON.parse(draftEntry.raw);
          applyDraft(draft);
          if (draft?.status === 'draft' && draft.form) void saveKycDraftToServer(draft);
        } catch {
          localStorage.removeItem(draftEntry.key);
        }
      } finally {
        setKycDraftReady(true);
      }
    };

    void loadDraft();
  }, [kycDraftKey, needsKyc]);

  useEffect(() => {
    if (!needsKyc || !kycDraftReady || typeof window === 'undefined') return;
    if (!hasKycDraft) return;
    const draft = buildKycDraft();
    persistKycDraftLocally(draft);

    if (kycDraftServerSaveRef.current) clearTimeout(kycDraftServerSaveRef.current);
    kycDraftServerSaveRef.current = setTimeout(() => {
      void saveKycDraftToServer(draft);
    }, 450);

    return () => {
      if (kycDraftServerSaveRef.current) clearTimeout(kycDraftServerSaveRef.current);
    };
  }, [activeStep, files, form, hasKycDraft, kycDraftKey, kycDraftReady, needsKyc, restoredFileNames]);

  useEffect(() => {
    if (!needsKyc || !hasKycDraft || typeof window === 'undefined') return;

    const persistBeforeExit = () => {
      const draft = buildKycDraft();
      persistKycDraftLocally(draft);
      void saveKycDraftToServer(draft, true);
    };

    const persistWhenHidden = () => {
      if (document.visibilityState === 'hidden') persistBeforeExit();
    };

    window.addEventListener('pagehide', persistBeforeExit);
    document.addEventListener('visibilitychange', persistWhenHidden);

    return () => {
      persistBeforeExit();
      window.removeEventListener('pagehide', persistBeforeExit);
      document.removeEventListener('visibilitychange', persistWhenHidden);
    };
  }, [activeStep, files, form, hasKycDraft, kycDraftKey, needsKyc, restoredFileNames]);

  if (!needsKyc) return <>{children}</>;

  const setValue = (key: keyof typeof form, value: string | boolean) => {
    setHasKycDraft(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setFile = (key: FileField, file?: File) => {
    setHasKycDraft(true);
    setRestoredFileNames((prev) => ({ ...prev, [key]: file?.name || '' }));
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  const resetRegion = (region: Region) => {
    setHasKycDraft(true);
    setForm((prev) => ({
      ...prev,
      region,
      country: region === 'india' ? 'India' : '',
      countryIso: region === 'india' ? 'IN' : '',
      state: '',
      stateIso: '',
      city: '',
      pincode: '',
    }));
    setPostOffices([]);
  };

  const validateStep = (step = activeStep) => {
    if (step === 0) {
      if (!form.region || !form.accountType || !form.phoneNumber.trim()) return 'Choose region, account type, and phone number.';
      if (form.accountType === 'artist' && (!form.artistName.trim() || !form.legalName.trim())) return 'Artist and legal name are required.';
      if (form.accountType === 'label' && (!form.labelName.trim() || !form.legalName.trim())) return 'Label and legal contact name are required.';
    }
    if (step === 1) {
      if (!form.country || !form.state || !form.city || !form.pincode || !form.address.trim()) return 'Country, state, city, pincode, and address are required.';
    }
    if (step === 2) {
      if (isIndia) {
        if (!aadhaarPattern.test(form.aadhaarNumber.replace(/\D/g, ''))) return 'Enter valid 12 digit Aadhaar.';
        if (!panPattern.test(form.panNumber.toUpperCase())) return 'Enter valid PAN.';
        if (!files.aadhaarFrontFile || !files.aadhaarBackFile || !files.panCardFile) return 'Upload Aadhaar front/back and PAN.';
      } else if (!form.nationalIdNumber.trim() || !files.nationalIdFrontFile) {
        return 'Upload national ID.';
      }
    }
    if (step === 3) {
      if (!form.kycConsent) return 'Consent is required before submitting KYC.';
      if (isIndia) {
        if (!form.accountHolderName.trim() || !form.accountNumber || form.accountNumber !== form.confirmAccountNumber) return 'Bank account name and matching account numbers are required.';
        if (!ifscPattern.test(form.ifscCode.toUpperCase()) || !form.bankName) return 'Verify a valid IFSC before submitting.';
      } else if (!emailPattern.test(form.paypalEmail)) {
        return 'Valid PayPal email is required.';
      }
    }
    return '';
  };

  const goNext = () => {
    const stepError = validateStep();
    if (stepError) {
      setError(stepError);
      return;
    }
    setError('');
    setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const lookupPincode = async () => {
    if (!/^\d{6}$/.test(form.pincode)) {
      setError('Enter valid 6 digit pincode.');
      return;
    }
    setLookupLoading('pincode');
    setError('');
    try {
      const data = await readLookup<any[]>(`/api/geo/pincode/${form.pincode}`, []);
      const offices = data?.[0]?.PostOffice || [];
      if (!offices.length) throw new Error('No postal records found for this pincode.');
      setPostOffices(offices);
      const first = offices[0] as PostOffice;
      setHasKycDraft(true);
      setForm((prev) => ({ ...prev, country: first.Country, state: first.State, city: first.District }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pincode lookup failed.');
    } finally {
      setLookupLoading('');
    }
  };

  const lookupIfsc = async () => {
    const code = form.ifscCode.toUpperCase();
    if (!ifscPattern.test(code)) {
      setError('Enter valid IFSC code.');
      return;
    }
    setLookupLoading('ifsc');
    setError('');
    try {
      const data = await readLookup<any>(`/api/geo/ifsc/${code}`, null);
      if (!data?.BANK) throw new Error('No bank found for this IFSC.');
      setHasKycDraft(true);
      setForm((prev) => ({
        ...prev,
        ifscCode: code,
        bankName: data.BANK || '',
        bankBranch: data.BRANCH || '',
        bankCity: data.CITY || data.CENTRE || '',
        bankState: data.STATE || '',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'IFSC lookup failed.');
    } finally {
      setLookupLoading('');
    }
  };

  const submitKyc = async (event: FormEvent) => {
    event.preventDefault();
    const stepError = validateStep(3);
    if (stepError) {
      setError(stepError);
      return;
    }

    const payload = new FormData();
    const location = {
      country: form.country,
      countryIso: form.countryIso,
      state: form.state,
      stateIso: form.stateIso,
      city: form.city,
      pincode: form.pincode,
      address: form.address,
    };
    const payoutMethod = isIndia
      ? {
          method: 'bank_transfer',
          details: {
            accountHolderName: form.accountHolderName,
            accountNumber: form.accountNumber,
            confirmAccountNumber: form.confirmAccountNumber,
            ifscCode: form.ifscCode.toUpperCase(),
            bankName: form.bankName,
            branch: form.bankBranch,
            city: form.bankCity,
            state: form.bankState,
          },
        }
      : { method: 'paypal', details: { paypalEmail: form.paypalEmail } };

    Object.entries({
      region: form.region,
      accountType: form.accountType,
      artistName: form.artistName,
      labelName: form.labelName,
      legalName: form.legalName,
      labelLegalName: form.legalName,
      phoneNumber: form.phoneNumber,
      legalAddress: form.address,
      idType: isIndia ? 'aadhaar' : 'national_id',
      idNumber: isIndia ? form.aadhaarNumber.replace(/\D/g, '') : form.nationalIdNumber,
      aadhaarNumber: form.aadhaarNumber.replace(/\D/g, ''),
      panNumber: form.panNumber.toUpperCase(),
      registrationType: form.registrationType,
      numberOfTracks: form.numberOfTracks,
      numberOfReleases: form.numberOfReleases,
      totalArtists: form.totalArtists,
      totalRevenue: form.totalRevenue,
      catalogSize: form.catalogSize,
      rightsType: form.rightsType,
      mobileVerificationProvider: 'manual',
      kycProvider: 'manual',
      kycConsent: String(form.kycConsent),
      location: JSON.stringify(location),
      payoutMethod: JSON.stringify(payoutMethod),
    }).forEach(([key, value]) => payload.append(key, value));

    fileFields.forEach((key) => {
      if (files[key]) payload.append(key, files[key] as File);
    });

    try {
      setSubmitting(true);
      setError('');
      const response = await fetch('/api/auth/me/kyc', { method: 'PUT', body: payload });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.message || json?.error || 'KYC submission failed');
      void fetch('/api/auth/me/kyc-draft', { method: 'DELETE' }).catch(() => undefined);
      if (typeof window !== 'undefined') {
        [kycDraftKey, KYC_DRAFT_BACKUP_KEY, `${KYC_DRAFT_PREFIX}anonymous`].forEach((key) => localStorage.removeItem(key));
      }
      setHasKycDraft(false);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'KYC submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const panelSx = {
    p: { xs: 2, md: 2.5 },
    borderRadius: 2,
    border: '1px solid',
    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)',
    bgcolor: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
  };

  return (
    <Box
      sx={{
        minHeight: 'calc(100vh - 60px)',
        px: { xs: 2, md: 4 },
        py: { xs: 3, md: 5 },
        bgcolor: isDark ? '#0e1624' : '#f3f8fb',
      }}
    >
      <Paper
        component="form"
        onSubmit={submitKyc}
        sx={{
          width: '100%',
          maxWidth: 1140,
          mx: 'auto',
          borderRadius: 3,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
          boxShadow: isDark ? '0 26px 80px rgba(0,0,0,0.34)' : '0 26px 80px rgba(15,23,42,0.10)',
        }}
      >
        <Box sx={{ p: { xs: 3, md: 4 }, bgcolor: isDark ? '#111b2b' : '#ffffff', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <ShieldOutlined sx={{ color: '#0f9f8f' }} />
                <Chip size="small" color={statusMeta.color} label={statusMeta.label} />
              </Stack>
              <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: 0 }}>
                Manual KYC review
              </Typography>
              <Typography sx={{ mt: 1, color: 'text.secondary', maxWidth: 700 }}>
                Submit identity, address, documents, and payout details. Admin approval unlocks dashboard tools.
              </Typography>
            </Box>
            {status === 'submitted' && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: '#b7791f' }}>
                <HourglassTop />
                <Typography fontWeight={800}>Admin review pending</Typography>
              </Stack>
            )}
          </Stack>
        </Box>

        <Box sx={{ p: { xs: 3, md: 4 }, bgcolor: isDark ? '#0e1624' : '#f8fafc' }}>
          <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4, display: { xs: 'none', sm: 'flex' } }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {status === 'rejected' && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {user?.verification?.rejectionReason || 'Your KYC was rejected. Update details and resubmit.'}
            </Alert>
          )}
          {status === 'submitted' && (
            <Alert severity="info" sx={{ mb: 3 }}>
              KYC submitted. You can resubmit if admin asks for correction.
            </Alert>
          )}
          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

          {activeStep === 0 && (
            <Stack spacing={3}>
              <Box sx={panelSx}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <TravelExplore sx={{ color: '#0f9f8f' }} />
                  <Typography variant="h6" fontWeight={900}>Account territory</Typography>
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                  <FormControl fullWidth>
                    <InputLabel>Region</InputLabel>
                    <Select label="Region" value={form.region} onChange={(event) => resetRegion(event.target.value as Region)}>
                      <MenuItem value="india">India</MenuItem>
                      <MenuItem value="international">International</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl fullWidth>
                    <InputLabel>Account type</InputLabel>
                    <Select label="Account type" value={form.accountType} onChange={(event) => setValue('accountType', event.target.value)}>
                      <MenuItem value="artist">Artist</MenuItem>
                      <MenuItem value="label">Label</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              <FieldShell title={form.accountType === 'artist' ? 'Artist details' : 'Label details'}>
                {form.accountType === 'artist' ? (
                  <TextField label="Artist name" value={form.artistName} onChange={(event) => setValue('artistName', event.target.value)} required />
                ) : (
                  <TextField label="Label name" value={form.labelName} onChange={(event) => setValue('labelName', event.target.value)} required />
                )}
                <TextField label="Legal name" value={form.legalName} onChange={(event) => setValue('legalName', event.target.value)} required />
                <TextField label="Phone number" value={form.phoneNumber} onChange={(event) => setValue('phoneNumber', event.target.value)} required />
                {form.accountType === 'artist' ? (
                  <>
                    <TextField label="Number of tracks" type="number" value={form.numberOfTracks} onChange={(event) => setValue('numberOfTracks', event.target.value)} />
                    <TextField label="Number of releases" type="number" value={form.numberOfReleases} onChange={(event) => setValue('numberOfReleases', event.target.value)} />
                  </>
                ) : (
                  <>
                    <FormControl fullWidth>
                      <InputLabel>Registration type</InputLabel>
                      <Select label="Registration type" value={form.registrationType} onChange={(event) => setValue('registrationType', event.target.value)}>
                        <MenuItem value="individual">Individual</MenuItem>
                        <MenuItem value="registered_company">Registered company</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField label="Total artists" type="number" value={form.totalArtists} onChange={(event) => setValue('totalArtists', event.target.value)} />
                    <TextField label="Catalog size" type="number" value={form.catalogSize} onChange={(event) => setValue('catalogSize', event.target.value)} />
                    <TextField label="Total revenue" type="number" value={form.totalRevenue} onChange={(event) => setValue('totalRevenue', event.target.value)} />
                  </>
                )}
              </FieldShell>
            </Stack>
          )}

          {activeStep === 1 && (
            <Stack spacing={3}>
              <Box sx={panelSx}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <LocationOnOutlined sx={{ color: '#0f9f8f' }} />
                  <Typography variant="h6" fontWeight={900}>Verified address</Typography>
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                  {isIndia ? (
                    <>
                      <TextField label="Country" value="India" disabled />
                      <Stack direction="row" spacing={1}>
                        <TextField label="Pincode" value={form.pincode} onChange={(event) => setValue('pincode', event.target.value.replace(/\D/g, '').slice(0, 6))} fullWidth required />
                        <Button variant="contained" onClick={lookupPincode} disabled={lookupLoading === 'pincode'} sx={{ minWidth: 110 }}>
                          {lookupLoading === 'pincode' ? <CircularProgress size={18} /> : 'Verify'}
                        </Button>
                      </Stack>
                      <TextField label="State" value={form.state} disabled required />
                      <FormControl fullWidth disabled={!postOffices.length}>
                        <InputLabel>City / post office</InputLabel>
                        <Select
                          label="City / post office"
                          value={form.city}
                          onChange={(event) => {
                            const office = postOffices.find((item) => `${item.District} - ${item.Name}` === event.target.value);
                            setHasKycDraft(true);
                            setForm((prev) => ({
                              ...prev,
                              city: String(event.target.value),
                              state: office?.State || prev.state,
                              country: office?.Country || prev.country,
                            }));
                          }}
                        >
                          {postOffices.map((office) => (
                            <MenuItem key={`${office.Name}-${office.Pincode}`} value={`${office.District} - ${office.Name}`}>
                              {office.District} - {office.Name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </>
                  ) : (
                    <>
                      <FormControl fullWidth>
                        <InputLabel>Country</InputLabel>
                        <Select
                          label="Country"
                          value={form.countryIso}
                          onChange={(event) => {
                            const country = countries.find((item) => item.iso2 === event.target.value);
                            setHasKycDraft(true);
                            setForm((prev) => ({
                              ...prev,
                              countryIso: country?.iso2 || '',
                              country: country?.name || '',
                              state: '',
                              stateIso: '',
                              city: '',
                            }));
                          }}
                        >
                          {countries.map((country) => (
                            <MenuItem key={country.iso2} value={country.iso2}>{country.name}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControl fullWidth disabled={!states.length}>
                        <InputLabel>State</InputLabel>
                        <Select
                          label="State"
                          value={form.stateIso}
                          onChange={(event) => {
                            const state = states.find((item) => item.iso2 === event.target.value);
                            setHasKycDraft(true);
                            setForm((prev) => ({ ...prev, stateIso: state?.iso2 || '', state: state?.name || '', city: '' }));
                          }}
                        >
                          {states.map((state) => (
                            <MenuItem key={state.iso2} value={state.iso2}>{state.name}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControl fullWidth disabled={!cities.length}>
                        <InputLabel>City</InputLabel>
                        <Select label="City" value={form.city} onChange={(event) => setValue('city', event.target.value)}>
                          {cities.map((city) => (
                            <MenuItem key={city.name} value={city.name}>{city.name}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField label="Postal / ZIP code" value={form.pincode} onChange={(event) => setValue('pincode', event.target.value)} required />
                    </>
                  )}
                  <TextField
                    label="Full address"
                    value={form.address}
                    onChange={(event) => setValue('address', event.target.value)}
                    multiline
                    minRows={3}
                    required
                    sx={{ gridColumn: { md: '1 / -1' } }}
                  />
                </Box>
              </Box>
            </Stack>
          )}

          {activeStep === 2 && (
            <Stack spacing={3}>
              <Box sx={panelSx}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <BadgeOutlined sx={{ color: '#0f9f8f' }} />
                  <Typography variant="h6" fontWeight={900}>Identity documents</Typography>
                </Stack>
                {isIndia ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                    <TextField label="Aadhaar number" value={form.aadhaarNumber} onChange={(event) => setValue('aadhaarNumber', event.target.value.replace(/\D/g, '').slice(0, 12))} required />
                    <TextField label="PAN number" value={form.panNumber} onChange={(event) => setValue('panNumber', event.target.value.toUpperCase().slice(0, 10))} required />
                    <UploadBox label="Aadhaar front" value={files.aadhaarFrontFile} restoredFileName={restoredFileNames.aadhaarFrontFile} required onChange={(file) => setFile('aadhaarFrontFile', file)} />
                    <UploadBox label="Aadhaar back" value={files.aadhaarBackFile} restoredFileName={restoredFileNames.aadhaarBackFile} required onChange={(file) => setFile('aadhaarBackFile', file)} />
                    <UploadBox label="PAN card" value={files.panCardFile} restoredFileName={restoredFileNames.panCardFile} required onChange={(file) => setFile('panCardFile', file)} />
                  </Box>
                ) : (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                    <TextField label="Government ID number" value={form.nationalIdNumber} onChange={(event) => setValue('nationalIdNumber', event.target.value)} required />
                    <UploadBox label="National ID front" value={files.nationalIdFrontFile} restoredFileName={restoredFileNames.nationalIdFrontFile} required onChange={(file) => setFile('nationalIdFrontFile', file)} />
                    <UploadBox label="National ID back" value={files.nationalIdBackFile} restoredFileName={restoredFileNames.nationalIdBackFile} onChange={(file) => setFile('nationalIdBackFile', file)} />
                  </Box>
                )}
              </Box>
            </Stack>
          )}

          {activeStep === 3 && (
            <Stack spacing={3}>
              <Box sx={panelSx}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  {isIndia ? <AccountBalance sx={{ color: '#0f9f8f' }} /> : <PaymentsOutlined sx={{ color: '#0f9f8f' }} />}
                  <Typography variant="h6" fontWeight={900}>{isIndia ? 'Bank payout' : 'PayPal payout'}</Typography>
                </Stack>
                {isIndia ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                    <TextField label="Account holder name" value={form.accountHolderName} onChange={(event) => setValue('accountHolderName', event.target.value)} required />
                    <TextField label="Account number" value={form.accountNumber} onChange={(event) => setValue('accountNumber', event.target.value.replace(/\D/g, ''))} required />
                    <TextField label="Confirm account number" value={form.confirmAccountNumber} onChange={(event) => setValue('confirmAccountNumber', event.target.value.replace(/\D/g, ''))} required />
                    <Stack direction="row" spacing={1}>
                      <TextField label="IFSC code" value={form.ifscCode} onChange={(event) => setValue('ifscCode', event.target.value.toUpperCase().slice(0, 11))} fullWidth required />
                      <Button variant="contained" onClick={lookupIfsc} disabled={lookupLoading === 'ifsc'} sx={{ minWidth: 110 }}>
                        {lookupLoading === 'ifsc' ? <CircularProgress size={18} /> : 'Verify'}
                      </Button>
                    </Stack>
                    <TextField label="Bank" value={form.bankName} disabled />
                    <TextField label="Branch" value={form.bankBranch} disabled />
                    <TextField label="Bank city" value={form.bankCity} disabled />
                    <TextField label="Bank state" value={form.bankState} disabled />
                  </Box>
                ) : (
                  <TextField label="PayPal email" value={form.paypalEmail} onChange={(event) => setValue('paypalEmail', event.target.value)} required fullWidth />
                )}
              </Box>
              <FormControlLabel
                control={<Switch checked={form.kycConsent} onChange={(event) => setValue('kycConsent', event.target.checked)} />}
                label="I confirm these details are accurate and consent to manual KYC review."
              />
            </Stack>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mt: 4 }}>
            <Button variant="outlined" disabled={activeStep === 0 || submitting} onClick={() => setActiveStep((prev) => prev - 1)}>
              Back
            </Button>
            {activeStep < steps.length - 1 ? (
              <Button variant="contained" onClick={goNext} endIcon={<CheckCircle />} sx={{ px: 4, fontWeight: 900 }}>
                Continue
              </Button>
            ) : (
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={18} /> : <CheckCircle />}
                sx={{ px: 4, fontWeight: 900 }}
              >
                {submitting ? 'Submitting' : status === 'submitted' ? 'Resubmit KYC' : 'Submit KYC'}
              </Button>
            )}
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
