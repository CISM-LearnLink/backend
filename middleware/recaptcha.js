const axios = require('axios');

// Middleware to verify reCAPTCHA v2
const verifyRecaptcha = async (req, res, next) => {
    const recaptchaToken = req.body.recaptchaToken;

    // Skip verification in development if no secret is configured
    if (!process.env.RECAPTCHA_SECRET_KEY) {
        console.warn('[reCAPTCHA] No RECAPTCHA_SECRET_KEY found, skipping verification');
        return next();
    }

    if (!recaptchaToken) {
        // Allow requests without token (CAPTCHA is optional until shown after failed attempts)
        console.log('[reCAPTCHA] No token provided, skipping verification');
        return next();
    }

    try {
        const verificationURL = 'https://www.google.com/recaptcha/api/siteverify';

        // Google reCAPTCHA expects form-urlencoded data
        const params = new URLSearchParams();
        params.append('secret', process.env.RECAPTCHA_SECRET_KEY);
        params.append('response', recaptchaToken);
        if (req.ip) {
            params.append('remoteip', req.ip);
        }

        const response = await axios.post(verificationURL, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('[reCAPTCHA] Response:', response.data);

        if (!response.data.success) {
            console.log('[reCAPTCHA] Verification failed:', response.data['error-codes']);
            return res.status(400).json({
                success: false,
                msg: 'CAPTCHA verification failed. Please try again.'
            });
        }

        // Verification successful, continue to next middleware
        console.log('[reCAPTCHA] Verification successful');
        next();
    } catch (error) {
        console.error('[reCAPTCHA] Error verifying reCAPTCHA:', error.message);
        return res.status(500).json({
            success: false,
            msg: 'Error verifying CAPTCHA. Please try again.'
        });
    }
};

module.exports = { verifyRecaptcha };
