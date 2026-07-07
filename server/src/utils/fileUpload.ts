import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import { 
  TRACKS_DIR, 
  ARTWORK_DIR,
  REGISTRATION_DIR,
  SUPPORT_ATTACHMENT_DIR,
  KNOWLEDGE_BASE_MEDIA_DIR,
  MAX_FILE_SIZE,
  PROFILE_IMAGE_MAX_FILE_SIZE,
  ALLOWED_AUDIO_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_SUPPORT_ATTACHMENT_TYPES,
  ALLOWED_KNOWLEDGE_BASE_MEDIA_TYPES,
  SUPPORT_ATTACHMENT_MAX_FILE_SIZE,
  KNOWLEDGE_BASE_MEDIA_MAX_FILE_SIZE
} from '../config/constants';
import { ApiError } from '../middleware/errorHandler.middleware';
import SettingsModel from '../models/settings.model';

// Ensure upload directories exist
[TRACKS_DIR, ARTWORK_DIR, REGISTRATION_DIR, SUPPORT_ATTACHMENT_DIR, KNOWLEDGE_BASE_MEDIA_DIR].forEach(dir => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown upload directory error';
    throw new Error(`Failed to initialize upload directory "${dir}": ${message}`);
  }
});

const sanitizeUploadBasename = (originalName: string) => {
  const parsed = path.parse(originalName || 'upload');
  const safe = parsed.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 120);

  return safe || 'upload';
};

const createUniqueFilename = (file: Express.Multer.File) =>
  `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`;

const createReadableUniqueFilename = (file: Express.Multer.File) =>
  `${sanitizeUploadBasename(file.originalname)}-${uuidv4().slice(0, 8)}${path.extname(file.originalname).toLowerCase()}`;

