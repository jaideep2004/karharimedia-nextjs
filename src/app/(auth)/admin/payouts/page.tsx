'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  Chip,
  Tooltip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SelectChangeEvent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
} from '@mui/material';
import { Search, CheckCircle, Cancel, MonetizationOn } from '@mui/icons-material';
import { adminAPI, payoutAPI } from '@/services/api';
import useAdminAuth from '@/hooks/useAdminAuth';
import { useColorMode } from '@/context/ColorModeContext';
import { PremiumHeader, premiumSurfaceSx } from '@/components/premium/PremiumSurface';

export default function AdminPayoutsPage() {
  const router = useRouter();
  const { isAdmin } = useAdminAuth();

  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [totalPayouts, setTotalPayouts] = useState(0);
  const [selectedPayout, setSelectedPayout] = useState<any>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const { mode } = useColorMode();

  useEffect(() => {
    if (isAdmin) {
      fetchPayouts();
    }
  }, [isAdmin, page, rowsPerPage, searchTerm, statusFilter]);

  const fetchPayouts = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: page + 1,
        limit: rowsPerPage,
        search: searchTerm,
      };

      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const response = await adminAPI.getPayouts(params);

      if (response.success && response.data) {
        const payoutData = response.data as any;
        const payoutRows = Array.isArray(payoutData)
          ? payoutData
          : Array.isArray(payoutData.payouts)
            ? payoutData.payouts
            : [];
        setPayouts(payoutRows);
        setTotalPayouts(payoutData.total || payoutRows.length);
      }
    } catch (error) {
      console.error('Error fetching payouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(0);
  };

  const handleStatusFilterChange = (event: SelectChangeEvent) => {
    setStatusFilter(event.target.value);
    setPage(0);
  };

  const handleApproveClick = (payout: any) => {
    setSelectedPayout(payout);
    setApproveDialogOpen(true);
  };

  const handleRejectClick = (payout: any) => {
    setSelectedPayout(payout);
    setRejectionReason('');
    setRejectDialogOpen(true);
  };

  const handleApprovePayout = async () => {
    if (!selectedPayout) return;

    try {
      const response = await payoutAPI.updatePayoutStatus(selectedPayout._id, 'approved');
      if (response.success) {
        fetchPayouts();
      }
    } catch (error) {
      console.error('Error approving payout:', error);
    } finally {
      setApproveDialogOpen(false);
      setSelectedPayout(null);
    }
  };

  const handleRejectPayout = async () => {
    if (!selectedPayout) return;

    try {
      const response = await payoutAPI.updatePayoutStatus(
        selectedPayout._id,
        'rejected',
        rejectionReason
      );

      if (response.success) {
        fetchPayouts();
      }
    } catch (error) {
      console.error('Error rejecting payout:', error);
    } finally {
      setRejectDialogOpen(false);
      setSelectedPayout(null);
      setRejectionReason('');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'pending':
        return 'warning';
      case 'rejected':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (isAdmin === null) {
    return <div>Loading...</div>;
  }

  if (isAdmin === false) {
    router.push('/login');
    return null;
  }

  return (
    <Box>
      <PremiumHeader
        eyebrow="Finance Ops"
        title="Payout Management"
        description="Review payout requests, approve clean payments, reject exceptions, and keep balances auditable."
      />

      <Paper sx={{ ...premiumSurfaceSx({ palette: { mode } } as any), p: 2, mb: 3, display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search payouts..."
          value={searchTerm}
          onChange={handleSearch}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search />
              </InputAdornment>
            ),
          }}
        />
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel id="status-filter-label">Status</InputLabel>
          <Select
            labelId="status-filter-label"
            value={statusFilter}
            label="Status"
            onChange={handleStatusFilterChange}
          >
            <MenuItem value="all">All Statuses</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
          </Select>
        </FormControl>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Artist</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Payment Method</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Request Date</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                  Loading payouts...
                </TableCell>
              </TableRow>
            ) : payouts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                  No payouts found
                </TableCell>
              </TableRow>
            ) : (
              payouts.map(payout => (
                <TableRow key={payout._id} hover>
                  <TableCell>{payout.artistName}</TableCell>
                  <TableCell>{formatCurrency(payout.amount)}</TableCell>
                  <TableCell>
                    {payout.paymentMethod ? (
                      <Chip label={payout.paymentMethod.toUpperCase()} size="small" />
                    ) : (
                      '--'
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={payout.status}
                      color={getStatusColor(payout.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{new Date(payout.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell align="right">
                    {payout.status === 'pending' && (
                      <>
                        <Tooltip title="Approve Payout">
                          <IconButton color="success" onClick={() => handleApproveClick(payout)}>
                            <CheckCircle />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reject Payout">
                          <IconButton color="error" onClick={() => handleRejectClick(payout)}>
                            <Cancel />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={totalPayouts}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onClose={() => setApproveDialogOpen(false)}>
        <DialogTitle>Approve Payout</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to approve this payout of{' '}
            {formatCurrency(selectedPayout?.amount || 0)}
            to {selectedPayout?.artistName}?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleApprovePayout}
            variant="contained"
            color="success"
            startIcon={<CheckCircle />}
          >
            Approve
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)}>
        <DialogTitle>Reject Payout</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Are you sure you want to reject this payout of{' '}
            {formatCurrency(selectedPayout?.amount || 0)}
            to {selectedPayout?.artistName}?
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Reason for rejection"
            fullWidth
            variant="outlined"
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleRejectPayout}
            variant="contained"
            color="error"
            startIcon={<Cancel />}
            disabled={!rejectionReason.trim()}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
