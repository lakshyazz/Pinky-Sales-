import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import crypto from 'crypto';

// Supabase S3 Storage Configuration
const SUPABASE_S3_ENDPOINT = process.env.SUPABASE_S3_ENDPOINT || 'https://mkaiwdqcvpltydmqsfer.storage.supabase.co/storage/v1/s3';
const SUPABASE_S3_REGION = process.env.SUPABASE_S3_REGION || 'ap-southeast-2';
const SUPABASE_ACCESS_KEY_ID = process.env.SUPABASE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || 'fd37853c0f72640eb49bbdb60c0a0e63';
const SUPABASE_SECRET_ACCESS_KEY = process.env.SUPABASE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '1c4b4a3f76b8be4386c662b40f3ff73a5e2460b82b8938c43b89fec040dfc387';
const SUPABASE_BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME || 'product-images';
const SUPABASE_PUBLIC_URL_PREFIX = process.env.SUPABASE_PUBLIC_URL_PREFIX || 'https://mkaiwdqcvpltydmqsfer.supabase.co/storage/v1/object/public';

// Cloudflare R2 Configuration (Optional fallback/alternative)
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'as-store-images';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

export const isSupabaseConfigured = () => {
  return Boolean(SUPABASE_ACCESS_KEY_ID && SUPABASE_SECRET_ACCESS_KEY && SUPABASE_S3_ENDPOINT);
};

export const isR2Configured = () => {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
};

let supabaseS3Instance = null;
let r2S3Instance = null;

const getSupabaseS3Client = () => {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseS3Instance) {
    supabaseS3Instance = new S3Client({
      forcePathStyle: true,
      region: SUPABASE_S3_REGION,
      endpoint: SUPABASE_S3_ENDPOINT,
      credentials: {
        accessKeyId: SUPABASE_ACCESS_KEY_ID,
        secretAccessKey: SUPABASE_SECRET_ACCESS_KEY,
      },
    });
  }
  return supabaseS3Instance;
};

const getR2S3Client = () => {
  if (!isR2Configured()) return null;
  if (!r2S3Instance) {
    r2S3Instance = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return r2S3Instance;
};

/**
 * Optimizes an image buffer with Sharp:
 * - Auto-rotates according to EXIF
 * - Resizes to max 800x800 px (preserving aspect ratio, fit inside, no enlargement)
 * - Converts to WebP format with 80% quality compression
 */
export const optimizeImageBuffer = async (inputBuffer) => {
  const image = sharp(inputBuffer).rotate();

  const optimizedBuffer = await image
    .resize({
      width: 800,
      height: 800,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: 80,
      effort: 4,
    })
    .toBuffer();

  const optimizedMetadata = await sharp(optimizedBuffer).metadata();

  return {
    buffer: optimizedBuffer,
    originalSize: inputBuffer.length,
    optimizedSize: optimizedBuffer.length,
    format: 'webp',
    width: optimizedMetadata.width,
    height: optimizedMetadata.height,
  };
};

/**
 * Uploads an image to Supabase S3 Storage (1 GB Free Tier) or Cloudflare R2
 */
export const uploadImageToR2 = async (inputBuffer, originalName = 'image', folder = 'products') => {
  // Step 1: Optimize image to WebP (max 800x800)
  const optimized = await optimizeImageBuffer(inputBuffer);

  // Generate sanitized unique key
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(4).toString('hex');
  const safeFilename = `${folder}/${timestamp}_${randomHex}.webp`;

  // Priority 1: Supabase Storage S3
  const supabaseS3 = getSupabaseS3Client();
  if (supabaseS3) {
    try {
      const putCommand = new PutObjectCommand({
        Bucket: SUPABASE_BUCKET_NAME,
        Key: safeFilename,
        Body: optimized.buffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          'original-name': encodeURIComponent(originalName.slice(0, 100)),
          'optimized-format': 'webp',
        },
      });

      await supabaseS3.send(putCommand);

      const publicUrl = `${SUPABASE_PUBLIC_URL_PREFIX.replace(/\/+$/, '')}/${SUPABASE_BUCKET_NAME}/${safeFilename}`;
      console.log(`[Supabase S3 Storage] Successfully uploaded ${safeFilename} (${Math.round(optimized.optimizedSize / 1024)} KB) -> ${publicUrl}`);

      return {
        success: true,
        url: publicUrl,
        key: safeFilename,
        size: optimized.optimizedSize,
        originalSize: optimized.originalSize,
        width: optimized.width,
        height: optimized.height,
        provider: 'supabase',
        fallback: false,
      };
    } catch (err) {
      console.error('[Supabase S3 Upload Error]', err.message);
    }
  }

  // Priority 2: Cloudflare R2
  const r2S3 = getR2S3Client();
  if (r2S3) {
    try {
      const putCommand = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: safeFilename,
        Body: optimized.buffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: {
          'original-name': encodeURIComponent(originalName.slice(0, 100)),
          'optimized-format': 'webp',
        },
      });

      await r2S3.send(putCommand);

      let publicUrl;
      if (R2_PUBLIC_URL) {
        const baseUrl = R2_PUBLIC_URL.replace(/\/+$/, '');
        publicUrl = `${baseUrl}/${safeFilename}`;
      } else {
        publicUrl = `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${safeFilename}`;
      }

      console.log(`[R2 Storage] Successfully uploaded ${safeFilename} (${Math.round(optimized.optimizedSize / 1024)} KB)`);

      return {
        success: true,
        url: publicUrl,
        key: safeFilename,
        size: optimized.optimizedSize,
        originalSize: optimized.originalSize,
        width: optimized.width,
        height: optimized.height,
        provider: 'r2',
        fallback: false,
      };
    } catch (err) {
      console.error('[R2 Storage Error]', err.message);
    }
  }

  // Priority 3: Optimized Base64 WebP Fallback
  console.warn('[Storage] Remote storage unavailable. Using base64 WebP fallback.');
  const base64Data = `data:image/webp;base64,${optimized.buffer.toString('base64')}`;
  return {
    success: true,
    url: base64Data,
    key: safeFilename,
    size: optimized.optimizedSize,
    originalSize: optimized.originalSize,
    width: optimized.width,
    height: optimized.height,
    provider: 'base64',
    fallback: true,
  };
};

