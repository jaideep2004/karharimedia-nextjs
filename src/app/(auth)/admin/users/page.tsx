'use client';
import { useCallback, useEffect, useState } from 'react';
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
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  useTheme,
  useMediaQuery,
  MenuItem,
  Alert,
} from '@mui/material';
import { 
  Search, 
  Edit, 
  Delete, 
  PersonAdd, 
  Visibility,
  Block,
  CheckCircle,
  VerifiedUser,
  Cancel,
} from '@mui/icons-material';
import { adminAPI } from '@/services/api';
import useAdminAuth from '@/hooks/useAdminAuth';
import { useAuth } from '@/context/AppContext';
import { useColorMode } from '@/context/ColorModeContext';
import { PremiumHeader, premiumSurfaceSx } from '@/components/premium/PremiumSurface';
import { isFullAdmin } from '@/lib/adminAccess';
import { resolveMediaUrl } from '@/lib/urlConfig';
import { toast } from 'sonner';

interface AdminUser {
  _id: string;
  name: string;
  email: string;
  profilePicture?: string;
  role: 'admin' | 'artist' | string;
  artistName?: string;
  isActive: boolean;
  createdAt: string;
  verification?: {
    status?: 'pending' | 'submitted' | 'approved' | 'rejected';
    rejectionReason?: string;
  };
}

const toAssetUrl = (value?: string) => {
  return resolveMediaUrl(value);
};

interface AdminUsersResponseData {
  users?: AdminUser[];
  total?: number;
  pagination?: {
    total?: number;
  };
}

