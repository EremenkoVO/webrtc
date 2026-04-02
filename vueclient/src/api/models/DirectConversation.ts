/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ChatMessage } from './ChatMessage';
import type { DirectConversationParticipant } from './DirectConversationParticipant';
export type DirectConversation = {
    id: string;
    participants: Array<DirectConversationParticipant>;
    created_at: string;
    updated_at?: string;
    last_message?: ChatMessage;
    unread_count?: number;
};

