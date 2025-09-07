"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const utils_1 = require("./utils");
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({
            success: false,
            message: 'Access token required',
        });
    }
    const token = authHeader.split(' ')[1];
    const payload = (0, utils_1.verifyToken)(token);
    if (!payload) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
        });
    }
    req.user = payload;
    next();
};
exports.authenticateToken = authenticateToken;
//# sourceMappingURL=middleware.js.map