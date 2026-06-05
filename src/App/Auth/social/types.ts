// Types specific to the social / OAuth login flow.
// Shared user types (IUser, TUserPublic, TLoginResponse) stay in ../types.ts
// because they are used by both email/password and social auth.

export type TSocialLoginInput = {
  provider  : "google";          // extend the union as new providers are added
  providerId: string;            // OAuth sub / unique ID from the provider
  email     : string;
  name      : string;
  picture  ?: string;            // avatar URL from the provider (best-effort)
};
