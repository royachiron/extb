import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';
import { hashPassword, verifyPassword } from './auth';

/** Stateless crypto RPC. Passwords and hashes are never stored or logged. */
export class PasswordHasher extends DurableObject<Env> {
  async hashPassword(password: string, salt: string): Promise<string> {
    this.validate(password, salt);
    return hashPassword(password, salt);
  }

  async verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
    this.validate(password, salt);
    if (typeof expectedHash !== 'string' || expectedHash.length > 128) return false;
    return verifyPassword(password, salt, expectedHash);
  }

  private validate(password: string, salt: string): void {
    if (typeof password !== 'string' || password.length > 256 || typeof salt !== 'string' || salt.length > 1024) {
      throw new Error('Invalid password hashing input');
    }
  }
}
