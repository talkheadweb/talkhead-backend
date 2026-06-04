import envConfig from '@/Config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Request } from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import CustomError from '../errors/customError.class';
import { R2Config } from './type';



// Initialize R2 client
const r2Config: R2Config = {
    accountId: envConfig.cloudflare_r2.accountId,
    accessKeyId: envConfig.cloudflare_r2.accessKeyId,
    secretAccessKey: envConfig.cloudflare_r2.secretAccessKey,
    bucketName: envConfig.cloudflare_r2.bucketName,
    endpoint: `https://${envConfig.cloudflare_r2.accountId}.r2.cloudflarestorage.com`,
    customDomain: envConfig.cloudflare_r2.customDomain,
};

const r2Client = new S3Client({
    region: envConfig.cloudflare_r2.region,
    endpoint: r2Config.endpoint,
    credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
    },
});

// Compress and upload profile image to Cloudflare R2 (Private Bucket)
// @param filePath - Local file path to upload
// @param fileName - Original file name
// @param bucketName - Optional bucket name (uses default from env if not provided)
export const uploadProfileImageToR2 = async (filePath: string, fileName: string, bucketName?: string): Promise<{ fileKey: string; fileUrl: string }> => {
    try {
        const targetBucket = bucketName || r2Config.bucketName;
        const fileKey = `avatars/${uuidv4()}-${path.parse(fileName).name}.webp`;

        // Compress image using sharp
        const compressedBuffer = await sharp(filePath)
            .resize(400, 400, {
                fit: 'cover',
                position: 'center'
            })
            .webp({
                quality: 80,
                effort: 6
            })
            .toBuffer();

        const command = new PutObjectCommand({
            Bucket: targetBucket,
            Key: fileKey,
            Body: compressedBuffer,
            ContentType: 'image/webp',
            Metadata: {
                originalName: fileName,
                uploadedAt: new Date().toISOString(),
                compressed: 'true',
                type: 'profile-image'
            }
        });

        await r2Client.send(command);

        // Generate R2 storage URL (not publicly accessible)
        const fileUrl = `https://${targetBucket}.${envConfig.cloudflare_r2.accountId}.r2.cloudflarestorage.com/${fileKey}`;

        // Clean up local file
        fs.unlinkSync(filePath);

        return {
            fileKey,
            fileUrl
        };
    } catch (error) {
        // Clean up local file even if upload fails
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        throw new CustomError(`Failed to upload profile image to R2: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
};

/**
 * Generate a presigned URL for accessing a private file
 * @param fileKey - The file key in the bucket
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @param bucketName - Optional bucket name (uses default from env if not provided)
 * @returns Presigned URL for file access
 */
export const getPresignedUrl = async (fileKey: string, expiresIn: number = 3600, bucketName?: string): Promise<string> => {
    try {
        const targetBucket = bucketName || r2Config.bucketName;

        const command = new GetObjectCommand({
            Bucket: targetBucket,
            Key: fileKey,
        });

        const presignedUrl = await getSignedUrl(r2Client, command, {
            expiresIn, // URL expires in specified seconds
        });

        return presignedUrl;
    } catch (error) {
        throw new CustomError(`Failed to generate presigned URL: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
};

/**
 * Delete file from Cloudflare R2 by file key
 * @param fileKey - The file key in the bucket
 * @param bucketName - Optional bucket name (uses default from env if not provided)
 */
export const deleteFileByKey = async (fileKey: string, bucketName?: string): Promise<void> => {
    try {
        const targetBucket = bucketName || r2Config.bucketName;

        await r2Client.send(new DeleteObjectCommand({
            Bucket: targetBucket,
            Key: fileKey,
        }));

        console.log(`Successfully deleted file from R2 bucket '${targetBucket}':`, fileKey);
    } catch (error) {
        throw new CustomError(`Failed to delete from R2: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
};

/**
 * Parse file location from URL or file key to extract bucket and file key
 * @param fileKeyOrUrl - File key, custom domain URL, or R2 storage URL
 * @param fallbackBucket - Fallback bucket name for direct file keys
 * @returns Object containing fileKey and targetBucket
 */
const parseFileLocation = (fileKeyOrUrl: string): { fileKey: string; targetBucket: string } => {
    // Direct file key (no URL)
    if (!fileKeyOrUrl.startsWith('http')) {
        return {
            fileKey: fileKeyOrUrl,
            targetBucket: r2Config.bucketName
        };
    }

    const url = new URL(fileKeyOrUrl);
    const isCloudflareR2Domain = url.hostname.includes('.r2.cloudflarestorage.com');

    if (isCloudflareR2Domain) {
        // Cloudflare R2 domain: https://bucket-name.account-id.r2.cloudflarestorage.com/path/file.ext
        // Extract bucket name from hostname (first part before the first dot)
        const hostnameParts = url.hostname.split('.');
        const targetBucket = hostnameParts[0]; // First part is the bucket name

        // Extract file key from pathname
        const fileKey = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;

        if (!fileKey) {
            throw new CustomError('Invalid R2 URL format - no file path found', 400);
        }

        if (!targetBucket) {
            throw new CustomError('Invalid R2 URL format - could not extract bucket name from hostname', 400);
        }

        return {
            fileKey,
            targetBucket
        };
    } else {
        // Custom domain: https://custom-domain.com/path/file.ext
        const fileKey = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;

        if (!fileKey) {
            throw new CustomError('Invalid custom domain URL - no file path found', 400);
        }

        return {
            fileKey,
            targetBucket: r2Config.bucketName
        };
    }
};

/**
 * Delete file from Cloudflare R2
 * @param fileKeyOrUrl - File key, custom domain URL, or R2 storage URL
 * @param bucketName - Optional bucket name (only used for direct file keys)
 * Examples:
 *   deleteFromR2('profile-images/file.webp') // Uses default bucket from env
 *   deleteFromR2('https://custom-domain.com/profile-images/file.webp') // Uses default bucket (custom domain)
 *   deleteFromR2('https://account.r2.cloudflarestorage.com/bucket/file.webp') // Uses 'bucket' from URL
 */
export const deleteFromR2 = async (fileKeyOrUrl: string): Promise<void> => {
    try {
        const { fileKey, targetBucket } = parseFileLocation(fileKeyOrUrl);

        await r2Client.send(new DeleteObjectCommand({
            Bucket: targetBucket,
            Key: fileKey,
        }));

        console.log(`Successfully deleted file from R2 bucket '${targetBucket}':`, fileKey);
    } catch (error) {
        throw new CustomError(`Failed to delete from R2: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
};

// Utility function to clean up temp directory
export const cleanupTempFiles = () => {
    const tempDir = path.join(process.cwd(), 'temp-uploads');
    if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            const stats = fs.statSync(filePath);
            // Delete files older than 1 hour
            if (Date.now() - stats.mtime.getTime() > 60 * 60 * 1000) {
                fs.unlinkSync(filePath);
            }
        });
    }
};

// Types for better TypeScript support
export interface UploadResult {
    fileKey: string;
    fileUrl: string;
}

export interface UploadRequest extends Request {
    uploadResult?: UploadResult;
}

/**
 * R2BucketUtils Class - Object-oriented utility for Cloudflare R2 bucket operations
 * Provides a clean interface for private bucket file management with presigned URLs
 */
export class R2BucketUtils {
    private bucketName: string;

    constructor(bucketName?: string) {
        this.bucketName = bucketName || r2Config.bucketName;
    }

    /**
     * Upload profile image to the bucket
     * @param filePath - Local file path to upload
     * @param fileName - Original file name
     * @returns Promise with fileKey and fileUrl
     */
    async uploadProfileImage(filePath: string, fileName: string): Promise<{ fileKey: string; fileUrl: string }> {
        return uploadProfileImageToR2(filePath, fileName, this.bucketName);
    }

    /**
     * Generate presigned URL for file access
     * @param fileKey - The file key in the bucket
     * @param expiresIn - Expiration time in seconds (default: 1 hour)
     * @returns Promise with presigned URL
     */
    async getPresignedUrl(fileKey: string, expiresIn: number = 3600): Promise<string> {
        return getPresignedUrl(fileKey, expiresIn, this.bucketName);
    }

    /**
     * Delete file by key from the bucket
     * @param fileKey - The file key to delete
     * @returns Promise<void>
     */
    async deleteFileByKey(fileKey: string): Promise<void> {
        return deleteFileByKey(fileKey, this.bucketName);
    }

    /**
     * Delete file by URL or key (legacy support)
     * @param fileKeyOrUrl - File key or URL to delete
     * @returns Promise<void>
     */
    async deleteFile(fileKeyOrUrl: string): Promise<void> {
        return deleteFromR2(fileKeyOrUrl);
    }

    /**
     * Get the bucket name
     * @returns string - The bucket name
     */
    getBucketName(): string {
        return this.bucketName;
    }

    /**
     * Set a new bucket name
     * @param bucketName - New bucket name
     */
    setBucketName(bucketName: string): void {
        this.bucketName = bucketName;
    }
}


// Download image from URL to temporary file
const downloadImageFromUrl = async (imageUrl: string, fileName: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const tempDir = path.join(process.cwd(), 'temp');

        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempFilePath = path.join(tempDir, `${uuidv4()}-${fileName}`);
        const file = fs.createWriteStream(tempFilePath);

        const protocol = imageUrl.startsWith('https:') ? https : http;

        const request = protocol.get(imageUrl, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download image: HTTP ${response.statusCode}`));
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve(tempFilePath);
            });

            file.on('error', (err) => {
                fs.unlink(tempFilePath, () => { }); // Clean up on error
                reject(err);
            });
        });

        request.on('error', (err) => {
            fs.unlink(tempFilePath, () => { }); // Clean up on error
            reject(err);
        });

        request.setTimeout(30000, () => {
            request.destroy();
            fs.unlink(tempFilePath, () => { }); // Clean up on timeout
            reject(new Error('Download timeout'));
        });
    });
};

// Upload profile image from URL to Cloudflare R2
export const uploadProfileImageFromUrlToR2 = async (imageUrl: string, fileName: string, bucketName?: string): Promise<{ fileKey: string; fileUrl: string }> => {
    let tempFilePath: string | null = null;

    try {
        // Download image to temporary file
        tempFilePath = await downloadImageFromUrl(imageUrl, fileName);
        // Upload using existing function
        const result = await uploadProfileImageToR2(tempFilePath, fileName, bucketName);

        return result;
    } catch (error) {
        // Clean up temporary file if it exists
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        throw new CustomError(`Failed to upload profile image from URL: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
};