import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
export declare const authenticateToken: (req: CustomRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=middleware.d.ts.map