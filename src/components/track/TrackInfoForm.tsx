import React from 'react';
import {
  Box, Grid, TextField, MenuItem, Typography, FormControlLabel, Checkbox, InputLabel, Select, FormControl, Button
} from '@mui/material';

export interface TrackInfo {
  title: string;
  version: string;
  artist: string;
  featuring: string;
  remixer: string;
  isrc: string;
  language: string;
  explicit: boolean;
  genre: string;
  subgenre: string;
  trackNumber: number;
  discNumber: number;
  duration: string;
  composers: string;
  publishers: string;
  lyrics: string;
  producers: string;
  copyrightC: string;
  copyrightP: string;
  recordingYear: string;
  originalReleaseDate: string;
  parentalAdvisory: 'explicit' | 'clean' | 'none';
  instrumental: boolean;
}

interface TrackInfoFormProps {
  value: TrackInfo;
  onChange: (info: TrackInfo) => void;
  isrcAuto?: string;
  durationAuto?: string;
}

const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'hi', name: 'Hindi' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  // ... add more as needed
];

const genres = [
  'Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'Country', 'Folk', 'Reggae', 'Blues', 'Other'
];

const subgenres = [
  'Alternative', 'Dance', 'Trap', 'Indie', 'Synthpop', 'Hard Rock', 'Soul', 'RnB', 'Ambient', 'Other'
];

const TrackInfoForm: React.FC<TrackInfoFormProps> = ({ value, onChange, isrcAuto, durationAuto }) => {
  // Helper for field changes
  const handleChange = (field: keyof TrackInfo, v: any) => {
    onChange({ ...value, [field]: v });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Track Information</Typography>
      <Grid container spacing={2}>

        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="Track Title" fullWidth required value={value.title} onChange={e => handleChange('title', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="Version (Remix, Acoustic, etc.)" fullWidth value={value.version} onChange={e => handleChange('version', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="Primary Artist" fullWidth required value={value.artist} onChange={e => handleChange('artist', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="Featuring Artist(s)" fullWidth value={value.featuring} onChange={e => handleChange('featuring', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="Remixer(s)" fullWidth value={value.remixer} onChange={e => handleChange('remixer', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="ISRC" fullWidth required value={value.isrc || isrcAuto || ''} onChange={e => handleChange('isrc', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <FormControl fullWidth>
            <InputLabel>Language</InputLabel>
            <Select
              value={value.language}
              label="Language"
              onChange={e => handleChange('language', e.target.value)}
              required
            >
              {languages.map(l => <MenuItem key={l.code} value={l.code}>{l.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <FormControlLabel
            control={<Checkbox checked={value.explicit} onChange={e => handleChange('explicit', e.target.checked)} />}
            label="Explicit Content"
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <FormControl fullWidth>
            <InputLabel>Genre</InputLabel>
            <Select
              value={value.genre}
              label="Genre"
              onChange={e => handleChange('genre', e.target.value)}
              required
            >
              {genres.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <FormControl fullWidth>
            <InputLabel>Subgenre</InputLabel>
            <Select
              value={value.subgenre}
              label="Subgenre"
              onChange={e => handleChange('subgenre', e.target.value)}
            >
              {subgenres.map(sg => <MenuItem key={sg} value={sg}>{sg}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <TextField label="Track Number" type="number" fullWidth required value={value.trackNumber} onChange={e => handleChange('trackNumber', Number(e.target.value))} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <TextField label="Disc Number" type="number" fullWidth value={value.discNumber} onChange={e => handleChange('discNumber', Number(e.target.value))} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="Duration (mm:ss)" fullWidth value={value.duration || durationAuto || ''} onChange={e => handleChange('duration', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="Composer(s)" fullWidth value={value.composers} onChange={e => handleChange('composers', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="Publisher(s)" fullWidth value={value.publishers} onChange={e => handleChange('publishers', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 12 }}>
          <TextField label="Lyrics" fullWidth multiline minRows={2} value={value.lyrics} onChange={e => handleChange('lyrics', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="Producer(s)" fullWidth value={value.producers} onChange={e => handleChange('producers', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="Copyright (C)" fullWidth value={value.copyrightC} onChange={e => handleChange('copyrightC', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <TextField label="Copyright (P)" fullWidth value={value.copyrightP} onChange={e => handleChange('copyrightP', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <TextField label="Recording Year" type="number" fullWidth value={value.recordingYear} onChange={e => handleChange('recordingYear', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <TextField label="Original Release Date" type="date" fullWidth InputLabelProps={{ shrink: true }} value={value.originalReleaseDate} onChange={e => handleChange('originalReleaseDate', e.target.value)} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <FormControl fullWidth>
            <InputLabel>Parental Advisory</InputLabel>
            <Select
              value={value.parentalAdvisory}
              label="Parental Advisory"
              onChange={e => handleChange('parentalAdvisory', e.target.value)}
            >
              <MenuItem value="explicit">Explicit</MenuItem>
              <MenuItem value="clean">Clean</MenuItem>
              <MenuItem value="none">None</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>

          <FormControlLabel
            control={<Checkbox checked={value.instrumental} onChange={e => handleChange('instrumental', e.target.checked)} />}
            label="Instrumental"
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default TrackInfoForm;