export default function AdminUsersPage() {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { isAdmin } = useAdminAuth();
  const { mode } = useColorMode();
  const { user } = useAuth();
  const canCreateUsers = isFullAdmin(user);
  const [mounted, setMounted] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalUsers, setTotalUsers] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [kycFilter, setKycFilter] = useState('');
  const [reviewingKyc, setReviewingKyc] = useState<string | null>(null);

  // Set mounted state to true after component mounts
  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getUsers({
        page: page + 1,
        limit: rowsPerPage,
        search: searchTerm,
        status: kycFilter,
      });

      if (response.success && response.data) {
        const data = response.data as AdminUsersResponseData;
        const userData = data.users || [];

        if (Array.isArray(userData)) {
          setUsers(userData);
          setTotalUsers(data.total || data.pagination?.total || 0);
        } else {
          setUsers([]);
          setTotalUsers(0);
        }
      } else {
        setUsers([]);
        setTotalUsers(0);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
      setTotalUsers(0);
      showToast('Error fetching users', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, searchTerm, kycFilter]);

  useEffect(() => {
    if (isAdmin) {
      void fetchUsers();
    }
  }, [fetchUsers, isAdmin]);

  const handleChangePage = (_event: unknown, newPage: number) => {
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

  const handleEditUser = (userId: string) => {
    router.push(`/admin/users/${userId}`);
  };

  const handleViewUser = (userId: string) => {
    router.push(`/admin/users/${userId}`);
  };

  const handleCreateUser = () => {
    router.push('/admin/users/new');
  };

  const handleDeleteClick = (selectedUser: AdminUser) => {
    setUserToDelete(selectedUser);
    setDeleteDialogOpen(true);
  };

  const canDeleteUser = (selectedUser: AdminUser) =>
    canCreateUsers && selectedUser.role !== 'admin';

  const handleKycFilter = (event: React.ChangeEvent<HTMLInputElement>) => {
    setKycFilter(event.target.value);
    setPage(0);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;

    try {
      const response = await adminAPI.deleteUser(userToDelete._id);
      if (response.success) {
        showToast('User deleted successfully', 'success');
        void fetchUsers();
      } else {
        showToast(response.message || 'Failed to delete user', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete user';
      showToast(message, 'error');
    } finally {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const handleStatusToggle = async (selectedUser: AdminUser) => {
    try {
      setUpdatingStatus(selectedUser._id);
      const newStatus = !selectedUser.isActive;
      
      const response = await adminAPI.updateUser(selectedUser._id, {
        isActive: newStatus
      });
      
      if (response.success) {
        showToast(`User ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
        setUsers(prevUsers => 
          prevUsers.map(u => 
            u._id === selectedUser._id ? { ...u, isActive: newStatus } : u
          )
        );
      } else {
        showToast(response.message || `Failed to ${newStatus ? 'activate' : 'deactivate'} user`, 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update user status';
      showToast(message, 'error');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleKycReview = async (selectedUser: AdminUser, status: 'approved' | 'rejected') => {
    try {
      setReviewingKyc(selectedUser._id);
      const response = await adminAPI.reviewUserVerification(selectedUser._id, {
        status,
        rejectionReason: status === 'rejected' ? 'KYC details need correction. Please resubmit with valid information.' : undefined,
      });

      if (response.success) {
        showToast(`KYC ${status} successfully`, 'success');
        void fetchUsers();
      } else {
        showToast(response.message || 'Failed to update KYC', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update KYC';
      showToast(message, 'error');
    } finally {
      setReviewingKyc(null);
    }
  };

  const getKycChip = (status?: string) => {
    const normalized = status || 'pending';
    const color =
      normalized === 'approved' ? 'success' :
      normalized === 'rejected' ? 'error' :
      normalized === 'submitted' ? 'warning' :
      'info';

    return <Chip label={normalized} color={color as any} size="small" sx={{ height: 22, fontSize: '0.7rem', minWidth: 76 }} />;
  };

  const showToast = (message: string, severity: 'success' | 'error' | 'warning' | 'info') => {
    toast[severity](message);
  };

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  };

  // Show loading state until client-side hydration is complete
  if (!mounted) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '80vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

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
        eyebrow="Admin"
        title="User Management"
        description="Review artists, labels, KYC state, access rights, and account health from one command surface."
      />

      <Paper 
        sx={{ 
          p: 2, 
          mb: 3,
          ...premiumSurfaceSx(theme),
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: canCreateUsers ? 'minmax(280px, 1fr) auto 220px' : 'minmax(280px, 1fr) 220px',
            },
            gap: 2,
            alignItems: 'center',
          }}
        >
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Search users by name, email, or artist name..."
            value={searchTerm}
            onChange={handleSearch}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                '& fieldset': {
                  borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.23)',
                },
                '&:hover fieldset': {
                  borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: mode === 'dark' ? '#9bafff' : '#00e7ff',
                },
              },
            }}
          />
          {canCreateUsers && (
            <Button
              variant="contained"
              startIcon={<PersonAdd />}
              onClick={handleCreateUser}
              size={isMobile ? 'small' : 'medium'}
              sx={{
                minHeight: { md: 56 },
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 850,
                px: 2.5,
                whiteSpace: 'nowrap',
              }}
            >
              {isMobile ? 'Add User' : 'Add New User'}
            </Button>
          )}
          <TextField
            select
            label="KYC status"
            value={kycFilter}
            onChange={handleKycFilter}
          >
            <MenuItem value="">All KYC</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="submitted">Submitted</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
          </TextField>
        </Box>
      </Paper>

      <TableContainer 
        component={Paper}
        sx={{
          borderRadius: 2,
          border: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
          backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
        }}
      >
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>KYC</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Joined</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  <CircularProgress size={24} sx={{ mr: 2 }} />
                  Loading users...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    No users found. Try adjusting your search.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              users.map(user => {
                const profilePicture = toAssetUrl(user.profilePicture);
                return (
                <TableRow 
                  key={user._id} 
                  hover
                  sx={{
                    '&:last-child td, &:last-child th': { border: 0 },
                  }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {profilePicture ? (
                        <Box
                          component="img"
                          src={profilePicture}
                          alt={`${user.name} profile`}
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            mr: 1.5,
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            backgroundColor: mode === 'dark' ? 'primary.dark' : 'primary.light',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            mr: 1.5,
                            color: 'white',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                          }}
                        >
                          {user.name.charAt(0).toUpperCase()}
                        </Box>
                      )}
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {user.name}
                        </Typography>
                        {user.artistName && user.artistName !== user.name && (
                          <Typography variant="caption" color="text.secondary">
                            {user.artistName}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{user.email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.role}
                      color={user.role === 'admin' ? 'primary' : user.role === 'artist' ? 'secondary' : 'default'}
                      size="small"
                      sx={{ 
                        height: 20, 
                        fontSize: '0.7rem',
                        minWidth: 60
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {getKycChip(user.verification?.status)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={user.isActive ? 'Active' : 'Inactive'}
                      color={user.isActive ? 'success' : 'default'}
                      size="small"
                      sx={{ 
                        height: 20, 
                        fontSize: '0.7rem',
                        minWidth: 60
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="View User">
                      <IconButton 
                        size="small" 
                        onClick={() => handleViewUser(user._id)}
                        sx={{
                          mr: 0.5,
                          color: mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
                        }}
                      >
                        <Visibility fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit User">
                      <IconButton 
                        size="small" 
                        onClick={() => handleEditUser(user._id)}
                        sx={{
                          mr: 0.5,
                          color: mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
                        }}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={user.isActive ? "Deactivate User" : "Activate User"}>
                      <IconButton 
                        size="small" 
                        onClick={() => handleStatusToggle(user)}
                        disabled={updatingStatus === user._id}
                        sx={{
                          mr: 0.5,
                          color: user.isActive 
                            ? (mode === 'dark' ? '#f44336' : '#d32f2f') 
                            : (mode === 'dark' ? '#4caf50' : '#388e3c'),
                        }}
                      >
                        {updatingStatus === user._id ? (
                          <CircularProgress size={16} />
                        ) : user.isActive ? (
                          <Block fontSize="small" />
                        ) : (
                          <CheckCircle fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                    {user.role !== 'admin' && (
                      <>
                        <Tooltip title="Approve KYC">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleKycReview(user, 'approved')}
                              disabled={reviewingKyc === user._id || user.verification?.status === 'approved'}
                              sx={{ mr: 0.5, color: mode === 'dark' ? '#4ade80' : '#16a34a' }}
                            >
                              {reviewingKyc === user._id ? <CircularProgress size={16} /> : <VerifiedUser fontSize="small" />}
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Reject KYC">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleKycReview(user, 'rejected')}
                              disabled={reviewingKyc === user._id || user.verification?.status === 'rejected'}
                              sx={{ mr: 0.5, color: mode === 'dark' ? '#f87171' : '#dc2626' }}
                            >
                              <Cancel fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </>
                    )}
                    {canDeleteUser(user) && (
                      <Tooltip title="Delete User">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteClick(user)}
                          sx={{
                            color: mode === 'dark' ? '#f44336' : '#d32f2f',
                            '&:disabled': {
                              color: mode === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                            }
                          }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={totalUsers}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        sx={{
          '& .MuiTablePagination-select': {
            color: mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)',
          },
          '& .MuiTablePagination-displayedRows': {
            color: mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)',
          },
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        aria-labelledby="delete-user-dialog-title"
        aria-describedby="delete-user-dialog-description"
        PaperProps={{
          sx: {
            backgroundColor: mode === 'dark' ? '#1a1a2e' : '#ffffff',
            color: mode === 'dark' ? 'rgba(255, 255, 255, 0.87)' : 'rgba(0, 0, 0, 0.87)',
          }
        }}
      >
        <DialogTitle id="delete-user-dialog-title">
          Confirm User Deletion
        </DialogTitle>
        <DialogContent>
          <DialogContentText 
            id="delete-user-dialog-description"
            sx={{ 
              color: mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
              mb: 2
            }}
          >
            Are you sure you want to delete user <strong>{userToDelete?.name}</strong>?
            This action cannot be undone.
          </DialogContentText>
          {userToDelete?.role === 'admin' && (
            <Alert 
              severity="warning" 
              sx={{ 
                mb: 2,
                bgcolor: mode === 'dark' ? 'rgba(255, 152, 0, 0.1)' : 'rgba(255, 152, 0, 0.1)',
                color: mode === 'dark' ? '#ffcc80' : '#ff9800',
              }}
            >
              This user is an administrator. Deleting admin users may affect system access.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleCloseDeleteDialog}
            sx={{
              color: mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            color="error" 
            variant="contained"
            autoFocus
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
