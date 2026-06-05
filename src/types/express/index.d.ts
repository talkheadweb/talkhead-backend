/*
  Extends Express.User (passport's interface) with our JWT token payload fields.

  When passport is installed it declares `namespace Express { interface User {} }`
  and sets `req.user?: User`. We merge our fields into that interface so
  `req.user` carries the JWT payload set by our `authenticate` middleware.

  For JWT-authenticated routes the `authenticate` middleware sets:
    req.user = { uid, email, role }

  For OAuth routes the passport strategy also injects the issued tokens
  (accessToken / refreshToken) so the callback controller can redirect
  without re-querying the database.

  Usage in a JWT-protected controller:
    const { uid, email, role } = req.user!;
*/

declare global {
  namespace Express {
    interface User {
      uid         : string;
      email       : string;
      role        : string;
      // Present only in OAuth callback controllers (set by the social-login strategy)
      accessToken ?: string;
      refreshToken?: string;
    }
  }
}

export {};
