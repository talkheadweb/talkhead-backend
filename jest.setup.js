"use strict";
// Set required env vars BEFORE any module loads so Zod config validation passes
process.env.APP_NAME = "talkhead-test";
process.env.NODE_ENV = "test";
process.env.PORT = "9000";
process.env.BACKEND_BASE_URL = "http://localhost:9000";
process.env.MONGO_URI = "mongodb://localhost:27017/test";
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.REDIS_PASSWORD = "test";
process.env.JWT_ACCESS_TOKEN_SECRET = "test-access-secret-32-chars-long!";
process.env.JWT_REFRESH_TOKEN_SECRET = "test-refresh-secret-32-chars-lon!";
process.env.JWT_ACCESS_TOKEN_EXPIRE_IN = "15m";
process.env.JWT_REFRESH_TOKEN_EXPIRE_IN = "7d";
process.env.BCRYPT_SALT_ROUNDS = "1"; // fast in tests
process.env.ADMIN_CONTACT_EMAIL = "test@test.com";
process.env.RESEND_API_KEY = "re_test_123";
process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_ACCESS_KEY_ID = "test-key";
process.env.CLOUDFLARE_SECRET_ACCESS_KEY = "test-secret";
process.env.CLOUDFLARE_BUCKET_NAME = "test-bucket";
process.env.FRONTEND_VERIFY_PAGE_URL = "http://localhost:3000/verify-email";
process.env.FRONTEND_RESET_PAGE_URL = "http://localhost:3000/reset-password";
