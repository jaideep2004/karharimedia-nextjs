"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import {
  Container,
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardMedia,
  IconButton,
  Chip,
  Divider,
  Link as MuiLink,
  CircularProgress,
  Alert,
  Paper,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  Instagram,
  Facebook,
  Twitter,
  Language,
  MusicNote,
} from '@mui/icons-material';
import Link from 'next/link';

// Fetch artist data (would normally come from API)
const fetchArtist = async (slug: string) => {
  // This would be an API call in production
  // For demo purposes, return mock data
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: '1',
        name: 'John Doe',
        artistName: 'J-Doe',
        slug: 'j-doe',
        bio: 'Electronic music producer and DJ with over 10 years of experience. Known for blending techno and ambient sounds into unique sonic landscapes.',
        profilePicture: 'https://source.unsplash.com/random/400x400/?artist',
        socialLinks: {
          website: 'https://example.com',
          instagram: 'johndoe',
          twitter: 'johndoe',
          facebook: 'johndoe',
        },
        tracks: [
          {
            id: '1',
            title: 'Neon Dreams',
            genre: 'Electronic',
            releaseDate: '2023-04-15',
            audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
            artworkUrl: 'https://source.unsplash.com/random/500x500/?electronic',
            status: 'approved',
          },
        ],
      });
    }, 800);
  });
};

export default function ArtistProfileClient() {
  const { slug } = useParams();
  const [artist, setArtist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchArtist(slug as string)
      .then((data: any) => {
        setArtist(data);
        setError(null);
      })
      .catch(() => setError('Failed to load artist data'))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }
  if (!artist) {
    return <Alert severity="info">Artist not found.</Alert>;
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Image
            src={artist.profilePicture}
            alt={artist.artistName}
            width={100}
            height={100}
            style={{ borderRadius: '50%', objectFit: 'cover', marginRight: 24 }}
          />
          <Box>
            <Typography variant="h4" fontWeight={700}>{artist.artistName}</Typography>
            <Typography variant="subtitle1" color="text.secondary">{artist.bio}</Typography>
            <Box sx={{ mt: 1 }}>
              {artist.socialLinks.website && (
                <MuiLink href={artist.socialLinks.website} target="_blank" rel="noopener" sx={{ mr: 1 }}>
                  <Language fontSize="small" />
                </MuiLink>
              )}
              {artist.socialLinks.instagram && (
                <MuiLink href={`https://instagram.com/${artist.socialLinks.instagram}`} target="_blank" rel="noopener" sx={{ mr: 1 }}>
                  <Instagram fontSize="small" />
                </MuiLink>
              )}
              {artist.socialLinks.twitter && (
                <MuiLink href={`https://twitter.com/${artist.socialLinks.twitter}`} target="_blank" rel="noopener" sx={{ mr: 1 }}>
                  <Twitter fontSize="small" />
                </MuiLink>
              )}
              {artist.socialLinks.facebook && (
                <MuiLink href={`https://facebook.com/${artist.socialLinks.facebook}`} target="_blank" rel="noopener">
                  <Facebook fontSize="small" />
                </MuiLink>
              )}
            </Box>
          </Box>
        </Box>
        <Divider sx={{ my: 2 }} />
        <Typography variant="h6" gutterBottom>Tracks</Typography>
        <Grid container spacing={2}>
          {artist.tracks.map((track: any) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={track.id}>
              <Card>
                <CardMedia
                  component="img"
                  height="140"
                  image={track.artworkUrl}
                  alt={track.title}
                />
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600}>{track.title}</Typography>
                  <Typography variant="body2" color="text.secondary">{track.genre}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Released: {new Date(track.releaseDate).toLocaleDateString()}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <Chip label={track.status} size="small" color={track.status === 'approved' ? 'success' : 'warning'} icon={<MusicNote fontSize="small" />} />
                  </Box>
                  <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
                    <audio controls style={{ width: '100%' }}>
                      <source src={track.audioUrl} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Container>
  );
}
