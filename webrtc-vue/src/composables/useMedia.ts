import { useMediaStore } from '../stores/media';

interface UseMediaReturn {
  localStream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  fullscreenUserId: number | null;
  remoteStreams: Record<number, MediaStream>;
  toggleAudio: () => void;
  toggleVideo: () => void;
  setFullscreenUser: (userId: number | null) => void;
  getRemoteStream: (userId: number) => MediaStream | undefined;
  attachVideo: (videoEl: HTMLVideoElement | null, userId: number) => void;
  getAudioDevices: () => Promise<MediaDeviceInfo[]>;
  getVideoDevices: () => Promise<MediaDeviceInfo[]>;
  selectAudioDevice: (deviceId: string) => Promise<MediaStream>;
  selectVideoDevice: (deviceId: string) => Promise<MediaStream>;
  selectBothDevices: (
    audioDeviceId: string,
    videoDeviceId: string,
  ) => Promise<MediaStream>;
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

  const getAudioDevices = async (): Promise<MediaDeviceInfo[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'audioinput');
    } catch (error) {
      console.error('Error getting audio devices:', error);
      return [];
    }
  };

  const getVideoDevices = async (): Promise<MediaDeviceInfo[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'videoinput');
    } catch (error) {
      console.error('Error getting video devices:', error);
      return [];
    }
  };

  const selectAudioDevice = async (deviceId: string): Promise<MediaStream> => {
    try {
      // Останавливаем текущий стрим если он есть
      if (mediaStore.localStream) {
        mediaStore.localStream.getTracks().forEach((track) => track.stop());
      }

      // Получаем новый стрим с выбранным аудио устройством
      const constraints: MediaStreamConstraints = {
        audio: { deviceId: { exact: deviceId } },
        video: mediaStore.localStream
          ? mediaStore.localStream.getVideoTracks().length > 0
          : { width: { ideal: 640 }, height: { ideal: 480 } },
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStore.setLocalStream(newStream);

      console.log('Audio device selected:', deviceId);
      return newStream;
    } catch (error) {
      console.error('Error selecting audio device:', error);
      throw error;
    }
  };

  const selectVideoDevice = async (deviceId: string): Promise<MediaStream> => {
    try {
      // Останавливаем текущий стрим если он есть
      if (mediaStore.localStream) {
        mediaStore.localStream.getTracks().forEach((track) => track.stop());
      }

      // Получаем новый стрим с выбранным видео устройством
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: mediaStore.localStream
          ? mediaStore.localStream.getAudioTracks().length > 0
          : true,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStore.setLocalStream(newStream);

      console.log('Video device selected:', deviceId);
      return newStream;
    } catch (error) {
      console.error('Error selecting video device:', error);
      throw error;
    }
  };

  const selectBothDevices = async (
    audioDeviceId: string,
    videoDeviceId: string,
  ): Promise<MediaStream> => {
    try {
      // Останавливаем текущий стрим если он есть
      if (mediaStore.localStream) {
        mediaStore.localStream.getTracks().forEach((track) => track.stop());
      }

      // Получаем новый стрим с обоими устройствами
      const constraints: MediaStreamConstraints = {
        audio: { deviceId: { exact: audioDeviceId } },
        video: {
          deviceId: { exact: videoDeviceId },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStore.setLocalStream(newStream);

      console.log('Both devices selected:', audioDeviceId, videoDeviceId);
      return newStream;
    } catch (error) {
      console.error('Error selecting both devices:', error);
      throw error;
    }
  };

  return {
    localStream: mediaStore.localStream,
    isAudioEnabled: mediaStore.isAudioEnabled,
    isVideoEnabled: mediaStore.isVideoEnabled,
    fullscreenUserId: mediaStore.fullscreenUserId,
    remoteStreams: mediaStore.remoteStreams,
    toggleAudio: mediaStore.toggleAudio,
    toggleVideo: mediaStore.toggleVideo,
    setFullscreenUser: mediaStore.setFullscreenUser,
    getRemoteStream,
    attachVideo,
    getAudioDevices,
    getVideoDevices,
    selectAudioDevice,
    selectVideoDevice,
    selectBothDevices,
  };
};
