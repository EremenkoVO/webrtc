import { useMediaStore } from '../stores/media';

interface UseMediaReturn {
  localStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  fullscreenUserId: number | null;
  toggleAudio: () => void;
  toggleVideo: () => void;
  setFullscreenUser: (userId: number | null) => void;
  getRemoteStream: (userId: number) => MediaStream | undefined;
  attachVideo: (videoEl: HTMLVideoElement | null, userId: number) => void;
}

export const useMedia = (): UseMediaReturn => {
  const mediaStore = useMediaStore();

  const getRemoteStream = (userId: number): MediaStream | undefined => {
    return mediaStore.remoteStreams[userId];
  };

  const attachVideo = (
    videoEl: HTMLVideoElement | null,
    userId: number,
  ): void => {
    if (!videoEl) return;
    const stream = getRemoteStream(userId);
    if (stream) {
      videoEl.srcObject = stream;
    }
  };

  return {
    localStream: mediaStore.localStream,
    isAudioEnabled: mediaStore.isAudioEnabled,
    isVideoEnabled: mediaStore.isVideoEnabled,
    fullscreenUserId: mediaStore.fullscreenUserId,
    toggleAudio: mediaStore.toggleAudio,
    toggleVideo: mediaStore.toggleVideo,
    setFullscreenUser: mediaStore.setFullscreenUser,
    getRemoteStream,
    attachVideo,
  };
};
