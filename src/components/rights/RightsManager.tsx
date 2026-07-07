import React from 'react';
import { Box, Typography, FormControl, InputLabel, Select, MenuItem, TextField, Paper } from '@mui/material';

export type RightsType = 'exclusive' | 'non-exclusive' | 'other';

interface RightsManagerProps {
  rightsType: RightsType;
  description: string;
  onChange: (type: RightsType, description: string) => void;
}

const RightsManager: React.FC<RightsManagerProps> = ({ rightsType, description, onChange }) => {
  return (
    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
      <Typography variant="h6" gutterBottom>Rights Management</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Specify the rights for this track/release (required)
      </Typography>
      <FormControl fullWidth sx={{ mt: 1 }} size="small">
        <InputLabel id="rights-type-label">Rights Type</InputLabel>
        <Select
          labelId="rights-type-label"
          value={rightsType}
          label="Rights Type"
          onChange={e => onChange(e.target.value as RightsType, description)}
        >
          <MenuItem value="exclusive">Exclusive</MenuItem>
          <MenuItem value="non-exclusive">Non-Exclusive</MenuItem>
          <MenuItem value="other">Other</MenuItem>
        </Select>
      </FormControl>
      <TextField
        label="Description (optional)"
        fullWidth
        multiline
        minRows={2}
        size="small"
        sx={{ mt: 2 }}
        helperText="Add any additional context about licensing or ownership (optional)."
        value={description}
        onChange={e => onChange(rightsType, e.target.value)}
      />
    </Paper>
  );
};

export default RightsManager;
