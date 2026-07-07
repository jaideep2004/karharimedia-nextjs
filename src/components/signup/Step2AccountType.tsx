'use client';

import { Control, Controller, FieldErrors } from 'react-hook-form';
import {
  Box,
  Typography,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { MusicNote, Business } from '@mui/icons-material';
import { SignupFormValues } from '@/app/(public)/signup/types';
import { formSectionSx, sectionCaptionSx, sectionTitleSx } from './styles';

export interface Step2Props {
  control: Control<SignupFormValues>;
  errors: FieldErrors<SignupFormValues>;
  onAccountTypeChange: (type: 'artist' | 'label') => void;
}

export default function Step2AccountType({
  control,
  errors,
  onAccountTypeChange,
}: Step2Props) {
  return (
    <Stack spacing={3} sx={formSectionSx}>
      <Box>
        <Typography variant="h6" sx={sectionTitleSx}>
          Account Type
        </Typography>
        <Typography variant="body2" sx={sectionCaptionSx}>
          Choose how you want to register on the platform
        </Typography>
      </Box>

      <Controller
        name="accountType"
        control={control}
        rules={{ required: 'Please select an account type' }}
        render={({ field }) => (
          <Box>
            <ToggleButtonGroup
              exclusive
              value={field.value || null}
              onChange={(_e, val) => {
                if (val) {
                  field.onChange(val);
                  onAccountTypeChange(val as 'artist' | 'label');
                }
              }}
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
                width: '100%',
                '& .MuiToggleButtonGroup-grouped': {
                  border: '1px solid rgba(255,255,255,0.12) !important',
                  borderRadius: '20px !important',
                  mx: 0,
                },
              }}
            >
              <ToggleButton
                value="artist"
                aria-label="Artist account"
                sx={{
                  minHeight: { xs: 150, sm: 190 },
                  p: { xs: 2.5, sm: 3 },
                  flexDirection: 'column',
                  gap: 1.5,
                  textTransform: 'none',
                  color: 'rgba(255,255,255,0.6)',
                  background: 'rgba(255,255,255,0.02)',
                  '&.Mui-selected': {
                    color: '#00e7ff',
                    background: 'rgba(237, 30, 121, 0.12)',
                    borderColor: '#00e7ff !important',
                    boxShadow: '0 0 0 1px #00e7ff',
                  },
                  '&:hover': {
                    background: 'rgba(237, 30, 121, 0.06)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '16px',
                    display: 'grid',
                    placeItems: 'center',
                    background:
                      field.value === 'artist'
                        ? 'rgba(237, 30, 121, 0.2)'
                        : 'rgba(255,255,255,0.06)',
                    transition: 'background 200ms',
                  }}
                >
                  <MusicNote sx={{ fontSize: 28 }} />
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    Artist
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}
                  >
                    Individual musician or performer
                  </Typography>
                </Box>
              </ToggleButton>

              <ToggleButton
                value="label"
                aria-label="Label account"
                sx={{
                  minHeight: { xs: 150, sm: 190 },
                  p: { xs: 2.5, sm: 3 },
                  flexDirection: 'column',
                  gap: 1.5,
                  textTransform: 'none',
                  color: 'rgba(255,255,255,0.6)',
                  background: 'rgba(255,255,255,0.02)',
                  '&.Mui-selected': {
                    color: '#00e7ff',
                    background: 'rgba(237, 30, 121, 0.12)',
                    borderColor: '#00e7ff !important',
                    boxShadow: '0 0 0 1px #00e7ff',
                  },
                  '&:hover': {
                    background: 'rgba(237, 30, 121, 0.06)',
                  },
                }}
              >
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: '16px',
                    display: 'grid',
                    placeItems: 'center',
                    background:
                      field.value === 'label'
                        ? 'rgba(237, 30, 121, 0.2)'
                        : 'rgba(255,255,255,0.06)',
                    transition: 'background 200ms',
                  }}
                >
                  <Business sx={{ fontSize: 28 }} />
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    Label
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}
                  >
                    Record label or management company
                  </Typography>
                </Box>
              </ToggleButton>
            </ToggleButtonGroup>

            {errors.accountType && (
              <Typography
                variant="caption"
                sx={{ color: '#ef4444', mt: 1, display: 'block' }}
              >
                {errors.accountType.message}
              </Typography>
            )}
          </Box>
        )}
      />

      {/* Info cards */}
      <Box
        sx={{
          p: 2.5,
          borderRadius: '16px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
          <Box component="span" sx={{ color: '#00e7ff', fontWeight: 600 }}>
            Artist accounts
          </Box>{' '}
          are for individual musicians, producers, and performers who want to distribute their
          music and manage their catalog.
          <br />
          <Box component="span" sx={{ color: '#00e7ff', fontWeight: 600 }}>
            Label accounts
          </Box>{' '}
          are for record labels and management companies that represent multiple artists and
          manage large catalogs.
        </Typography>
      </Box>
    </Stack>
  );
}
