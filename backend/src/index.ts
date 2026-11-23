import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ApiResponse } from '@smartflow/shared';

// Load environment variables
dotenv.config();

// Import routes
import dashboardRoutes from './routes/dashboard';
import trafficRoutes from './routes/traffic';
import segmentsRoutes from './routes/segments';
import forecastsRoutes from './routes/forecasts';
import hotspotsRoutes from './routes/hotspots';
import assistantRoutes from './routes/assistant';
import corridorRoutes from './routes/corridor';

const app: Application = express();
const PORT: number = parseInt(process.env.PORT || '3000', 10);

// Render puts one proxy in front of the app; trusting it makes req.ip the
// caller's address, which the assistant's per-minute limit is counted by.
app.set('trust proxy', 1);

// ============================================================================
// MIDDLEWARE
// ============================================================================

// CORS Configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging Middleware
app.use((req: Request, _res: Response, next: NextFunction): void => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// API ROUTES
// ============================================================================

// Health Check
app.get('/health', (_req: Request, res: Response): void => {
  const response: ApiResponse<{ status: string }> = {
    success: true,
    data: { status: 'ok' },
  };
  res.json(response);
});

// API v1 Routes
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/traffic', trafficRoutes);
app.use('/api/v1/segments', segmentsRoutes);
app.use('/api/v1/forecasts', forecastsRoutes);
app.use('/api/v1/hotspots', hotspotsRoutes);
app.use('/api/assistant', assistantRoutes);
/*
 * Mirrors the dashboard's own path, so the app switches to this backend by
 * changing one address rather than any code. See routes/corridor.ts for why
 * the numbers now come from here instead of straight from the dashboard.
 */
app.use('/api/dashboard', corridorRoutes);
/*
 * No /api/community or /api/users here any more. They were early placeholders that
 * accepted posts, likes and profile edits from anyone, with no sign-in, into a list
 * in this server's memory. The app never used them - Community lives in Supabase,
 * where row-level security decides who may write what - so they were only an
 * unguarded way in. Removed 23 Nov 2026.
 */

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 Handler
app.use((req: Request, res: Response): void => {
  const response: ApiResponse<null> = {
    success: false,
    error: 'Not Found',
    message: `Route ${req.path} not found`,
  };
  res.status(404).json(response);
});

// Global Error Handler
app.use(
  (
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ): void => {
    console.error('[ERROR]', err.message);
    const response: ApiResponse<null> = {
      success: false,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    };
    res.status(500).json(response);
  }
);

// ============================================================================
// SERVER STARTUP
// ============================================================================

app.listen(PORT, (): void => {
  console.log(`
╔════════════════════════════════════════╗
║     SmartFlow NLEX API Server          ║
║     Version: 1.0.0                    ║
║     Environment: ${process.env.NODE_ENV || 'development'}               ║
║     Port: ${PORT}                            ║
╚════════════════════════════════════════╝
  `);
});

export default app;
