export const FileType = {
  PROFILE_PICTURE: "profile_picture",
  AVATAR_IMAGE   : "avatar_image",
  GENERATION     : "generation",
} as const;

export type TFileType = typeof FileType[keyof typeof FileType];
export const FileTypeValues = Object.values(FileType) as [TFileType, ...TFileType[]];

export interface TFileTypeConfig {
  getFolder      : (userId: string) => string;
  allowedMimes   : string[];
  maxSizeBytes   : number;
  deleteWithOwner: boolean;  // controls deleteByOwner() cascade behaviour — not stored in DB
}

export const FileTypeConfig: Record<TFileType, TFileTypeConfig> = {
  profile_picture: {
    getFolder      : () => "profiles",
    allowedMimes   : ["image/jpeg", "image/png", "image/webp"],
    maxSizeBytes   : 2 * 1024 * 1024,
    deleteWithOwner: false,
  },
  avatar_image: {
    getFolder      : () => "avatars",
    allowedMimes   : ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxSizeBytes   : 5 * 1024 * 1024,
    deleteWithOwner: true,
  },
  generation: {
    getFolder      : (userId) => `generations/${userId}`,
    allowedMimes   : [
      "image/jpeg", "image/png",
      "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a",
      "video/mp4", "video/mpeg", "video/quicktime", "video/webm", "video/x-msvideo",
    ],
    maxSizeBytes   : 200 * 1024 * 1024,  // 200 MB to accommodate video output
    deleteWithOwner: true,
  },
};
