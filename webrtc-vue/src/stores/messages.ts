import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { messageService } from '../services/messages';
import type { Message } from '../types';

export const useMessagesStore = defineStore('messages', () => {
  const messages = ref<Message[]>([]);
  const loading = ref<boolean>(false);
  const pendingMessages = ref<Set<string>>(new Set()); // Для отслеживания отправленных сообщений

  const sortedMessages = computed<Message[]>(() => {
    return [...messages.value].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB;
    });
  });

  const loadMessages = async (channelId: number): Promise<void> => {
    if (loading.value) return;

    loading.value = true;
    try {
      const fetchedMessages = await messageService.getMessages(channelId);
      messages.value = fetchedMessages;
      pendingMessages.value.clear(); // Очищаем список ожидающих сообщений
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      loading.value = false;
    }
  };

  const addMessage = (message: Message): void => {
    // Проверяем, не является ли это дубликатом
    const isDuplicate = messages.value.some((msg) => msg.id === message.id);
    if (!isDuplicate) {
      messages.value.push(message);
    }
  };

  const sendMessage = async (
    channelId: number,
    content: string,
  ): Promise<Message | null> => {
    try {
      // Создаем временное сообщение для немедленного отображения
      const tempId = `temp_${Date.now()}_${Math.random()}`;
      const tempMessage: Message = {
        id: Date.now(),
        channel_id: channelId,
        user_id: 0, // Будет заменено сервером
        content,
        created_at: new Date().toISOString(),
      };

      // Добавляем временное сообщение
      messages.value.push(tempMessage);
      pendingMessages.value.add(tempId);

      // Отправляем сообщение на сервер
      const newMessage = await messageService.sendMessage(channelId, content);

      // Удаляем временное сообщение и добавляем реальное
      messages.value = messages.value.filter(
        (msg) => msg.id !== tempMessage.id,
      );
      if (newMessage) {
        messages.value.push(newMessage);
      }

      pendingMessages.value.delete(tempId);
      return newMessage;
    } catch (error) {
      console.error('Failed to send message:', error);
      // Удаляем временное сообщение в случае ошибки
      messages.value = messages.value.filter(
        (msg) =>
          !(
            msg.created_at === new Date().toISOString() &&
            msg.content === content
          ),
      );
      return null;
    }
  };

  const clearMessages = (): void => {
    messages.value = [];
    pendingMessages.value.clear();
  };

  return {
    messages: sortedMessages,
    loading,
    loadMessages,
    addMessage,
    sendMessage,
    clearMessages,
  };
});
