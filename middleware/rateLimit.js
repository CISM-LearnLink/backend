const rateLimit = require('express-rate-limit');

// Limiter for login/register attempts - strict
// 15 minutes window, 5 attempts max
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per `window` (here, per 15 minutes)
    message: {
        success: false,
        msg: 'Too many login/register attempts from this User, please try again after 15 minutes'
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
        message: 'Too many requests from this IP, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    authLimiter,
    passwordResetLimiter,
    apiLimiter
};
