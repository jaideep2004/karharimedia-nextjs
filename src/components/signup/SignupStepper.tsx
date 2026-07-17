'use client';

import {
  Box,
  Stepper,
  Step,
  StepLabel,
  LinearProgress,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

export interface SignupStepperProps {
  currentStep: 1 | 2 | 3;
  steps: { label: string }[];
}

export default function SignupStepper({ currentStep, steps }: SignupStepperProps) {
  const theme = useTheme();
  const progressValue = ((currentStep - 1) / (steps.length - 1)) * 100;

  return (
    <Box sx={{ mb: 4 }}>
      <Stepper
        activeStep={currentStep - 1}
        sx={{
          mb: 2,
          '& .MuiStepLabel-label': {
            color: 'var(--auth-muted, rgba(255,255,255,0.45))',
            fontSize: '0.82rem',
            fontWeight: 500,
          },
          '& .MuiStepLabel-label.Mui-active': {
            color: theme.palette.primary.main,
            fontWeight: 700,
          },
          '& .MuiStepLabel-label.Mui-completed': {
            color: 'var(--auth-text, rgba(255,255,255,0.7))',
          },
          '& .MuiStepIcon-root': {
            color: 'var(--auth-field-border, rgba(255,255,255,0.15))',
          },
          '& .MuiStepIcon-root.Mui-active': {
            color: theme.palette.primary.main,
          },
          '& .MuiStepIcon-root.Mui-completed': {
            color: '#d6d70d',
          },
          '& .MuiStepConnector-line': {
            borderColor: 'var(--auth-field-border, rgba(255,255,255,0.12))',
          },
        }}
      >
        {steps.map((step) => (
          <Step key={step.label}>
            <StepLabel>{step.label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <LinearProgress
        variant="determinate"
        value={progressValue}
        sx={{
          height: 4,
          borderRadius: 2,
          backgroundColor: 'var(--auth-field-border, rgba(255,255,255,0.08))',
          '& .MuiLinearProgress-bar': {
            borderRadius: 2,
            background: `linear-gradient(90deg, ${theme.palette.primary.main}, #d6d70d)`,
          },
        }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
        <Typography variant="caption" sx={{ color: 'var(--auth-muted, rgba(255,255,255,0.4))' }}>
          Step {currentStep} of {steps.length}
        </Typography>
        <Typography variant="caption" sx={{ color: 'var(--auth-muted, rgba(255,255,255,0.4))' }}>
          {Math.round(progressValue)}% complete
        </Typography>
      </Box>
    </Box>
  );
}
