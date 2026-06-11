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

// Generation-specific allowed types
export const allowedGenerationImageMimes = ['image/jpeg', 'image/jpg', 'image/png'];
export const allowedGenerationAudioMimes = [
  'audio/mpeg',         // .mp3
  'audio/wav',          // .wav
  'audio/x-wav',        // .wav (alternate)
  'audio/mp4',          // .m4a
  'audio/x-m4a',        // .m4a (alternate)
  'audio/aac',          // .aac
  'audio/webm',         // .webm audio
];
