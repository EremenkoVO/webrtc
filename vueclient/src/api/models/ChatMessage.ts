/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ChatMessage = {
    id?: string;
    type?: string;
    room?: string;
    from?: string;
    username?: string;
    text?: string;
    timestamp?: string;
    edited?: boolean;
    reactions?: Record<string, Array<string>>;
    replyToId?: string;
    replyToUsername?: string;
    replyToText?: string;
    voiceUrl?: string;
    voiceDuration?: number;
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    fileContentType?: string;
};

