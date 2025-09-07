import { Message } from '../types';
export declare const messageService: {
    getMessagesByChannel: (channelId: number) => Message[];
    createMessage: (channelId: number, userId: number, content: string) => Message | null;
};
//# sourceMappingURL=service.d.ts.map