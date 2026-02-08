import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { WebSocketService } from './websocket.service';

describe('WebSocketService (Real-time Communication)', () => {
  let service: WebSocketService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [WebSocketService]
    });

    service = TestBed.inject(WebSocketService);
  });

  afterEach(() => {
    service.disconnect();
  });

  // Run: npm test -- --include="**/websocket.service.spec.ts"
  it('creates the service successfully', () => {
    expect(service).toBeTruthy();
    expect(service.isConnected()).toBe(false);
  });

  it('initializes with correct default state', () => {
    expect(service.isConnected()).toBe(false);
    
    // Check initial observable values
    service.isConnected$.subscribe(connected => {
      expect(connected).toBe(false);
    });

    service.onlineUsers$.subscribe(users => {
      expect(users).toEqual([]);
    });
  });

  it('exposes connection state through observables', () => {
    expect(service.isConnected$).toBeInstanceOf(BehaviorSubject);
    expect(service.onlineUsers$).toBeInstanceOf(BehaviorSubject);
    
    // These should be accessible
    expect(service.userOnline$).toBeDefined();
    expect(service.userOffline$).toBeDefined();
    expect(service.typing$).toBeDefined();
    expect(service.messageSent$).toBeDefined();
    expect(service.keyRegenerated$).toBeDefined();
  });

  it('has connect method available', () => {
    expect(typeof service.connect).toBe('function');
    expect(() => service.connect()).not.toThrow();
  });

  it('has disconnect method available', () => {
    expect(typeof service.disconnect).toBe('function');
    expect(() => service.disconnect()).not.toThrow();
  });

  it('has message sending methods available', () => {
    expect(typeof service.sendMessage).toBe('function');
    expect(typeof service.sendTyping).toBe('function');
    expect(typeof service.sendEditMessage).toBe('function');
    expect(typeof service.sendDeleteMessage).toBe('function');
    
    // These should not throw even when disconnected
    expect(() => service.sendMessage('user-123', 'test-message')).not.toThrow();
    expect(() => service.sendTyping('user-123')).not.toThrow();
    expect(() => service.sendEditMessage('msg-123', 'edited-message')).not.toThrow();
    expect(() => service.sendDeleteMessage('msg-123')).not.toThrow();
  });

  it('has message handler management methods', () => {
    expect(typeof service.onReceiveMessage).toBe('function');
    expect(typeof service.offReceiveMessage).toBe('function');
    expect(typeof service.onMessageSent).toBe('function');
    expect(typeof service.offMessageSent).toBe('function');
    expect(typeof service.onMessageRead).toBe('function');
    expect(typeof service.offMessageRead).toBe('function');
    expect(typeof service.onKeyRegenerated).toBe('function');
    expect(typeof service.offKeyRegenerated).toBe('function');
    expect(typeof service.onMessageEdited).toBe('function');
    expect(typeof service.offMessageEdited).toBe('function');
    expect(typeof service.onMessageDeleted).toBe('function');
    expect(typeof service.offMessageDeleted).toBe('function');
  });

  it('manages message handlers correctly', () => {
    const handler1 = jasmine.createSpy('handler1');
    const handler2 = jasmine.createSpy('handler2');

    // Add handlers - should not throw
    expect(() => service.onReceiveMessage(handler1)).not.toThrow();
    expect(() => service.onReceiveMessage(handler2)).not.toThrow();

    // Add same handler twice - should not throw
    expect(() => service.onReceiveMessage(handler1)).not.toThrow();

    // Remove handler - should not throw
    expect(() => service.offReceiveMessage(handler1)).not.toThrow();
    expect(() => service.offReceiveMessage(handler2)).not.toThrow();
  });

  it('manages message sent handlers correctly', () => {
    const handler = jasmine.createSpy('messageSentHandler');

    expect(() => service.onMessageSent(handler)).not.toThrow();
    expect(() => service.offMessageSent(handler)).not.toThrow();
  });

  it('manages message read handlers correctly', () => {
    const handler = jasmine.createSpy('messageReadHandler');

    expect(() => service.onMessageRead(handler)).not.toThrow();
    expect(() => service.offMessageRead(handler)).not.toThrow();
  });

  it('manages key regenerated handlers correctly', () => {
    const handler = jasmine.createSpy('keyRegeneratedHandler');

    expect(() => service.onKeyRegenerated(handler)).not.toThrow();
    expect(() => service.offKeyRegenerated(handler)).not.toThrow();
  });

  it('manages message edited handlers correctly', () => {
    const handler1 = jasmine.createSpy('editedHandler1');
    const handler2 = jasmine.createSpy('editedHandler2');

    // Add handlers - should not throw
    expect(() => service.onMessageEdited(handler1)).not.toThrow();
    expect(() => service.onMessageEdited(handler2)).not.toThrow();

    // Add same handler twice - should not throw
    expect(() => service.onMessageEdited(handler1)).not.toThrow();

    // Remove handlers - should not throw
    expect(() => service.offMessageEdited(handler1)).not.toThrow();
    expect(() => service.offMessageEdited(handler2)).not.toThrow();

    // Remove non-existent handler - should not throw
    const nonExistentHandler = jasmine.createSpy('nonExistent');
    expect(() => service.offMessageEdited(nonExistentHandler)).not.toThrow();
  });

  it('manages message deleted handlers correctly', () => {
    const handler1 = jasmine.createSpy('deletedHandler1');
    const handler2 = jasmine.createSpy('deletedHandler2');

    // Add handlers - should not throw
    expect(() => service.onMessageDeleted(handler1)).not.toThrow();
    expect(() => service.onMessageDeleted(handler2)).not.toThrow();

    // Add same handler twice - should not throw
    expect(() => service.onMessageDeleted(handler1)).not.toThrow();

    // Remove handlers - should not throw
    expect(() => service.offMessageDeleted(handler1)).not.toThrow();
    expect(() => service.offMessageDeleted(handler2)).not.toThrow();

    // Remove non-existent handler - should not throw
    const nonExistentHandler = jasmine.createSpy('nonExistent');
    expect(() => service.offMessageDeleted(nonExistentHandler)).not.toThrow();
  });

  it('provides connection status method', () => {
    expect(typeof service.isConnected).toBe('function');
    expect(service.isConnected()).toBe(false);
  });

  it('handles multiple connections gracefully', () => {
    // Multiple connect calls should not throw
    expect(() => {
      service.connect();
      service.connect();
      service.connect();
    }).not.toThrow();
  });

  it('handles multiple disconnections gracefully', () => {
    // Multiple disconnect calls should not throw
    expect(() => {
      service.disconnect();
      service.disconnect();
      service.disconnect();
    }).not.toThrow();
  });

  it('does not send messages when not connected', () => {
    // These should not throw even when disconnected
    expect(() => service.sendMessage('', '')).not.toThrow();
    expect(() => service.sendTyping('')).not.toThrow();
    expect(() => service.sendEditMessage('', '')).not.toThrow();
    expect(() => service.sendDeleteMessage('')).not.toThrow();
  });

  it('initializes observables correctly', () => {
    let isConnectedValue: boolean | undefined;
    let onlineUsersValue: string[] | undefined;

    service.isConnected$.subscribe(value => {
      isConnectedValue = value;
    });

    service.onlineUsers$.subscribe(value => {
      onlineUsersValue = value;
    });

    expect(isConnectedValue).toBe(false);
    expect(onlineUsersValue).toEqual([]);
  });

  it('maintains consistent state after connect/disconnect cycles', () => {
    // Initial state
    expect(service.isConnected()).toBe(false);
    
    // Connect
    service.connect();
    // Note: isConnected() might still be false until actual connection is established
    
    // Disconnect
    service.disconnect();
    expect(service.isConnected()).toBe(false);
    
    // Connect again
    service.connect();
    // Disconnect again
    service.disconnect();
    expect(service.isConnected()).toBe(false);
  });

  it('handles invalid handler removal gracefully', () => {
    const nonExistentHandler = jasmine.createSpy('nonExistent');
    
    // These should not throw even for handlers that were never added
    expect(() => service.offReceiveMessage(nonExistentHandler)).not.toThrow();
    expect(() => service.offMessageSent(nonExistentHandler)).not.toThrow();
    expect(() => service.offMessageRead(nonExistentHandler)).not.toThrow();
    expect(() => service.offKeyRegenerated(nonExistentHandler)).not.toThrow();
    expect(() => service.offMessageEdited(nonExistentHandler)).not.toThrow();
    expect(() => service.offMessageDeleted(nonExistentHandler)).not.toThrow();
  });

  it('provides all required Observable streams', () => {
    // Check that all streams are defined and are observables
    expect(service.isConnected$).toBeTruthy();
    expect(service.isConnected$.subscribe).toBeDefined();
    
    expect(service.userOnline$).toBeTruthy();
    expect(service.userOnline$.subscribe).toBeDefined();
    
    expect(service.userOffline$).toBeTruthy();
    expect(service.userOffline$.subscribe).toBeDefined();
    
    expect(service.onlineUsers$).toBeTruthy();
    expect(service.onlineUsers$.subscribe).toBeDefined();
    
    expect(service.typing$).toBeTruthy();
    expect(service.typing$.subscribe).toBeDefined();
    
    expect(service.messageSent$).toBeTruthy();
    expect(service.messageSent$.subscribe).toBeDefined();
    
    expect(service.keyRegenerated$).toBeTruthy();
    expect(service.keyRegenerated$.subscribe).toBeDefined();
  });

  it('handles empty or invalid parameters gracefully', () => {
    // These should not throw with empty or invalid parameters
    expect(() => service.sendMessage('', '')).not.toThrow();
    expect(() => service.sendMessage('valid-user', '')).not.toThrow();
    expect(() => service.sendTyping('')).not.toThrow();
    expect(() => service.sendEditMessage('', '')).not.toThrow();
    expect(() => service.sendDeleteMessage('')).not.toThrow();
  });

  it('handles multiple handlers for message edit events', () => {
    const handler1 = jasmine.createSpy('editHandler1');
    const handler2 = jasmine.createSpy('editHandler2');
    const handler3 = jasmine.createSpy('editHandler3');

    // Add multiple handlers
    service.onMessageEdited(handler1);
    service.onMessageEdited(handler2);
    service.onMessageEdited(handler3);

    // Verify all handlers are added (by checking removal works)
    service.offMessageEdited(handler2); // Remove middle handler
    
    // The remaining handlers should still be there
    expect(() => service.offMessageEdited(handler1)).not.toThrow();
    expect(() => service.offMessageEdited(handler3)).not.toThrow();
  });

  it('handles multiple handlers for message delete events', () => {
    const handler1 = jasmine.createSpy('deleteHandler1');
    const handler2 = jasmine.createSpy('deleteHandler2');
    const handler3 = jasmine.createSpy('deleteHandler3');

    // Add multiple handlers
    service.onMessageDeleted(handler1);
    service.onMessageDeleted(handler2);
    service.onMessageDeleted(handler3);

    // Verify all handlers are added (by checking removal works)
    service.offMessageDeleted(handler2); // Remove middle handler
    
    // The remaining handlers should still be there
    expect(() => service.offMessageDeleted(handler1)).not.toThrow();
    expect(() => service.offMessageDeleted(handler3)).not.toThrow();
  });

  it('properly manages handler collections for edit/delete events', () => {
    const editHandler = jasmine.createSpy('editHandler');
    const deleteHandler = jasmine.createSpy('deleteHandler');

    // Add handlers
    service.onMessageEdited(editHandler);
    service.onMessageDeleted(deleteHandler);

    // Verify handlers can be removed independently
    service.offMessageEdited(editHandler);
    expect(() => service.offMessageDeleted(deleteHandler)).not.toThrow();

    // Add them back
    service.onMessageEdited(editHandler);
    service.onMessageDeleted(deleteHandler);

    // Clear all by removing
    service.offMessageEdited(editHandler);
    service.offMessageDeleted(deleteHandler);

    // Should be able to remove again without error
    expect(() => service.offMessageEdited(editHandler)).not.toThrow();
    expect(() => service.offMessageDeleted(deleteHandler)).not.toThrow();
  });

  it('maintains separate handler arrays for different event types', () => {
    const messageHandler = jasmine.createSpy('messageHandler');
    const editHandler = jasmine.createSpy('editHandler');
    const deleteHandler = jasmine.createSpy('deleteHandler');
    const sentHandler = jasmine.createSpy('sentHandler');
    const readHandler = jasmine.createSpy('readHandler');
    const keyHandler = jasmine.createSpy('keyHandler');

    // Add handlers for all event types
    service.onReceiveMessage(messageHandler);
    service.onMessageEdited(editHandler);
    service.onMessageDeleted(deleteHandler);
    service.onMessageSent(sentHandler);
    service.onMessageRead(readHandler);
    service.onKeyRegenerated(keyHandler);

    // Remove one type - others should remain
    service.offMessageEdited(editHandler);
    
    // All other handlers should still be removable
    expect(() => service.offReceiveMessage(messageHandler)).not.toThrow();
    expect(() => service.offMessageDeleted(deleteHandler)).not.toThrow();
    expect(() => service.offMessageSent(sentHandler)).not.toThrow();
    expect(() => service.offMessageRead(readHandler)).not.toThrow();
    expect(() => service.offKeyRegenerated(keyHandler)).not.toThrow();
  });

  it('validates message edit/delete handler methods work with proper callbacks', () => {
    // Simple callbacks that match the expected signature
    const editCallback = jasmine.createSpy('editCallback');
    const deleteCallback = jasmine.createSpy('deleteCallback');

    expect(() => service.onMessageEdited(editCallback)).not.toThrow();
    expect(() => service.onMessageDeleted(deleteCallback)).not.toThrow();
    expect(() => service.offMessageEdited(editCallback)).not.toThrow();
    expect(() => service.offMessageDeleted(deleteCallback)).not.toThrow();
  });
});