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
import { r2 } from '../services/storage/r2Provider';
import { resolveAssetUrl } from '../config/urlResolver';

const UPLOAD_DIRECTORIES: Record<string, string> = {
  tracks: TRACKS_DIR,
  artwork: ARTWORK_DIR,
  registration: REGISTRATION_DIR,
  support: SUPPORT_ATTACHMENT_DIR,
  'knowledge-base': KNOWLEDGE_BASE_MEDIA_DIR,
};

const DIRECTORY_NAMES: Record<string, string> = {
  tracks: 'tracks',
  artwork: 'artwork',
  registration: 'registration',
  support: 'support',
  'knowledge-base': 'knowledge-base',
};

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

export const uploadAudio = multer({
  storage: audioStorage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: audioFileFilter
});

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
  limits: { fileSize: 10 * 1024 * 1024 },
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

export const deleteFile = (filePath: string, r2Key?: string): void => {
  if (r2Key && r2.isConfigured) {
    r2.deleteFile(r2Key).catch((error) => {
      console.error(`[R2] Failed to delete ${r2Key}:`, error);
    });
  }
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`Failed to delete file at ${filePath}:`, error);
  }
};

export const uploadToR2 = async (file: Express.Multer.File, directory: string): Promise<string | null> => {
  if (!r2.isConfigured) return null;
  try {
    const key = r2.getR2Key(file.filename, directory);
    const result = await r2.uploadAndCleanup(file.path, key, file.mimetype);
    return result.url;
  } catch (error) {
    console.error(`[R2] Failed to upload ${file.filename}:`, error);
    return null;
  }
};

export const uploadToR2WithPath = async (localPath: string, filename: string, directory: string, mimeType?: string, cleanupLocal = true): Promise<string | null> => {
  if (!r2.isConfigured) return null;
  try {
    const key = r2.getR2Key(filename, directory);
    const result = cleanupLocal
      ? await r2.uploadAndCleanup(localPath, key, mimeType)
      : await r2.uploadFile(localPath, key, mimeType);
    return result.url;
  } catch (error) {
    console.error(`[R2] Failed to upload ${filename}:`, error);
    return null;
  }
};

export const getFileUrl = (filename: string, type: 'audio' | 'image' | 'support' | 'knowledge-base', provider?: string): string => {
  return resolveAssetUrl(filename, type, provider || (r2.isConfigured ? 'r2' : 'local'));
};

export const getDirectoryForType = (type: string): string => {
  return DIRECTORY_NAMES[type] || type;
};