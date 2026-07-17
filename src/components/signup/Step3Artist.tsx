'use client';

import { Control, Controller, FieldErrors } from 'react-hook-form';
import {
  Box,
  TextField,
  Typography,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Person,
  Phone,
  Home,
  MusicNote,
  CheckCircle,
  Error as ErrorIcon,
  Warning,
} from '@mui/icons-material';
import FileDropZone from './FileDropZone';
import { SignupFormValues } from '@/app/(public)/signup/types';
import {
  compactToggleGroupSx,
  fieldSx,
  formSectionSx,
  multilineFieldSx,
  sectionCaptionSx,
  sectionTitleSx,
  twoColumnGridSx,
} from './styles';

export type ArtistNameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export interface Step3ArtistProps {
  control: Control<SignupFormValues>;
  errors: FieldErrors<SignupFormValues>;
  isSubmitting: boolean;
  artistNameStatus: ArtistNameStatus;
  onArtistNameBlur: () => void;
}

function ArtistNameAdornment({ status }: { status: ArtistNameStatus }) {
  const theme = useTheme();
  if (status === 'checking') return <CircularProgress size={18} sx={{ color: theme.palette.primary.main }} />;
  if (status === 'available') return <CheckCircle sx={{ color: theme.palette.primary.main, fontSize: 20 }} />;
  if (status === 'taken' || status === 'error')
    return <ErrorIcon sx={{ color: '#ef4444', fontSize: 20 }} />;
  return null;
}

