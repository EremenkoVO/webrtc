/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * A signaling message exchanged over WebSocket for WebRTC peer-to-peer calls
 */
export type SignalingMessage = {
    /**
     * Type of signaling message
     */
    type: SignalingMessage.type;
    /**
     * Room identifier this message belongs to
     */
    room?: string;
    /**
     * Sender client ID
     */
    from?: string;
    /**
     * Target client ID (used for direct messages like offer/answer/ice)
     */
    to?: string;
    /**
     * Message payload, depends on message type
     */
    payload?: ({
        roomId: string;
    } | {
        clientId: string;
    } | {
        /**
         * Session Description Protocol (SDP) string
         */
        sdp: string;
        type: SignalingMessage.type;
    } | {
        candidate: string;
        sdpMid?: string;
        sdpMLineIndex?: number;
    });
};
export namespace SignalingMessage {
    /**
     * Type of signaling message
     */
    export enum type {
        JOIN = 'join',
        JOINED = 'joined',
        PEER_JOINED = 'peer-joined',
        OFFER = 'offer',
        ANSWER = 'answer',
        ICE = 'ice',
        LEAVE = 'leave',
    }
}

