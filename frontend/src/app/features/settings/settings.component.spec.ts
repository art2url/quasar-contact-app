import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { SettingsComponent } from './settings.component';
import { CryptoService } from '@services/crypto.service';
import { UserService } from '@services/user.service';
import { VaultService, VAULT_KEYS } from '@services/vault.service';
import { ScrollService } from '@services/scroll.service';
import { STOCK_AVATARS } from '@constants/avatars';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let mockCryptoService: jasmine.SpyObj<CryptoService>;
  let mockUserService: jasmine.SpyObj<UserService>;
  let mockVaultService: jasmine.SpyObj<VaultService>;
  let mockScrollService: jasmine.SpyObj<ScrollService>;
  let mockLocation: jasmine.SpyObj<Location>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    // Mock window.matchMedia for BreakpointObserver
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jasmine.createSpy('addListener'),
        removeListener: jasmine.createSpy('removeListener'),
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
        dispatchEvent: jasmine.createSpy('dispatchEvent'),
      }),
    });

    // Create service mocks
    mockCryptoService = jasmine.createSpyObj('CryptoService', ['hasPrivateKey', 'exportPrivateKey', 'importPrivateKey']);
    mockUserService = jasmine.createSpyObj('UserService', ['updateMyAvatar']);
    mockVaultService = jasmine.createSpyObj('VaultService', ['get', 'set']);
    mockScrollService = jasmine.createSpyObj('ScrollService', ['scrollToTop']);
    mockLocation = jasmine.createSpyObj('Location', ['back']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    // Mock localStorage
    spyOn(localStorage, 'getItem').and.returnValue('assets/images/avatars/02.svg');
    spyOn(localStorage, 'setItem');

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideRouter([]),
        { provide: CryptoService, useValue: mockCryptoService },
        { provide: UserService, useValue: mockUserService },
        { provide: VaultService, useValue: mockVaultService },
        { provide: ScrollService, useValue: mockScrollService },
        { provide: Location, useValue: mockLocation },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
  });

  // Run: npm test
  it('creates with defaults and initializes correctly', () => {
    expect(component).toBeTruthy();
    expect(component.avatars).toBe(STOCK_AVATARS);
    expect(component.selected).toBe('assets/images/avatars/02.svg');
    expect(component.importError).toBe('');
    expect(component.selectedFileName).toBe('');

    fixture.detectChanges();
    
    expect(mockScrollService.scrollToTop).toHaveBeenCalled();
  });

  it('handles avatar selection correctly', () => {
    const newAvatarUrl = 'assets/images/avatars/03.svg';
    mockUserService.updateMyAvatar.and.returnValue(of({ message: 'Avatar updated successfully' }));
    spyOn(window, 'alert');

    component.chooseAvatar(newAvatarUrl);

    expect(component.selected).toBe(newAvatarUrl);
    expect(localStorage.setItem).toHaveBeenCalledWith('myAvatar', newAvatarUrl);
    expect(mockUserService.updateMyAvatar).toHaveBeenCalledWith(newAvatarUrl);
    expect(window.alert).toHaveBeenCalledWith('Avatar updated ✅');
  });

  it('handles private key download flow correctly', async () => {
    mockCryptoService.hasPrivateKey.and.returnValue(true);
    mockCryptoService.exportPrivateKey.and.returnValue(Promise.resolve(new ArrayBuffer(32)));
    spyOn(window, 'confirm').and.returnValue(true);
    
    // Mock DOM manipulation
    const mockAnchor = jasmine.createSpyObj('HTMLAnchorElement', ['click']);
    spyOn(document, 'createElement').and.returnValue(mockAnchor);
    spyOn(document.body, 'appendChild');
    spyOn(document.body, 'removeChild');
    spyOn(URL, 'createObjectURL').and.returnValue('blob:mock-url');
    spyOn(URL, 'revokeObjectURL');

    await component.downloadKey();

    expect(mockCryptoService.hasPrivateKey).toHaveBeenCalled();
    expect(mockCryptoService.exportPrivateKey).toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledWith('Download your private key now? Keep it in a safe place.');
    expect(mockAnchor.download).toBe('quasar-chat-private-key.pem');
    expect(mockAnchor.click).toHaveBeenCalled();
  });

  it('handles file import with validation correctly', async () => {
    const mockFile = new File(['mock-private-key-content'], 'test.pem', { type: 'text/plain' });
    const mockEvent = {
      target: {
        files: [mockFile],
        value: 'test.pem'
      }
    } as unknown as Event;

    mockCryptoService.importPrivateKey.and.returnValue(Promise.resolve('test-fingerprint'));
    spyOn(window, 'alert');

    await component.onFileSelected(mockEvent);

    expect(mockCryptoService.importPrivateKey).toHaveBeenCalledWith('mock-private-key-content');
    expect(mockVaultService.set).toHaveBeenCalledWith(VAULT_KEYS.PRIVATE_KEY, 'mock-private-key-content');
    expect(window.alert).toHaveBeenCalledWith('Private key imported ✅\nFingerprint: test-fingerprint');
    expect(component.selectedFileName).toBe(''); // Reset after processing
    expect(component.importError).toBe(''); // No error on success
  });

  it('handles navigation and error scenarios correctly', async () => {
    // Test navigation with history
    Object.defineProperty(window, 'history', {
      value: { length: 2 },
      writable: true
    });
    
    component.goBack();
    expect(mockLocation.back).toHaveBeenCalled();

    // Test navigation without history
    Object.defineProperty(window, 'history', {
      value: { length: 1 },
      writable: true
    });
    
    component.goBack();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/chat']);

    // Test avatar update error
    mockUserService.updateMyAvatar.and.returnValue(throwError(() => new Error('Network error')));
    spyOn(window, 'alert');
    spyOn(console, 'error');

    component.chooseAvatar('test-avatar.svg');
    
    expect(window.alert).toHaveBeenCalledWith('Could not update avatar on the server');
    expect(console.error).toHaveBeenCalled();

    // Test file size validation
    const largeFile = new File(['x'.repeat(60000)], 'large.pem', { type: 'text/plain' });
    const largeFileEvent = {
      target: { files: [largeFile] }
    } as unknown as Event;

    await component.onFileSelected(largeFileEvent);
    
    expect(component.importError).toBe('Selected file is too large to be a private‑key backup.');
  });
});