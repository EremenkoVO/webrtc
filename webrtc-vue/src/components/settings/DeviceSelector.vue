<template>
  <div class="device-selector">
    <div class="selector-header">
      <h3><i class="fas fa-cog"></i> Audio/Video Settings</h3>
      <button @click="$emit('close')" class="close-btn">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <div class="selector-content">
      <!-- Audio Input Devices -->
      <div class="device-section">
        <h4><i class="fas fa-microphone"></i> Microphones</h4>
        <div class="device-list">
          <div
            v-for="(device, index) in audioDevices"
            :key="device.deviceId || index"
            class="device-item"
            :class="{ active: selectedAudioDevice === device.deviceId }"
            @click="selectAudioDevice(device.deviceId)"
          >
            <div class="device-info">
              <span class="device-name">{{
                device.label || `Microphone ${index + 1}`
              }}</span>
              <span
                v-if="selectedAudioDevice === device.deviceId"
                class="device-selected"
              >
                <i class="fas fa-check"></i> Selected
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Video Input Devices -->
      <div class="device-section">
        <h4><i class="fas fa-video"></i> Cameras</h4>
        <div class="device-list">
          <div
            v-for="(device, index) in videoDevices"
            :key="device.deviceId || index"
            class="device-item"
            :class="{ active: selectedVideoDevice === device.deviceId }"
            @click="selectVideoDevice(device.deviceId)"
          >
            <div class="device-info">
              <span class="device-name">{{
                device.label || `Camera ${index + 1}`
              }}</span>
              <span
                v-if="selectedVideoDevice === device.deviceId"
                class="device-selected"
              >
                <i class="fas fa-check"></i> Selected
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Apply Button -->
      <div class="apply-section">
        <button
          @click="applyChanges"
          class="apply-btn"
          :disabled="!selectedAudioDevice && !selectedVideoDevice"
        >
          <i class="fas fa-check"></i>
          Apply Changes
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useMedia } from '../../composables/useMedia';

interface Emits {
  (e: 'close'): void;
}

defineEmits<Emits>();

const {
  getAudioDevices,
  getVideoDevices,
  selectAudioDevice,
  selectVideoDevice,
  selectBothDevices,
  localStream,
} = useMedia();

const audioDevices = ref<MediaDeviceInfo[]>([]);
const videoDevices = ref<MediaDeviceInfo[]>([]);
const selectedAudioDevice = ref<string | null>(null);
const selectedVideoDevice = ref<string | null>(null);

// Methods
const refreshDevices = async () => {
  try {
    audioDevices.value = await getAudioDevices();
    videoDevices.value = await getVideoDevices();

    // Устанавливаем первые устройства по умолчанию
    if (audioDevices.value.length > 0 && !selectedAudioDevice.value) {
      selectedAudioDevice.value = audioDevices.value[0].deviceId;
    }
    if (videoDevices.value.length > 0 && !selectedVideoDevice.value) {
      selectedVideoDevice.value = videoDevices.value[0].deviceId;
    }

    console.log('Devices loaded:', audioDevices.value, videoDevices.value);
  } catch (error) {
    console.error('Error loading devices:', error);
  }
};

const selectAudioDeviceById = (deviceId: string) => {
  selectedAudioDevice.value = deviceId;
};

const selectVideoDeviceById = (deviceId: string) => {
  selectedVideoDevice.value = deviceId;
};

const applyChanges = async () => {
  try {
    if (selectedAudioDevice.value && selectedVideoDevice.value) {
      // Выбираем оба устройства
      await selectBothDevices(
        selectedAudioDevice.value,
        selectedVideoDevice.value,
      );
    } else if (selectedAudioDevice.value) {
      // Выбираем только аудио устройство
      await selectAudioDevice(selectedAudioDevice.value);
    } else if (selectedVideoDevice.value) {
      // Выбираем только видео устройство
      await selectVideoDevice(selectedVideoDevice.value);
    }

    console.log('Device changes applied');
  } catch (error) {
    console.error('Error applying device changes:', error);
    alert('Failed to apply device changes. Please try again.');
  }
};

// Lifecycle
onMounted(async () => {
  await refreshDevices();
});
</script>

<style scoped>
.device-selector {
  background: #36393f;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #2f3136;
  border-bottom: 1px solid #202225;
}

.selector-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: white;
  display: flex;
  align-items: center;
  gap: 12px;
}

.close-btn {
  background: none;
  border: none;
  color: #b9bbbe;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.close-btn:hover {
  background: #36393f;
  color: #fff;
}

.selector-content {
  padding: 24px;
}

.device-section {
  margin-bottom: 24px;
}

.device-section:last-child {
  margin-bottom: 0;
}

.device-section h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: #b9bbbe;
  display: flex;
  align-items: center;
  gap: 8px;
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.device-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #2f3136;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.device-item:hover {
  background: #36393f;
}

.device-item.active {
  background: rgba(88, 101, 242, 0.2);
  border: 1px solid #5865f2;
}

.device-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.device-name {
  font-size: 14px;
  color: white;
  font-weight: 500;
}

.device-selected {
  font-size: 12px;
  color: #5865f2;
  display: flex;
  align-items: center;
  gap: 4px;
}

.apply-section {
  margin-top: 32px;
  text-align: center;
}

.apply-btn {
  background: #5865f2;
  border: none;
  border-radius: 4px;
  padding: 12px 24px;
  color: white;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 500;
  transition: background 0.2s;
}

.apply-btn:hover:not(:disabled) {
  background: #4752c4;
}

.apply-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .device-selector {
    margin: 16px;
    max-height: calc(100vh - 32px);
  }

  .selector-content {
    padding: 16px;
  }

  .apply-section {
    margin-top: 24px;
  }
}
</style>
