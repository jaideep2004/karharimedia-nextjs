'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Tooltip,
} from '@mui/material';
import {
  FormatBold,
  FormatItalic,
  FormatUnderlined,
  FormatListBulleted,
  FormatListNumbered,
  Link as LinkIcon,
  Image as ImageIcon,
  OndemandVideo,
  PhotoSizeSelectLarge,
  TableChart,
  Title,
} from '@mui/icons-material';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import { TableKit } from '@tiptap/extension-table';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';

const emptyDoc = { type: 'doc', content: [] };

type TiptapEditorProps = {
  value?: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  onUploadImage?: (file: File) => Promise<{ url: string; fileName?: string }>;
};

export default function TiptapEditor({ value, onChange, onUploadImage }: TiptapEditorProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
      Image.configure({
        HTMLAttributes: { loading: 'lazy' },
        resize: {
          enabled: true,
          minWidth: 120,
          minHeight: 80,
          alwaysPreserveAspectRatio: true,
        },
      }),
      Youtube.configure({ width: 720, height: 405, nocookie: true }),
      TableKit.configure({ table: { resizable: true } }),
      Placeholder.configure({ placeholder: 'Write clear operational guidance for artists, labels, and support teams...' }),
    ],
    content: value || emptyDoc,
    editorProps: {
      attributes: {
        class: 'kb-editor-surface',
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getJSON() as Record<string, unknown>);
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    const next = value || emptyDoc;
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next);
    }
  }, [editor, value]);

  const setLink = () => {
    if (!editor) return;
    const href = window.prompt('URL');
    if (!href) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  const setImage = () => {
    if (!editor) return;
    imageInputRef.current?.click();
  };

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editor || !onUploadImage) return;

    setUploadingImage(true);
    try {
      const media = await onUploadImage(file);
      editor.chain().focus().setImage({ src: media.url, alt: media.fileName || file.name }).run();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const setYoutube = () => {
    if (!editor) return;
    const src = window.prompt('YouTube URL');
    if (!src) return;
    const width = Number(window.prompt('Width in pixels', '720')) || 720;
    const height = Math.round(width * 0.5625);
    editor.commands.setYoutubeVideo({ src, width, height });
  };

  const resizeSelectedMedia = () => {
    if (!editor) return;
    const selectedImage = editor.isActive('image');
    const selectedYoutube = editor.isActive('youtube');
    if (!selectedImage && !selectedYoutube) {
      window.alert('Select an image or YouTube video first.');
      return;
    }

    const width = Number(window.prompt('Width in pixels', selectedYoutube ? '720' : '640'));
    if (!Number.isFinite(width) || width < 120) return;

    if (selectedImage) {
      editor.chain().focus().updateAttributes('image', { width }).run();
      return;
    }

    editor
      .chain()
      .focus()
      .updateAttributes('youtube', { width, height: Math.round(width * 0.5625) })
      .run();
  };

  if (!editor) {
    return <Box sx={{ minHeight: 260, border: '1px solid', borderColor: 'divider', borderRadius: 1 }} />;
  }

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        '& .kb-editor-surface': {
          minHeight: 320,
          p: 2.5,
          outline: 'none',
          color: 'text.primary',
          '& p': { lineHeight: 1.7 },
          '& h2, & h3': { mt: 2.5, mb: 1 },
          '& blockquote': { borderLeft: '4px solid #E46D4E', pl: 2, color: 'text.secondary' },
          '& table': { width: '100%', borderCollapse: 'collapse', my: 2 },
          '& td, & th': { border: '1px solid', borderColor: 'divider', p: 1 },
          '& img': { maxWidth: '100%', borderRadius: 1 },
          '& iframe': { width: '100%', aspectRatio: '16 / 9', border: 0 },
        },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap', gap: 1 }}
      >
        <ButtonGroup size="small" variant="outlined">
          <Tooltip title="Bold">
            <IconButton onClick={() => editor.chain().focus().toggleBold().run()} color={editor.isActive('bold') ? 'primary' : 'default'}>
              <FormatBold fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Italic">
            <IconButton onClick={() => editor.chain().focus().toggleItalic().run()} color={editor.isActive('italic') ? 'primary' : 'default'}>
              <FormatItalic fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Underline">
            <IconButton onClick={() => editor.chain().focus().toggleUnderline().run()} color={editor.isActive('underline') ? 'primary' : 'default'}>
              <FormatUnderlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </ButtonGroup>
        <Divider orientation="vertical" flexItem />
        <Button size="small" startIcon={<Title />} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </Button>
        <Tooltip title="Bulleted list">
          <IconButton onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <FormatListBulleted fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Numbered list">
          <IconButton onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <FormatListNumbered fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Link">
          <IconButton onClick={setLink}>
            <LinkIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Image">
          <IconButton onClick={setImage} disabled={!onUploadImage || uploadingImage}>
            {uploadingImage ? <CircularProgress size={18} /> : <ImageIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <input
          ref={imageInputRef}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={uploadImage}
        />
        <Tooltip title="YouTube">
          <IconButton onClick={setYoutube}>
            <OndemandVideo fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Resize selected media">
          <IconButton onClick={resizeSelectedMedia}>
            <PhotoSizeSelectLarge fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Table">
          <IconButton onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            <TableChart fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      <EditorContent editor={editor} />
    </Box>
  );
}
