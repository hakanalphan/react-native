import React, { useEffect, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  PermissionsAndroid,
  Platform,
  Alert
} from 'react-native';
import io, { Socket } from 'socket.io-client';
import {
  RTCPeerConnection,
  RTCView,
  mediaDevices,
  MediaStream,
  RTCIceCandidateType,
  RTCSessionDescriptionType
} from 'react-native-webrtc';

const SIGNALING_SERVER_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

const ICE_SERVERS = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function App(): JSX.Element {
  const [roomId, setRoomId] = useState<string>('');
  const [joined, setJoined] = useState<boolean>(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<string>('Not connected');

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA as string,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO as string
        ]);

        const cameraGranted =
          granted[PermissionsAndroid.PERMISSIONS.CAMERA as string] ===
          PermissionsAndroid.RESULTS.GRANTED;
        const audioGranted =
          granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO as string] ===
          PermissionsAndroid.RESULTS.GRANTED;

        if (!cameraGranted || !audioGranted) {
          Alert.alert('İzin gerekli', 'Kamera ve mikrofon izinleri verilmelidir.');
          return false;
        }
        return true;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const initLocalStream = async (): Promise<MediaStream | null> => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return null;

    try {
      const stream = (await mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      })) as MediaStream;

      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Error getting user media:', error);
      Alert.alert('Hata', 'Kamera erişiminde sorun oluştu.');
      return null;
    }
  };

  const initPeerConnection = async (): Promise<RTCPeerConnection | null> => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event: { candidate: RTCIceCandidateType | null }) => {
      if (event.candidate && socketRef.current && roomId) {
        socketRef.current.emit('ice-candidate', {
          roomId,
          candidate: event.candidate,
          from: socketRef.current.id
        });
      }
    };

    pc.ontrack = (event: { streams: MediaStream[] }) => {
      const [stream] = event.streams;
      if (stream) {
        setRemoteStream(stream);
      }
    };

    const stream = localStream || (await initLocalStream());
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    pcRef.current = pc;
    return pc;
  };

  const setupSocket = (): void => {
    const socket = io(SIGNALING_SERVER_URL, { transports: ['websocket'] });

    socket.on('connect', () => {
      setStatus(`Connected as ${socket.id}`);
    });

    socket.on('disconnect', () => {
      setStatus('Disconnected');
      cleanupPeer();
    });

    socket.on('connect_error', (error: Error) => {
      console.warn('Socket connect_error', error.message);
      setStatus(`Connection error: ${error.message}`);
    });

    socket.on('connect_timeout', () => {
      console.warn('Socket connect_timeout');
      setStatus('Connection timeout');
    });

    socket.on('user-joined', async () => {
      await startCall();
    });

    socket.on(
      'offer-received',
      async ({ sdp }: { sdp: RTCSessionDescriptionType }) => {
        if (!pcRef.current) {
          await initPeerConnection();
        }
        const pc = pcRef.current;
        if (!pc) return;

        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', {
          roomId,
          sdp: answer,
          from: socket.id
        });
      }
    );

    socket.on(
      'answer-received',
      async ({ sdp }: { sdp: RTCSessionDescriptionType }) => {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(sdp);
      }
    );

    socket.on(
      'ice-candidate-received',
      async ({ candidate }: { candidate: RTCIceCandidateType }) => {
        const pc = pcRef.current;
        if (!pc) return;
        try {
          await pc.addIceCandidate(candidate);
        } catch (error) {
          console.warn('Error adding ICE candidate', error);
        }
      }
    );

    socketRef.current = socket;
  };

  const joinRoom = async (): Promise<void> => {
    if (!roomId.trim()) {
      Alert.alert('Hata', 'Lütfen bir roomId girin.');
      return;
    }

    if (!socketRef.current) {
      setupSocket();
    }

    const waitSocket = (): Promise<void> =>
      new Promise((resolve) => {
        const check = () => {
          if (socketRef.current && socketRef.current.connected) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });

    await waitSocket();
    await initPeerConnection();

    socketRef.current?.emit('join-room', { roomId: roomId.trim() });
    setJoined(true);
    setStatus(`Joined room: ${roomId.trim()}`);
  };

  const startCall = async (): Promise<void> => {
    const pc = pcRef.current || (await initPeerConnection());
    if (!pc || !socketRef.current) return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current.emit('offer', {
      roomId,
      sdp: offer,
      from: socketRef.current.id
    });
  };

  const cleanupPeer = (): void => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((t) => t.stop());
      setRemoteStream(null);
    }
  };

  const cleanup = (): void => {
    cleanupPeer();
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setJoined(false);
    setStatus('Not connected');
  };

  const leaveRoom = (): void => {
    cleanup();
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Video Görüşme</Text>
      <Text style={styles.status}>{status}</Text>

      {!joined && (
        <View style={styles.form}>
          <Text style={styles.label}>Room ID</Text>
          <TextInput
            style={styles.input}
            placeholder="ör: test-room"
            value={roomId}
            onChangeText={setRoomId}
          />
          <Button title="Odaya Katıl / Oluştur" onPress={joinRoom} />
        </View>
      )}

      {joined && (
        <View style={styles.buttonsRow}>
          <Button title="Odadan Ayrıl" onPress={leaveRoom} />
        </View>
      )}

      <View style={styles.videoContainer}>
        <View style={styles.videoBox}>
          <Text style={styles.videoLabel}>Ben</Text>
          {localStream ? (
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.video}
              objectFit="cover"
              mirror={true}
              zOrder={0}
            />
          ) : (
            <View style={styles.placeholder}>
              <Text>Kamera yok</Text>
            </View>
          )}
        </View>

        <View style={styles.videoBox}>
          <Text style={styles.videoLabel}>Karşı Taraf</Text>
          {remoteStream ? (
            <RTCView
              streamURL={remoteStream.toURL()}
              style={styles.video}
              objectFit="cover"
              mirror={false}
              zOrder={0}
            />
          ) : (
            <View style={styles.placeholder}>
              <Text>Bağlantı bekleniyor...</Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e5e7eb',
    textAlign: 'center',
    marginBottom: 8
  },
  status: { textAlign: 'center', color: '#9ca3af', marginBottom: 16 },
  form: { marginBottom: 16 },
  label: { color: '#e5e7eb', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#4b5563',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#e5e7eb',
    marginBottom: 8
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  videoContainer: { flex: 1, flexDirection: 'row' },
  videoBox: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 8,
    marginHorizontal: 4
  },
  videoLabel: { color: '#d1d5db', marginBottom: 4 },
  video: { 
    flex: 1, 
    backgroundColor: '#000', 
    borderRadius: 8,
    minHeight: 200,
    overflow: 'hidden'
  },
  placeholder: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center'
  }
});

export default App;