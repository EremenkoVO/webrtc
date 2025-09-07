import type { SignOptions } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UserPayload } from '../types';

const SECRET_KEY = config.jwt.secret;

export function signToken(
  payload: object,
  expiresIn: SignOptions['expiresIn'] = '24h',
) {
  if (!SECRET_KEY || typeof SECRET_KEY !== 'string') {
    throw new Error('SECRET_KEY is not defined or not a string');
  }

  const options: SignOptions = { expiresIn };
  return jwt.sign(payload, SECRET_KEY, options);
}

export function verifyToken(token?: string): UserPayload | null {
  if (!token) return null;

  try {
    if (!SECRET_KEY || typeof SECRET_KEY !== 'string') {
      throw new Error('SECRET_KEY is not defined or not a string');
    }

    const payload = jwt.verify(token, SECRET_KEY);
    return payload as UserPayload;
  } catch {
    return null;
  }
}