const createOriginalNameFilename = (destination: string, file: Express.Multer.File) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const base = sanitizeUploadBasename(file.originalname);
  const preferred = `${base}${ext}`;
  if (!fs.existsSync(path.join(destination, preferred))) return preferred;

  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${base}-${index}${ext}`;
    if (!fs.existsSync(path.join(destination, candidate))) return candidate;
  }

  return createReadableUniqueFilename(file);
};

const createStorage = (
  destination: string,
  filenameFactory: (file: Express.Multer.File) => string = createUniqueFilename
) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, destination);
    },
    filename: (_req, file, cb) => {
      cb(null, filenameFactory(file));
    }
  });

const audioStorage = createStorage(TRACKS_DIR, (file) => createOriginalNameFilename(TRACKS_DIR, file));
const imageStorage = createStorage(ARTWORK_DIR, (file) => createOriginalNameFilename(ARTWORK_DIR, file));

const mixedTrackStorage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === 'audio') {
      cb(null, TRACKS_DIR);
      return;
    }

    if (file.fieldname === 'artwork') {
      cb(null, ARTWORK_DIR);
      return;
    }

    cb(new ApiError(`Unsupported upload field: ${file.fieldname}`, 400), TRACKS_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, createOriginalNameFilename(file.fieldname === 'artwork' ? ARTWORK_DIR : TRACKS_DIR, file));
  }
});

// File filter for audio files
const audioFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  void (async () => {
    const configuredSetting = await SettingsModel.findOne({ key: 'allowedFileTypes' }).lean();
    const configuredTypes = configuredSetting?.value || ['mp3', 'wav', 'aac', 'flac'];
    const allowedExtensions = new Set(
      (Array.isArray(configuredTypes) ? configuredTypes : [])
        .map(item => String(item || '').trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean)
    );
    const extension = path.extname(file.originalname).slice(1).toLowerCase();
    const knownMime = ALLOWED_AUDIO_TYPES.includes(file.mimetype);

    if (allowedExtensions.has(extension) && (knownMime || file.mimetype === 'application/octet-stream')) {
      cb(null, true);
      return;
    }

    cb(
      new ApiError(
        `Invalid audio file type. Allowed extensions: ${Array.from(allowedExtensions).join(', ')}`,
        400
      )
    );
  })().catch(error => {
    cb(
      new ApiError(
        error instanceof Error ? error.message : 'Failed to validate audio file type',
        500
      )
    );
  });
};

// File filter for image files
const imageFileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(`Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`, 400));
  }
};

const trackUploadFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.fieldname === 'audio') {
    audioFileFilter(req, file, cb);
    return;
  }

  if (file.fieldname === 'artwork') {
    imageFileFilter(req, file, cb);
    return;
  }

  cb(new ApiError(`Unsupported upload field: ${file.fieldname}`, 400));
};

// Configure upload for audio files
export const uploadAudio = multer({
  storage: audioStorage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: audioFileFilter
});

// Configure upload for image files
export const uploadImage = multer({
  storage: imageStorage,
  limits: {
    fileSize: PROFILE_IMAGE_MAX_FILE_SIZE
  },
  fileFilter: imageFileFilter
});

export const uploadTrackFiles = multer({
  storage: mixedTrackStorage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: trackUploadFileFilter
});

const ALLOWED_REGISTRATION_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

const registrationStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, REGISTRATION_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, createUniqueFilename(file));
  },
});

const registrationFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_REGISTRATION_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        `Invalid file type. Allowed types: ${ALLOWED_REGISTRATION_TYPES.join(', ')}`,
        400
      )
    );
  }
};

export const uploadRegistrationFiles = multer({
  storage: registrationStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: registrationFileFilter,
}).fields([
  { name: 'governmentIdFile', maxCount: 1 },
  { name: 'labelGovIdFile', maxCount: 1 },
  { name: 'incorporationCertFile', maxCount: 1 },
  { name: 'gstCertFile', maxCount: 1 },
  { name: 'aadhaarFrontFile', maxCount: 1 },
  { name: 'aadhaarBackFile', maxCount: 1 },
  { name: 'panCardFile', maxCount: 1 },
  { name: 'nationalIdFrontFile', maxCount: 1 },
  { name: 'nationalIdBackFile', maxCount: 1 },
]);

const supportAttachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, SUPPORT_ATTACHMENT_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, createUniqueFilename(file));
  },
});

const supportAttachmentFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_SUPPORT_ATTACHMENT_TYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  cb(
    new ApiError(
      `Invalid file type. Allowed types: ${ALLOWED_SUPPORT_ATTACHMENT_TYPES.join(', ')}`,
      400
    )
  );
};

export const uploadSupportAttachment = multer({
  storage: supportAttachmentStorage,
  limits: { fileSize: SUPPORT_ATTACHMENT_MAX_FILE_SIZE },
  fileFilter: supportAttachmentFileFilter,
});

const knowledgeBaseMediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, KNOWLEDGE_BASE_MEDIA_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, createUniqueFilename(file));
  },
});

const knowledgeBaseMediaFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_KNOWLEDGE_BASE_MEDIA_TYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  cb(
    new ApiError(
      `Invalid file type. Allowed types: ${ALLOWED_KNOWLEDGE_BASE_MEDIA_TYPES.join(', ')}`,
      400
    )
  );
};

export const uploadKnowledgeBaseMedia = multer({
  storage: knowledgeBaseMediaStorage,
  limits: { fileSize: KNOWLEDGE_BASE_MEDIA_MAX_FILE_SIZE },
  fileFilter: knowledgeBaseMediaFileFilter,
});

// Delete file
export const deleteFile = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Failed to delete file at ${filePath}:`, error);
  }
};

// Get file URL (in a real app, this would be a CDN or S3 URL)
export const getFileUrl = (filename: string, type: 'audio' | 'image' | 'support' | 'knowledge-base'): string => {
  const configuredBaseUrl = process.env.API_URL || process.env.BACKEND_URL || process.env.PUBLIC_API_URL || '';
  const baseUrl = configuredBaseUrl
    ? configuredBaseUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '')
    : process.env.NODE_ENV === 'production'
      ? ''
      : `http://${'localhost'}:${process.env.PORT || 5000}`;
  const directory = type === 'audio'
    ? 'tracks'
    : type === 'image'
      ? 'artwork'
      : type === 'knowledge-base'
        ? 'knowledge-base'
        : 'support';
  return `${baseUrl}/uploads/${directory}/${filename}`;
}; 
