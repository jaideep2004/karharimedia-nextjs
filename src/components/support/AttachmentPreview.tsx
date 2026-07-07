'use client';

import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import {
  Archive,
  ImageOutlined,
  InsertDriveFile,
  OpenInNew,
  PictureAsPdf,
  TextSnippet,
} from '@mui/icons-material';

export type SupportAttachment = {
  fileName: string;
  key: string;
  url: string;
  provider?: string;
  contentType?: string;
  size?: number;
};

const formatBytes = (value?: number) => {
  if (!value || value <= 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (contentType?: string) => {
  if (contentType?.includes('pdf')) return <PictureAsPdf fontSize="small" />;
  if (contentType?.includes('text')) return <TextSnippet fontSize="small" />;
  if (contentType?.includes('zip')) return <Archive fontSize="small" />;
  if (contentType?.startsWith('image/')) return <ImageOutlined fontSize="small" />;
  return <InsertDriveFile fontSize="small" />;
};

export function AttachmentPreview({ attachment }: { attachment: SupportAttachment }) {
  const isImage = attachment.contentType?.startsWith('image/');
  const size = formatBytes(attachment.size);

  if (isImage) {
    return (
      <ButtonBase
        component="a"
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        sx={{
          mt: 1,
          width: '100%',
          maxWidth: 560,
          display: 'block',
          borderRadius: 2,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          textAlign: 'left',
          transition: 'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
          '&:hover': {
            transform: 'translateY(-1px)',
            borderColor: 'primary.main',
            boxShadow: '0 10px 28px rgba(15,23,42,0.14)',
          },
        }}
      >
        <Box
          component="img"
          src={attachment.url}
          alt="Attachment preview"
          sx={{
            width: '100%',
            maxHeight: 420,
            objectFit: 'contain',
            bgcolor: 'action.hover',
            display: 'block',
          }}
        />
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1.25, py: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={800}>
            {[attachment.contentType || 'image', size].filter(Boolean).join(' / ')}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" color="primary.main">
            <Typography variant="caption" fontWeight={900}>
              Open In New Tab
            </Typography>
            <OpenInNew sx={{ fontSize: 16 }} />
          </Stack>
        </Stack>
      </ButtonBase>
    );
  }

  return (
    <ButtonBase
      component="a"
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      sx={{
        mt: 1,
        width: '100%',
        maxWidth: 360,
        justifyContent: 'flex-start',
        borderRadius: 2,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        color: 'text.primary',
        textAlign: 'left',
        transition: 'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
        '&:hover': {
          transform: 'translateY(-1px)',
          borderColor: 'primary.main',
          boxShadow: '0 10px 28px rgba(15,23,42,0.14)',
        },
      }}
    >
      <Box
        sx={{
          width: 76,
          height: 64,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'action.hover',
          color: 'primary.main',
          flex: '0 0 auto',
        }}
      >
        {getFileIcon(attachment.contentType)}
      </Box>
      <Stack spacing={0.25} sx={{ p: 1, minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={850} noWrap>
          Attachment
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {[attachment.contentType || 'file', size].filter(Boolean).join(' / ')}
        </Typography>
      </Stack>
      <OpenInNew sx={{ fontSize: 16, mr: 1.25, color: 'text.secondary' }} />
    </ButtonBase>
  );
}
