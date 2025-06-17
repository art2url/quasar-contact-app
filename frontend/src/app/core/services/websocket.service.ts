import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject, interval, Subscription } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '@environments/environment';

import {
  AckPayload,
  IncomingSocketMessage,
  TypingPayload,
  ReadPayload,
  MessageEditedEvent,
  MessageDeletedEvent,
} from 'app/core/models/socket.model';

// Enhanced debugging
const DEBUG_WS = true;

function logWs(message: string, ...args: unknown[]) {
  if (DEBUG_WS) {
    console.log(`[WebSocket Debug] ${message}`, ...args);
  }
}

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
  private socket: Socket | null = null;
  public readonly isConnected$ = new BehaviorSubject<boolean>(false);

  // Enhanced connection state tracking
  private connectionState = {
    connected: false,
    connecting: false,
    reconnectAttempts: 0,
    lastDisconnectReason: null as string | null,
    lastConnectTime: 0,
    consecutiveFailures: 0,
  };

  // Connection management
  private reconnectionTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckInterval: Subscription | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;

  // Message handlers tracking
  private messageHandlers: ((msg: IncomingSocketMessage) => void)[] = [];

  // Enhanced presence streams
  public readonly userOnline$ = new Subject<string>();
  public readonly userOffline$ = new Subject<string>();
  public readonly onlineUsers$ = new BehaviorSubject<string[]>([]);
  private onlineUsersList = new Set<string>();

  // Event subjects
  private _typingSubject = new Subject<TypingPayload>();
  public typing$ = this._typingSubject.asObservable();

  private _messageSentSubject = new Subject<AckPayload>();
  public messageSent$ = this._messageSentSubject.asObservable();

  // Connection quality tracking
  private pingStartTime = 0;
  private lastPingTime = 0;
  private connectionQuality = 'good'; // 'good', 'poor', 'bad'

  constructor(private zone: NgZone) {
    // Start connection health monitoring
    this.startHealthCheck();
  }

  /**
   * Enhanced connection with better error handling and stability
   */
  connect(token: string): void {
    if (this.connectionState.connected || this.connectionState.connecting) {
      logWs('Already connected or connecting, skipping');
      return;
    }

    this.connectionState.connecting = true;
    this.connectionState.lastConnectTime = Date.now();

    logWs('Connecting with enhanced configuration...');

    // Clean up any existing socket
    this.cleanupSocket();
    this.resetState();

    // Create socket with enhanced configuration
    this.socket = io(environment.wsUrl, {
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: false, // Handle reconnection manually
      timeout: 10000,
      forceNew: true,
      // Enhanced transport options
      upgrade: true,
      rememberUpgrade: true,
    });

    this.setupEventHandlers();
    this.startConnectionTimeout();
  }

  /**
   * Enhanced event handler setup
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    logWs('Setting up enhanced event handlers');

    // Connection events
    this.socket.on('connect', () => {
      this.zone.run(() => {
        logWs('Connected successfully:', this.socket!.id);
        this.clearConnectionTimeout();
        this.onConnectionSuccess();
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.zone.run(() => {
        logWs('Disconnected, reason:', reason);
        this.onDisconnection(reason);
      });
    });

    this.socket.on('connect_error', (err) => {
      this.zone.run(() => {
        logWs('Connection error:', err.message);
        this.onConnectionError(err);
      });
    });

    // Enhanced reconnection handling
    this.socket.on('reconnect', (attemptNumber) => {
      this.zone.run(() => {
        logWs('Reconnected after', attemptNumber, 'attempts');
        this.onReconnectionSuccess();
      });
    });

    this.socket.on('reconnect_error', (err) => {
      this.zone.run(() => {
        logWs('Reconnection error:', err.message);
        this.connectionState.consecutiveFailures++;
      });
    });

    // Health check events
    this.socket.on('pong', () => {
      this.zone.run(() => {
        const latency = Date.now() - this.pingStartTime;
        this.lastPingTime = latency;
        this.updateConnectionQuality(latency);
        logWs('Ping response received, latency:', latency + 'ms');
      });
    });

    // Message events
    this.socket.on('receive-message', (message) => {
      this.zone.run(() => {
        logWs('Message received:', message.fromUserId);
        this.messageHandlers.forEach((handler) => handler(message));
      });
    });

    this.socket.on('message-sent', (ack) => {
      this.zone.run(() => {
        logWs('Message sent ack:', ack.messageId);
        this._messageSentSubject.next(ack);
      });
    });

    this.socket.on('typing', (data) => {
      this.zone.run(() => {
        logWs('Typing indicator received:', data);
        this._typingSubject.next(data);
      });
    });

    // Enhanced presence events with better logging
    this.socket.on('online-users', (data) => {
      this.zone.run(() => {
        logWs('Online users received:', data);
        const userList = Array.isArray(data) ? data : data?.userIds || [];
        this.updateOnlineUsers(userList);
      });
    });

    this.socket.on('user-online', (data) => {
      this.zone.run(() => {
        logWs('User came online:', data.userId, data.username || '');
        if (!this.onlineUsersList.has(data.userId)) {
          this.onlineUsersList.add(data.userId);
          this.onlineUsers$.next([...this.onlineUsersList]);
          this.userOnline$.next(data.userId);
          logWs('Updated online users after user came online:', [
            ...this.onlineUsersList,
          ]);
        }
      });
    });

    this.socket.on('user-offline', (data) => {
      this.zone.run(() => {
        logWs('User went offline:', data.userId);
        if (this.onlineUsersList.has(data.userId)) {
          this.onlineUsersList.delete(data.userId);
          this.onlineUsers$.next([...this.onlineUsersList]);
          this.userOffline$.next(data.userId);
          logWs('Updated online users after user went offline:', [
            ...this.onlineUsersList,
          ]);
        }
      });
    });

    // Error handling events
    this.socket.on('message-error', (error) => {
      this.zone.run(() => {
        console.error('[WebSocket] Message error:', error);
        // Could emit to an error subject for UI handling
      });
    });
  }

  /**
   * Handle successful connection
   */
  private onConnectionSuccess(): void {
    this.connectionState.connected = true;
    this.connectionState.connecting = false;
    this.connectionState.reconnectAttempts = 0;
    this.connectionState.consecutiveFailures = 0;
    this.isConnected$.next(true);

    // Start health monitoring
    this.startHealthCheck();
  }

  /**
   * Handle disconnection
   */
  private onDisconnection(reason: string): void {
    this.connectionState.connected = false;
    this.connectionState.connecting = false;
    this.connectionState.lastDisconnectReason = reason;
    this.isConnected$.next(false);

    // Clear online users on disconnect
    this.onlineUsersList.clear();
    this.onlineUsers$.next([]);

    this.stopHealthCheck();

    // Auto-reconnect unless it was a manual disconnect
    if (reason !== 'io client disconnect' && reason !== 'manual_disconnect') {
      this.scheduleReconnection();
    }
  }

  /**
   * Handle connection errors
   */
  private onConnectionError(error: Error): void {
    this.connectionState.connected = false;
    this.connectionState.connecting = false;
    this.connectionState.consecutiveFailures++;
    this.isConnected$.next(false);

    logWs(
      'Connection failed, consecutive failures:',
      this.connectionState.consecutiveFailures,
      'Error:',
      error.message
    );

    // Exponential backoff for reconnection
    this.scheduleReconnection();
  }

  /**
   * Handle successful reconnection
   */
  private onReconnectionSuccess(): void {
    this.connectionState.reconnectAttempts = 0;
    this.connectionState.consecutiveFailures = 0;
    logWs('Successfully reconnected');
  }

  /**
   * Enhanced reconnection with exponential backoff
   */
  private scheduleReconnection(): void {
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
    }

    const token = localStorage.getItem('token');
    if (!token) {
      logWs('No token available for reconnection');
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const baseDelay = 1000;
    const maxDelay = 30000;
    const backoffDelay = Math.min(
      baseDelay * Math.pow(2, this.connectionState.consecutiveFailures),
      maxDelay
    );

    logWs(
      `Scheduling reconnection in ${backoffDelay}ms (attempt ${
        this.connectionState.consecutiveFailures + 1
      })`
    );

    this.reconnectionTimer = setTimeout(() => {
      this.reconnectionTimer = null;
      this.connectionState.reconnectAttempts++;

      // Give up after too many attempts
      if (this.connectionState.reconnectAttempts > 10) {
        logWs('Max reconnection attempts reached, giving up');
        return;
      }

      logWs(
        `Attempting reconnection (attempt ${this.connectionState.reconnectAttempts})`
      );
      this.connect(token);
    }, backoffDelay);
  }

  /**
   * Connection timeout handling
   */
  private startConnectionTimeout(): void {
    this.connectionTimeout = setTimeout(() => {
      if (!this.connectionState.connected) {
        logWs('Connection timeout, forcing cleanup');
        this.onConnectionError(new Error('Connection timeout'));
      }
    }, 15000); // 15 second timeout
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  /**
   * Enhanced health monitoring
   */
  private startHealthCheck(): void {
    this.stopHealthCheck(); // Clear any existing interval

    this.healthCheckInterval = interval(30000).subscribe(() => {
      if (this.socket?.connected) {
        this.pingStartTime = Date.now();
        this.socket.emit('ping');
      }
    });
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      this.healthCheckInterval.unsubscribe();
      this.healthCheckInterval = null;
    }
  }

  /**
   * Update connection quality based on latency
   */
  private updateConnectionQuality(latency: number): void {
    if (latency < 100) {
      this.connectionQuality = 'good';
    } else if (latency < 500) {
      this.connectionQuality = 'poor';
    } else {
      this.connectionQuality = 'bad';
    }
  }

  /**
   * Enhanced user presence management with immediate update
   */
  private updateOnlineUsers(userList: string[]): void {
    logWs(
      'Updating online users list from:',
      [...this.onlineUsersList],
      'to:',
      userList
    );

    // Clear and rebuild the set
    this.onlineUsersList.clear();
    userList.forEach((userId) => this.onlineUsersList.add(userId));

    // Immediately update the observable
    this.onlineUsers$.next([...this.onlineUsersList]);

    logWs('Updated online users list:', [...this.onlineUsersList]);
  }

  /**
   * Reset connection state
   */
  private resetState(): void {
    this.onlineUsersList.clear();
    this.onlineUsers$.next([]);
  }

  /**
   * Enhanced cleanup
   */
  private cleanupSocket(): void {
    this.stopHealthCheck();
    this.clearConnectionTimeout();

    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }

    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch (err) {
        logWs('Error during socket cleanup:', err);
      }
      this.socket = null;
    }
  }

  /**
   * Enhanced disconnect method
   */
  disconnect(): void {
    logWs('Manual disconnect requested');

    this.connectionState.lastDisconnectReason = 'manual_disconnect';

    if (this.socket) {
      this.socket.disconnect();
    }

    this.cleanupSocket();
    this.resetState();
    this.isConnected$.next(false);

    // Complete and recreate subjects
    this._typingSubject.complete();
    this._messageSentSubject.complete();

    this._typingSubject = new Subject<TypingPayload>();
    this._messageSentSubject = new Subject<AckPayload>();
  }

  /**
   * Enhanced message sending with retry logic
   */
  sendMessage(toUserId: string, ciphertext: string, avatarUrl?: string): void {
    if (!this.socket?.connected) {
      logWs('Cannot send message - socket not connected');
      return;
    }

    this.socket.emit('send-message', { toUserId, ciphertext, avatarUrl });
  }

  /**
   * Enhanced typing indicator with connection check
   */
  sendTyping(toUserId: string): void {
    if (!toUserId) {
      logWs('Cannot send typing - missing userId');
      return;
    }

    if (!this.socket?.connected) {
      logWs('Cannot send typing - socket not connected');
      return;
    }

    this.socket.emit('typing', { toUserId });
  }

  /**
   * Enhanced message handlers
   */
  onReceiveMessage(cb: (msg: IncomingSocketMessage) => void): void {
    if (this.messageHandlers.includes(cb)) {
      logWs('Handler already registered, skipping');
      return;
    }

    logWs('Registering message handler');
    this.messageHandlers.push(cb);
  }

  offReceiveMessage(cb: (msg: IncomingSocketMessage) => void): void {
    const index = this.messageHandlers.indexOf(cb);
    if (index !== -1) {
      this.messageHandlers.splice(index, 1);
      logWs('Message handler removed');
    }
  }

  // Edit/delete message methods
  sendEditMessage(id: string, ciphertext: string, avatarUrl?: string): void {
    this.socket?.emit('edit-message', { messageId: id, ciphertext, avatarUrl });
  }

  sendDeleteMessage(id: string): void {
    this.socket?.emit('delete-message', { messageId: id });
  }

  // Event handlers for edit/delete
  onMessageEdited(cb: (p: MessageEditedEvent) => void): void {
    this.socket?.on('message-edited', (d) => this.zone.run(() => cb(d)));
  }

  offMessageEdited(cb: (p: MessageEditedEvent) => void): void {
    this.socket?.off('message-edited', cb);
  }

  onMessageDeleted(cb: (d: MessageDeletedEvent) => void): void {
    this.socket?.on('message-deleted', (d) => this.zone.run(() => cb(d)));
  }

  offMessageDeleted(cb: (d: MessageDeletedEvent) => void): void {
    this.socket?.off('message-deleted', cb);
  }

  onMessageSent(cb: (ack: AckPayload) => void): void {
    this.socket?.on('message-sent', (d) => this.zone.run(() => cb(d)));
  }

  offMessageSent(cb: (ack: AckPayload) => void): void {
    this.socket?.off('message-sent', cb);
  }

  // Read receipts
  markMessageRead(messageId: string): void {
    this.socket?.emit('read-message', { messageId });
  }

  onMessageRead(cb: (data: ReadPayload) => void): void {
    this.socket?.on('message-read', (d) => this.zone.run(() => cb(d)));
  }

  offMessageRead(cb: (payload: ReadPayload) => void): void {
    this.socket?.off('message-read', cb);
  }

  // Utility methods
  isConnected(): boolean {
    return this.connectionState.connected;
  }

  getCurrentOnlineUsers(): string[] {
    return [...this.onlineUsersList];
  }

  isUserOnline(userId: string): boolean {
    return this.onlineUsersList.has(userId);
  }

  getConnectionQuality(): string {
    return this.connectionQuality;
  }

  getLastPingTime(): number {
    return this.lastPingTime;
  }

  /**
   * Debug method to check online status
   */
  debugOnlineStatus(): void {
    logWs('=== Online Status Debug ===');
    logWs('Connected:', this.connectionState.connected);
    logWs('Online users:', [...this.onlineUsersList]);
    logWs('Connection quality:', this.connectionQuality);
    logWs('Last ping:', this.lastPingTime + 'ms');
  }

  /**
   * Force refresh online users list
   */
  refreshOnlineUsers(): void {
    if (this.socket?.connected) {
      logWs('Requesting fresh online users list');
      // The server will automatically send online-users on connection
      // but we can emit a custom event if needed
    }
  }

  /**
   * Setup automatic reconnection (for backwards compatibility)
   * @deprecated - Reconnection is now handled automatically
   */
  setupReconnection(): void {
    console.log(
      '[WebSocket] setupReconnection called - now handled automatically'
    );
    // This method is kept for backwards compatibility but does nothing
    // since reconnection is now handled automatically in the enhanced service
  }

  /**
   * Manual reconnect (for backwards compatibility)
   */
  reconnect(): void {
    const token = localStorage.getItem('token');
    if (!token) return;

    logWs('Manual reconnect requested');
    this.forceReconnect();
  }

  /**
   * Force reconnection (for manual retry)
   */
  forceReconnect(): void {
    const token = localStorage.getItem('token');
    if (!token) return;

    logWs('Force reconnection requested');
    this.disconnect();

    setTimeout(() => {
      this.connect(token);
    }, 1000);
  }
}
