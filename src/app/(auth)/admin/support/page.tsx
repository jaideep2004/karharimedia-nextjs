'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AttachFile,
  AssignmentInd,
  Clear,
  DoneAll,
  Notes,
  Search,
  Send as SendIcon,
  SupportAgent,
} from '@mui/icons-material';
import {
  adminSupportAPI,
  SUPPORT_CATEGORIES,
  type SupportTicketSort,
  type SupportTicketStatus,
} from '@/services/api';
import { useAuth } from '@/context/AppContext';
import { AttachmentPreview } from '@/components/support/AttachmentPreview';
import { SupportPriorityChip, SupportStatusChip } from '@/components/support/SupportLabels';
import { resolveMediaUrl } from '@/lib/urlConfig';

const statuses: Array<{ value: SupportTicketStatus | ''; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In Review' },
  { value: 'waiting_for_user', label: 'Waiting For User' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const categoryLabels = Object.fromEntries(
  SUPPORT_CATEGORIES.map(category => [category.value, category.label])
);

const sortOptions: Array<{ value: SupportTicketSort; label: string }> = [
  { value: 'latest', label: 'Latest Chat' },
  { value: 'oldest', label: 'Oldest Chat' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
];

const toAssetUrl = (value?: string) => {
  return resolveMediaUrl(value);
};

const supportMessageBody = (message: any) =>
  message.attachments?.length && String(message.body || '').startsWith('Attachment uploaded')
    ? 'Attachment uploaded'
    : message.body;

export default function AdminSupportPage() {
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get('ticket') || '';
  const requestedTicketId = /^[a-f\d]{24}$/i.test(ticketParam) ? ticketParam : '';
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [sort, setSort] = useState<SupportTicketSort>('latest');
  const [reply, setReply] = useState('');
  const [replyAttachment, setReplyAttachment] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<SupportTicketStatus>('in_review');
  const [reason, setReason] = useState('');
  const [queueCollapsed, setQueueCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedTicket = useMemo(
    () => detail?.ticket || tickets.find(ticket => ticket._id === selectedId),
    [detail, selectedId, tickets]
  );
  const queueHidden = Boolean(selectedTicket && queueCollapsed);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (searchFilter.trim()) params.search = searchFilter.trim();
      if (fromFilter) params.from = fromFilter;
      if (toFilter) params.to = toFilter;
      if (monthFilter) params.month = monthFilter;
      if (sort) params.sort = sort;
      const response = await adminSupportAPI.getTickets(params);
      const nextTickets = response?.data?.tickets || [];
      setTickets(nextTickets);
      if (requestedTicketId) {
        setSelectedId(requestedTicketId);
        setQueueCollapsed(true);
        return;
      }
      setSelectedId(current => (current && nextTickets.some((ticket: any) => ticket._id === current) ? current : ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load support queue');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, fromFilter, monthFilter, requestedTicketId, searchFilter, sort, statusFilter, toFilter]);

  const loadDetail = async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await adminSupportAPI.getTicket(id);
      setDetail(response?.data || null);
      if (response?.data?.ticket?.status) setStatus(response.data.ticket.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const clearUnread = (id: string) => {
    setTickets(current =>
      current.map(ticket => (ticket._id === id ? { ...ticket, unreadMessageCount: 0 } : ticket))
    );
    setDetail((current: any | null) =>
      current?.ticket?._id === id
        ? { ...current, ticket: { ...current.ticket, unreadMessageCount: 0 } }
        : current
    );
  };

  const markTicketRead = async (id: string) => {
    if (!id) return;
    clearUnread(id);
    try {
      await adminSupportAPI.markRead(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark ticket as read');
    }
  };

  const selectTicket = (id: string) => {
    setSelectedId(id);
    setQueueCollapsed(true);
    void markTicketRead(id);
  };

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    void loadDetail(selectedId);
    setReply('');
    setReplyAttachment(null);
    if (selectedId) void markTicketRead(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const refreshSelected = async () => {
    await Promise.all([loadTickets(), selectedId ? loadDetail(selectedId) : Promise.resolve()]);
  };

  const handleAssignToMe = async () => {
    if (!selectedId || !user?.id) return;
    setSubmitting(true);
    setError('');
    try {
      await adminSupportAPI.assignTicket(selectedId, user.id);
      await refreshSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatus = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    setSubmitting(true);
    setError('');
    try {
      await adminSupportAPI.updateStatus(selectedId, status, reason);
      setReason('');
      await refreshSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    setError('');
    try {
      await adminSupportAPI.updateStatus(selectedId, 'open', 'Ticket reopened by admin');
      setStatus('open');
      await refreshSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplyAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setReplyAttachment(null);
      setError('Attachment cannot exceed 10 MB');
      return;
    }

    setReplyAttachment(file);
    setError('');
  };

  const handleReply = async (event: FormEvent) => {
    event.preventDefault();
    const body = reply.trim();
    if (!selectedId || (!body && !replyAttachment)) return;
    setSubmitting(true);
    setError('');
    try {
      if (replyAttachment) {
        await adminSupportAPI.uploadAttachment(selectedId, replyAttachment, body || undefined);
      } else {
        await adminSupportAPI.addMessage(selectedId, body);
      }
      setReply('');
      setReplyAttachment(null);
      await refreshSelected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !note.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await adminSupportAPI.addInternalNote(selectedId, note.trim());
      setNote('');
      await loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add internal note');
    } finally {
      setSubmitting(false);
    }
  };

  const clearFilters = () => {
    setSearchFilter('');
    setStatusFilter('');
    setCategoryFilter('');
    setFromFilter('');
    setToFilter('');
    setMonthFilter('');
    setSort('latest');
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        justifyContent="space-between"
        gap={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h4" fontWeight={900} color="text.primary">
            Support Queue
          </Typography>
          <Typography color="text.secondary">
            Assign, investigate, reply, and keep internal notes separate.
          </Typography>
        </Box>
      </Stack>

      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 2,
          bgcolor: 'background.paper',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: 'minmax(240px, 1.3fr) repeat(3, minmax(150px, 1fr))',
              xl: 'minmax(280px, 1.5fr) repeat(6, minmax(130px, 1fr)) auto',
            },
            gap: 1.25,
            alignItems: 'center',
          }}
        >
          <TextField
            size="small"
            label="Search users or tickets"
            value={searchFilter}
            onChange={event => setSearchFilter(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select
            size="small"
            label="Status"
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value)}
          >
            {statuses.map(item => (
              <MenuItem key={item.value || 'all'} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Category"
            value={categoryFilter}
            onChange={event => setCategoryFilter(event.target.value)}
          >
            <MenuItem value="">All Categories</MenuItem>
            {SUPPORT_CATEGORIES.map(category => (
              <MenuItem key={category.value} value={category.value}>
                {category.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Sort"
            value={sort}
            onChange={event => setSort(event.target.value as SupportTicketSort)}
          >
            {sortOptions.map(item => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Month"
            type="month"
            value={monthFilter}
            onChange={event => setMonthFilter(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            label="From"
            type="date"
            value={fromFilter}
            onChange={event => setFromFilter(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            label="To"
            type="date"
            value={toFilter}
            onChange={event => setToFilter(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            variant="outlined"
            startIcon={<Clear />}
            onClick={clearFilters}
            sx={{ height: 40, whiteSpace: 'nowrap' }}
          >
            Clear
          </Button>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            xl: !selectedTicket
              ? '1fr'
              : queueHidden
                ? 'minmax(0, 1fr) 340px'
                : '390px minmax(0, 1fr) 340px',
          },
          gap: 2,
        }}
      >
        <Paper
          sx={{ borderRadius: 2, overflow: 'hidden', display: queueHidden ? 'none' : 'block' }}
        >
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography fontWeight={900}>Queue</Typography>
          </Box>
          {loading ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          ) : tickets.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <SupportAgent color="disabled" />
              <Typography color="text.secondary">No tickets match filters.</Typography>
            </Box>
          ) : (
            <Stack divider={<Divider />}>
              {tickets.map(ticket => {
                const ownerImage = toAssetUrl(ticket.ownerId?.profilePicture);
                return (
                <Box
                  key={ticket._id}
                  onClick={() => selectTicket(ticket._id)}
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    bgcolor: selectedId === ticket._id ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" gap={1}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                      <Typography fontWeight={850} noWrap>
                        {ticket.subject}
                      </Typography>
                      {ticket.unreadMessageCount > 0 && (
                        <Chip
                          size="small"
                          label={ticket.unreadMessageCount}
                          color="error"
                          sx={{ height: 22, fontWeight: 900, flexShrink: 0 }}
                        />
                      )}
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <SupportPriorityChip priority={ticket.priority} />
                      <Tooltip title="Mark as read">
                        <IconButton
                          size="small"
                          aria-label={`Mark ${ticket.subject} as read`}
                          onClick={event => {
                            event.stopPropagation();
                            void markTicketRead(ticket._id);
                          }}
                        >
                          <DoneAll fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                  <Box sx={{ mt: 0.75, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
                    {ownerImage ? (
                      <Box
                        component="img"
                        src={ownerImage}
                        alt={`${ticket.ownerId?.name || 'User'} profile`}
                        sx={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          fontSize: 12,
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                      >
                        {(ticket.ownerId?.name || 'U').charAt(0).toUpperCase()}
                      </Box>
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" color="text.primary" fontWeight={800} noWrap>
                        {ticket.ownerId?.name || 'Unknown user'}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        sx={{ display: 'block' }}
                      >
                        {ticket.ownerId?.email || 'No email'} -{' '}
                        {categoryLabels[ticket.category] || ticket.category}
                      </Typography>
                    </Box>
                  </Box>
                  <Stack direction="row" gap={1} sx={{ mt: 1 }}>
                    <SupportStatusChip status={ticket.status} />
                    <Typography
                      variant="caption"
                      sx={{ alignSelf: 'center', color: 'text.secondary', fontWeight: 800 }}
                    >
                      {ticket.ticketNumber}
                    </Typography>
                  </Stack>
                </Box>
                );
              })}
            </Stack>
          )}
        </Paper>

        <Paper
          sx={{
            borderRadius: 2,
            height: selectedTicket ? '90vh' : 'auto',
            minHeight: selectedTicket ? 0 : 360,
            display: selectedTicket ? 'flex' : 'none',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {!selectedTicket ? (
            <Box sx={{ m: 'auto', p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">Select ticket.</Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  gap={1}
                >
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {queueHidden && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<SupportAgent />}
                          onClick={() => setQueueCollapsed(false)}
                        >
                          Queue
                        </Button>
                      )}
                      <Typography variant="h6" fontWeight={900}>
                        {selectedTicket.subject}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {selectedTicket.ticketNumber} -{' '}
                      {categoryLabels[selectedTicket.category] || selectedTicket.category}
                    </Typography>
                  </Box>
                  <Stack direction="row" gap={1}>
                    <SupportStatusChip status={selectedTicket.status} />
                    <SupportPriorityChip priority={selectedTicket.priority} />
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                  {(() => {
                    const ownerImage = toAssetUrl(selectedTicket.ownerId?.profilePicture);
                    return ownerImage ? (
                      <Box
                        component="img"
                        src={ownerImage}
                        alt={`${selectedTicket.ownerId?.name || 'User'} profile`}
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          fontSize: 12,
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                      >
                        {(selectedTicket.ownerId?.name || 'U').charAt(0).toUpperCase()}
                      </Box>
                    );
                  })()}
                  <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                    User: <strong>{selectedTicket.ownerId?.name || 'Unknown user'}</strong> (
                    {selectedTicket.ownerId?.email || 'No email'})
                  </Typography>
                </Stack>
              </Box>

              <Stack
                spacing={1.5}
                sx={{
                  p: 2,
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  scrollbarWidth: 'thin',
                  '&::-webkit-scrollbar': { width: 4 },
                  '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 999 },
                }}
              >
                {detailLoading ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : (
                  detail?.messages?.map((message: any) => {
                    const internal = message.visibility === 'internal';
                    return (
                      <Box
                        key={message._id}
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          bgcolor: internal
                            ? 'warning.light'
                            : message.authorRole === 'admin'
                              ? 'primary.main'
                              : 'action.hover',
                          color:
                            internal || message.authorRole !== 'admin'
                              ? 'text.primary'
                              : 'primary.contrastText',
                          border: internal ? '1px solid' : 'none',
                          borderColor: 'warning.main',
                          maxWidth: { xs: '100%', md: '82%' },
                          alignSelf: message.authorRole === 'admin' ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          {internal && <Notes fontSize="small" />}
                          <Typography variant="caption" fontWeight={900}>
                            {internal
                              ? 'Internal note'
                              : message.authorId?.name || message.authorRole}
                          </Typography>
                        </Stack>
                        <Typography variant="body2" whiteSpace="pre-wrap">
                          {supportMessageBody(message)}
                        </Typography>
                        {message.attachments?.map((item: any) => (
                          <AttachmentPreview key={item.key} attachment={item} />
                        ))}
                      </Box>
                    );
                  })
                )}
              </Stack>

              <Box
                component="form"
                onSubmit={handleReply}
                sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    value={reply}
                    onChange={event => setReply(event.target.value)}
                    placeholder="Public reply to user"
                    size="small"
                    fullWidth
                    disabled={selectedTicket.status === 'closed'}
                  />
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<AttachFile />}
                    disabled={submitting || selectedTicket.status === 'closed'}
                    sx={{ minWidth: { sm: 118 }, whiteSpace: 'nowrap' }}
                  >
                    Attach
                    <input
                      hidden
                      type="file"
                      accept="image/jpeg,image/png,application/pdf,text/plain,application/zip"
                      onChange={handleReplyAttachment}
                    />
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    endIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                    disabled={
                      submitting ||
                      selectedTicket.status === 'closed' ||
                      (!reply.trim() && !replyAttachment)
                    }
                  >
                    {submitting ? 'Sending' : 'Reply'}
                  </Button>
                </Stack>
                {replyAttachment && (
                  <Chip
                    sx={{
                      mt: 1,
                      maxWidth: '100%',
                      '& .MuiChip-label': {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      },
                    }}
                    icon={<AttachFile fontSize="small" />}
                    label={`Attachment selected (${(replyAttachment.size / (1024 * 1024)).toFixed(1)} MB)`}
                    onDelete={() => setReplyAttachment(null)}
                    variant="outlined"
                  />
                )}
              </Box>
            </>
          )}
        </Paper>

        <Stack spacing={2} sx={{ display: selectedTicket ? 'flex' : 'none' }}>
          <Paper sx={{ p: 2, borderRadius: 2 }}>
            <Stack spacing={1.5}>
              <Typography fontWeight={900}>Actions</Typography>
              <Button
                variant="outlined"
                startIcon={<AssignmentInd />}
                onClick={handleAssignToMe}
                disabled={!selectedTicket || submitting}
              >
                Assign To Me
              </Button>
              {selectedTicket?.status === 'closed' && (
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleReopen}
                  disabled={submitting}
                >
                  Reopen Ticket
                </Button>
              )}
              <Box component="form" onSubmit={handleStatus}>
                <Stack spacing={1}>
                  <TextField
                    select
                    size="small"
                    label="Status"
                    value={status}
                    onChange={event => setStatus(event.target.value as SupportTicketStatus)}
                    disabled={!selectedTicket}
                  >
                    {statuses
                      .filter(item => item.value)
                      .map(item => (
                        <MenuItem key={item.value} value={item.value}>
                          {item.label}
                        </MenuItem>
                      ))}
                  </TextField>
                  <TextField
                    size="small"
                    label="Reason"
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    disabled={!selectedTicket}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={!selectedTicket || submitting}
                  >
                    Update Status
                  </Button>
                </Stack>
              </Box>
            </Stack>
          </Paper>

          <Paper component="form" onSubmit={handleNote} sx={{ p: 2, borderRadius: 2 }}>
            <Stack spacing={1.5}>
              <Typography fontWeight={900}>Internal Notes</Typography>
              <TextField
                value={note}
                onChange={event => setNote(event.target.value)}
                multiline
                minRows={5}
                placeholder="Private investigation note"
                disabled={!selectedTicket || selectedTicket.status === 'closed'}
              />
              <Button
                type="submit"
                variant="outlined"
                disabled={!selectedTicket || submitting || selectedTicket.status === 'closed'}
              >
                Add Note
              </Button>
            </Stack>
          </Paper>

          <Paper sx={{ p: 2, borderRadius: 2 }}>
            <Typography fontWeight={900} sx={{ mb: 1 }}>
              Linked Context
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Release: {selectedTicket?.related?.releaseId || 'None'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Track: {selectedTicket?.related?.trackId || 'None'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ACRCloud: {selectedTicket?.related?.acrCloudFileId || 'None'}
            </Typography>
          </Paper>
        </Stack>
      </Box>
    </Box>
  );
}
