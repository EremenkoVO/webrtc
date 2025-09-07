<template>
  <div class="modal-overlay">
    <Modal @close="$emit('close')">
      <template #header>
        <h3>Create Channel</h3>
      </template>

      <template #content>
        <form @submit.prevent="onSubmit">
          <div class="form-group">
            <label>Channel Name</label>
            <input
              v-model="form.name"
              type="text"
              placeholder="Enter channel name"
              required
            />
          </div>
          <div class="form-group">
            <label>Channel Type</label>
            <div class="radio-group">
              <label class="radio-option">
                <input v-model="form.type" type="radio" value="text" />
                <i class="fas fa-comment"></i>
                Text Channel
              </label>
              <label class="radio-option">
                <input v-model="form.type" type="radio" value="voice" />
                <i class="fas fa-microphone"></i>
                Voice Channel
              </label>
            </div>
          </div>
        </form>
      </template>

      <template #footer>
        <div class="modal-actions">
          <button type="button" @click="$emit('close')" class="btn-secondary">
            Cancel
          </button>
          <button type="submit" @click="onSubmit" class="btn-primary">
            Create Channel
          </button>
        </div>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { CreateChannelData } from '../../types';
import Modal from '../modals/Modal.vue';

interface Emits {
  (e: 'close'): void;
  (e: 'create', data: CreateChannelData): void;
}

const emit = defineEmits<Emits>();

const form = reactive({
  name: '',
  type: 'text' as 'text' | 'voice',
});

const onSubmit = () => {
  if (!form.name.trim()) return;

  emit('create', {
    name: form.name.trim(),
    type: form.type,
  });

  form.name = '';
};
</script>

<style scoped>
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #b9bbbe;
}

.form-group input {
  width: 100%;
  padding: 12px;
  background: #202225;
  border: 1px solid #202225;
  border-radius: 4px;
  color: white;
  font-size: 16px;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #5865f2;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px;
  border-radius: 4px;
  color: white;
}

.radio-option:hover {
  background: #2f3136;
}

.radio-option input {
  margin: 0;
}

.modal-actions {
  display: flex;
  gap: 12px;
  width: 100%;
}

.btn-secondary {
  flex: 1;
  padding: 12px;
  background: #4f545c;
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 16px;
  cursor: pointer;
}

.btn-secondary:hover {
  background: #5d6269;
}

.btn-primary {
  flex: 1;
  padding: 12px;
  background: #5865f2;
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 16px;
  cursor: pointer;
}

.btn-primary:hover {
  background: #4752c4;
}
</style>
