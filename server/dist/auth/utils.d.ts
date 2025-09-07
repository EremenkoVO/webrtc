import type { SignOptions } from 'jsonwebtoken';
import { UserPayload } from '../types';
export declare function signToken(payload: object, expiresIn?: SignOptions['expiresIn']): string;
export declare function verifyToken(token?: string): UserPayload | null;
//# sourceMappingURL=utils.d.ts.map