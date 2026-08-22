import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
dotenv.config();

import authRoutes from './routes/authRoutes.js';
import folderRoutes from './routes/folderRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import shareRoutes from './routes/shareRoutes.js';
import miscRoutes from './routes/miscRoutes.js';

import { errorHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimit.js';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(generalLimiter);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api', miscRoutes);
app.use(errorHandler);

export default app;