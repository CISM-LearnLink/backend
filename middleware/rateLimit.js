const rateLimit = require('express-rate-limit');

// Limiter for login/register attempts - strict
// 15 minutes window, 10 attempts max (higher than account lockout to avoid double-trigger)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per `window` (account lockout handles lower threshold)
    message: {
        success: false,
        msg: 'Too many login/register attempts from this IP, please try again after 15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Limiter for password reset requests - very strict
// 1 hour window, 3 attempts max
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: {
        success: false,
        msg: 'Too many password reset requests from this IP, please try again after an hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// General API limiter to prevent DoS - moderate
// 15 minutes window, 100 requests per IP
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        msg: 'Too many requests from this IP, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Refresh token limiter - prevent token generation abuse
// 15 minutes window, 20 refresh attempts max
const refreshTokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: {
        success: false,
        msg: 'Too many token refresh attempts, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Global limiter for all requests (even static files) - very generous
// 15 minutes window, 1000 requests max
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: {
        success: false,
        msg: 'Too many requests from this IP'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    authLimiter,
    passwordResetLimiter,
    apiLimiter,
    refreshTokenLimiter,
    globalLimiter
};
