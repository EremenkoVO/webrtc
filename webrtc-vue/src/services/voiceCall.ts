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

  const peerConnections: Record<number, RTCPeerConnection> = {};
  const remoteStreams: Record<number, MediaStream> = {};

  const connect = (): void => {
    if (authStore.isAuthenticated && authStore.user && authStore.token) {
      console.log('Connecting WebSocket...');
      wsService.connect(
        authStore.user.id,
        authStore.user.username,
        authStore.token,
      );
      wsService.onMessage((msg) => handleMessage(msg));
    }
  };

  const createPeerConnection = (remoteUserId: number): RTCPeerConnection => {
    console.log('Creating peer connection for user:', remoteUserId);

    // Проверяем, существует ли уже соединение
    if (peerConnections[remoteUserId]) {
      return peerConnections[remoteUserId];
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.stunprotocol.org:3478' },
      ],
    });

    const localStream = mediaStore.localStream;
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsService.send({
          type: 'candidate',
          to: remoteUserId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        remoteStreams[remoteUserId] = event.streams[0];
        mediaStore.setRemoteStream(remoteUserId, event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state for ${remoteUserId}:`, pc.connectionState);
    };

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
      throw new Error('Not authenticated');
    }

    try {
      console.log('Starting call...');
      usersStore.clearCallParticipants();

      // Получаем доступ к микрофону/камере
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });

      mediaStore.setLocalStream(stream);
      usersStore.setInCall(true);

      // Добавляем себя в участники
      usersStore.addCallParticipant({
        userId: authStore.user.id,
        username: authStore.user.username,
      });

      // Уведомляем сервер
      wsService.send({
        type: 'join_call',
        userId: authStore.user.id,
        username: authStore.user.username,
      });

      // Создаём соединения с участниками
      const otherParticipants = usersStore.onlineUsers || [];
      otherParticipants.forEach((participant) => {
        if (participant.userId !== authStore.user?.id) {
          createOffer(participant.userId);
        }
      });
    } catch (error) {
      console.error('Failed to start call:', error);
      usersStore.setInCall(false);
      throw new Error(
        'Failed to access camera/microphone: ' + (error as Error).message,
      );
    }
  };

  const createOffer = async (remoteUserId: number): Promise<void> => {
    try {
      const pc = createPeerConnection(remoteUserId);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      wsService.send({
        type: 'offer',
        to: remoteUserId,
        offer,
      });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  const handleMessage = async (msg: SignalMessage): Promise<void> => {
    if (!authStore.user) return;

    switch (msg.type) {
      case 'user_list':
        if ('users' in msg && Array.isArray(msg.users)) {
          const filteredUsers = msg.users.filter(
            (user) => user.userId !== authStore.user?.id,
          );
          usersStore.setOnlineUsers(filteredUsers);
        }
        break;

      case 'user_joined':
        if (
          'user' in msg &&
          msg.user &&
          msg.user.userId !== authStore.user?.id
        ) {
          usersStore.addOnlineUser(msg.user);
        }
        break;

      case 'user_left':
        if ('userId' in msg && typeof msg.userId === 'number') {
          usersStore.removeOnlineUser(msg.userId);
          if (usersStore.isInCall) {
            usersStore.removeCallParticipant(msg.userId);
            if (peerConnections[msg.userId]) {
              peerConnections[msg.userId].close();
              delete peerConnections[msg.userId];
              delete remoteStreams[msg.userId];
            }
          }
        }
        break;

      case 'channel_created':
      case 'channel_deleted':
        channelsStore.loadChannels();
        break;

      case 'new_message':
        if ('message' in msg && msg.message) {
          const isOwnMessage = msg.message.user_id === authStore.user?.id;
          const inCurrentChannel =
            msg.message.channel_id === channelsStore.activeChannelId;

          if (!isOwnMessage && inCurrentChannel) {
            messagesStore.addMessage(msg.message);
          }
        }
        break;

      case 'join_call':
        if ('userId' in msg && typeof msg.userId === 'number') {
          usersStore.addCallParticipant({
            userId: msg.userId,
            username: msg.username || `User ${msg.userId}`,
          });

          if (
            usersStore.isInCall &&
            mediaStore.localStream &&
            msg.userId !== authStore.user?.id
          ) {
            createOffer(msg.userId);
          }
        }
        break;

      case 'leave_call':
        if ('userId' in msg && typeof msg.userId === 'number') {
          usersStore.removeCallParticipant(msg.userId);
          if (peerConnections[msg.userId]) {
            peerConnections[msg.userId].close();
            delete peerConnections[msg.userId];
            delete remoteStreams[msg.userId];
          }
        }
        break;

      case 'offer':
        if (
          'from' in msg &&
          typeof msg.from === 'number' &&
          'offer' in msg &&
          msg.offer
        ) {
          await handleOffer(msg.from, msg.offer);
        }
        break;

      case 'answer':
        if (
          'from' in msg &&
          typeof msg.from === 'number' &&
          'answer' in msg &&
          msg.answer
        ) {
          await handleAnswer(msg.from, msg.answer);
        }
        break;

      case 'candidate':
        if (
          'from' in msg &&
          typeof msg.from === 'number' &&
          'candidate' in msg &&
          msg.candidate
        ) {
          await handleCandidate(msg.from, msg.candidate);
        }
        break;

      default:
        console.log('Unknown message type:', (msg as any).type);
    }
  };

  const handleOffer = async (
    fromUserId: number,
    offer: RTCSessionDescriptionInit,
  ): Promise<void> => {
    try {
      const pc = createPeerConnection(fromUserId);

      // Более аккуратная обработка состояния сигнализации
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
      } else if (pc.signalingState === 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
      } else {
        console.warn(
          `Unexpected signaling state for offer: ${pc.signalingState}`,
        );
        return;
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      wsService.send({
        type: 'answer',
        to: fromUserId,
        answer,
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  };

  const handleAnswer = async (
    fromUserId: number,
    answer: RTCSessionDescriptionInit,
  ): Promise<void> => {
    try {
      const pc = peerConnections[fromUserId];
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  };

  const handleCandidate = async (
    fromUserId: number,
    candidate: RTCIceCandidateInit,
  ): Promise<void> => {
    try {
      const pc = peerConnections[fromUserId];
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  };

  const send = (message: any): void => {
    wsService.send(message);
  };

  const disconnectCall = (): void => {
    console.log('Disconnecting call...');

    if (authStore.user) {
      wsService.send({
        type: 'leave_call',
        userId: authStore.user.id,
      });
    }

    try {
      Object.values(peerConnections).forEach((pc) => {
        try {
          pc.close();
        } catch (e) {
          console.error('Error closing peer connection:', e);
        }
      });

      Object.keys(peerConnections).forEach(
        (key) => delete peerConnections[+key],
      );
      Object.keys(remoteStreams).forEach((key) => delete remoteStreams[+key]);
    } catch (error) {
      console.error('Error during call disconnection:', error);
    }

    usersStore.clearCallParticipants();
    mediaStore.clearStreams();
    usersStore.setInCall(false);

    // WebSocket остаётся подключённым
  };

  return {
    connect,
    startCall,
    send,
    disconnectCall,
    createOffer,
  };
};
