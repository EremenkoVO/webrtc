import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Participant } from '../types';
import { useAuthStore } from './auth';

export const useUsersStore = defineStore('users', () => {
  const onlineUsers = ref<Participant[]>([]); // Все онлайн пользователи
  const callParticipants = ref<Participant[]>([]); // Участники текущего звонка
  const isInCall = ref<boolean>(false);

  // Методы для работы с онлайн пользователями
  const setOnlineUsers = (users: Participant[]): void => {
    onlineUsers.value = users;
    console.log('Online users updated:', users);
  };

  const addOnlineUser = (user: Participant): void => {
    const exists = onlineUsers.value.some((u) => u.userId === user.userId);
    if (!exists) {
      onlineUsers.value.push(user);
      console.log('User added to online list:', user);
    }
  };

  const removeOnlineUser = (userId: number): void => {
    onlineUsers.value = onlineUsers.value.filter((u) => u.userId !== userId);
    console.log('User removed from online list:', userId);
  };

  // Методы для работы с участниками звонка
  const addCallParticipant = (participant: Participant): void => {
    // Проверяем, что это не текущий пользователь
    const authStore = useAuthStore();
    if (participant.userId === authStore.user?.id) {
      return;
    }

    const exists = callParticipants.value.some(
      (p) => p.userId === participant.userId,
    );
    if (!exists) {
      callParticipants.value.push(participant);
      console.log('Participant added to call:', participant);
    }
  };

  const removeCallParticipant = (userId: number): void => {
    callParticipants.value = callParticipants.value.filter(
      (p) => p.userId !== userId,
    );
    console.log('Participant removed from call:', userId);
  };

  const clearCallParticipants = (): void => {
    callParticipants.value = [];
    console.log('Call participants cleared');
  };

  const setInCall = (inCall: boolean): void => {
    isInCall.value = inCall;
    console.log('In call status changed:', inCall);
    if (!inCall) {
      clearCallParticipants();
    }
  };

  return {
    // Online users
    onlineUsers,
    setOnlineUsers,
    addOnlineUser,
    removeOnlineUser,

    // Call participants
    callParticipants,
    addCallParticipant,
    removeCallParticipant,
    clearCallParticipants,

    // Call status
    isInCall,
    setInCall,
  };
});
