import { Server, Socket } from 'socket.io';
export declare class SignalingGateway {
    server: Server;
    handleJoinRoom(data: {
        roomId: string;
    }, client: Socket): void;
    handleOffer(data: {
        roomId: string;
        sdp: any;
        from: string;
    }, client: Socket): void;
    handleAnswer(data: {
        roomId: string;
        sdp: any;
        from: string;
    }, client: Socket): void;
    handleIceCandidate(data: {
        roomId: string;
        candidate: any;
        from: string;
    }, client: Socket): void;
}
