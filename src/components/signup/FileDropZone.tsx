'use client';

import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { CloudUpload, Close, InsertDriveFile } from '@mui/icons-material';

export interface FileDropZoneProps {
  label: string;
  accept: string; // e.g. "image/jpeg,image/png" or "application/pdf"
  hint: string;   // e.g. "JPEG or PNG, max 5 MB"
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  disabled?: boolean;
  maxSizeMB?: number;
}

export default function FileDropZone({
  label,
  accept,
  hint,
  value,
  onChange,
  error,
  disabled,
  maxSizeMB = 10,
}: FileDropZoneProps) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const acceptedTypes = accept.split(',').map((t) => t.trim());

  const validateAndSet = (file: File) => {
    setLocalError(null);
    if (!acceptedTypes.includes(file.type)) {
      const isPdf = acceptedTypes.includes('application/pdf');
      const msg = isPdf
        ? 'Only PDF files are accepted'
        : 'Only JPEG or PNG images are accepted';
      setLocalError(msg);
      onChange(null);
      return;
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setLocalError(`File must be ${maxSizeMB} MB or smaller`);
      onChange(null);
      return;
    }
    onChange(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndSet(file);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSet(file);
    // Reset input so same file can be re-selected after clear
    e.target.value = '';
  };

  const handleClear = () => {
    setLocalError(null);
    onChange(null);
  };

  const displayError = error || localError;

  return (
    <Box>
      <Typography
        variant="body2"
        sx={{ mb: 0.75, fontWeight: 600, color: displayError ? '#ef4444' : 'text.secondary' }}
      >
        {label}
      </Typography>

      {value ? (
        // File selected state
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            borderRadius: '14px',
            border: '1px solid rgba(237, 30, 121, 0.4)',
            background: 'rgba(237, 30, 121, 0.08)',
          }}
        >
          <InsertDriveFile sx={{ color: theme.palette.primary.main, flexShrink: 0 }} />
          <Typography
            variant="body2"
            sx={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'text.primary',
            }}
          >
            {value.name}
          </Typography>
          <IconButton
            size="small"
            onClick={handleClear}
            disabled={disabled}
            aria-label="Remove file"
            sx={{ color: 'text.secondary', '&:hover': { color: '#ef4444' } }}
          >
            <Close fontSize="small" />
          </IconButton>
        </Box>
      ) : (
        // Drop zone
        <Box
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            border: `2px dashed ${
              displayError
                ? '#ef4444'
                : isDragging
                ? theme.palette.primary.main
                : 'rgba(255,255,255,0.15)'
            }`,
            borderRadius: '14px',
            p: 3,
            minHeight: 154,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer',
            background: isDragging
              ? 'rgba(237, 30, 121, 0.08)'
              : 'rgba(255,255,255,0.02)',
            transition: 'border-color 200ms, background 200ms',
            opacity: disabled ? 0.5 : 1,
          }}
          onClick={() => !disabled && inputRef.current?.click()}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
              inputRef.current?.click();
            }
          }}
          aria-label={`Upload ${label}`}
        >
          <CloudUpload
            sx={{
              fontSize: 36,
              color: isDragging ? theme.palette.primary.main : 'rgba(255,255,255,0.3)',
              mb: 1,
            }}
          />
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
            Drag & drop here, or{' '}
            <Box
              component="span"
              sx={{ color: theme.palette.primary.main, fontWeight: 600, cursor: 'pointer' }}
            >
              browse
            </Box>
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
            {hint}
          </Typography>
        </Box>
      )}

      {displayError && (
        <Typography variant="caption" sx={{ color: '#ef4444', mt: 0.5, display: 'block' }}>
          {displayError}
        </Typography>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleInputChange}
        disabled={disabled}
        aria-hidden="true"
      />
    </Box>
  );
}
