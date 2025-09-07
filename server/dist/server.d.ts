import https from 'https';
declare const server: https.Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
declare const wss: import("ws").Server<typeof import("ws"), typeof import("http").IncomingMessage>;
export { server, wss };
//# sourceMappingURL=server.d.ts.map