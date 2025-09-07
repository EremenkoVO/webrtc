<template>
  <div class="voice-call">
    <!-- Call Controls -->
    <div class="call-controls">
      <button
        v-if="!isInCall && !isConnecting"
        @click="handleStartCall"
        class="btn btn-primary"
        :disabled="!websocket"
      >
        <i class="fas fa-phone"></i>
        Join Voice Chat
      </button>
      
      <div v-else-if="isConnecting" class="connecting">
        <i class="fas fa-spinner fa-spin"></i>
        Connecting...
      </div>
      
      <div v-else class="in-call-controls">
        <button
          @click="toggleAudio"
          class="btn btn-control"
          :class="{ active: isAudioEnabled, muted: !isAudioEnabled }"
        >
          <i :class="isAudioEnabled ? 'fas fa-microphone' : 'fas fa-microphone-slash'"></i>
        </button>
        
        <button
          @click="toggleVideo"
          class="btn btn-control"
          :class="{ active: isVideoEnabled, disabled: !isVideoEnabled }"
        >
          <i :class="isVideoEnabled ? 'fas fa-video' : 'fas fa-video-slash'"></i>
        </button>
        
        <button
          @click="handleEndCall"
          class="btn btn-danger"
        >
          <i class="fas fa-phone-slash"></i>
          Leave Call
        </button>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="error-message">
      <i class="fas fa-exclamation-triangle"></i>
      {{ error }}
    </div>

    <!-- Video Grid -->
    <div v-if="isInCall" class="video-grid">
      <!-- Local Video -->
      <div v-if="localStream" class="video-participant local">
        <video
          ref="localVideoRef"
          :srcObject="localStream"
          autoplay
          muted
          playsinline
        ></video>
        <div class="participant-info">
          <span class="username">You</span>
          <div class="status-indicators">
            <i v-if="!isAudioEnabled" class="fas fa-microphone-slash muted"></i>
            <i v-if="!isVideoEnabled" class="fas fa-video-slash disabled"></i>
          </div>
        </div>
      </div>

      <!-- Remote Videos -->
      <div
        v-for="participant in remoteParticipants"
        :key="participant.id"
        class="video-participant remote"
      >
        <video
          :ref="(el) => setRemoteVideoRef(el, participant.id)"
          :srcObject="getParticipantStream(participant.id)"
          autoplay
          playsinline
          muted="false"
          controls
        ></video>
        <div class="participant-info">
          <span class="username">{{ participant.username }}</span>
          <div class="debug-info">
            <small>ID: {{ participant.id }}</small>
            <small>Stream: {{ getParticipantStream(participant.id) ? 'Yes' : 'No' }}</small>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="participants.length === 1" class="empty-state">
        <i class="fas fa-user-friends"></i>
        <p>Waiting for others to join...</p>
      </div>
    </div>

    <!-- Participant List -->
    <div v-if="isInCall" class="participant-list">
      <h4>Participants ({{ participants.length }})</h4>
      <div class="participant-items">
        <div
          v-for="participant in participants"
          :key="participant.id"
          class="participant-item"
        >
          <i class="fas fa-user"></i>
          <span>{{ participant.isLocal ? 'You' : participant.username }}</span>
          <div class="participant-status">
            <i v-if="participant.isLocal && !isAudioEnabled" class="fas fa-microphone-slash"></i>
            <i v-if="participant.isLocal && !isVideoEnabled" class="fas fa-video-slash"></i>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useVoiceCall } from '../../composables/useVoiceCall';

interface Props {
  websocket?: WebSocket | null;
  userId?: number;
}

const props = withDefaults(defineProps<Props>(), {
  websocket: null,
  userId: 0
});

const {
  isInCall,
  isConnecting,
  participants,
  localStream,
  error,
  isAudioEnabled,
  isVideoEnabled,
  initialize,
  startCall,
  endCall,
  toggleAudio: toggleAudioCall,
  toggleVideo: toggleVideoCall,
  getParticipantStream,
  debugStatus
} = useVoiceCall();

// Expose debug function globally for console access
(window as any).debugVoiceCall = debugStatus;

const localVideoRef = ref<HTMLVideoElement | null>(null);
const remoteVideoRefs = ref<Record<number, HTMLVideoElement>>({});

const remoteParticipants = computed(() => 
  participants.value.filter((p: any) => !p.isLocal)
);

