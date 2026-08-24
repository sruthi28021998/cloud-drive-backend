import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, cookieOptions } from '../utils/tokens.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100)
});

export const register = async (req, res, next) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);

    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new AppError('Email already registered', 409, 'CONFLICT');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await query(
      `INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)`,
      [id, email, passwordHash, name]
    );

    const accessToken = signAccessToken({ id, email });
    const refreshToken = signRefreshToken({ id });

    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.status(201).json({ id, email, name });
  } catch (err) {
    if (err.name === 'ZodError') {
      return next(new AppError('Invalid input', 400, 'VALIDATION_ERROR'));
    }
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
    }

    const accessToken = signAccessToken({ id: user.id, email: user.email });
    const refreshToken = signRefreshToken({ id: user.id });

    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    next(err);
  }
};

export const logout = (req, res) => {
  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
  res.status(204).send();
};

export const refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) throw new AppError('No refresh token', 401, 'UNAUTHORIZED');

    const decoded = verifyRefreshToken(token);
    const result = await query('SELECT id, email FROM users WHERE id = $1', [decoded.id]);
    const user = result.rows[0];
    if (!user) throw new AppError('User not found', 401, 'UNAUTHORIZED');

    const accessToken = signAccessToken({ id: user.id, email: user.email });
    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const me = async (req, res, next) => {
  try {
    const result = await query('SELECT id, email, name, image_url FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows[0]) throw new AppError('User not found', 404, 'NOT_FOUND');
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

export const lookupByEmail = async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) throw new AppError('Email is required', 400, 'VALIDATION_ERROR');

    const result = await query('SELECT id, email, name FROM users WHERE email = $1', [email]);
    if (!result.rows[0]) throw new AppError('No user found with that email', 404, 'NOT_FOUND');

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};