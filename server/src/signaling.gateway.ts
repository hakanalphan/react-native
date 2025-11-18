import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*'
  }
})
export class SignalingGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket
  ) {
    const { roomId } = data;
    client.join(roomId);
    client.to(roomId).emit('user-joined', { socketId: client.id });
  }

  @SubscribeMessage('offer')
  handleOffer(
    @MessageBody()
    data: { roomId: string; sdp: any; from: string },
    @ConnectedSocket() client: Socket
  ) {
    const { roomId, sdp, from } = data;
    client.to(roomId).emit('offer-received', { sdp, from });
  }

  @SubscribeMessage('answer')
  handleAnswer(
    @MessageBody()
    data: { roomId: string; sdp: any; from: string },
    @ConnectedSocket() client: Socket
  ) {
    const { roomId, sdp, from } = data;
    client.to(roomId).emit('answer-received', { sdp, from });
  }

  @SubscribeMessage('ice-candidate')
  handleIceCandidate(
    @MessageBody()
    data: { roomId: string; candidate: any; from: string },
    @ConnectedSocket() client: Socket
  ) {
    const { roomId, candidate, from } = data;
    client.to(roomId).emit('ice-candidate-received', { candidate, from });
  }
}


