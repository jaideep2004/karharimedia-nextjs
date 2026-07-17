'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import {
  Box,
  Button,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  TextField,
  useTheme,
} from '@mui/material';
import {
  ArrowForward,
  ArrowBack,
  Error as ErrorIcon,
  CheckCircle,
  GraphicEq,
  Insights,
  Public,
} from '@mui/icons-material';
import { useAuth } from '@/context/AppContext';
import SignupStepper from '@/components/signup/SignupStepper';
import Step1BasicInfo from '@/components/signup/Step1BasicInfo';
import { fieldSx } from '@/components/signup/styles';
import {
  SignupFormValues,
  defaultSignupValues,
  SIGNUP_STEPS,
} from './types';
import {
  AUTH_BUTTON_GRADIENT,
  AuthLogo,
  authStyleVars,
  getAuthTokens,
} from '@/components/auth/authBrand';

// Fields validated per step
const STEP_FIELDS: Record<number, (keyof SignupFormValues)[]> = {
  1: ['name', 'email', 'phoneNumber', 'password', 'confirmPassword'],
  2: [],
};

const signupFeatureCards = [
  {
    icon: <Public sx={{ fontSize: 20 }} />,
    title: 'Worldwide Delivery',
    text: 'Prepare releases for 150+ platforms with clean account setup.',
  },
  {
    icon: <Insights sx={{ fontSize: 20 }} />,
    title: 'Royalty Ready',
    text: 'Start with verified contact data for payouts and reporting.',
  },
  {
    icon: <GraphicEq sx={{ fontSize: 20 }} />,
    title: 'Creator Control',
    text: 'Keep music, metadata, publishing, and approvals in one workspace.',
  },
];

