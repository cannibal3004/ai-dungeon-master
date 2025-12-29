import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';

let authService: AuthService;

function getAuthService(): AuthService {
  if (!authService) {
    authService = new AuthService();
  }
  return authService;
}

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
}).strict();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    // Validate input
    const data = registerSchema.parse(req.body) as any;

    // Register user
    const result = await getAuthService().register(data);

    res.status(201).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    // Validate input
    const data = loginSchema.parse(req.body);

    // Login user
    const result = await getAuthService().login(data.email, data.password);

    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function logout(_req: Request, res: Response, next: NextFunction) {
  try {
    // In a JWT system, logout is handled client-side by removing the token
    // Here we just confirm the action
    res.json({
      status: 'success',
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const user = await getAuthService().getUserById(userId);

    res.json({
      status: 'success',
      data: { user },
    });
  } catch (error) {
    next(error);
  }
}
