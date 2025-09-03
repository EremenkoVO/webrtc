const ws = new WebSocket('wss://192.168.1.129:8080');

let myId: string = '';
let targetId: string = '';
let pc: RTCPeerConnection;
let localStream: MediaStream;
let remoteStream: MediaStream;

const localVideo = document.getElementById('localVideo') as HTMLVideoElement;
const remoteVideo = document.getElementById('remoteVideo') as HTMLVideoElement;
const myIdSpan = document.getElementById('myId') as HTMLSpanElement;
const callBtn = document.getElementById('callBtn') as HTMLButtonElement;
const targetInput = document.getElementById('targetId') as HTMLInputElement;

ws.onmessage = async (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'welcome') {
    myId = msg.id;
    myIdSpan.textContent = myId;
    console.log('My ID:', myId);
    await initConnection();
  }

  if (!pc) return;

  if (msg.type === 'offer' && msg.from) {
    targetId = msg.from;
    await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'answer', to: targetId, data: answer }));
  } else if (msg.type === 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription(msg.data));
  } else if (msg.type === 'candidate') {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(msg.data));
    } catch (err) {
      console.error('Error adding candidate:', err);
    }
  }
};

async function initConnection() {
  pc = new RTCPeerConnection();

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  remoteStream = new MediaStream();
  pc.ontrack = (event) => {
    event.streams[0]
      .getTracks()
      .forEach((track) => remoteStream.addTrack(track));
    remoteVideo.srcObject = remoteStream;
  };

  pc.onicecandidate = (event) => {
    if (event.candidate && targetId) {
      ws.send(
        JSON.stringify({
          type: 'candidate',
          to: targetId,
          data: event.candidate,
        }),
      );
    }
  };

  localVideo.srcObject = localStream;
}

callBtn.onclick = async () => {
  targetId = targetInput.value.trim();
  if (!targetId) {
    alert('Введите ID собеседника!');
    return;
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'offer', to: targetId, data: offer }));
};
