/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Room = {
    id?: string;
    name?: string;
    /**
     * Channel type
     */
    type?: Room.type;
    created_at?: string;
    roommates?: Array<string>;
};
export namespace Room {
    /**
     * Channel type
     */
    export enum type {
        VOICE = 'voice',
        TEXT = 'text',
    }
}

