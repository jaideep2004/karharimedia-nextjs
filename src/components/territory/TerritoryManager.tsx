import React, { useState, useEffect } from 'react';
import { Box, Typography, ToggleButton, ToggleButtonGroup, Autocomplete, TextField, Chip, Stack, Button, Divider, Paper } from '@mui/material';
import countries from '../../utils/countries';

export type TerritoryMode = 'allowed' | 'disallowed';

interface TerritoryManagerProps {
  value: string[];
  mode: TerritoryMode;
  onChange: (countries: string[], mode: TerritoryMode) => void;
}

const TerritoryManager: React.FC<TerritoryManagerProps> = ({ value, mode, onChange }) => {
  const [selected, setSelected] = useState<string[]>(value);
  const [currentMode, setCurrentMode] = useState<TerritoryMode>(mode);

  useEffect(() => {
    setSelected(value);
  }, [value]);

  useEffect(() => {
    setCurrentMode(mode);
  }, [mode]);

  return (
    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
      <Typography variant="h6" gutterBottom>Territory Restrictions</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Select the countries where this track/release is {currentMode === 'allowed' ? 'ALLOWED' : 'DISALLOWED'} for distribution.
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <ToggleButtonGroup
          size="small"
          value={currentMode}
          exclusive
          onChange={(_, newMode) => {
            if (newMode) {
              setCurrentMode(newMode);
              onChange(selected, newMode);
            }
          }}
        >
          <ToggleButton value="allowed">Allowed</ToggleButton>
          <ToggleButton value="disallowed">Disallowed</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary">
          Mode: <strong>{currentMode.toUpperCase()}</strong> · Selected: <strong>{selected.length}</strong>
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            if (selected.length < countries.length) {
              const all = countries.map(c => c.code);
              setSelected(all);
              onChange(all, currentMode);
            } else {
              setSelected([]);
              onChange([], currentMode);
            }
          }}
        >
          {selected.length < countries.length ? 'Select All' : 'Clear All'}
        </Button>
      </Stack>
      <Autocomplete
        multiple
        options={countries}
        groupBy={(option) => option.continent}
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(o, v) => o.code === v.code}
        value={countries.filter(c => selected.includes(c.code))}
        onChange={(_, newValue) => {
          setSelected(newValue.map(c => c.code));
          onChange(newValue.map(c => c.code), currentMode);
        }}
        size="small"
        limitTags={6}
        renderTags={(tagValue, getTagProps) =>
          tagValue.map((option, index) => (
            <Chip size="small" variant="outlined" label={option.label} {...getTagProps({ index })} key={option.code} />
          ))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            variant="outlined"
            label="Countries"
            placeholder="Select countries..."
            slotProps={{ inputLabel: { shrink: true } }}
          />
        )}
        sx={{
          mt: 2,
          width: '100%',
          // Keep input tidy with many chips
          '& .MuiInputBase-root': {
            minHeight: 56,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            maxHeight: 160,
            overflowY: 'auto',
            overflowX: 'hidden',
          },
          '& .MuiAutocomplete-input': {
            // remove extra vertical padding so minHeight applies cleanly
            paddingTop: 0.75,
            paddingBottom: 0.75,
          },
          // Ensure outline doesn't create inner lines when label is floating
          '& .MuiOutlinedInput-notchedOutline legend': {
            display: 'none',
          },
          '& .MuiOutlinedInput-root': {
            alignItems: 'flex-start',
          },
          '& .MuiAutocomplete-inputRoot': {
            paddingTop: 6,
            paddingBottom: 6,
          },
          '& .MuiOutlinedInput-notchedOutline': {
            top: 0,
          },
          '& .MuiChip-root': { m: 0.25 },
        }}
      />
    </Paper>
  );
};

export default TerritoryManager;
