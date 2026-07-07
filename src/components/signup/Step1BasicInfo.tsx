'use client';

import { useState } from 'react';
import { Control, Controller, FieldErrors } from 'react-hook-form';
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
  Typography,
  Stack,
} from '@mui/material';
import {
  Person,
  Email,
  Lock,
  PhoneIphone,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { SignupFormValues } from '@/app/(public)/signup/types';
import { fieldSx, formSectionSx, sectionCaptionSx, sectionTitleSx } from './styles';

export interface Step1Props {
  control: Control<SignupFormValues>;
  errors: FieldErrors<SignupFormValues>;
  isSubmitting: boolean;
}

export default function Step1BasicInfo({ control, errors, isSubmitting }: Step1Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <Stack spacing={2.5} sx={formSectionSx}>
      <Box>
        <Typography variant="h6" sx={sectionTitleSx}>
          Basic Information
        </Typography>
        <Typography variant="body2" sx={sectionCaptionSx}>
          Set up your account credentials
        </Typography>
      </Box>

      <Controller
        name="name"
        control={control}
        rules={{
          required: 'Full name is required',
          maxLength: { value: 50, message: 'Name cannot exceed 50 characters' },
          validate: (v) => {
            if (!v.trim()) return 'Full name is required';
            if (/\d/.test(v)) return 'Full name cannot contain numbers';
            return true;
          },
        }}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="Full Name"
            autoComplete="name"
            error={!!errors.name}
            helperText={errors.name?.message}
            disabled={isSubmitting}
            sx={fieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Person sx={{ color: 'var(--auth-icon, rgba(255,255,255,0.35))' }} />
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      <Controller
        name="email"
        control={control}
        rules={{
          required: 'Email is required',
          pattern: {
            value: /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            message: 'Enter a valid email address',
          },
        }}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="Email Address"
            type="email"
            autoComplete="email"
            spellCheck={false}
            error={!!errors.email}
            helperText={errors.email?.message}
            disabled={isSubmitting}
            sx={fieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Email sx={{ color: 'var(--auth-icon, rgba(255,255,255,0.35))' }} />
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      <Controller
        name="phoneNumber"
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
            autoComplete="tel"
            error={!!errors.phoneNumber}
            helperText={errors.phoneNumber?.message}
            disabled={isSubmitting}
            sx={fieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <PhoneIphone sx={{ color: 'var(--auth-icon, rgba(255,255,255,0.35))' }} />
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      <Controller
        name="password"
        control={control}
        rules={{
          required: 'Password is required',
          minLength: { value: 8, message: 'Password must be at least 8 characters' },
        }}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            error={!!errors.password}
            helperText={errors.password?.message}
            disabled={isSubmitting}
            sx={fieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Lock sx={{ color: 'var(--auth-icon, rgba(255,255,255,0.35))' }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword((p) => !p)}
                    edge="end"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    sx={{ color: 'var(--auth-icon, rgba(255,255,255,0.35))' }}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      <Controller
        name="confirmPassword"
        control={control}
        rules={{
          required: 'Please confirm your password',
          validate: (value, formValues) =>
            value === formValues.password || 'Passwords do not match',
        }}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="Confirm Password"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            error={!!errors.confirmPassword}
            helperText={errors.confirmPassword?.message}
            disabled={isSubmitting}
            sx={fieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Lock sx={{ color: 'var(--auth-icon, rgba(255,255,255,0.35))' }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowConfirm((p) => !p)}
                    edge="end"
                    tabIndex={-1}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    sx={{ color: 'var(--auth-icon, rgba(255,255,255,0.35))' }}
                  >
                    {showConfirm ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        )}
      />
    </Stack>
  );
}