export default function SignupPage() {
  const { startSignup, verifySignup } = useAuth();
  const theme = useTheme();
  const authTokens = getAuthTokens(theme.palette.mode);

  const [mounted, setMounted] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSignupEnabled, setIsSignupEnabled] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [smsOtp, setSmsOtp] = useState('');

  const {
    control,
    handleSubmit,
    trigger,
    watch,
    getValues,
    formState: { errors },
  } = useForm<SignupFormValues>({
    defaultValues: defaultSignupValues,
    mode: 'onTouched',
  });

  const phoneNumber = watch('phoneNumber');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Check signup enabled
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/settings/signup-enabled');
        const data = await res.json();
        setIsSignupEnabled(data.success ? data.enabled : false);
      } catch {
        setIsSignupEnabled(false);
      } finally {
        setIsLoading(false);
      }
    };
    check();
  }, []);

  const handleNext = async () => {
    const valid = await trigger(STEP_FIELDS[1] as any);
    if (!valid) return;
    await onSubmit(getValues());
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(1);
  };

  const onSubmit = async (data: SignupFormValues) => {
    setServerError(null);

    setIsSubmitting(true);
    try {
      if (otpSent) {
        await verifySignup({ email: pendingEmail || data.email, emailOtp, smsOtp });
        return;
      }

      await startSignup({
        name: data.name,
        email: data.email,
        password: data.password,
        accountType: 'artist',
        phoneNumber: data.phoneNumber,
        verification: {
          phoneNumber: data.phoneNumber,
        },
      });
      setPendingEmail(data.email);
      setOtpSent(true);
      setCurrentStep(2);
    } catch (err: any) {
      setServerError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Box
        style={authStyleVars(theme.palette.mode)}
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: authTokens.pageBackground,
          bgcolor: authTokens.pageBgColor,
          color: authTokens.text,
        }}
      >
        <CircularProgress sx={{ color: theme.palette.primary.main }} />
      </Box>
    );
  }

  // Signup disabled
  if (!isSignupEnabled) {
    return (
      <Box
        style={authStyleVars(theme.palette.mode)}
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: authTokens.pageBackground,
          bgcolor: authTokens.pageBgColor,
          color: authTokens.text,
          px: 2,
        }}
      >
        <Box
          sx={{
            maxWidth: 480,
            width: '100%',
            p: { xs: 3, sm: 5 },
            borderRadius: '28px',
            background: authTokens.surfaceBackground,
            border: `1px solid ${authTokens.border}`,
            backdropFilter: 'blur(18px)',
            textAlign: 'center',
          }}
        >
          <ErrorIcon sx={{ fontSize: 56, color: '#ef4444', mb: 2 }} />
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'var(--auth-text)', mb: 1.5 }}>
            Registrations Currently Disabled
          </Typography>
          <Typography sx={{ color: 'var(--auth-muted)', mb: 3, lineHeight: 1.7 }}>
            We're not accepting new registrations at this time. Please check back later or
            contact support.
          </Typography>
          <Button
            component={Link}
            href="/login"
            variant="contained"
            sx={{
              borderRadius: '14px',
              fontWeight: 700,
              background: AUTH_BUTTON_GRADIENT,
              px: 4,
              py: 1.5,
            }}
          >
            Go to Login
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      style={authStyleVars(theme.palette.mode)}
      sx={{
        width: '100vw',
        ml: 'calc(50% - 50vw)',
        mr: 'calc(50% - 50vw)',
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        px: { xs: 2, sm: 3, md: 5, lg: 6 },
        py: { xs: 3, md: 6 },
        background: authTokens.pageBackground,
        bgcolor: authTokens.pageBgColor,
        color: authTokens.text,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'transparent',
        }}
      />

      <Box
        sx={{
          maxWidth: 1360,
          mx: 'auto',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(520px, 600px)' },
            gap: { xs: 3, md: 4, lg: 5 },
            alignItems: 'stretch',
          }}
        >
          {/* Left panel — brand */}
          <Box
            sx={{
              display: { xs: 'none', lg: 'flex' },
              borderRadius: '36px',
              p: { md: 5 },
              minHeight: { lg: 760 },
              flexDirection: 'column',
              justifyContent: 'space-between',
              color: authTokens.panelText,
              position: 'relative',
              overflow: 'hidden',
              background: authTokens.panelBackground,
              border: `1px solid ${authTokens.border}`,
              boxShadow: '0 28px 80px rgba(3,10,24,0.34)',
              transform: mounted ? 'translateY(0)' : 'translateY(16px)',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 600ms ease, transform 600ms ease',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background:
                  authTokens.panelOverlay,
              }}
            />

            <Stack spacing={3} sx={{ position: 'relative', zIndex: 1 }}>
              <AuthLogo width={230} />

              <Box>
                <Typography
                  sx={{
                    fontSize: { md: '2.8rem', lg: '3.2rem' },
                    lineHeight: 1.05,
                    fontWeight: 800,
                    letterSpacing: 0,
                  }}
                >
                  Build your premium distribution workspace.
                </Typography>
                <Typography
                  sx={{
                    mt: 2,
                    maxWidth: 560,
                    fontSize: '1.05rem',
                    lineHeight: 1.7,
                    color: 'var(--auth-panel-muted)',
                  }}
                >
                  Artists and labels get a focused onboarding flow for releases, verification,
                  royalties, publishing, and payout readiness.
                </Typography>
              </Box>

              <Stack spacing={1.5}>
                {[
                  'Distribute to 150+ streaming platforms globally',
                  'Real-time royalty tracking and payout management',
                  'Full catalog control with metadata and rights management',
                  'Artist and label workflows built for scale',
                ].map((point) => (
                  <Box
                    key={point}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
                  >
                    <CheckCircle sx={{ color: theme.palette.primary.main, fontSize: 18, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: '0.98rem', color: 'var(--auth-panel-text)' }}>
                      {point}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Stack>

            <Box
              sx={{
                position: 'relative',
                zIndex: 1,
                mt: 6,
              }}
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 2,
                }}
              >
                {signupFeatureCards.map((card) => (
                  <Box
                    key={card.title}
                    sx={{
                      p: 2.5,
                      minHeight: 170,
                      borderRadius: '24px',
                      background: 'var(--auth-card-bg)',
                      border: '1px solid var(--auth-card-border)',
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    <Box
                      sx={{
                        width: 42,
                        height: 42,
                        borderRadius: '14px',
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: 'rgba(237,30,121,0.14)',
                        color: '#ff7ab8',
                        mb: 1.5,
                      }}
                    >
                      {card.icon}
                    </Box>
                    <Typography sx={{ fontWeight: 800, mb: 0.75 }}>{card.title}</Typography>
                    <Typography sx={{ color: 'var(--auth-panel-muted)', lineHeight: 1.6 }}>
                      {card.text}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          {/* Right panel — form */}
          <Box
            sx={{
              width: '100%',
              maxWidth: { xs: 640, lg: 'none' },
              mx: { xs: 'auto', lg: 0 },
              borderRadius: { xs: '28px', md: '32px' },
              p: { xs: 2.5, sm: 4, md: 5 },
              alignSelf: 'stretch',
              background: authTokens.surfaceBackground,
              border: `1px solid ${authTokens.border}`,
              boxShadow: authTokens.shadow,
              backdropFilter: 'blur(18px)',
              transform: mounted ? 'translateY(0)' : 'translateY(20px)',
              opacity: mounted ? 1 : 0,
              transition: 'opacity 700ms ease 120ms, transform 700ms ease 120ms',
            }}
          >
            {/* Header */}
            <Box sx={{ mb: 4 }}>
              <Typography
                sx={{
                  fontSize: { xs: '1.7rem', sm: '2rem' },
                  fontWeight: 800,
                  color: 'var(--auth-text)',
                  letterSpacing: 0,
                  lineHeight: 1.1,
                }}
              >
                Create Your Account
              </Typography>
              <Typography
                sx={{
                  mt: 1,
                  color: 'var(--auth-muted)',
                  lineHeight: 1.7,
                }}
              >
                Already have an account?{' '}
                <Link
                  href="/login"
                  style={{ color: theme.palette.primary.main, fontWeight: 700, textDecoration: 'none' }}
                >
                  Sign in
                </Link>
              </Typography>
            </Box>

            {/* Stepper */}
            <SignupStepper currentStep={currentStep} steps={SIGNUP_STEPS} />

            {/* Server error */}
            {serverError && (
              <Alert
                severity="error"
                sx={{ mb: 3, borderRadius: '14px' }}
                onClose={() => setServerError(null)}
              >
                {serverError}
              </Alert>
            )}

            {/* Step content */}
            <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
              {currentStep === 1 && (
                <Step1BasicInfo
                  control={control}
                  errors={errors}
                  isSubmitting={isSubmitting}
                />
              )}

              {currentStep === 2 && (
                <Stack spacing={2.5}>
                  <Alert severity="success" sx={{ borderRadius: '14px' }}>
                    OTP sent to {pendingEmail || getValues('email')} and {phoneNumber}. Enter both codes to finish signup.
                  </Alert>
                  <TextField
                    label="Email OTP"
                    name="emailOtp"
                    value={emailOtp}
                    onChange={(event) => setEmailOtp(event.target.value)}
                    inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code' }}
                    disabled={isSubmitting}
                    spellCheck={false}
                    fullWidth
                    sx={fieldSx}
                  />
                  <TextField
                    label="Mobile OTP"
                    name="smsOtp"
                    value={smsOtp}
                    onChange={(event) => setSmsOtp(event.target.value)}
                    inputProps={{ inputMode: 'numeric', autoComplete: 'one-time-code' }}
                    disabled={isSubmitting}
                    spellCheck={false}
                    fullWidth
                    sx={fieldSx}
                  />
                </Stack>
              )}

              {/* Navigation buttons */}
              <Stack
                direction={{ xs: 'column-reverse', sm: 'row' }}
                spacing={2}
                sx={{ mt: 4, justifyContent: 'space-between' }}
              >
                {currentStep > 1 ? (
                  <Button
                    onClick={handleBack}
                    disabled={isSubmitting}
                    startIcon={<ArrowBack />}
                    sx={{
                      borderRadius: '14px',
                      color: 'var(--auth-muted)',
                      border: '1px solid var(--auth-field-border)',
                      px: 3,
                      py: 1.5,
                      width: { xs: '100%', sm: 'auto' },
                      textTransform: 'none',
                      fontWeight: 600,
                      '&:hover': {
                        background: 'var(--auth-card-bg)',
                        borderColor: 'var(--auth-card-border)',
                      },
                    }}
                  >
                    Back
                  </Button>
                ) : (
                  <Box />
                )}

                {currentStep === 1 ? (
                  <Button
                    onClick={handleNext}
                    disabled={isSubmitting}
                    endIcon={<ArrowForward />}
                    variant="contained"
                    sx={{
                      borderRadius: '14px',
                      fontWeight: 700,
                      fontSize: '1rem',
                      px: 4,
                      py: 1.5,
                      width: { xs: '100%', sm: 'auto' },
                      textTransform: 'none',
                      background: AUTH_BUTTON_GRADIENT,
                      boxShadow: '0 12px 28px rgba(237,30,121,0.22)',
                      '&:hover': {
                        background: AUTH_BUTTON_GRADIENT,
                        boxShadow: '0 16px 32px rgba(214,215,13,0.20)',
                      },
                    }}
                  >
                    {isSubmitting ? 'Sending…' : 'Send OTP'}
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    endIcon={
                      isSubmitting ? (
                        <CircularProgress size={18} sx={{ color: 'white' }} />
                      ) : (
                        <ArrowForward />
                      )
                    }
                    variant="contained"
                    sx={{
                      borderRadius: '14px',
                      fontWeight: 700,
                      fontSize: '1rem',
                      px: 4,
                      py: 1.5,
                      width: { xs: '100%', sm: 'auto' },
                      textTransform: 'none',
                      background: AUTH_BUTTON_GRADIENT,
                      boxShadow: '0 12px 28px rgba(237,30,121,0.22)',
                      '&:hover': {
                        background: AUTH_BUTTON_GRADIENT,
                        boxShadow: '0 16px 32px rgba(214,215,13,0.20)',
                      },
                      '&.Mui-disabled': {
                        background: 'rgba(123,31,162,0.34)',
                        color: 'var(--auth-faint)',
                      },
                    }}
                  >
                    {isSubmitting ? 'Verifying…' : otpSent ? 'Verify & Create Account' : 'Send OTP'}
                  </Button>
                )}
              </Stack>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
