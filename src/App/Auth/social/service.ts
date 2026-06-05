import { LogService } from "@/Config/logger/utils";
import { JwtHelper } from "@/Utils/helper/jwtHelper";
import UserModel from "../model";
import { AuthRedisService } from "../redisService";
import { TLoginResponse } from "../types";
import { toPublicUser } from "../utils";
import { TSocialLoginInput } from "./types";

const log = LogService.APPLICATION;

/**
 * Find-or-create a user from an OAuth provider profile, then issue tokens.
 *
 * Called by every passport strategy (Google, GitHub, …).  The strategy passes
 * a normalised TSocialLoginInput regardless of which provider authenticated the
 * user, so this function never needs to change when a new provider is added.
 *
 * Business rules:
 * - Match by provider-specific ID first  (e.g. googleId, githubId).
 * - If no match, look up by email:
 *     • Existing email/password account → link the provider ID to it.
 *       The user can now sign in with either method.
 *     • No account at all → create a new one.
 * - Social accounts are automatically verified (the provider already confirmed
 *   the email address).
 * - Tokens issued are identical to the normal login flow.
 */
const socialLogin = async (payload: TSocialLoginInput): Promise<TLoginResponse> => {
  const { provider, providerId, email, name, picture } = payload;

  // Dynamic field name: "google" → "googleId", "github" → "githubId", etc.
  const providerIdField = `${provider}Id`;

  // 1. Returning user — already linked this provider
  let user = await UserModel.findOne({ [providerIdField]: providerId });

  if (!user) {
    // 2. Known email — link the new provider to the existing account
    user = await UserModel.findOne({ email });
    if (user) {
      (user as any)[providerIdField] = providerId;
      user.isVerified = true;
      if (picture && !user.profilePicture) user.profilePicture = picture;
      await user.save();
    } else {
      // 3. First time — create a brand-new account
      user = await UserModel.create({
        name,
        email,
        [providerIdField]: providerId,
        isVerified       : true,   // provider already confirmed the email
        profilePicture   : picture ?? null,
      });
    }
  }

  const tokenPayload = { uid: user._id.toString(), email: user.email, role: user.role };
  const accessToken  = JwtHelper.signAccessToken(tokenPayload);
  const refreshToken = JwtHelper.signRefreshToken(tokenPayload);
  await AuthRedisService.refreshToken.set(user._id.toString(), refreshToken);

  log.info("Social login", { provider, userId: user._id });
  return { user: toPublicUser(user), accessToken, refreshToken };
};

export const SocialAuthService = { socialLogin };
