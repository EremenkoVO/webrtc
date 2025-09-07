"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const SECRET_KEY = config_1.config.jwt.secret;
function signToken(payload, expiresIn = '24h') {
    if (!SECRET_KEY || typeof SECRET_KEY !== 'string') {
        throw new Error('SECRET_KEY is not defined or not a string');
    }
    const options = { expiresIn };
    return jsonwebtoken_1.default.sign(payload, SECRET_KEY, options);
}
function verifyToken(token) {
    if (!token)
        return null;
    try {
        if (!SECRET_KEY || typeof SECRET_KEY !== 'string') {
            throw new Error('SECRET_KEY is not defined or not a string');
        }
        const payload = jsonwebtoken_1.default.verify(token, SECRET_KEY);
        return payload;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=utils.js.map