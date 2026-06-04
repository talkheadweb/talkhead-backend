// Cloudflare R2 configuration
export interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    endpoint: string;
    customDomain?: string;
}

export const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
