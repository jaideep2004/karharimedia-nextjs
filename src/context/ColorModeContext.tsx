'use client';
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ThemeProvider, createTheme, PaletteMode } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';

// Define the context type
type ColorModeContextType = {
  mode: PaletteMode;
  toggleColorMode: () => void;
};

// Create the context
export const ColorModeContext = createContext<ColorModeContextType>({
  mode: 'dark',
  toggleColorMode: () => {},
});

// Custom hook to use the color mode
export const useColorMode = () => useContext(ColorModeContext);

// Provider component
export function ColorModeProvider({ children }: { children: React.ReactNode }) {
  // Use state to track the current mode - default to dark
  const [mode, setMode] = useState<PaletteMode>('dark');

  // Initialize mode from localStorage or system preference
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem('colorMode') as PaletteMode | null;
      if (savedMode && (savedMode === 'light' || savedMode === 'dark')) {
        setMode(savedMode);
      } else {
        // Check system preference
        const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const systemMode = prefersDarkMode ? 'dark' : 'light';
        setMode(systemMode);
        // Save system preference to localStorage
        localStorage.setItem('colorMode', systemMode);
      }
    } catch (error) {
      console.error('Error initializing color mode:', error);
      // Fallback to dark mode
      setMode('dark');
    }
  }, []);

  // Toggle function
  const toggleColorMode = () => {
    setMode((prevMode) => {
      const newMode = prevMode === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('colorMode', newMode);
      } catch (error) {
        console.error('Error saving to localStorage:', error);
      }
      return newMode;
    });
  };

  // Create a theme with the current mode
  const theme = useMemo(
    () => {
      const isDark = mode === 'dark';
      const textPrimary = isDark ? '#e9fbff' : '#111827';
      const textSecondary = isDark ? 'rgba(216, 247, 255, 0.68)' : '#536173';
      const divider = isDark ? 'rgba(0, 231, 255, 0.14)' : 'rgba(17, 24, 39, 0.10)';
      const appBackground = isDark
        ? '#08061a'
        : '#f3f8fb';
      const appBackgroundImage = isDark
        ? [
            'radial-gradient(900px 520px at 78% 22%, rgba(0, 231, 255, 0.18), transparent 62%)',
            'radial-gradient(760px 520px at 14% 14%, rgba(67, 29, 140, 0.34), transparent 64%)',
            'linear-gradient(rgba(0, 231, 255, 0.085) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(0, 231, 255, 0.085) 1px, transparent 1px)',
            'linear-gradient(135deg, #08061a 0%, #100725 45%, #061426 100%)',
          ].join(', ')
        : [
            'radial-gradient(900px 520px at 78% 18%, rgba(0, 153, 199, 0.11), transparent 62%)',
            'linear-gradient(rgba(0, 153, 199, 0.06) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(0, 153, 199, 0.06) 1px, transparent 1px)',
            '#f3f8fb',
          ].join(', ');

      return createTheme({
        palette: {
          mode,
          primary: {
            main: '#00e7ff',
            light: '#7ad9ff',
            dark: '#0098c7',
            contrastText: '#06121b',
          },
          secondary: {
            main: '#d6d70d',
            light: '#eef15b',
            dark: '#9a9500',
            contrastText: '#121212',
          },
          success: {
            main: '#21c58b',
            light: '#59dcae',
            dark: '#0b8f62',
          },
          warning: {
            main: '#f5a524',
            light: '#ffc45c',
            dark: '#c77b05',
          },
          error: {
            main: '#f2556b',
            light: '#ff8495',
            dark: '#be233d',
          },
          info: {
            main: '#00b8d9',
            light: '#6feaff',
            dark: '#007993',
          },
          background: {
            default: appBackground,
            paper: isDark ? '#120a2a' : '#ffffff',
          },
          text: {
            primary: textPrimary,
            secondary: textSecondary,
          },
          divider,
        },
        shape: {
          borderRadius: 14,
        },
        typography: {
          fontFamily: '"Plus Jakarta Sans", "DM Sans", "Segoe UI", sans-serif',
          h1: {
            fontWeight: 850,
            letterSpacing: 0,
          },
          h2: {
            fontWeight: 850,
            letterSpacing: 0,
          },
          h3: {
            fontWeight: 800,
            letterSpacing: 0,
          },
          h4: {
            fontWeight: 800,
            letterSpacing: 0,
          },
          h5: {
            fontWeight: 760,
            letterSpacing: 0,
          },
          h6: {
            fontWeight: 740,
            letterSpacing: 0,
          },
          button: {
            fontWeight: 800,
            letterSpacing: 0,
          },
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                backgroundColor: appBackground,
                backgroundImage: appBackgroundImage,
                backgroundAttachment: 'fixed',
                backgroundSize: isDark
                  ? 'auto, auto, 96px 96px, 96px 96px, auto'
                  : 'auto, 96px 96px, 96px 96px, auto',
                color: textPrimary,
              },
              '::selection': {
                backgroundColor: isDark ? 'rgba(0, 231, 255, 0.34)' : 'rgba(0, 153, 199, 0.22)',
              },
            },
          },
          MuiAppBar: {
            styleOverrides: {
              colorDefault: {
                backgroundColor: isDark ? 'rgba(16, 7, 37, 0.86)' : 'rgba(255, 255, 255, 0.9)',
                color: textPrimary,
                borderBottom: `1px solid ${divider}`,
              },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: {
                borderRadius: 14,
                textTransform: 'none',
                fontWeight: 800,
                minHeight: 42,
                touchAction: 'manipulation',
              },
              contained: {
                boxShadow: isDark
                  ? '0 12px 28px rgba(0, 231, 255, 0.24)'
                  : '0 12px 24px rgba(0, 153, 199, 0.16)',
                '&:hover': {
                  boxShadow: isDark
                    ? '0 18px 36px rgba(0, 231, 255, 0.32)'
                    : '0 16px 28px rgba(0, 153, 199, 0.22)',
                },
              },
              outlined: {
                borderColor: divider,
              },
            },
          },
          MuiCard: {
            styleOverrides: {
              root: {
                borderRadius: 18,
                backgroundImage: 'none',
                backgroundColor: isDark ? 'rgba(18, 10, 42, 0.9)' : '#ffffff',
                border: `1px solid ${divider}`,
                boxShadow: isDark
                  ? '0 22px 52px rgba(0, 0, 0, 0.38), 0 0 32px rgba(0, 231, 255, 0.05)'
                  : '0 22px 52px rgba(27, 39, 68, 0.09)',
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: 'none',
                color: textPrimary,
              },
              outlined: {
                borderColor: divider,
              },
            },
          },
          MuiChip: {
            styleOverrides: {
              root: {
                borderRadius: 999,
                fontWeight: 800,
              },
            },
          },
          MuiTableCell: {
            styleOverrides: {
              root: {
                borderBottomColor: divider,
                color: textPrimary,
              },
              head: {
                color: textSecondary,
                fontWeight: 850,
                letterSpacing: 0,
              },
            },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                borderRadius: 14,
                backgroundColor: isDark ? 'rgba(216, 247, 255, 0.045)' : '#ffffff',
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: divider,
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: isDark ? 'rgba(0, 231, 255, 0.38)' : 'rgba(0, 153, 199, 0.3)',
                },
              },
              input: {
                color: textPrimary,
              },
            },
          },
          MuiInputLabel: {
            styleOverrides: {
              root: {
                color: textSecondary,
              },
            },
          },
          MuiMenu: {
            styleOverrides: {
              paper: {
                borderRadius: 16,
                border: `1px solid ${divider}`,
                backgroundImage: 'none',
              },
            },
          },
        },
      });
    },
    [mode]
  );

  // Context value
  const colorModeContextValue = useMemo(
    () => ({
      mode,
      toggleColorMode,
    }),
    [mode]
  );

  // Always render children to prevent hydration mismatch
  return (
    <ColorModeContext.Provider value={colorModeContextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
