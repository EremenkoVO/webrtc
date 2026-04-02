/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateRoomRequest = {
    /**
     * Human-readable room name
     */
    name: string;
    /**
     * Channel type
     */
    type?: CreateRoomRequest.type;
};
export namespace CreateRoomRequest {
    /**
     * Channel type
     */
    export enum type {
        VOICE = 'voice',
        TEXT = 'text',
    }
}

