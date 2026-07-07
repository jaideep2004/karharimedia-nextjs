'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { AccountBalance, AccountBalanceWallet, ArrowForward, Payment } from '@mui/icons-material';
import AuthGuard from '@/components/AuthGuard';
import { PremiumHeader, PremiumPanel } from '@/components/premium/PremiumSurface';
import { useAuth } from '@/context/AppContext';
import { payoutAPI, royaltyAPI } from '@/services/api';

type Method = 'bank_transfer' | 'paypal';

export default function PayoutsPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>}>
        <PayoutsContent />
      </Suspense>
    </AuthGuard>
  );
}

function PayoutsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const activeView = searchParams.get('view') === 'statement' || searchParams.get('view') === 'report'
    ? searchParams.get('view')!
    : 'method';
  const [method, setMethod] = useState<Method>('bank_transfer');
  const [form, setForm] = useState({
    paypalEmail: '',
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    branchName: '',
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [financeLoading, setFinanceLoading] = useState(false);
  const [royalties, setRoyalties] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const savedPayoutMethod = user?.payoutMethod?.method ? user.payoutMethod : null;

  useEffect(() => {
    if (savedPayoutMethod?.method) {
      setMethod(savedPayoutMethod.method);
      setForm((prev) => ({ ...prev, ...(savedPayoutMethod.details || {}) }));
      return;
    }
    const raw = window.localStorage.getItem('karharimedia-payment-method');
    if (!raw) return;
    try {
      const savedMethod = JSON.parse(raw);
      setMethod(savedMethod.method || 'bank_transfer');
      setForm((prev) => ({ ...prev, ...(savedMethod.details || {}) }));
    } catch {
      // Ignore malformed local state.
    }
  }, [savedPayoutMethod]);

  useEffect(() => {
    if (activeView === 'method') return;
    let mounted = true;
    const loadFinance = async () => {
      try {
        setFinanceLoading(true);
        const [royaltyResponse, payoutResponse] = await Promise.all([
          royaltyAPI.getRoyalties(),
          payoutAPI.getPayouts(),
        ]);
        if (!mounted) return;
        setRoyalties(Array.isArray(royaltyResponse?.data) ? royaltyResponse.data : []);
        setPayouts(Array.isArray(payoutResponse?.data) ? payoutResponse.data : []);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load payout reports');
      } finally {
        if (mounted) setFinanceLoading(false);
      }
    };
    void loadFinance();
    return () => {
      mounted = false;
    };
  }, [activeView]);

  const totalEarnings = useMemo(
    () => royalties.reduce((sum, item) => sum + Number(item.amount || item.earnings || 0), 0),
    [royalties]
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const saveMethod = async () => {
    try {
      setError('');
      if (savedPayoutMethod?.method) {
        setError('Payout method is already saved. Contact admin to change it.');
        return;
      }
      const payload = { method, details: form };
      window.localStorage.setItem(
        'karharimedia-payment-method',
        JSON.stringify({ ...payload, updatedAt: new Date().toISOString() })
      );
      await axios.put('/auth/me', { payoutMethod: payload });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payment method');
    }
  };

  const handleViewChange = (_event: React.SyntheticEvent, nextView: string) => {
    router.push(`/dashboard/payouts${nextView === 'method' ? '' : `?view=${nextView}`}`);
  };

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
        <PremiumHeader
          eyebrow="Finance"
          title="Payouts"
          description="Add a payment method, request eligible payouts, and review payout history."
        />

        {saved && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setSaved(false)}>Payment method saved.</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <PremiumPanel sx={{ mb: 2.5, overflow: 'hidden', p: { xs: 1, md: 1.25 } }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
            gap={1}
            sx={{
              minWidth: 0,
            }}
          >
            <Tabs
              value={activeView}
              onChange={handleViewChange}
              variant="scrollable"
              allowScrollButtonsMobile
              aria-label="payout sections"
              sx={{
                flex: 1,
                minWidth: 0,
                px: 1,
                '& .MuiTab-root': { textTransform: 'none', fontWeight: 800 },
              }}
            >
              <Tab value="method" label="Payment Method" />
              <Tab value="statement" label="Statement" />
              <Tab value="report" label="Report" />
            </Tabs>
            <Button
              component={Link}
              href="/dashboard/royalties?tab=payouts"
              variant="contained"
              endIcon={<ArrowForward />}
              sx={{ borderRadius: '12px', fontWeight: 900, minHeight: 42 }}
            >
              Request Payout
            </Button>
          </Stack>
        </PremiumPanel>

        {activeView === 'method' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.15fr 0.85fr' }, gap: 2.5 }}>
          <PremiumPanel sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>Payment Method</Typography>
                <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
                  India users should add bank transfer details. International users can use PayPal.
                </Typography>
              </Box>

              {savedPayoutMethod?.method && (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  Payout method is saved and locked. Contact admin to change bank or PayPal details.
                </Alert>
              )}

              <RadioGroup row value={method} onChange={(event) => setMethod(event.target.value as Method)}>
                <FormControlLabel disabled={Boolean(savedPayoutMethod?.method)} value="bank_transfer" control={<Radio />} label={<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><AccountBalance /> Bank Transfer</Box>} />
                <FormControlLabel disabled={Boolean(savedPayoutMethod?.method)} value="paypal" control={<Radio />} label={<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><Payment /> PayPal</Box>} />
              </RadioGroup>

              {method === 'paypal' ? (
                <TextField
                  label="PayPal Email"
                  type="email"
                  value={form.paypalEmail}
                  onChange={(event) => setForm((prev) => ({ ...prev, paypalEmail: event.target.value }))}
                  fullWidth
                  disabled={Boolean(savedPayoutMethod?.method)}
                />
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                  {[
                    ['accountHolderName', 'Account Holder Name'],
                    ['bankName', 'Bank Name'],
                    ['accountNumber', 'Account Number'],
                    ['ifscCode', 'IFSC Code'],
                    ['branchName', 'Branch Name'],
                  ].map(([key, label]) => (
                    <TextField
                      key={key}
                      label={label}
                      value={form[key as keyof typeof form]}
                      onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                      fullWidth
                      disabled={Boolean(savedPayoutMethod?.method)}
                    />
                  ))}
                </Box>
              )}

              <Button variant="contained" onClick={saveMethod} disabled={Boolean(savedPayoutMethod?.method)} sx={{ alignSelf: 'flex-start' }}>
                Save Payment Method
              </Button>
            </Stack>
          </PremiumPanel>

          <PremiumPanel sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={2}>
              <AccountBalanceWallet sx={{ fontSize: 52, color: 'primary.main' }} />
              <Typography variant="h5" sx={{ fontWeight: 900 }}>Minimum payout is $100</Typography>
              <Typography sx={{ color: 'text.secondary' }}>
                Payout requests are submitted from Royalties after enough balance is available. Saved method details help keep the request flow clear.
              </Typography>
              <Button component={Link} href="/dashboard/royalties?tab=payouts" variant="outlined">
                Open Payout History
              </Button>
            </Stack>
          </PremiumPanel>
        </Box>
        )}

        {activeView !== 'method' && (
          <PremiumPanel sx={{ p: { xs: 3, md: 4 } }}>
            {financeLoading ? (
              <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 220 }}>
                <CircularProgress />
              </Box>
            ) : activeView === 'statement' ? (
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 900 }}>Royalty Statement</Typography>
                  <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
                    Current earnings snapshot used for payout planning.
                  </Typography>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
                  <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Total Earnings</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900 }}>{formatCurrency(totalEarnings)}</Typography>
                  </Box>
                  <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Statement Rows</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900 }}>{royalties.length}</Typography>
                  </Box>
                  <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Payout Requests</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900 }}>{payouts.length}</Typography>
                  </Box>
                </Box>
                <Divider />
                <Stack spacing={1.25}>
                  {royalties.slice(0, 8).map((item, index) => (
                    <Box key={item._id || index} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                      <Typography sx={{ fontWeight: 700 }}>{item.trackTitle || item.title || 'Untitled Track'}</Typography>
                      <Typography sx={{ color: 'success.main', fontWeight: 900 }}>{formatCurrency(Number(item.amount || item.earnings || 0))}</Typography>
                    </Box>
                  ))}
                  {royalties.length === 0 && <Typography color="text.secondary">No statement rows yet.</Typography>}
                </Stack>
              </Stack>
            ) : (
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 900 }}>Payout Report</Typography>
                  <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
                    Recent payout request status and payment trail.
                  </Typography>
                </Box>
                <Stack spacing={1.5}>
                  {payouts.slice(0, 8).map((payout, index) => (
                    <Box key={payout._id || index} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                      <Box>
                        <Typography sx={{ fontWeight: 800 }}>{formatCurrency(Number(payout.amount || 0))}</Typography>
                        <Typography variant="caption" color="text.secondary">{payout.paymentMethod || 'Payment method pending'}</Typography>
                      </Box>
                      <Chip size="small" label={payout.status || 'pending'} color={payout.status === 'approved' ? 'success' : payout.status === 'rejected' ? 'error' : 'warning'} />
                    </Box>
                  ))}
                  {payouts.length === 0 && <Typography color="text.secondary">No payout reports yet.</Typography>}
                </Stack>
              </Stack>
            )}
          </PremiumPanel>
        )}
    </Box>
  );
}
