'use client';

import { Control, Controller, FieldErrors } from 'react-hook-form';
import {
  Alert,
  Box,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Shield, PhoneIphone } from '@mui/icons-material';
import { SignupFormValues } from '@/app/(public)/signup/types';
import { fieldSx, formSectionSx, sectionCaptionSx, sectionTitleSx, twoColumnGridSx } from './styles';

const providerOptions = [
  { value: 'surepass', label: 'Surepass' },
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'manual', label: 'Manual Review' },
] as const;

export interface Step4VerificationProps {
  control: Control<SignupFormValues>;
  errors: FieldErrors<SignupFormValues>;
  isSubmitting: boolean;
}

export default function Step4Verification({ control, errors, isSubmitting }: Step4VerificationProps) {
  return (
    <Stack spacing={2.5} sx={formSectionSx}>
      <Box>
        <Typography variant="h6" sx={sectionTitleSx}>
          Verification
        </Typography>
        <Typography variant="body2" sx={sectionCaptionSx}>
          Choose KYC and mobile verification route
        </Typography>
      </Box>

      <Box sx={twoColumnGridSx}>
        <Controller
          name="verificationPhoneNumber"
          control={control}
          rules={{
            required: 'Mobile number is required',
            pattern: {
              value: /^\+?[0-9]{10,15}$/,
              message: 'Enter 10-15 digits with optional country code',
            },
          }}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Mobile Number"
              type="tel"
              error={!!errors.verificationPhoneNumber}
              helperText={errors.verificationPhoneNumber?.message}
              disabled={isSubmitting}
              sx={fieldSx}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <PhoneIphone sx={{ color: 'rgba(255,255,255,0.35)' }} />
                  </InputAdornment>
                ),
              }}
            />
          )}
        />

        <Controller
          name="mobileVerificationProvider"
          control={control}
          rules={{ required: 'Mobile provider is required' }}
          render={({ field }) => (
            <TextField
              {...field}
              select
              fullWidth
              label="Mobile API"
              error={!!errors.mobileVerificationProvider}
              helperText={errors.mobileVerificationProvider?.message}
              disabled={isSubmitting}
              sx={fieldSx}
            >
              {providerOptions.map((provider) => (
                <MenuItem key={provider.value} value={provider.value}>
                  {provider.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
      </Box>

      <Controller
        name="kycProvider"
        control={control}
        rules={{ required: 'KYC provider is required' }}
        render={({ field }) => (
          <TextField
            {...field}
            select
            fullWidth
            label="KYC API"
            error={!!errors.kycProvider}
            helperText={errors.kycProvider?.message}
            disabled={isSubmitting}
            sx={fieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Shield sx={{ color: 'rgba(255,255,255,0.35)' }} />
                </InputAdornment>
              ),
            }}
          >
            {providerOptions.map((provider) => (
              <MenuItem key={provider.value} value={provider.value}>
                {provider.label}
              </MenuItem>
            ))}
          </TextField>
        )}
      />

      <Alert severity="info" sx={{ borderRadius: '14px', bgcolor: 'rgba(59,130,246,0.08)', color: '#bfdbfe' }}>
        API keys stay server-side. Surepass/Sandbox can be connected through env config without hardcoding secrets.
      </Alert>

      <Controller
        name="kycConsent"
        control={control}
        rules={{ validate: (value) => value === true || 'Consent is required for KYC verification' }}
        render={({ field }) => (
          <FormControlLabel
            sx={{ color: 'rgba(226,232,240,0.72)' }}
            control={
              <Checkbox
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                disabled={isSubmitting}
              />
            }
            label="I consent to mobile and KYC verification for this account."
          />
        )}
      />
      {errors.kycConsent && (
        <Typography variant="caption" sx={{ color: '#ef4444' }}>
          {errors.kycConsent.message}
        </Typography>
      )}
    </Stack>
  );
}
