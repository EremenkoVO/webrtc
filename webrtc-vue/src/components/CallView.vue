<template>
  <div class="app-container">
    <!-- Sidebar -->
    <aside class="sidebar">
      <h2 class="logo">🎧 MyChat</h2>
      <div class="user-list">
        <h3>Online</h3>
        <ul>
          <transition-group name="fade" tag="div">
            <li
              v-for="user in users"
              :key="user"
              :class="{ self: user === myId }"
            >
              <div class="avatar">{{ user.slice(0, 4) }}</div>
              <span>{{ user === myId ? 'You' : user }}</span>
              <button
                v-if="user !== myId"
                @click="callUser(user)"
                class="call-btn"
              >
                📞
              </button>
            </li>
          </transition-group>
        </ul>
      </div>
    </aside>

    <!-- Main panel -->
    <main class="main-panel">
      <div class="controls-top">
        <button @click="toggleCamera">
          {{ cameraOn ? 'Turn Camera Off' : 'Turn Camera On' }}
        </button>
        <button @click="toggleMic">{{ micOn ? 'Mute' : 'Unmute' }}</button>
        <button @click="shareScreen">Share Screen</button>
        <button @click="hangUp">Hang Up</button>
      </div>

      <!-- Stage with Picture-in-Picture -->
      <div class="stage">
        <!-- Main video -->
        <div class="main-video-wrapper">
          <video ref="mainVideo" autoplay playsinline class="video" />
          <span class="label">{{
            mainVideoId === myId ? 'You' : mainVideoId
          }}</span>
        </div>

        <!-- PiP миниатюры -->
        <div class="pip-thumbnails">
          <div
            v-for="id in pipIds"
            :key="id"
            class="pip-video-wrapper"
            draggable="true"
            @click="setMainVideo(id)"
            @dragstart="dragStart($event, id)"
            @dragend="dragEnd"
          >
            <video :ref="setRemoteRef(id)" autoplay playsinline class="video" />
            <span class="label">{{ id }}</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, reactive, onMounted, watch } from 'vue';

