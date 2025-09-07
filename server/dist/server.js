"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wss = exports.server = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const https_1 = __importDefault(require("https"));
const routes_1 = __importDefault(require("./auth/routes"));
const routes_2 = __importDefault(require("./channels/routes"));
const config_1 = require("./config");
const routes_3 = __importDefault(require("./messages/routes"));
const websocket_1 = require("./websocket");
const app = (0, express_1.default)();
// CORS configuration
app.use((0, cors_1.default)({
    origin: config_1.config.cors.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Routes with /api prefix
app.use('/api/auth', routes_1.default);
app.use('/api/channels', routes_2.default);
app.use('/api/messages', routes_3.default);
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// HTTPS server
const server = https_1.default.createServer({
    key: fs_1.default.readFileSync('cert/key.pem'),
    cert: fs_1.default.readFileSync('cert/cert.pem'),
}, app);
exports.server = server;
// Initialize WebSocket
const wss = (0, websocket_1.initializeWebSocket)(server);
exports.wss = wss;
server.listen(config_1.config.port, () => {
    console.log(`Server running on https://${config_1.config.host}:${config_1.config.port}`);
});
//# sourceMappingURL=server.js.map