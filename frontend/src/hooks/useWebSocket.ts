import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { wsService } from '../services/websocket';

export function useWebSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const ws = wsService.connect();
    setSocket(ws);

    ws.on('connect', () => setIsConnected(true));
    ws.on('disconnect', () => setIsConnected(false));

    return () => {
      wsService.disconnect();
    };
  }, []);

  return { socket, isConnected };
}