export default function Step3Artist({
  control,
  errors,
  isSubmitting,
  artistNameStatus,
  onArtistNameBlur,
}: Step3ArtistProps) {
  const theme = useTheme();
  return (
    <Stack spacing={2.5} sx={formSectionSx}>
      <Box>
        <Typography variant="h6" sx={sectionTitleSx}>
          Artist Details
        </Typography>
        <Typography variant="body2" sx={sectionCaptionSx}>
          Provide your professional and legal information
        </Typography>
      </Box>

      {/* Artist Name */}
      <Box>
        <Controller
          name="artistName"
          control={control}
          rules={{ required: 'Artist name is required' }}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Artist Name"
              error={!!errors.artistName || artistNameStatus === 'taken'}
              helperText={
                errors.artistName?.message ||
                (artistNameStatus === 'taken'
                  ? 'This artist name is already taken'
                  : artistNameStatus === 'error'
                  ? 'Unable to verify artist name availability. Please try again.'
                  : artistNameStatus === 'available'
                  ? 'Artist name is available!'
                  : undefined)
              }
              FormHelperTextProps={{
                sx: {
                  color:
                    artistNameStatus === 'available'
                      ? theme.palette.primary.main
                      : artistNameStatus === 'taken' || artistNameStatus === 'error'
                      ? '#ef4444'
                      : undefined,
                },
              }}
              disabled={isSubmitting}
              sx={fieldSx}
              onBlur={() => {
                field.onBlur();
                onArtistNameBlur();
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <MusicNote sx={{ color: 'rgba(255,255,255,0.35)' }} />
                  </InputAdornment>
                ),
                endAdornment: artistNameStatus !== 'idle' ? (
                  <InputAdornment position="end">
                    <ArtistNameAdornment status={artistNameStatus} />
                  </InputAdornment>
                ) : undefined,
              }}
            />
          )}
        />

        {/* Permanent name warning */}
        <Box
          sx={{
            mt: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1.5,
            borderRadius: '12px',
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}
        >
          <Warning sx={{ color: '#f59e0b', fontSize: 18, flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: 'rgba(245, 158, 11, 0.9)', lineHeight: 1.5 }}>
            Your artist name is <strong>permanent</strong> and cannot be changed after
            registration. Choose carefully.
          </Typography>
        </Box>
      </Box>

      {/* Legal Name */}
      <Controller
        name="legalName"
        control={control}
        rules={{ required: 'Legal name is required' }}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="Legal Name"
            error={!!errors.legalName}
            helperText={errors.legalName?.message}
            disabled={isSubmitting}
            sx={fieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Person sx={{ color: 'rgba(255,255,255,0.35)' }} />
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      {/* ID Type Toggle */}
      <Box>
        <Typography
          variant="body2"
          sx={{ mb: 1, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}
        >
          Government ID Type
        </Typography>
        <Controller
          name="idType"
          control={control}
          render={({ field }) => (
            <ToggleButtonGroup
              exclusive
              value={field.value}
              onChange={(_e, val) => val && field.onChange(val)}
              sx={{ ...compactToggleGroupSx, mb: 2 }}
            >
              <ToggleButton value="pan">PAN Card</ToggleButton>
              <ToggleButton value="aadhaar">Aadhaar Card</ToggleButton>
            </ToggleButtonGroup>
          )}
        />

        {/* PAN field */}
        <Controller
          name="idType"
          control={control}
          render={({ field: idTypeField }) =>
            idTypeField.value === 'pan' ? (
              <Controller
                name="panId"
                control={control}
                rules={{
                  required: 'PAN number is required',
                  pattern: {
                    value: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
                    message: 'Invalid PAN format (e.g. ABCDE1234F)',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="PAN Number"
                    placeholder="ABCDE1234F"
                    error={!!errors.panId}
                    helperText={errors.panId?.message}
                    disabled={isSubmitting}
                    sx={fieldSx}
                    inputProps={{ style: { textTransform: 'uppercase' } }}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                  />
                )}
              />
            ) : (
              <Controller
                name="aadhaarId"
                control={control}
                rules={{
                  required: 'Aadhaar number is required',
                  pattern: {
                    value: /^\d{12}$/,
                    message: 'Aadhaar must be exactly 12 digits',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Aadhaar Number"
                    placeholder="123456789012"
                    error={!!errors.aadhaarId}
                    helperText={errors.aadhaarId?.message}
                    disabled={isSubmitting}
                    sx={fieldSx}
                    inputProps={{ maxLength: 12, inputMode: 'numeric' }}
                  />
                )}
              />
            )
          }
        />
      </Box>

      {/* Legal Address */}
      <Controller
        name="legalAddress"
        control={control}
        rules={{ required: 'Legal address is required' }}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="Full Legal Address"
            multiline
            rows={3}
            error={!!errors.legalAddress}
            helperText={errors.legalAddress?.message}
            disabled={isSubmitting}
            sx={multilineFieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1.5 }}>
                  <Home sx={{ color: 'rgba(255,255,255,0.35)' }} />
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      {/* Phone Number */}
      <Controller
        name="phoneNumber"
        control={control}
        rules={{
          required: 'Phone number is required',
          pattern: {
            value: /^\+?[0-9]{10,15}$/,
            message: 'Enter a valid phone number (10–15 digits)',
          },
        }}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="Phone Number"
            type="tel"
            error={!!errors.phoneNumber}
            helperText={errors.phoneNumber?.message}
            disabled={isSubmitting}
            sx={fieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Phone sx={{ color: 'rgba(255,255,255,0.35)' }} />
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      {/* Tracks & Releases */}
      <Box sx={twoColumnGridSx}>
        <Controller
          name="numberOfTracks"
          control={control}
          rules={{
            required: 'Required',
            min: { value: 0, message: 'Must be 0 or more' },
            validate: (v) =>
              v === '' || Number.isInteger(Number(v)) || 'Must be a whole number',
          }}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Number of Tracks"
              type="number"
              error={!!errors.numberOfTracks}
              helperText={errors.numberOfTracks?.message}
              disabled={isSubmitting}
              sx={fieldSx}
              inputProps={{ min: 0, step: 1 }}
            />
          )}
        />

        <Controller
          name="numberOfReleases"
          control={control}
          rules={{
            required: 'Required',
            min: { value: 0, message: 'Must be 0 or more' },
            validate: (v) =>
              v === '' || Number.isInteger(Number(v)) || 'Must be a whole number',
          }}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Number of Releases"
              type="number"
              error={!!errors.numberOfReleases}
              helperText={errors.numberOfReleases?.message}
              disabled={isSubmitting}
              sx={fieldSx}
              inputProps={{ min: 0, step: 1 }}
            />
          )}
        />
      </Box>

      {/* Government ID Upload */}
      <Controller
        name="governmentIdFile"
        control={control}
        rules={{ required: 'Government ID card image is required' }}
        render={({ field }) => (
          <FileDropZone
            label="Government ID Card *"
            accept="image/jpeg,image/png"
            hint="JPEG or PNG, max 10 MB"
            value={field.value}
            onChange={field.onChange}
            error={errors.governmentIdFile?.message as string | undefined}
            disabled={isSubmitting}
          />
        )}
      />
    </Stack>
  );
}
