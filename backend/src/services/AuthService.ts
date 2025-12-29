import jwt, { Secret } from 'jsonwebtoken';
import { UserModel, CreateUserData } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export class AuthService {
  private userModel: UserModel;

  constructor() {
    this.userModel = new UserModel();
  }

  async register(data: CreateUserData) {
    // Check if user already exists
    const existingEmail = await this.userModel.findByEmail(data.email);
    if (existingEmail) {
      throw new AppError(409, 'Email already registered');
    }

    const existingUsername = await this.userModel.findByUsername(data.username);
    if (existingUsername) {
      throw new AppError(409, 'Username already taken');
    }

    // Validate password strength
    if (data.password.length < 8) {
      throw new AppError(400, 'Password must be at least 8 characters long');
    }

    // Create user
    const user = await this.userModel.createUser(data);
    
    // Generate JWT
    const token = this.generateToken(user.id);

    logger.info(`User registered: ${user.username}`);

    return {
      user,
      token,
    };
  }

  async login(email: string, password: string) {
    // Find user
    const user = await this.userModel.findByEmail(email);
    if (!user) {
      throw new AppError(401, 'Invalid email or password');
    }

    // Verify password
    const isValid = await this.userModel.verifyPassword(password, user.password_hash);
    if (!isValid) {
      throw new AppError(401, 'Invalid email or password');
    }

    // Generate JWT
    const token = this.generateToken(user.id);

    logger.info(`User logged in: ${user.username}`);

    // Remove password hash from response
    const { password_hash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  async verifyToken(token: string): Promise<string> {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      return decoded.userId;
    } catch (error) {
      throw new AppError(401, 'Invalid or expired token');
    }
  }

  async getUserById(id: string) {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    return user;
  }

  private generateToken(userId: string): string {
    const signOptions = { expiresIn: JWT_EXPIRES_IN };
    return jwt.sign({ userId }, JWT_SECRET as Secret, signOptions as jwt.SignOptions);
  }
}