/**
 * Retrieves image buffer from storage
 */
export const getImageBufferFromStorage = async (rawKey) => {
  const key = extractKeyFromUrl(rawKey);
  if (!key) return null;

  // Try Supabase S3
  const supabaseS3 = getSupabaseS3Client();
  if (supabaseS3) {
    try {
      const command = new GetObjectCommand({
        Bucket: SUPABASE_BUCKET_NAME,
        Key: key,
      });
      const response = await supabaseS3.send(command);
      const byteArray = await response.Body.transformToByteArray();
      return Buffer.from(byteArray);
    } catch (err) {
      console.warn(`[Supabase S3 Get Warning for ${key}]:`, err.message);
    }
  }

  // Try Cloudflare R2
  const r2S3 = getR2S3Client();
  if (r2S3) {
    try {
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      });
      const response = await r2S3.send(command);
      const byteArray = await response.Body.transformToByteArray();
      return Buffer.from(byteArray);
    } catch (err) {
      console.warn(`[R2 Get Warning for ${key}]:`, err.message);
    }
  }

  return null;
};

/**
 * Extracts storage key from URL
 */
export const extractKeyFromUrl = (urlOrKey) => {
  if (!urlOrKey || typeof urlOrKey !== 'string') return null;
  if (!urlOrKey.startsWith('http://') && !urlOrKey.startsWith('https://')) {
    return urlOrKey.replace(/^\/+/, '').trim();
  }
  try {
    const parsed = new URL(urlOrKey);
    const pathname = parsed.pathname.replace(/^\/+/, '');
    if (pathname.includes('/public/')) {
      const parts = pathname.split('/public/')[1];
      const subParts = parts.split('/');
      subParts.shift(); // remove bucket name
      return subParts.join('/');
    }
    if (pathname.includes('/images/')) {
      return pathname.split('/images/')[1];
    }
    return pathname || null;
  } catch {
    return null;
  }
};

/**
 * Deletes an image from Storage
 */
export const deleteImageFromR2 = async (urlOrKey) => {
  if (!urlOrKey) return { success: true, skipped: true };
  if (typeof urlOrKey === 'string' && urlOrKey.startsWith('data:')) {
    return { success: true, skipped: true };
  }

  const key = extractKeyFromUrl(urlOrKey);
  if (!key) return { success: true, skipped: true };

  // Delete from Supabase S3
  const supabaseS3 = getSupabaseS3Client();
  if (supabaseS3) {
    try {
      await supabaseS3.send(new DeleteObjectCommand({
        Bucket: SUPABASE_BUCKET_NAME,
        Key: key,
      }));
      console.log(`[Supabase S3 Storage] Deleted object ${key}`);
      return { success: true, key };
    } catch (err) {
      console.warn(`[Supabase S3 Delete Warning]`, err.message);
    }
  }

  // Delete from R2
  const r2S3 = getR2S3Client();
  if (r2S3) {
    try {
      await r2S3.send(new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      }));
      console.log(`[R2 Storage] Deleted object ${key}`);
      return { success: true, key };
    } catch (err) {
      console.warn(`[R2 Delete Warning]`, err.message);
    }
  }

  return { success: true, key, fallback: true };
};
