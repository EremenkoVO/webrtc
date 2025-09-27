/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ErrorResponse = {
    code: ErrorResponse.code;
    message: string;
};
export namespace ErrorResponse {
    export enum code {
        INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
        TOKEN_EXPIRED = 'TOKEN_EXPIRED',
        INVALID_REFRESH_TOKEN = 'INVALID_REFRESH_TOKEN',
        UNAUTHORIZED = 'UNAUTHORIZED',
        VALIDATION_ERROR = 'VALIDATION_ERROR',
        NOT_FOUND = 'NOT_FOUND',
        TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
        SERVER_ERROR = 'SERVER_ERROR',
    }
}

