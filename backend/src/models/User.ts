import { Pool } from 'pg';
import { getDatabase } from '../utils/database';
import bcrypt from 'bcryptjs';

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
}

export class UserModel {
  private db: Pool;

  constructor() {
    this.db = getDatabase();
  }

  async createUser(data: CreateUserData): Promise<Omit<User, 'password_hash'>> {
    const { username, email, password } = data;
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const query = `
      INSERT INTO users (username, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, username, email, created_at, updated_at
    `;

    const result = await this.db.query(query, [username, email, password_hash]);
    return result.rows[0];
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await this.db.query(query, [email]);
    return result.rows[0] || null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE username = $1';
    const result = await this.db.query(query, [username]);
    return result.rows[0] || null;
  }

  async findById(id: string): Promise<Omit<User, 'password_hash'> | null> {
    const query = 'SELECT id, username, email, created_at, updated_at FROM users WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rows[0] || null;
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  async updateUser(id: string, data: Partial<CreateUserData>): Promise<Omit<User, 'password_hash'>> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.username) {
      updates.push(`username = $${paramCount++}`);
      values.push(data.username);
    }

    if (data.email) {
      updates.push(`email = $${paramCount++}`);
      values.push(data.email);
    }

    if (data.password) {
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(data.password, salt);
      updates.push(`password_hash = $${paramCount++}`);
      values.push(password_hash);
    }

    values.push(id);

    const query = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, username, email, created_at, updated_at
    `;

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async deleteUser(id: string): Promise<boolean> {
    const query = 'DELETE FROM users WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount! > 0;
  }
}
