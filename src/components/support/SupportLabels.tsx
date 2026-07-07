'use client';

import { Chip, type ChipProps } from '@mui/material';
import {
  Flag,
  RadioButtonChecked,
  Schedule,
  TaskAlt,
  Visibility,
} from '@mui/icons-material';
import type { SupportTicketPriority, SupportTicketStatus } from '@/services/api';

const statusMeta: Record<SupportTicketStatus, { label: string; color: string; bg: string; icon: ChipProps['icon'] }> = {
  open: { label: 'Open', color: '#ffffff', bg: '#0f766e', icon: <RadioButtonChecked /> },
  in_review: { label: 'In Review', color: '#ffffff', bg: '#6d28d9', icon: <Visibility /> },
  waiting_for_user: { label: 'Waiting For User', color: '#ffffff', bg: '#b45309', icon: <Schedule /> },
  resolved: { label: 'Resolved', color: '#ffffff', bg: '#15803d', icon: <TaskAlt /> },
  closed: { label: 'Closed', color: '#ffffff', bg: '#475569', icon: <TaskAlt /> },
};

const priorityMeta: Record<SupportTicketPriority, { label: string; color: string; bg: string }> = {
  low: { label: 'Low', color: '#ffffff', bg: '#0f766e' },
  normal: { label: 'Normal', color: '#ffffff', bg: '#475569' },
  high: { label: 'High', color: '#ffffff', bg: '#c2410c' },
  urgent: { label: 'Urgent', color: '#ffffff', bg: '#be123c' },
};

const chipSx = (color: string, bg: string) => ({
  bgcolor: bg,
  color,
  border: '1px solid',
  borderColor: bg,
  fontWeight: 900,
  '& .MuiChip-icon': { color, fontSize: 16 },
  '& .MuiChip-label': { color },
});

export function SupportStatusChip({ status, size = 'small' }: { status?: SupportTicketStatus | string; size?: ChipProps['size'] }) {
  const meta = statusMeta[(status || 'open') as SupportTicketStatus] || {
    label: String(status || 'Open'),
    color: '#475569',
    bg: 'rgba(100,116,139,0.14)',
    icon: undefined,
  };

  return <Chip size={size} icon={meta.icon} label={meta.label} sx={chipSx(meta.color, meta.bg)} />;
}

export function SupportPriorityChip({ priority, size = 'small' }: { priority?: SupportTicketPriority | string; size?: ChipProps['size'] }) {
  const meta = priorityMeta[(priority || 'normal') as SupportTicketPriority] || {
    label: String(priority || 'Normal'),
    color: '#475569',
    bg: 'rgba(100,116,139,0.14)',
  };

  return <Chip size={size} icon={<Flag />} label={meta.label} sx={chipSx(meta.color, meta.bg)} />;
}
