import https from 'https';
import { WSClient } from '../types';
export declare const clients: Map<number, WSClient>;
export declare const initializeWebSocket: (server: https.Server) => import("ws").Server<typeof import("ws"), typeof import("http").IncomingMessage>;
//# sourceMappingURL=index.d.ts.map