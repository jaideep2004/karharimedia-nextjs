'use client';

import { ChangeEvent, FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  AttachFile,
  Close as CloseIcon,
  Send as SendIcon,
  SupportAgent,
} from '@mui/icons-material';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  type SupportTicketCategory,
  type SupportTicketPriority,
  supportAPI,
} from '@/services/api';
import { AttachmentPreview } from '@/components/support/AttachmentPreview';
import { SupportPriorityChip, SupportStatusChip } from '@/components/support/SupportLabels';

const supportMessageBody = (message: any) =>
  message.attachments?.length && String(message.body || '').startsWith('Attachment uploaded')
    ? 'Attachment uploaded'
    : message.body;

function UserSupportContent() {
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get('ticket') || '';
  const requestedTicketId = /^[a-f\d]{24}$/i.test(ticketParam) ? ticketParam : '';
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [ticketDetail, setTicketDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    category: 'technical_issue' as SupportTicketCategory,
    customIssue: '',
    priority: 'normal' as SupportTicketPriority,
    message: '',
  });

  const selectedTicket = useMemo(
    () => ticketDetail?.ticket || tickets.find((ticket) => ticket._id === selectedId),
    [selectedId, ticketDetail, tickets]
  );

  const loadTickets = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await supportAPI.getTickets();
      const nextTickets = response?.data?.tickets || [];
      setTickets(nextTickets);
      if (requestedTicketId) {
        setSelectedId(requestedTicketId);
        return;
      }
      setSelectedId((current) =>
        current && nextTickets.some((ticket: any) => ticket._id === current) ? current : ''
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  const loadTicketDetail = async (id: string) => {
    if (!id) {
      setTicketDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await supportAPI.getTicket(id);
      setTicketDetail(response?.data || null);
      setTickets(current =>
        current.map(ticket =>
          ticket._id === id ? { ...ticket, unreadMessageCount: 0 } : ticket
        )
      );
      await supportAPI.markRead(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTicketId]);

  useEffect(() => {
    void loadTicketDetail(selectedId);
  }, [selectedId]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await supportAPI.createTicket({
        category: form.category,
        customIssue: form.category === 'other' ? form.customIssue.trim() : undefined,
        priority: form.priority,
        message: form.message,
      });
      const created = response?.data;
      setForm({ category: 'technical_issue', customIssue: '', priority: 'normal', message: '' });
      setCreateOpen(false);
      await loadTickets();
      if (created?._id) setSelectedId(created._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || (!reply.trim() && !attachment)) return;
    setSubmitting(true);
    setError('');
    try {
      if (attachment) {
        await supportAPI.uploadAttachment(selectedId, attachment, reply.trim() || undefined);
      } else if (reply.trim()) {
        await supportAPI.addMessage(selectedId, reply.trim());
      }
      setReply('');
      setAttachment(null);
      await Promise.all([loadTickets(), loadTicketDetail(selectedId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await supportAPI.closeTicket(selectedId);
      await Promise.all([loadTickets(), loadTicketDetail(selectedId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    setAttachment(event.target.files?.[0] || null);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: 'background.default', minHeight: '100vh' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={900} color="text.primary">Support Center</Typography>
          <Typography color="text.secondary">Create tickets, attach evidence, and track every reply.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen((value) => !value)}>
          New Ticket
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {createOpen && (
        <Paper component="form" onSubmit={handleCreate} sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                select
                label="Category"
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value as SupportTicketCategory,
                    customIssue: event.target.value === 'other' ? current.customIssue : '',
                  }))
                }
                fullWidth
              >
                {SUPPORT_CATEGORIES.map((category) => (
                  <MenuItem key={category.value} value={category.value}>{category.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Priority"
                value={form.priority}
                onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as SupportTicketPriority }))}
                fullWidth
              >
                {SUPPORT_PRIORITIES.map(({ value, label }) => (
                  <MenuItem key={value} value={value}>{label}</MenuItem>
                ))}
              </TextField>
            </Stack>
            {form.category === 'other' && (
              <TextField
                label="Custom issue"
                value={form.customIssue}
                onChange={(event) =>
                  setForm((current) => ({ ...current, customIssue: event.target.value }))
                }
                required
                fullWidth
              />
            )}
            <TextField
              label="Message"
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              required
              multiline
              minRows={4}
              fullWidth
            />
            <Box>
              <Button type="submit" variant="contained" disabled={submitting}>
                Create Ticket
              </Button>
            </Box>
          </Stack>
        </Paper>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: selectedTicket ? '360px 1fr' : '1fr' },
          gap: 2,
        }}
      >
        <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography fontWeight={900}>Tickets</Typography>
          </Box>
          {loading ? (
            <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
          ) : tickets.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <SupportAgent color="disabled" sx={{ mb: 1 }} />
              <Typography color="text.secondary">No tickets yet.</Typography>
            </Box>
          ) : (
            <Stack divider={<Divider />}>
              {tickets.map((ticket) => (
                <Box
                  key={ticket._id}
                  onClick={() => setSelectedId(ticket._id)}
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    bgcolor: selectedId === ticket._id ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" gap={1}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                      <Typography fontWeight={850} noWrap>{ticket.subject}</Typography>
                      {ticket.unreadMessageCount > 0 && (
                        <Chip
                          size="small"
                          label={ticket.unreadMessageCount}
                          color="error"
                          sx={{ height: 22, fontWeight: 900, flexShrink: 0 }}
                        />
                      )}
                    </Stack>
                    <SupportStatusChip status={ticket.status} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">{ticket.ticketNumber}</Typography>
                  <Stack direction="row" gap={1} sx={{ mt: 1 }}>
                    <SupportPriorityChip priority={ticket.priority} />
                  </Stack>
                </Box>
              ))}
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
            <Box sx={{ p: 4, textAlign: 'center', m: 'auto' }}>
              <Typography color="text.secondary">Select a ticket to view conversation.</Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
                  <Box>
                    <Typography variant="h6" fontWeight={900}>{selectedTicket.subject}</Typography>
                    <Typography variant="caption" color="text.secondary">{selectedTicket.ticketNumber}</Typography>
                  </Box>
                  <Stack direction="row" gap={1} alignItems="center">
                    <SupportStatusChip status={selectedTicket.status} />
                    <SupportPriorityChip priority={selectedTicket.priority} />
                    {selectedTicket.status !== 'closed' && (
                      <Button size="small" color="inherit" onClick={handleCloseTicket} disabled={submitting}>Close</Button>
                    )}
                  </Stack>
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
                  <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                ) : (
                  ticketDetail?.messages?.map((message: any) => (
                    <Box
                      key={message._id}
                      sx={{
                        alignSelf: message.authorRole === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: { xs: '100%', md: '78%' },
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: message.authorRole === 'user' ? 'primary.main' : 'action.hover',
                        color: message.authorRole === 'user' ? 'primary.contrastText' : 'text.primary',
                      }}
                    >
                      <Typography variant="body2" whiteSpace="pre-wrap">
                        {supportMessageBody(message)}
                      </Typography>
                      {message.attachments?.map((item: any) => <AttachmentPreview key={item.key} attachment={item} />)}
                    </Box>
                  ))
                )}
              </Stack>

              <Box component="form" onSubmit={handleReply} sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                {attachment && (
                  <Chip
                    label={`Attachment selected (${(attachment.size / (1024 * 1024)).toFixed(1)} MB)`}
                    onDelete={() => setAttachment(null)}
                    deleteIcon={<CloseIcon />}
                    sx={{ mb: 1 }}
                  />
                )}
                <Stack direction="row" spacing={1}>
                  <TextField
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Reply to support"
                    size="small"
                    fullWidth
                    disabled={selectedTicket.status === 'closed'}
                  />
                  <IconButton component="label" disabled={submitting || selectedTicket.status === 'closed'}>
                    <AttachFile />
                    <input hidden type="file" onChange={handleAttachment} />
                  </IconButton>
                  <Button
                    type="submit"
                    variant="contained"
                    endIcon={
                      submitting ? <CircularProgress size={16} color="inherit" /> : <SendIcon />
                    }
                    disabled={submitting || selectedTicket.status === 'closed' || (!reply.trim() && !attachment)}
                  >
                    {submitting ? 'Sending' : 'Send'}
                  </Button>
                </Stack>
              </Box>
            </>
          )}
        </Paper>
      </Box>
    </Box>
  );
}

export default function UserSupportPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      }
    >
      <UserSupportContent />
    </Suspense>
  );
}
