import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { environment } from '@environments/environment';

import { UserService } from './user.service';
import { UserSummary } from '@models/user.model';
import { KeyBundleResponse, DmRoomResponse, StandardResponse } from '@models/api-response.model';
import { getApiPath } from '@utils/api-paths.util';

describe('UserService (User Management and Key Operations)', () => {
  let service: UserService;
  let httpMock: HttpTestingController;

  const mockUsers: UserSummary[] = [
    {
      _id: 'user-123',
      username: 'alice',
      avatarUrl: 'avatar1.jpg'
    },
    {
      _id: 'user-456',
      username: 'bob',
      avatarUrl: 'avatar2.jpg'
    }
  ];

  const mockKeyBundle: KeyBundleResponse = {
    publicKeyBundle: 'mock-public-key-data',
    username: 'test-user',
    avatarUrl: 'test-avatar.jpg',
    hasPublicKey: true,
    isKeyMissing: false
  };

  const mockDmRoom: DmRoomResponse = {
    roomId: 'dm-room-123'
  };

  const mockStandardResponse: StandardResponse = {
    message: 'Operation completed successfully'
  };

  beforeEach(async () => {
    // Setup authenticated user state
    spyOn(Storage.prototype, 'getItem').and.callFake((key: string) => {
      if (key === 'username') return 'current-user';
      if (key === 'userId') return 'current-user-id';
      return null;
    });

    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        UserService
      ]
    });

    service = TestBed.inject(UserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Run: npm test -- --include="**/user.service.spec.ts"
  describe('Service Initialization', () => {
    it('initializes correctly', () => {
      expect(service).toBeDefined();
    });
  });

  describe('User Listing and Search', () => {
    it('lists all users for authenticated requests', () => {
      service.listUsers().subscribe(users => {
        expect(users).toEqual(mockUsers);
        expect(users.length).toBe(2);
        expect(users[0].username).toBe('alice');
        expect(users[0]._id).toBe('user-123');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users`);
      expect(req.request.method).toBe('GET');
      req.flush(mockUsers);
    });

    it('returns empty array when user is not authenticated', () => {
      (Storage.prototype.getItem as jasmine.Spy).and.returnValue(null);
      const consoleSpy = spyOn(console, 'error');
      
      service.listUsers().subscribe(users => {
        expect(users).toEqual([]);
      });

      httpMock.expectNone(`${environment.apiUrl}/users`);
      expect(consoleSpy).toHaveBeenCalledWith('[UserService] No auth data available');
    });

    it('handles user list API errors gracefully', () => {
      const consoleSpy = spyOn(console, 'error');
      
      service.listUsers().subscribe(users => {
        expect(users).toEqual([]);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users`);
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
      
      expect(consoleSpy).toHaveBeenCalledWith('[UserService] Error fetching users:', jasmine.any(Object));
    });

    it('searches users by query string', () => {
      const searchQuery = 'alice';
      
      service.searchUsers(searchQuery).subscribe(users => {
        expect(users).toEqual([mockUsers[0]]);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users?query=${searchQuery}`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('query')).toBe(searchQuery);
      req.flush([mockUsers[0]]);
    });

    it('returns empty array for empty search query', () => {
      service.searchUsers('').subscribe(users => {
        expect(users).toEqual([]);
      });

      service.searchUsers('   ').subscribe(users => {
        expect(users).toEqual([]);
      });

      httpMock.expectNone(`${environment.apiUrl}/users`);
    });

    it('handles search API errors gracefully', () => {
      const consoleSpy = spyOn(console, 'error');
      
      service.searchUsers('error-query').subscribe(users => {
        expect(users).toEqual([]);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users?query=error-query`);
      req.flush('Search Failed', { status: 400, statusText: 'Bad Request' });
      
      expect(consoleSpy).toHaveBeenCalledWith('[UserService] Error searching users:', jasmine.any(Object));
    });
  });

  describe('Public Key Management', () => {
    it('uploads public key successfully', () => {
      const publicKey = 'test-public-key-data';
      
      service.uploadPublicKey(publicKey).subscribe(response => {
        expect(response).toEqual(mockStandardResponse);
        expect(response.message).toBe('Operation completed successfully');
      });

      const req = httpMock.expectOne(getApiPath('keys/upload'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        publicKeyBundle: publicKey
      });
      req.flush(mockStandardResponse);
    });

    it('retrieves public key bundle for specific user', () => {
      const userId = 'target-user-123';
      
      service.getPublicKey(userId).subscribe(response => {
        expect(response).toEqual(mockKeyBundle);
        expect(response.hasPublicKey).toBe(true);
        expect(response.isKeyMissing).toBe(false);
        expect(response.publicKeyBundle).toBe('mock-public-key-data');
      });

      const req = httpMock.expectOne(getApiPath(`keys/${userId}`));
      expect(req.request.method).toBe('GET');
      req.flush(mockKeyBundle);
    });

    it('handles missing public key scenarios', () => {
      const missingKeyResponse: KeyBundleResponse = {
        publicKeyBundle: null,
        username: 'user-without-key',
        avatarUrl: 'default-avatar.jpg',
        hasPublicKey: false,
        isKeyMissing: true
      };
      
      service.getPublicKey('user-no-key').subscribe(response => {
        expect(response.hasPublicKey).toBe(false);
        expect(response.isKeyMissing).toBe(true);
        expect(response.publicKeyBundle).toBe(null);
      });

      const req = httpMock.expectOne(getApiPath('keys/user-no-key'));
      req.flush(missingKeyResponse);
    });

    it('re-throws public key retrieval errors for caller handling', () => {
      service.getPublicKey('error-user').subscribe({
        next: () => fail('Should have thrown error'),
        error: (error) => {
          expect(error.status).toBe(404);
        }
      });

      const req = httpMock.expectOne(getApiPath('keys/error-user'));
      req.flush('User Not Found', { status: 404, statusText: 'Not Found' });
    });

    it('marks keys as missing for current user', () => {
      service.markKeysAsMissing().subscribe(response => {
        expect(response).toEqual(mockStandardResponse);
      });

      const req = httpMock.expectOne(getApiPath('keys/mark-missing'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(mockStandardResponse);
    });
  });

  describe('Profile Management', () => {
    it('updates user avatar successfully', () => {
      const newAvatarUrl = 'new-avatar.jpg';
      
      service.updateMyAvatar(newAvatarUrl).subscribe(response => {
        expect(response).toEqual(mockStandardResponse);
      });

      const req = httpMock.expectOne(getApiPath('users/me/avatar'));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({
        avatarUrl: newAvatarUrl
      });
      req.flush(mockStandardResponse);
    });

    it('handles avatar update errors', () => {
      service.updateMyAvatar('invalid-avatar').subscribe({
        next: () => fail('Should have thrown error'),
        error: (error) => {
          expect(error.status).toBe(400);
        }
      });

      const req = httpMock.expectOne(getApiPath('users/me/avatar'));
      req.flush('Invalid Avatar URL', { status: 400, statusText: 'Bad Request' });
    });
  });

  describe('Direct Message Operations', () => {
    it('creates DM room with specific user', () => {
      const targetUserId = 'dm-target-123';
      
      service.createDm(targetUserId).subscribe(response => {
        expect(response).toEqual(mockDmRoom);
        expect(response.roomId).toBe('dm-room-123');
      });

      const req = httpMock.expectOne(getApiPath('rooms/dm'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        userId: targetUserId
      });
      req.flush(mockDmRoom);
    });

    it('lists existing DM conversations for authenticated user', () => {
      service.listMyDms().subscribe(users => {
        expect(users).toEqual(mockUsers);
        expect(users.length).toBe(2);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/rooms/my-dms`);
      expect(req.request.method).toBe('GET');
      req.flush(mockUsers);
    });

    it('returns empty DM list when user is not authenticated', () => {
      (Storage.prototype.getItem as jasmine.Spy).and.returnValue(null);
      const consoleSpy = spyOn(console, 'error');
      
      service.listMyDms().subscribe(users => {
        expect(users).toEqual([]);
      });

      httpMock.expectNone(`${environment.apiUrl}/rooms/my-dms`);
      expect(consoleSpy).toHaveBeenCalledWith('[UserService] No auth data available for DMs');
    });

    it('handles DM list API errors with detailed logging', () => {
      const consoleSpy = spyOn(console, 'error');
      const errorResponse = {
        message: 'Database connection failed',
        code: 'DB_ERROR'
      };
      
      service.listMyDms().subscribe(users => {
        expect(users).toEqual([]);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/rooms/my-dms`);
      req.flush(errorResponse, { status: 503, statusText: 'Service Unavailable' });
      
      expect(consoleSpy).toHaveBeenCalledWith('[UserService] DM list error:', jasmine.any(Object));
      expect(consoleSpy).toHaveBeenCalledWith('[UserService] Error message:', 'Database connection failed');
    });
  });

  describe('Authentication and Error Handling', () => {
    it('validates authentication with both username and userId present', () => {
      // Both present - should make request
      service.listUsers().subscribe(users => {
        expect(users).toEqual(mockUsers);
      });
      httpMock.expectOne(`${environment.apiUrl}/users`).flush(mockUsers);
    });

    it('blocks requests when username is missing', () => {
      (Storage.prototype.getItem as jasmine.Spy).and.callFake((key: string) => {
        if (key === 'username') return null;
        if (key === 'userId') return 'valid-id';
        return null;
      });
      
      service.listUsers().subscribe(users => {
        expect(users).toEqual([]);
      });
      
      httpMock.expectNone(`${environment.apiUrl}/users`);
    });

    it('blocks requests when userId is missing', () => {
      (Storage.prototype.getItem as jasmine.Spy).and.callFake((key: string) => {
        if (key === 'username') return 'valid-user';
        if (key === 'userId') return null;
        return null;
      });
      
      service.listUsers().subscribe(users => {
        expect(users).toEqual([]);
      });
      
      httpMock.expectNone(`${environment.apiUrl}/users`);
    });

    it('handles detailed error logging for API failures', () => {
      const consoleSpy = spyOn(console, 'error');
      const errorDetails = {
        code: 'RATE_LIMITED',
        details: 'Too many requests'
      };
      
      service.listUsers().subscribe(users => {
        expect(users).toEqual([]);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users`);
      req.flush(errorDetails, { status: 429, statusText: 'Too Many Requests' });
      
      expect(consoleSpy).toHaveBeenCalledWith('[UserService] Error fetching users:', jasmine.any(Object));
      expect(consoleSpy).toHaveBeenCalledWith('[UserService] Status: 429, Message: Http failure response for http://localhost:3000/api/users: 429 Too Many Requests');
      expect(consoleSpy).toHaveBeenCalledWith('[UserService] Error details:', errorDetails);
    });
  });

  describe('Edge Cases and Data Handling', () => {
    it('handles empty user list response', () => {
      service.listUsers().subscribe(users => {
        expect(users).toEqual([]);
        expect(Array.isArray(users)).toBe(true);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users`);
      req.flush([]);
    });

    it('handles large user lists efficiently', () => {
      const largeUserList: UserSummary[] = Array.from({ length: 500 }, (_, i) => ({
        _id: `user-${i}`,
        username: `user${i}`,
        avatarUrl: `avatar${i}.jpg`
      }));
      
      service.listUsers().subscribe(users => {
        expect(users.length).toBe(500);
        expect(users[0].username).toBe('user0');
        expect(users[499].username).toBe('user499');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users`);
      req.flush(largeUserList);
    });

    it('handles special characters in search queries', () => {
      const specialQuery = 'user@domain.com';
      
      service.searchUsers(specialQuery).subscribe(users => {
        expect(users).toEqual([]);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users?query=${specialQuery}`);
      req.flush([]);
    });

    it('validates DM room creation with proper user ID', () => {
      const targetUserId = 'valid-target-user';
      
      service.createDm(targetUserId).subscribe(response => {
        expect(response.roomId).toBeDefined();
        expect(typeof response.roomId).toBe('string');
      });

      const req = httpMock.expectOne(getApiPath('rooms/dm'));
      expect(req.request.body.userId).toBe(targetUserId);
      req.flush(mockDmRoom);
    });

    it('handles concurrent user operations', () => {
      let usersResult: UserSummary[] = [];
      let searchResult: UserSummary[] = [];
      let dmsResult: UserSummary[] = [];
      
      // Start multiple operations simultaneously
      service.listUsers().subscribe(users => usersResult = users);
      service.searchUsers('test').subscribe(users => searchResult = users);
      service.listMyDms().subscribe(users => dmsResult = users);
      
      // All requests should be made concurrently
      const userListReq = httpMock.expectOne(`${environment.apiUrl}/users`);
      const searchReq = httpMock.expectOne(`${environment.apiUrl}/users?query=test`);
      const dmListReq = httpMock.expectOne(`${environment.apiUrl}/rooms/my-dms`);
      
      // Complete in different order
      searchReq.flush([]);
      dmListReq.flush(mockUsers);
      userListReq.flush(mockUsers);
      
      expect(usersResult).toEqual(mockUsers);
      expect(searchResult).toEqual([]);
      expect(dmsResult).toEqual(mockUsers);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('recovers from network errors appropriately', () => {
      const consoleSpy = spyOn(console, 'error');
      
      service.listUsers().subscribe(users => {
        expect(users).toEqual([]);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/users`);
      req.error(new ProgressEvent('timeout'));
      
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('handles malformed error responses', () => {
      const consoleSpy = spyOn(console, 'error');
      
      service.listMyDms().subscribe(users => {
        expect(users).toEqual([]);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/rooms/my-dms`);
      req.flush(null, { status: 500, statusText: 'Internal Server Error' });
      
      expect(consoleSpy).toHaveBeenCalledWith('[UserService] DM list error:', jasmine.any(Object));
      expect(consoleSpy).toHaveBeenCalledWith('[UserService] Error message:', jasmine.any(String));
    });
  });
});