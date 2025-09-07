import { WebSocketService } from '../services/websocket';
import { useAuthStore } from '../stores/auth';
import { useChannelsStore } from '../stores/channels';
import { useMediaStore } from '../stores/media';
import { useMessagesStore } from '../stores/messages';
import { useUsersStore } from '../stores/users';
import type { SignalMessage } from '../types';

export const useWebSocket = () => {
  const wsService = new WebSocketService();
  const authStore = useAuthStore();
  const usersStore = useUsersStore();
  const mediaStore = useMediaStore();
  const channelsStore = useChannelsStore();
  const messagesStore = useMessagesStore();

  // WebRTC peer connections
  const peerConnections: Record<number, RTCPeerConnection> = {};
  const remoteStreams: Record<number, MediaStream> = {};

  const connect = (): void => {
    if (!authStore.isAuthenticated || !authStore.user) {
      console.warn('Cannot connect: not authenticated');
      return;
    }

    console.log('Connecting WebSocket...');
    wsService.connect(
      authStore.user.id,
      authStore.user.username,
      authStore.token,
    );
    wsService.onMessage((msg) => handleMessage(msg));
  };

  const createPeerConnection = (remoteUserId: number): RTCPeerConnection => {
    console.log('Creating peer connection for user:', remoteUserId);

    // Проверяем существующее соединение
    if (peerConnections[remoteUserId]) {
      console.log('Peer connection already exists for user:', remoteUserId);
      return peerConnections[remoteUserId];
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.stunprotocol.org:3478' },
      ],
    });

    // Add local stream tracks
    const localStream = mediaStore.localStream;
    if (localStream) {
      console.log('Adding local tracks to peer connection');
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && authStore.user) {
        console.log('Sending ICE candidate to user:', remoteUserId);
        wsService.send({
          type: 'candidate',
          to: remoteUserId,
          candidate: event.candidate,
        });
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('Received remote track from user:', remoteUserId);
      if (event.streams?.[0]) {
        const remoteStream = event.streams[0];
        remoteStreams[remoteUserId] = remoteStream;
        mediaStore.setRemoteStream(remoteUserId, remoteStream);
        console.log('Remote stream set for user:', remoteUserId);

        // Добавляем участника в список, если его там нет
        const participantExists = usersStore.callParticipants.some(
          (p) => p.userId === remoteUserId,
        );
        if (!participantExists) {
          usersStore.addCallParticipant({
            userId: remoteUserId,
            username: `User ${remoteUserId}`, // Будет обновлено позже
          });
        }
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state for ${remoteUserId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        console.log('Peer connection established with user:', remoteUserId);
      }
    };

    // Handle ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log(
        `ICE connection state for ${remoteUserId}:`,
        pc.iceConnectionState,
      );
    };

    peerConnections[remoteUserId] = pc;
    return pc;
  };

  const startCall = async (): Promise<void> => {
    if (!authStore.isAuthenticated || !authStore.user) {
      console.log('Not authenticated');
      throw new Error('Not authenticated');
    }

    try {
      console.log('Starting call...');
      usersStore.setInCall(true);
      usersStore.clearCallParticipants();

      // Добавляем себя в список участников звонка
      usersStore.addCallParticipant({
        userId: authStore.user.id,
        username: authStore.user.username,
      });

      // Get local media stream
      console.log('Requesting local media stream...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });

      mediaStore.setLocalStream(stream);
      console.log('Local stream acquired');

      // Уведомляем других пользователей о входе в звонок
      wsService.send({
        type: 'join_call',
        userId: authStore.user.id,
        username: authStore.user.username,
      });
    } catch (error) {
      console.error('Failed to start call:', error);
      usersStore.setInCall(false);
      mediaStore.clearStreams();
      throw new Error(
        'Failed to access camera/microphone: ' + (error as Error).message,
      );
    }
  };

  const createOffer = async (remoteUserId: number): Promise<void> => {
    try {
      console.log('Creating offer for user:', remoteUserId);

      const pc = createPeerConnection(remoteUserId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (pc.localDescription) {
        wsService.send({
          type: 'offer',
          to: remoteUserId,
          offer: pc.localDescription,
        });
        console.log('Offer sent to user:', remoteUserId);
      }
    } catch (error) {
      console.error('Error creating offer for user', remoteUserId, ':', error);
    }
  };

  const handleMessage = async (msg: SignalMessage): Promise<void> => {
    console.log('Received WebSocket message:', msg);

    if (!authStore.user) {
      console.warn('Received message but not authenticated');
      return;
    }

    switch (msg.type) {
      case 'user_list':
        handleUserList(msg);
        break;

      case 'user_joined':
        handleUserJoined(msg);
        break;

      case 'user_left':
        handleUserLeft(msg);
        break;

      case 'channel_created':
      case 'channel_deleted':
        channelsStore.loadChannels();
        break;

      case 'new_message':
        handleNewMessage(msg);
        break;

      case 'join_call':
        handleJoinCall(msg);
        break;

      case 'leave_call':
        handleLeaveCall(msg);
        break;

      case 'offer':
        if (isNumber(msg.from) && msg.offer) {
          await handleOffer(msg.from, msg.offer);
        }
        break;

      case 'answer':
        if (isNumber(msg.from) && msg.answer) {
          await handleAnswer(msg.from, msg.answer);
        }
        break;

      case 'candidate':
        if (isNumber(msg.from) && msg.candidate) {
          await handleCandidate(msg.from, msg.candidate);
        }
        break;

      default:
        console.log('Unknown message type:', msg.type);
    }
  };

  // Message handlers
  const handleUserList = (msg: SignalMessage): void => {
    if (Array.isArray(msg.users)) {
      const filteredUsers = msg.users.filter(
        (user) => user.userId !== authStore.user?.id,
      );
      usersStore.setOnlineUsers(filteredUsers);
    }
  };

  const handleUserJoined = (msg: SignalMessage): void => {
    if (msg.user && msg.user.userId !== authStore.user?.id) {
      usersStore.addOnlineUser(msg.user);
    }
  };

  const handleUserLeft = (msg: SignalMessage): void => {
    if (isNumber(msg.userId)) {
      usersStore.removeOnlineUser(msg.userId);
      // Удаляем из списка участников звонка, если в звонке
      if (usersStore.isInCall) {
        usersStore.removeCallParticipant(msg.userId);
        closePeerConnection(msg.userId);
      }
    }
  };

  const handleNewMessage = (msg: SignalMessage): void => {
    if (msg.message) {
      const isOwnMessage = msg.message.user_id === authStore.user?.id;
      if (!isOwnMessage) {
        messagesStore.addMessage(msg.message);
      }
    }
  };

  const handleJoinCall = (msg: SignalMessage): void => {
    // Другой пользователь присоединился к звонку
    if (isNumber(msg.userId) && msg.userId !== authStore.user?.id) {
      console.log('User joined call:', msg.userId, msg.username);

      // Добавляем пользователя в список участников звонка
      usersStore.addCallParticipant({
        userId: msg.userId,
        username: msg.username || `User ${msg.userId}`,
      });

      // Создаем offer для нового участника
      if (mediaStore.localStream) {
        setTimeout(() => {
          createOffer(msg.userId);
        }, 1000); // Небольшая задержка для стабильности
      }
    }
  };

  const handleLeaveCall = (msg: SignalMessage): void => {
    // Другой пользователь покинул звонок
    if (isNumber(msg.userId)) {
      console.log('User left call:', msg.userId);
      usersStore.removeCallParticipant(msg.userId);
      // Закрываем WebRTC соединение
      closePeerConnection(msg.userId);
    }
  };

  const handleOffer = async (
    fromUserId: number,
    offer: RTCSessionDescriptionInit,
  ): Promise<void> => {
    try {
      console.log('Received offer from user:', fromUserId);

      const pc = createPeerConnection(fromUserId);

      // Проверяем состояние сигнализации
      if (pc.signalingState !== 'stable') {
        console.warn(
          `Unexpected signaling state for offer: ${pc.signalingState}`,
        );
        if (pc.signalingState === 'have-local-offer') {
          await pc.setLocalDescription({ type: 'rollback' });
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (pc.localDescription) {
        wsService.send({
          type: 'answer',
          to: fromUserId,
          answer: pc.localDescription,
        });
        console.log('Answer sent to user:', fromUserId);
      }
    } catch (error) {
      console.error('Error handling offer from user', fromUserId, ':', error);
    }
  };

  const handleAnswer = async (
    fromUserId: number,
    answer: RTCSessionDescriptionInit,
  ): Promise<void> => {
    try {
      console.log('Received answer from user:', fromUserId);

      const pc = peerConnections[fromUserId];
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('Answer set for user:', fromUserId);
      } else {
        console.warn(`Cannot set answer: invalid state for user ${fromUserId}`);
      }
    } catch (error) {
      console.error('Error handling answer from user', fromUserId, ':', error);
    }
  };

  const handleCandidate = async (
    fromUserId: number,
    candidate: RTCIceCandidateInit,
  ): Promise<void> => {
    try {
      console.log('Received ICE candidate from user:', fromUserId);

      const pc = peerConnections[fromUserId];
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('ICE candidate added for user:', fromUserId);
      }
    } catch (error) {
      console.error(
        'Error handling ICE candidate from user',
        fromUserId,
        ':',
        error,
      );
    }
  };

  const closePeerConnection = (userId: number): void => {
    const pc = peerConnections[userId];
    if (pc) {
      try {
        pc.close();
      } catch (error) {
        console.error(
          'Error closing peer connection for user',
          userId,
          ':',
          error,
        );
      }
      delete peerConnections[userId];
      delete remoteStreams[userId];
    }
  };

  const send = (message: any): void => {
    wsService.send(message);
  };

  const disconnectCall = (): void => {
    console.log('Disconnecting call...');

    // Уведомляем других пользователей о выходе из звонка
    if (authStore.user) {
      wsService.send({
        type: 'leave_call',
        userId: authStore.user.id,
      });
    }

    // Закрываем все WebRTC соединения
    Object.keys(peerConnections).forEach((userId) => {
      closePeerConnection(Number(userId));
    });

    // Очищаем все данные
    usersStore.clearCallParticipants();
    mediaStore.clearStreams();
    usersStore.setInCall(false);

    // Отключаем WebSocket
    wsService.disconnect();
  };

  // Utility function
  const isNumber = (value: any): value is number => {
    return typeof value === 'number' && !isNaN(value);
  };

  return {
    connect,
    startCall,
    send,
    disconnectCall,
  };
};
