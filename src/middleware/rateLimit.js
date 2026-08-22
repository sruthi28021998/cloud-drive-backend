import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
});

export const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many upload attempts' } }
});