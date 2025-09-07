import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { verifyToken } from './utils';

export const authenticateToken = (
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: 'Access token required',
    });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }

  req.user = payload;
  next();
};
