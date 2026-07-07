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
  MenuItem,
  Divider,
} from '@mui/material';
import {
  Business,
  Person,
  Language,
  Instagram,
  Twitter,
  Facebook,
  YouTube,
} from '@mui/icons-material';
import FileDropZone from './FileDropZone';
import { SignupFormValues } from '@/app/(public)/signup/types';
import {
  compactToggleGroupSx,
  fieldSx,
  formSectionSx,
  sectionCaptionSx,
  sectionTitleSx,
  twoColumnGridSx,
} from './styles';

export interface Step3LabelProps {
  control: Control<SignupFormValues>;
  errors: FieldErrors<SignupFormValues>;
  isSubmitting: boolean;
  registrationType: 'individual' | 'registered_company' | '';
  companyType: 'private' | 'public' | '';
}

export default function Step3Label({
  control,
  errors,
  isSubmitting,
  registrationType,
  companyType,
}: Step3LabelProps) {
  return (
    <Stack spacing={2.5} sx={formSectionSx}>
      <Box>
        <Typography variant="h6" sx={sectionTitleSx}>
          Label Details
        </Typography>
        <Typography variant="body2" sx={sectionCaptionSx}>
          Provide your label and legal information
        </Typography>
      </Box>

      {/* Label Name */}
      <Controller
        name="labelName"
        control={control}
        rules={{ required: 'Label name is required' }}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="Label Name"
            error={!!errors.labelName}
            helperText={errors.labelName?.message}
            disabled={isSubmitting}
            sx={fieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Business sx={{ color: 'rgba(255,255,255,0.35)' }} />
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      {/* Registration Type */}
      <Box>
        <Typography
          variant="body2"
          sx={{ mb: 1, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}
        >
          Registration Type *
        </Typography>
        <Controller
          name="registrationType"
          control={control}
          rules={{ required: 'Please select a registration type' }}
          render={({ field }) => (
            <>
              <ToggleButtonGroup
                exclusive
                value={field.value || null}
                onChange={(_e, val) => val && field.onChange(val)}
                sx={{ ...compactToggleGroupSx, mb: 2 }}
              >
                <ToggleButton value="individual">Individual</ToggleButton>
                <ToggleButton value="registered_company">Registered Company</ToggleButton>
              </ToggleButtonGroup>
              {errors.registrationType && (
                <Typography variant="caption" sx={{ color: '#ef4444', display: 'block', mb: 1 }}>
                  {errors.registrationType.message}
                </Typography>
              )}
            </>
          )}
        />
      </Box>

      {/* Individual fields */}
      {registrationType === 'individual' && (
        <Stack spacing={2.5}>
          <Controller
            name="labelLegalName"
            control={control}
            rules={{ required: 'Legal name is required' }}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="Legal Name"
                error={!!errors.labelLegalName}
                helperText={errors.labelLegalName?.message}
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

          <Controller
            name="labelGovIdFile"
            control={control}
            rules={{ required: 'Government ID photo is required' }}
            render={({ field }) => (
              <FileDropZone
                label="Photo of Government ID *"
                accept="image/jpeg,image/png"
                hint="JPEG or PNG, max 10 MB"
                value={field.value}
                onChange={field.onChange}
                error={errors.labelGovIdFile?.message as string | undefined}
                disabled={isSubmitting}
              />
            )}
          />
        </Stack>
      )}

      {/* Registered Company fields */}
      {registrationType === 'registered_company' && (
        <Stack spacing={2.5}>
          <Controller
            name="legalEntityName"
            control={control}
            rules={{ required: 'Legal entity name is required' }}
            render={({ field }) => (
              <TextField
                {...field}
                fullWidth
                label="Legal Entity Name"
                error={!!errors.legalEntityName}
                helperText={errors.legalEntityName?.message}
                disabled={isSubmitting}
                sx={fieldSx}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Business sx={{ color: 'rgba(255,255,255,0.35)' }} />
                    </InputAdornment>
                  ),
                }}
              />
            )}
          />

          {/* Company Type */}
          <Box>
            <Typography
              variant="body2"
              sx={{ mb: 1, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}
            >
              Company Type *
            </Typography>
            <Controller
              name="companyType"
              control={control}
              rules={{ required: 'Please select a company type' }}
              render={({ field }) => (
                <>
                  <ToggleButtonGroup
                    exclusive
                    value={field.value || null}
                    onChange={(_e, val) => val && field.onChange(val)}
                    sx={{ ...compactToggleGroupSx, mb: 2 }}
                  >
                    <ToggleButton value="private">Private</ToggleButton>
                    <ToggleButton value="public">Public</ToggleButton>
                  </ToggleButtonGroup>
                  {errors.companyType && (
                    <Typography
                      variant="caption"
                      sx={{ color: '#ef4444', display: 'block', mb: 1 }}
                    >
                      {errors.companyType.message}
                    </Typography>
                  )}
                </>
              )}
            />
          </Box>

          {/* Private: Incorporation Certificate */}
          {companyType === 'private' && (
            <Controller
              name="incorporationCertFile"
              control={control}
              rules={{ required: 'Incorporation certificate is required' }}
              render={({ field }) => (
                <FileDropZone
                  label="Incorporation Certificate *"
                  accept="application/pdf"
                  hint="PDF only, max 10 MB"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.incorporationCertFile?.message as string | undefined}
                  disabled={isSubmitting}
                />
              )}
            />
          )}

          {/* Public: GST Certificate */}
          {companyType === 'public' && (
            <Controller
              name="gstCertFile"
              control={control}
              rules={{ required: 'GST certificate is required' }}
              render={({ field }) => (
                <FileDropZone
                  label="GST Certificate *"
                  accept="application/pdf"
                  hint="PDF only, max 10 MB"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.gstCertFile?.message as string | undefined}
                  disabled={isSubmitting}
                />
              )}
            />
          )}
        </Stack>
      )}

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Catalog Info */}
      <Typography variant="subtitle2" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
        Catalog Information
      </Typography>

      <Box sx={twoColumnGridSx}>
        <Controller
          name="totalArtists"
          control={control}
          rules={{
            required: 'Required',
            min: { value: 0, message: 'Must be 0 or more' },
          }}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Total Artists"
              type="number"
              error={!!errors.totalArtists}
              helperText={errors.totalArtists?.message}
              disabled={isSubmitting}
              sx={fieldSx}
              inputProps={{ min: 0, step: 1 }}
            />
          )}
        />

        <Controller
          name="totalRevenue"
          control={control}
          rules={{
            required: 'Required',
            min: { value: 0, message: 'Must be 0 or more' },
          }}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Total Revenue (₹)"
              type="number"
              error={!!errors.totalRevenue}
              helperText={errors.totalRevenue?.message}
              disabled={isSubmitting}
              sx={fieldSx}
              inputProps={{ min: 0, step: 0.01 }}
            />
          )}
        />
      </Box>

      <Box sx={twoColumnGridSx}>
        <Controller
          name="catalogSize"
          control={control}
          rules={{
            required: 'Required',
            min: { value: 0, message: 'Must be 0 or more' },
          }}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Total Catalog Size"
              type="number"
              error={!!errors.catalogSize}
              helperText={errors.catalogSize?.message}
              disabled={isSubmitting}
              sx={fieldSx}
              inputProps={{ min: 0, step: 1 }}
            />
          )}
        />

        <Controller
          name="rightsType"
          control={control}
          rules={{ required: 'Rights type is required' }}
          render={({ field }) => (
            <TextField
              {...field}
              select
              fullWidth
              label="Rights Type"
              error={!!errors.rightsType}
              helperText={errors.rightsType?.message}
              disabled={isSubmitting}
              sx={fieldSx}
            >
              <MenuItem value="exclusive">Exclusive</MenuItem>
              <MenuItem value="non_exclusive">Non-Exclusive</MenuItem>
            </TextField>
          )}
        />
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Online Presence */}
      <Typography variant="subtitle2" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
        Online Presence (Optional)
      </Typography>

      <Controller
        name="companyWebsite"
        control={control}
        rules={{
          validate: (v) =>
            !v || /^https?:\/\/.+/.test(v) || 'Enter a valid URL (e.g. https://example.com)',
        }}
        render={({ field }) => (
          <TextField
            {...field}
            fullWidth
            label="Company Website"
            placeholder="https://yourlabel.com"
            error={!!errors.companyWebsite}
            helperText={errors.companyWebsite?.message}
            disabled={isSubmitting}
            sx={fieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Language sx={{ color: 'rgba(255,255,255,0.35)' }} />
                </InputAdornment>
              ),
            }}
          />
        )}
      />

      {/* Social Links */}
      <Box sx={twoColumnGridSx}>
        {(
          [
            { name: 'socialLinks.instagram', label: 'Instagram', icon: <Instagram /> },
            { name: 'socialLinks.twitter', label: 'Twitter / X', icon: <Twitter /> },
            { name: 'socialLinks.facebook', label: 'Facebook', icon: <Facebook /> },
            { name: 'socialLinks.youtube', label: 'YouTube', icon: <YouTube /> },
          ] as const
        ).map(({ name, label, icon }) => (
          <Controller
            key={name}
            name={name as any}
            control={control}
            rules={{
              validate: (v: string) =>
                !v || /^https?:\/\/.+/.test(v) || 'Enter a valid URL',
            }}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                fullWidth
                label={label}
                placeholder="https://..."
                error={!!fieldState.error}
                helperText={fieldState.error?.message}
                disabled={isSubmitting}
                sx={fieldSx}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Box sx={{ color: 'rgba(255,255,255,0.35)', display: 'flex' }}>
                        {icon}
                      </Box>
                    </InputAdornment>
                  ),
                }}
              />
            )}
          />
        ))}
      </Box>
    </Stack>
  );
}