export default defineComponent({
  setup() {
    const localVideo = ref<HTMLVideoElement>();
    const mainVideo = ref<HTMLVideoElement>();
    const myId = ref<string>('-');
    const users = ref<string[]>([]);
    const ws = ref<WebSocket>();
    const pcs = reactive(new Map<string, RTCPeerConnection>());
    const localStream = ref<MediaStream>();
    const remoteStreams = reactive<Record<string, MediaStream>>({});
    const cameraOn = ref(true);
    const micOn = ref(true);

    // PiP
    const mainVideoId = ref<string>('-');
    const pipIds = ref<string[]>([]);

    const initLocalStream = async () => {
      localStream.value = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (localVideo.value) localVideo.value.srcObject = localStream.value;

      // Изначально основной видеопоток — локальный
      mainVideoId.value = myId.value;
      mainVideo.value!.srcObject = localStream.value;
    };

    const createPeerConnection = (peerId: string) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcs.set(peerId, pc);
      remoteStreams[peerId] = new MediaStream();

      localStream.value
        ?.getTracks()
        .forEach((track) => pc.addTrack(track, localStream.value!));

      pc.ontrack = (event) => {
        event.streams[0]
          .getTracks()
          .forEach((track) => remoteStreams[peerId].addTrack(track));
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          ws.value?.send(
            JSON.stringify({
              type: 'candidate',
              to: peerId,
              data: event.candidate,
            }),
          );
        }
      };

      return pc;
    };

    const setupWebSocket = () => {
      ws.value = new WebSocket('wss://192.168.1.129:8080');
      ws.value.onmessage = async (ev) => {
        const msg = JSON.parse(ev.data);

        if (msg.type === 'welcome') {
          myId.value = msg.id;
          await initLocalStream();
        }

        if (msg.type === 'user-list') {
          // Убираем себя из списка участников
          users.value = msg.users.filter((u) => u !== myId.value);
          pipIds.value = users.value.filter((u) => u !== mainVideoId.value);
        }

        if (msg.type === 'offer' && msg.from) {
          if (msg.from === myId.value) return; // игнорируем свои офферы
          const pc = createPeerConnection(msg.from);
          await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.value?.send(
            JSON.stringify({ type: 'answer', to: msg.from, data: answer }),
          );
        }

        if (msg.type === 'answer' && msg.from) {
          if (msg.from === myId.value) return; // игнорируем свои ответы
          const pc = pcs.get(msg.from);
          if (pc)
            await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
        }

        if (msg.type === 'candidate' && msg.from) {
          if (msg.from === myId.value) return; // игнорируем свои ICE-кандидаты
          const pc = pcs.get(msg.from);
          if (pc) await pc.addIceCandidate(new RTCIceCandidate(msg.data));
        }
      };
    };

    const callUser = async (peerId: string) => {
      if (peerId === myId.value) return; // не звонить самому себе
      const pc = createPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.value?.send(
        JSON.stringify({ type: 'offer', to: peerId, data: offer }),
      );
    };

    const toggleCamera = () => {
      localStream.value
        ?.getVideoTracks()
        .forEach((track) => (track.enabled = !cameraOn.value));
      cameraOn.value = !cameraOn.value;
    };

    const toggleMic = () => {
      localStream.value
        ?.getAudioTracks()
        .forEach((track) => (track.enabled = !micOn.value));
      micOn.value = !micOn.value;
    };

    const shareScreen = async () => {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        localStream.value?.getTracks().forEach((track) => track.stop());
        localStream.value = screenStream;
        if (mainVideoId.value === myId.value)
          mainVideo.value!.srcObject = screenStream;

        pcs.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenStream.getVideoTracks()[0]);
        });
      } catch (err) {
        console.error('Screen share error:', err);
      }
    };

    const hangUp = () => {
      pcs.forEach((pc) => pc.close());
      pcs.clear();
      Object.keys(remoteStreams).forEach((key) => delete remoteStreams[key]);
      localStream.value?.getTracks().forEach((track) => track.stop());
      initLocalStream();
      mainVideoId.value = myId.value;
      pipIds.value = [];
    };

    const setRemoteRef = (id: string) => (el: HTMLVideoElement) => {
      if (el) el.srcObject = remoteStreams[id];
    };

    // PiP controls
    const setMainVideo = (id: string) => {
      if (id === mainVideoId.value) return;
      // Старая основная видео переходит в PiP
      if (mainVideoId.value !== myId.value)
        pipIds.value.push(mainVideoId.value);
      else if (mainVideoId.value === myId.value) pipIds.value.push(myId.value);

      // Новый основной
      mainVideoId.value = id;
      mainVideo.value!.srcObject = remoteStreams[id];
      pipIds.value = pipIds.value.filter((i) => i !== id);
    };

    // Drag & Drop
    const dragData = ref<string | null>(null);
    const dragStart = (event: DragEvent, id: string) => {
      dragData.value = id;
      event.dataTransfer!.effectAllowed = 'move';
    };
    const dragEnd = () => {
      dragData.value = null;
    };

    // Watch to update main video if local
    watch(mainVideoId, (id) => {
      if (id === myId.value) mainVideo.value!.srcObject = localStream.value;
    });

    onMounted(() => setupWebSocket());

    return {
      localVideo,
      mainVideo,
      myId,
      users,
      callUser,
      remoteStreams,
      setRemoteRef,
      cameraOn,
      micOn,
      toggleCamera,
      toggleMic,
      shareScreen,
      hangUp,
      mainVideoId,
      pipIds,
      setMainVideo,
      dragStart,
      dragEnd,
    };
  },
});
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  background-color: #2f3136;
  color: #fff;
  font-family: 'Segoe UI', sans-serif;
}
.sidebar {
  width: 220px;
  background-color: #202225;
  padding: 20px;
  display: flex;
  flex-direction: column;
}
.logo {
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 20px;
}
.user-list h3 {
  margin-bottom: 10px;
}
.user-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.user-list li {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  transition: all 0.3s ease;
}
.user-list li.self span {
  color: #7289da;
}
.avatar {
  width: 32px;
  height: 32px;
  background-color: #7289da;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-right: 10px;
  font-size: 0.8rem;
}
.call-btn {
  margin-left: auto;
  background-color: #43b581;
  border: none;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
}
.main-panel {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}
.controls-top {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.controls-top button {
  background-color: #5865f2;
  border: none;
  color: white;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
}
.stage {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 20px;
}
.main-video-wrapper {
  position: relative;
  width: 640px;
  height: 480px;
  border-radius: 8px;
  overflow: hidden;
}
.pip-thumbnails {
  position: absolute;
  right: 20px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pip-video-wrapper {
  width: 160px;
  height: 120px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
}
.video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: black;
  border-radius: 8px;
}
.label {
  position: absolute;
  bottom: 4px;
  left: 4px;
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #fff;
}
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
