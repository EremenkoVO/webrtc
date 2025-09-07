"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const index_1 = require("../config/index");
const schema_1 = require("./schema");
exports.db = new better_sqlite3_1.default(index_1.config.database.filename);
// Initialize database
try {
    (0, schema_1.createTables)(exports.db);
    console.log('Database initialized successfully');
}
catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
}
//# sourceMappingURL=index.js.map