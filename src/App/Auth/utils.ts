import config from "@/Config";
import { TUserPublic } from "./types";

// ── Strip password from Mongoose doc ──────────────────────────────────────
export const toPublicUser = (user: any): TUserPublic => {
  const obj = user.toObject ? user.toObject() : { ...user };
  const { password: _pw, ...rest } = obj;
  return rest as TUserPublic;
};

// ── Email HTML templates ───────────────────────────────────────────────────
export const emailTemplates = {
  verifyEmail: (verifyLink: string): string => `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;">
      <h2>Welcome to ${config.appName}!</h2>
      <p>Please verify your email address by clicking the button below.
         This link expires in <strong>24 hours</strong>.</p>
      <a href="${verifyLink}"
         style="display:inline-block;padding:12px 24px;background:#4F46E5;
                color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
        Verify Email
      </a>
      <p style="color:#888;font-size:12px;margin-top:24px;">
        If you didn't create an account, you can safely ignore this email.
      </p>
    </div>
  `,

  resetPassword: (resetLink: string): string => `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;">
      <h2>Reset your password</h2>
      <p>Click the button below to reset your password.
         This link expires in <strong>1 hour</strong>.</p>
      <a href="${resetLink}"
         style="display:inline-block;padding:12px 24px;background:#4F46E5;
                color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">
        Reset Password
      </a>
      <p style="color:#888;font-size:12px;margin-top:24px;">
        If you didn't request a password reset, you can safely ignore this email.
      </p>
    </div>
  `,
};