onMounted(async () => {
  if (props.websocket && props.userId) {
    await initialize(props.websocket, props.userId);
  }
});

const handleStartCall = async () => {
  try {
    await startCall();
    await nextTick();
    setupLocalVideo();
  } catch (err) {
    console.error('Failed to start call:', err);
  }
};

const handleEndCall = async () => {
  await endCall();
};

const toggleAudio = () => {
  toggleAudioCall();
};

const toggleVideo = () => {
  toggleVideoCall();
};

const setupLocalVideo = () => {
  if (localVideoRef.value && localStream.value) {
    localVideoRef.value.srcObject = localStream.value;
  }
};

const setRemoteVideoRef = (el: any, participantId: number) => {
  if (el instanceof HTMLVideoElement) {
    remoteVideoRefs.value[participantId] = el;
    
    console.log(`🎬 Setting up video ref for participant ${participantId}`);
    
    // Set up video element properties
    el.autoplay = true;
    el.playsInline = true;
    el.controls = true;
    el.volume = 1.0;
    
    // Add event listeners for debugging
    el.addEventListener('loadstart', () => {
      console.log(`📺 Video loadstart for participant ${participantId}`);
    });
    
    el.addEventListener('loadeddata', () => {
      console.log(`📺 Video loadeddata for participant ${participantId}`);
    });
    
    el.addEventListener('canplay', () => {
      console.log(`📺 Video can play for participant ${participantId}`);
      el.play().catch(err => console.log('Auto play failed:', err));
    });
    
    el.addEventListener('play', () => {
      console.log(`▶️ Video started playing for participant ${participantId}`);
    });
    
    el.addEventListener('error', (e) => {
      console.log(`❌ Video error for participant ${participantId}:`, e);
    });
    
    // Force play when stream is available
    if (el.srcObject) {
      el.play().catch(err => console.log('Initial play failed:', err));
    }
  }
};
</script>

<style scoped>
.voice-call {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #2f3136;
  color: #ffffff;
}

.call-controls {
  padding: 20px;
  background: #202225;
  border-bottom: 1px solid #40444b;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #5865f2;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #4752c4;
}

.btn-control {
  background: #4f545c;
  color: white;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  padding: 0;
  justify-content: center;
}

.btn-control:hover {
  background: #5d6269;
}

.btn-control.active {
  background: #5865f2;
}

.btn-control.muted {
  background: #ed4245;
}

.btn-control.disabled {
  background: #747f8d;
}

.btn-danger {
  background: #ed4245;
  color: white;
}

.btn-danger:hover {
  background: #c03537;
}

.connecting {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: #5865f2;
}

.error-message {
  background: #ed4245;
  color: white;
  padding: 12px;
  margin: 16px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.video-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  padding: 16px;
  overflow-y: auto;
}

.video-participant {
  background: #202225;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  aspect-ratio: 16/9;
}

.video-participant video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
}

.video-participant.local {
  order: -1;
}

.participant-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.username {
  font-weight: 500;
  font-size: 14px;
  color: white;
}

.status-indicators {
  display: flex;
  gap: 4px;
}

.status-indicators i {
  font-size: 12px;
}

.status-indicators .muted {
  color: #ed4245;
}

.status-indicators .disabled {
  color: #747f8d;
}

.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #72767d;
  text-align: center;
}

.empty-state i {
  font-size: 48px;
  margin-bottom: 16px;
}

.participant-list {
  background: #202225;
  border-top: 1px solid #40444b;
  padding: 16px;
}

.participant-list h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #b9bbbe;
  text-transform: uppercase;
}

.participant-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.participant-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 4px;
  background: #2f3136;
}

.participant-item i {
  color: #72767d;
}

.participant-status {
  margin-left: auto;
  display: flex;
  gap: 4px;
}

.participant-status i {
  font-size: 12px;
  color: #ed4245;
}

.debug-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.debug-info small {
  font-size: 10px;
  color: #72767d;
  background: rgba(0, 0, 0, 0.5);
  padding: 2px 4px;
  border-radius: 2px;
}

@media (max-width: 768px) {
  .video-grid {
    grid-template-columns: 1fr;
    padding: 8px;
  }
  
  .call-controls {
    padding: 12px;
  }
  
  .btn {
    padding: 8px 16px;
    font-size: 14px;
  }
}</style>