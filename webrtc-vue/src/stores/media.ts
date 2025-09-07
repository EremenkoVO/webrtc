import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useMediaStore = defineStore('media', () => {
  const localStream = ref<MediaStream | null>(null);
  const isAudioEnabled = ref<boolean>(true);
  const isVideoEnabled = ref<boolean>(true);
  const fullscreenUserId = ref<number | null>(null);
  const remoteStreams = ref<Record<number, MediaStream>>({});

  const setLocalStream = (stream: MediaStream | null): void => {
    localStream.value = stream;
  };

  const toggleAudio = (): void => {
    if (localStream.value) {
      const audioTracks = localStream.value.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      console.log(!isAudioEnabled.value);
      isAudioEnabled.value = !isAudioEnabled.value;
    }
  };

  const toggleVideo = (): void => {
    if (localStream.value) {
      const videoTracks = localStream.value.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      isVideoEnabled.value = !isVideoEnabled.value;
    }
  };

  const setFullscreenUser = (userId: number | null): void => {
    fullscreenUserId.value = userId === fullscreenUserId.value ? null : userId;
  };

  const setRemoteStream = (userId: number, stream: MediaStream): void => {
    remoteStreams.value[userId] = stream;
  };

  const clearStreams = (): void => {
    // Останавливаем все треки локального стрима
    if (localStream.value) {
      localStream.value.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.error('Error stopping track:', e);
        }
      });
    }
    localStream.value = null;

    // Останавливаем все треки удаленных стримов
    Object.values(remoteStreams.value).forEach((stream) => {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.error('Error stopping remote track:', e);
        }
      });
    });
    remoteStreams.value = {};
  };

  return {
    localStream,
    isAudioEnabled,
    isVideoEnabled,
    fullscreenUserId,
    remoteStreams,
    setLocalStream,
    toggleAudio,
    toggleVideo,
    setFullscreenUser,
    setRemoteStream,
    clearStreams,
  };
});
