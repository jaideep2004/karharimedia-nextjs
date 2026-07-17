'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SelectChangeEvent } from '@mui/material/Select';
import {
  AccountBalance,
  AddCircleOutline,
  Download,
  MonetizationOn,
  Payment,
  Refresh,
  RequestQuote,
  ShowChart,
  TrendingUp,
} from '@mui/icons-material';
import { Controller, useForm } from 'react-hook-form';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AuthGuard from '@/components/AuthGuard';
import { payoutAPI, royaltyAPI } from '@/services/api';
import { PremiumHeader } from '@/components/premium/PremiumSurface';

type PaymentMethod = 'bank_transfer' | 'paypal';

interface PayoutFormData {
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDetails: string;
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
}

interface RoyaltyItem {
  _id?: string;
  trackId?: string;
  trackTitle?: string;
  store?: string;
  streams?: number;
  amount?: number;
  date?: string;
}

interface PayoutItem {
  _id?: string;
  amount?: number;
  paymentMethod?: PaymentMethod;
  paymentDetails?: string;
  status?: 'approved' | 'pending' | 'rejected' | string;
  reason?: string;
  createdAt?: string;
}

interface TrackOption {
  id: string;
  title: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];



function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`royalty-tabpanel-${index}`}
      aria-labelledby={`royalty-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: { xs: 2, sm: 3 } }}>{children}</Box>}
    </div>
  );
}

function formatCurrency(amount = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(dateString?: string) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatChartCurrency(value: unknown): [string, string] {
  return [formatCurrency(normalizeNumber(value)), 'Earnings'];
}

function buildCsv(rows: RoyaltyItem[]) {
  const header = ['Track', 'Platform', 'Streams', 'Earnings', 'Date'];
  const body = rows.map((row) => [
    row.trackTitle || 'Untitled Track',
    row.store || 'Unknown',
    normalizeNumber(row.streams).toString(),
    normalizeNumber(row.amount).toFixed(2),
    formatDate(row.date),
  ]);

  return [header, ...body]
    .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export default function RoyaltiesPage() {
  return (
    <AuthGuard>
      <RoyaltiesContent />
    </AuthGuard>
  );
}

function RoyaltiesContent() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const chartColors = [theme.palette.primary.main, '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#8b5cf6'];
  const router = useRouter();
  const searchParams = useSearchParams();

  const getTabFromQuery = useCallback(() => {
    const view = searchParams.get('view');
    if (view === 'report') return 1;
    if (searchParams.get('tab') === 'payouts') return 2;
    return 0;
  }, [searchParams]);

  const [activeTab, setActiveTab] = useState(getTabFromQuery);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [royaltyData, setRoyaltyData] = useState<RoyaltyItem[]>([]);
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedTrack, setSelectedTrack] = useState('all');
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);
  const [payoutSuccess, setPayoutSuccess] = useState(false);
  const [tracks, setTracks] = useState<TrackOption[]>([]);

  const years = useMemo(() => Array.from({ length: 5 }, (_, index) => currentYear - index), [currentYear]);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<PayoutFormData>({
    defaultValues: {
      amount: 0,
      paymentMethod: 'paypal',
      paymentDetails: '',
      accountHolderName: '',
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      branchName: '',
    },
  });

  const selectedPaymentMethod = watch('paymentMethod');

  const surfaceSx = {
    bgcolor: isDark ? '#111827' : '#ffffff',
    border: '1px solid',
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
    boxShadow: isDark ? '0 18px 50px rgba(0,0,0,0.28)' : '0 18px 45px rgba(15,23,42,0.06)',
  };

  const mutedText = isDark ? 'rgba(255,255,255,0.48)' : 'rgba(15,23,42,0.52)';
  const headingText = isDark ? '#f1f5f9' : '#0f172a';

  const fetchRoyaltyData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await royaltyAPI.getRoyaltyReports(currentYear, currentMonth + 1);

      if (response.success) {
        let data: RoyaltyItem[] = Array.isArray(response.data) ? response.data : [];
        if (selectedTrack !== 'all') {
          data = data.filter((item) => item.trackId === selectedTrack);
        }

        setRoyaltyData(data);
        setBalance(data.reduce((sum, item) => sum + normalizeNumber(item.amount), 0));
      } else {
        setError(response.message || 'Failed to load royalty data');
        setRoyaltyData([]);
        setBalance(0);
      }
    } catch (err: any) {
      console.error('Error fetching royalties:', err);
      setError(err.message || 'An error occurred while fetching royalty data');
      setRoyaltyData([]);
      setBalance(0);
    } finally {
      setIsLoading(false);
    }
  }, [currentMonth, currentYear, selectedTrack]);

  const fetchPayouts = useCallback(async () => {
    try {
      const response = await payoutAPI.getPayouts();
      if (response.success) {
        setPayouts(Array.isArray(response.data) ? response.data : []);
      }
    } catch (err) {
      console.error('Error fetching payouts:', err);
    }
  }, []);

  const fetchTracks = useCallback(async () => {
    try {
      const response = await royaltyAPI.getRoyalties();
      if (response.success) {
        const royaltyItems: RoyaltyItem[] = Array.isArray(response.data) ? response.data : [];
        const uniqueTracks = Array.from(new Set(royaltyItems.map((item) => item.trackId).filter(Boolean))).map(
          (trackId) => {
            const track = royaltyItems.find((item) => item.trackId === trackId);
            return {
              id: String(trackId),
              title: track?.trackTitle || 'Untitled Track',
            };
          }
        );

        setTracks(uniqueTracks);
      }
    } catch (err) {
      console.error('Error fetching tracks:', err);
    }
  }, []);

  useEffect(() => {
    fetchRoyaltyData();
  }, [fetchRoyaltyData]);

  useEffect(() => {
    fetchPayouts();
    fetchTracks();
  }, [fetchPayouts, fetchTracks]);

  useEffect(() => {
    setActiveTab(getTabFromQuery());
  }, [getTabFromQuery]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    const next = newValue === 1 ? '?view=report' : newValue === 2 ? '?tab=payouts' : '?view=statement';
    router.push(`/dashboard/royalties${next}`);
  };

  const handleMonthChange = (event: SelectChangeEvent<number>) => {
    setCurrentMonth(Number(event.target.value));
  };

  const handleYearChange = (event: SelectChangeEvent<number>) => {
    setCurrentYear(Number(event.target.value));
  };

  const handleTrackChange = (event: SelectChangeEvent<string>) => {
    setSelectedTrack(event.target.value);
  };

  const onPayoutSubmit = async (data: PayoutFormData) => {
    try {
      setIsSubmittingPayout(true);
      setError(null);

      const response = await payoutAPI.requestPayout({
        amount: data.amount,
        currency: 'USD',
        paymentMethod: data.paymentMethod,
        paymentDetails:
          data.paymentMethod === 'paypal'
            ? { paypalEmail: data.paymentDetails }
            : {
                country: 'IN',
                accountHolderName: data.accountHolderName,
                bankName: data.bankName,
                accountNumber: data.accountNumber,
                ifscCode: data.ifscCode,
                branchName: data.branchName,
              },
      });

      if (response.success) {
        setPayoutSuccess(true);
        setShowPayoutForm(false);
        reset();
        fetchPayouts();
      } else {
        setError(response.message || 'Failed to submit payout request');
      }
    } catch (err: any) {
      console.error('Error requesting payout:', err);
      setError(err.message || 'An error occurred while submitting your payout request');
    } finally {
      setIsSubmittingPayout(false);
    }
  };

  const storeChartData = useMemo(() => {
    const totals = new Map<string, number>();
    royaltyData.forEach((item) => {
      const store = item.store || 'Unknown';
      totals.set(store, (totals.get(store) || 0) + normalizeNumber(item.amount));
    });

    return Array.from(totals.entries()).map(([name, amount]) => ({ name, amount }));
  }, [royaltyData]);

  const trackChartData = useMemo(() => {
    const totals = new Map<string, number>();
    royaltyData.forEach((item) => {
      const track = item.trackTitle || 'Untitled Track';
      totals.set(track, (totals.get(track) || 0) + normalizeNumber(item.amount));
    });

    return Array.from(totals.entries()).map(([name, amount]) => ({ name, amount }));
  }, [royaltyData]);

  const totalStreams = useMemo(
    () => royaltyData.reduce((sum, item) => sum + normalizeNumber(item.streams), 0),
    [royaltyData]
  );

  const pendingPayouts = useMemo(
    () => payouts.filter((payout) => payout.status === 'pending').length,
    [payouts]
  );

  const approvedPayoutTotal = useMemo(
    () =>
      payouts
        .filter((payout) => payout.status === 'approved')
        .reduce((sum, payout) => sum + normalizeNumber(payout.amount), 0),
    [payouts]
  );

  const kpis = [
    {
      label: 'Selected Earnings',
      value: formatCurrency(balance),
      helper: `${months[currentMonth]} ${currentYear}`,
      icon: <MonetizationOn />,
      color: '#10b981',
    },
    {
      label: 'Reported Streams',
      value: totalStreams.toLocaleString(),
      helper: selectedTrack === 'all' ? 'All tracks' : 'Filtered track',
      icon: <ShowChart />,
      color: theme.palette.primary.main,
    },
    {
      label: 'Pending Payouts',
      value: pendingPayouts.toString(),
      helper: `${payouts.length} total requests`,
      icon: <RequestQuote />,
      color: '#f59e0b',
    },
    {
      label: 'Paid Out',
      value: formatCurrency(approvedPayoutTotal),
      helper: 'Approved requests',
      icon: <TrendingUp />,
      color: '#14b8a6',
    },
  ];

  const getPayoutStatusStyle = (status?: string) => {
    const styles: Record<string, { color: string; bg: string; label: string }> = {
      approved: {
        color: '#10b981',
        bg: isDark ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.09)',
        label: 'Approved',
      },
      pending: {
        color: '#f59e0b',
        bg: isDark ? 'rgba(245,158,11,0.14)' : 'rgba(245,158,11,0.09)',
        label: 'Pending',
      },
      rejected: {
        color: '#ef4444',
        bg: isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.09)',
        label: 'Rejected',
      },
    };

    return styles[status || 'pending'] || styles.pending;
  };

  const downloadCsv = () => {
    if (royaltyData.length === 0) return;

    const blob = new Blob([buildCsv(royaltyData)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `royalties-${currentYear}-${String(currentMonth + 1).padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderLoadingPanel = () => (
    <Box sx={{ py: 5 }}>
      <Skeleton variant="rounded" height={240} sx={{ borderRadius: '14px' }} />
    </Box>
  );

  const renderEmptyState = (message: string) => (
    <Box
      sx={{
        py: 6,
        px: 2,
        textAlign: 'center',
        borderRadius: '14px',
        border: '1px dashed',
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.14)',
        bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.02)',
      }}
    >
      <Typography sx={{ fontWeight: 700, color: headingText }}>No royalty data found</Typography>
      <Typography variant="body2" sx={{ mt: 0.75, color: mutedText }}>
        {message}
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <PremiumHeader
        eyebrow="Earnings"
        title="Royalties & Earnings"
        description="Track revenue, export statements, and manage payout requests from a finance-grade workspace."
        action={<Button
          variant="contained"
          startIcon={<AddCircleOutline />}
          onClick={() => setShowPayoutForm(true)}
          disabled={balance <= 0 || showPayoutForm}
          sx={{
            px: 2.4,
            py: 1,
            borderRadius: '10px',
            fontWeight: 700,
            bgcolor: '#10b981',
            boxShadow: isDark ? '0 10px 24px rgba(16,185,129,0.18)' : '0 10px 24px rgba(16,185,129,0.22)',
            '&:hover': { bgcolor: '#059669' },
          }}
        >
          Request Payout
        </Button>}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: '12px' }}>
          {error}
        </Alert>
      )}

      {payoutSuccess && (
        <Alert severity="success" sx={{ mb: 3, borderRadius: '12px' }} onClose={() => setPayoutSuccess(false)}>
          Payout request submitted. Status will update after review.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 4 }}>
        {kpis.map((kpi) => (
          <Box
            key={kpi.label}
            sx={{
              ...surfaceSx,
              p: { xs: 1.75, sm: 2.25 },
              borderRadius: '14px',
              minHeight: 118,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: '10px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: `${kpi.color}18`,
                  color: kpi.color,
                  '& .MuiSvgIcon-root': { fontSize: 20 },
                }}
              >
                {kpi.icon}
              </Box>
              <Chip
                label={kpi.helper}
                size="small"
                sx={{
                  maxWidth: 128,
                  height: 24,
                  borderRadius: '6px',
                  bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
                  color: mutedText,
                  fontSize: '0.68rem',
                  fontWeight: 600,
                }}
              />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.25rem', sm: '1.45rem' }, color: headingText }}>
              {isLoading && kpi.label === 'Selected Earnings' ? <CircularProgress size={20} /> : kpi.value}
            </Typography>
            <Typography sx={{ mt: 0.5, fontSize: '0.76rem', fontWeight: 600, color: mutedText }}>
              {kpi.label}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: showPayoutForm ? '1.4fr 1fr' : '1fr' }, gap: 2.5, mb: 4 }}>
        <Box
          sx={{
            ...surfaceSx,
            p: { xs: 2, sm: 2.5 },
            borderRadius: '14px',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: { xs: 'flex-start', md: 'center' },
              justifyContent: 'space-between',
              flexDirection: { xs: 'column', md: 'row' },
              gap: 2,
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 800, color: headingText }}>Royalty Statement</Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: mutedText }}>
                Filter reports by period and track before exporting or requesting payout.
              </Typography>
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '140px 120px minmax(180px, 1fr) auto auto' },
                gap: 1.25,
                width: { xs: '100%', md: 'auto' },
                alignItems: 'center',
              }}
            >
              <FormControl size="small" fullWidth>
                <InputLabel id="month-select-label">Month</InputLabel>
                <Select
                  labelId="month-select-label"
                  value={currentMonth}
                  label="Month"
                  onChange={handleMonthChange}
                >
                  {months.map((month, index) => (
                    <MenuItem key={month} value={index}>
                      {month}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="year-select-label">Year</InputLabel>
                <Select labelId="year-select-label" value={currentYear} label="Year" onChange={handleYearChange}>
                  {years.map((year) => (
                    <MenuItem key={year} value={year}>
                      {year}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="track-select-label">Track</InputLabel>
                <Select
                  labelId="track-select-label"
                  value={selectedTrack}
                  label="Track"
                  onChange={handleTrackChange}
                >
                  <MenuItem value="all">All Tracks</MenuItem>
                  {tracks.map((track) => (
                    <MenuItem key={track.id} value={track.id}>
                      {track.title}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                startIcon={<Refresh />}
                onClick={fetchRoyaltyData}
                disabled={isLoading}
                sx={{ height: 40, borderRadius: '10px', fontWeight: 700 }}
              >
                Refresh
              </Button>
              <Tooltip title="Download CSV report">
                <span>
                  <IconButton
                    color="primary"
                    onClick={downloadCsv}
                    disabled={royaltyData.length === 0}
                    sx={{
                      width: 40,
                      height: 40,
                      border: '1px solid',
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)',
                      borderRadius: '10px',
                    }}
                  >
                    <Download />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </Box>

        {showPayoutForm && (
          <Box
            sx={{
              ...surfaceSx,
              p: { xs: 2, sm: 2.5 },
              borderRadius: '14px',
            }}
          >
            <Typography sx={{ fontWeight: 800, color: headingText, mb: 0.5 }}>New payout request</Typography>
            <Typography variant="body2" sx={{ color: mutedText, mb: 2 }}>
              Available amount for selected statement: {formatCurrency(balance)}
            </Typography>
            <form onSubmit={handleSubmit(onPayoutSubmit)}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <Controller
                  name="amount"
                  control={control}
                  rules={{
                    required: 'Amount is required',
                    min: { value: 100, message: 'Minimum payout is $100' },
                    max: {
                      value: balance,
                      message: `Amount cannot exceed ${formatCurrency(balance)}`,
                    },
                  }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Amount"
                      type="number"
                      fullWidth
                      size="small"
                      error={!!errors.amount}
                      helperText={errors.amount?.message}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      }}
                      disabled={isSubmittingPayout}
                    />
                  )}
                />
                <Controller
                  name="paymentMethod"
                  control={control}
                  rules={{ required: 'Payment method is required' }}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.paymentMethod}>
                      <FormLabel sx={{ mb: 0.5, fontSize: '0.78rem', fontWeight: 700 }}>Payment Method</FormLabel>
                      <RadioGroup {...field} row>
                        <FormControlLabel
                          value="paypal"
                          control={<Radio size="small" />}
                          label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Payment fontSize="small" /> PayPal</Box>}
                          disabled={isSubmittingPayout}
                        />
                        <FormControlLabel
                          value="bank_transfer"
                          control={<Radio size="small" />}
                          label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><AccountBalance fontSize="small" /> India Bank</Box>}
                          disabled={isSubmittingPayout}
                        />
                      </RadioGroup>
                      {errors.paymentMethod && <FormHelperText>{errors.paymentMethod.message}</FormHelperText>}
                    </FormControl>
                  )}
                />
                {selectedPaymentMethod === 'paypal' ? (
                <Box sx={{ gridColumn: '1 / -1' }}>
                  <Controller
                    name="paymentDetails"
                    control={control}
                    rules={{ required: 'PayPal email is required' }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="PayPal Email"
                        fullWidth
                        size="small"
                        error={!!errors.paymentDetails}
                        helperText={errors.paymentDetails?.message}
                        disabled={isSubmittingPayout}
                      />
                    )}
                  />
                </Box>
                ) : (
                  <>
                    {[
                      ['accountHolderName', 'Account Holder Name'],
                      ['bankName', 'Bank Name'],
                      ['accountNumber', 'Account Number'],
                      ['ifscCode', 'IFSC Code'],
                      ['branchName', 'Branch Name'],
                    ].map(([name, label]) => (
                      <Controller
                        key={name}
                        name={name as keyof PayoutFormData}
                        control={control}
                        rules={{ required: `${label} is required` }}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            label={label}
                            fullWidth
                            size="small"
                            error={!!errors[name as keyof PayoutFormData]}
                            helperText={errors[name as keyof PayoutFormData]?.message as string}
                            disabled={isSubmittingPayout}
                          />
                        )}
                      />
                    ))}
                  </>
                )}
                <Box sx={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      setShowPayoutForm(false);
                      reset();
                    }}
                    disabled={isSubmittingPayout}
                    sx={{ borderRadius: '10px', fontWeight: 700 }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={isSubmittingPayout}
                    startIcon={isSubmittingPayout ? <CircularProgress size={16} /> : null}
                    sx={{ borderRadius: '10px', fontWeight: 700 }}
                  >
                    {isSubmittingPayout ? 'Submitting' : 'Submit'}
                  </Button>
                </Box>
              </Box>
            </form>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          ...surfaceSx,
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ borderBottom: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            aria-label="royalty tabs"
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{
              px: 1,
              minHeight: 46,
              '& .MuiTab-root': {
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.84rem',
                minHeight: 46,
                color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)',
                '&.Mui-selected': { color: theme.palette.primary.main },
              },
              '& .MuiTabs-indicator': {
                height: 2,
                borderRadius: '1px 1px 0 0',
                bgcolor: theme.palette.primary.main,
              },
            }}
          >
            <Tab label="Statement" id="royalty-tab-0" />
            <Tab label="Report" id="royalty-tab-1" />
            <Tab label="Payout History" id="royalty-tab-2" />
          </Tabs>
        </Box>

        <TabPanel value={activeTab} index={0}>
          {isLoading ? (
            renderLoadingPanel()
          ) : royaltyData.length === 0 ? (
            renderEmptyState('Try a different month, year, or track filter.')
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' }, gap: 2.5 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: '14px',
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                  bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.015)',
                  height: 340,
                }}
              >
                <Typography sx={{ fontWeight: 800, color: headingText, mb: 2 }}>Earnings by Platform</Typography>
                <ResponsiveContainer width="100%" height="88%">
                  <BarChart data={storeChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: mutedText }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(value) => `$${value}`} tick={{ fontSize: 11, fill: mutedText }} axisLine={false} tickLine={false} />
                    <RechartsTooltip
                      formatter={formatChartCurrency}
                      contentStyle={{ background: isDark ? '#1a2035' : '#fff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)'}`, borderRadius: 10, fontSize: '0.8rem' }}
                    />
                    <Bar dataKey="amount" fill={theme.palette.primary.main} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
              <Box
                sx={{
                  p: 2,
                  borderRadius: '14px',
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                  bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.015)',
                  height: 340,
                }}
              >
                <Typography sx={{ fontWeight: 800, color: headingText, mb: 1 }}>Top Track Split</Typography>
                <ResponsiveContainer width="100%" height="70%">
                  <PieChart>
                    <Pie data={trackChartData} dataKey="amount" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                      {trackChartData.map((entry, index) => (
                        <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={formatChartCurrency}
                      contentStyle={{ background: isDark ? '#1a2035' : '#fff', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)'}`, borderRadius: 10, fontSize: '0.8rem' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <Box sx={{ display: 'grid', gap: 0.75 }}>
                  {trackChartData.slice(0, 4).map((track, index) => (
                    <Box key={track.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: chartColors[index % chartColors.length] }} />
                      <Typography sx={{ flex: 1, color: mutedText, fontSize: '0.78rem' }} noWrap>
                        {track.name}
                      </Typography>
                      <Typography sx={{ color: headingText, fontSize: '0.78rem', fontWeight: 700 }}>
                        {formatCurrency(track.amount)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          )}
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
            <Box>
              <Typography sx={{ fontWeight: 800, color: headingText }}>Detailed Earnings Report</Typography>
              <Typography variant="body2" sx={{ color: mutedText }}>
                {royaltyData.length} rows for {months[currentMonth]} {currentYear}
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={downloadCsv}
              disabled={royaltyData.length === 0}
              sx={{ borderRadius: '10px', fontWeight: 700 }}
            >
              Export
            </Button>
          </Box>

          {isLoading ? (
            renderLoadingPanel()
          ) : royaltyData.length === 0 ? (
            renderEmptyState('No rows match the selected statement filters.')
          ) : (
            <TableContainer
              component={Box}
              sx={{
                borderRadius: '14px',
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                maxHeight: 520,
              }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {['Track', 'Platform', 'Streams', 'Earnings', 'Date'].map((header) => (
                      <TableCell
                        key={header}
                        align={header === 'Earnings' ? 'right' : 'left'}
                        sx={{
                          fontWeight: 800,
                          color: headingText,
                          bgcolor: isDark ? '#111827' : '#f8fafc',
                          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                        }}
                      >
                        {header}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {royaltyData.map((item, index) => (
                    <TableRow
                      key={item._id || `${item.trackId}-${item.store}-${item.date}-${index}`}
                      hover
                      sx={{
                        '& td': {
                          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
                        },
                      }}
                    >
                      <TableCell sx={{ color: headingText, fontWeight: 700 }}>{item.trackTitle || 'Untitled Track'}</TableCell>
                      <TableCell sx={{ color: mutedText }}>{item.store || 'Unknown'}</TableCell>
                      <TableCell sx={{ color: mutedText }}>{normalizeNumber(item.streams).toLocaleString()}</TableCell>
                      <TableCell align="right" sx={{ color: '#10b981', fontWeight: 800 }}>
                        {formatCurrency(normalizeNumber(item.amount))}
                      </TableCell>
                      <TableCell sx={{ color: mutedText }}>{formatDate(item.date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontWeight: 800, color: headingText }}>Payout Request History</Typography>
            <Typography variant="body2" sx={{ color: mutedText }}>
              Review pending, approved, and rejected withdrawal requests.
            </Typography>
          </Box>

          {payouts.length === 0 ? (
            renderEmptyState("You haven't made any payout requests yet.")
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
              {payouts.map((payout, index) => {
                const status = getPayoutStatusStyle(payout.status);

                return (
                  <Box
                    key={payout._id || index}
                    sx={{
                      height: '100%',
                      borderRadius: '14px',
                      bgcolor: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                      border: '1px solid',
                      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                      p: 2.25,
                      transition: 'border-color 150ms ease',
                      '&:hover': {
                        borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.14)',
                      },
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
                      <Box>
                        <Typography sx={{ fontSize: '0.76rem', fontWeight: 700, color: mutedText }}>
                          Request #{(payout._id || 'pending').slice(0, 8)}
                        </Typography>
                        <Typography sx={{ mt: 0.5, fontWeight: 800, fontSize: '1.35rem', color: headingText }}>
                          {formatCurrency(normalizeNumber(payout.amount))}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          alignSelf: 'flex-start',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.75,
                          px: 1,
                          py: 0.45,
                          borderRadius: '7px',
                          bgcolor: status.bg,
                          color: status.color,
                          fontSize: '0.72rem',
                          fontWeight: 800,
                        }}
                      >
                        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: status.color }} />
                        {status.label}
                      </Box>
                    </Box>

                    <Divider sx={{ my: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }} />

                    <Box sx={{ display: 'grid', gap: 1.25 }}>
                      <Box>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: mutedText }}>Requested</Typography>
                        <Typography sx={{ color: headingText, fontWeight: 700 }}>{formatDate(payout.createdAt)}</Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: mutedText }}>Payment Method</Typography>
                        <Typography sx={{ color: headingText, fontWeight: 700 }}>
                          {payout.paymentMethod === 'bank_transfer' ? 'Bank Transfer' : 'PayPal'}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: mutedText }}>Payment Details</Typography>
                        <Tooltip title={payout.paymentDetails || ''}>
                          <Typography sx={{ color: headingText, fontWeight: 700 }} noWrap>
                            {payout.paymentDetails || 'N/A'}
                          </Typography>
                        </Tooltip>
                      </Box>
                    </Box>

                    {payout.status === 'rejected' && payout.reason && (
                      <Alert severity="error" sx={{ mt: 2, borderRadius: '10px' }}>
                        {payout.reason}
                      </Alert>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </TabPanel>
      </Box>
    </Box>
  );
}
