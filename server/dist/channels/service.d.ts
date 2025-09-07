import { Channel } from '../types';
export declare const channelService: {
    getAllChannels: () => Channel[];
    createChannel: (name: string, type: "text" | "voice") => Channel | null;
    deleteChannel: (channelId: number) => boolean;
};
//# sourceMappingURL=service.d.ts.map