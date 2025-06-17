import { Component } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { STOCK_AVATARS } from '@constants/avatars';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { CryptoService } from '@services/crypto.service';
import { UserService } from '@services/user.service';
import { VaultService, VAULT_KEYS } from '@services/vault.service';

@Component({
  standalone: true,
  selector: 'app-settings',
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent {
  /** UI state */
  importError = '';
  selectedFileName = ''; // Added for the new file input UI

  /* ── avatar  ───────────────────────────── */
  readonly avatars = STOCK_AVATARS;
  selected = localStorage.getItem('myAvatar') || STOCK_AVATARS[0];

  constructor(
    private crypto: CryptoService,
    private location: Location,
    private router: Router,
    private users: UserService,
    private vault: VaultService
  ) {}

  /* ── download current private key ─────────────────────────── */
  async downloadKey(): Promise<void> {
    try {
      // First check if we have a key in the crypto service
      if (!this.crypto.hasPrivateKey()) {
        // Try to load from vault
        const storedKey = await this.vault.get<ArrayBuffer | string>(
          VAULT_KEYS.PRIVATE_KEY
        );
        if (storedKey) {
          await this.crypto.importPrivateKey(storedKey);
        } else {
          alert(
            'No private key found. Please log in again to generate a new key.'
          );
          return;
        }
      }

      const raw = await this.crypto.exportPrivateKey();
      if (!raw) {
        alert('Failed to export private key.');
        return;
      }

      if (!confirm('Download your private key now? Keep it in a safe place.')) {
        return;
      }

      // Convert ArrayBuffer to PEM format
      const base64Key = this.arrayBufferToBase64(raw);
      const pem = `-----BEGIN PRIVATE KEY-----\n${base64Key}\n-----END PRIVATE KEY-----`;

      // Create and download the file
      const blob = new Blob([pem], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'quasar-chat-private-key.pem';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('[Settings] Private key downloaded successfully');
    } catch (error) {
      console.error('[Settings] Error downloading private key:', error);
      alert('Failed to download private key. Please try again.');
    }
  }

  // Helper method for converting ArrayBuffer to base64
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const binary = String.fromCharCode(...new Uint8Array(buffer));
    return btoa(binary);
  }

  /* ── file‑input change handler (typed) ─────────────────────── */
  async onFileSelected(e: Event): Promise<void> {
    this.importError = '';

    const input = e.target as HTMLInputElement | null;
    if (!input?.files?.length) {
      this.selectedFileName = '';
      return;
    }

    const file = input.files[0];
    this.selectedFileName = file.name; // Update UI with selected file name

    // Sanity‑check: accept only reasonably‑sized text files (< 50KB)
    if (file.size > 50_000) {
      this.importError =
        'Selected file is too large to be a private‑key backup.';
      return;
    }

    try {
      const text = (await file.text()).trim();
      console.log('[Settings] Importing private key from file');

      // Import the key into the crypto service
      const fingerprint = await this.crypto.importPrivateKey(text);
      console.log('[Settings] Private key imported successfully');

      // Store in vault using consistent naming
      await this.vault.set(VAULT_KEYS.PRIVATE_KEY, text);
      console.log('[Settings] Private key stored in vault');

      alert(`Private key imported ✅\nFingerprint: ${fingerprint}`);
    } catch (err: unknown) {
      console.error('[Settings] Error importing private key:', err);
      this.importError =
        err instanceof Error
          ? err.message
          : 'Invalid or unsupported private‑key file';
    } finally {
      input.value = ''; // reset file input so the same file can be re‑added
      this.selectedFileName = ''; // Reset UI
    }
  }

  /** Go back or fall back to /chat if no history entry exists */
  goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/chat']);
    }
  }

  /* ── avatar upload / persist ──────────────────────────────── */
  chooseAvatar(url: string): void {
    this.selected = url;
    localStorage.setItem('myAvatar', url);

    // Persist on the backend
    this.users.updateMyAvatar(url).subscribe({
      next: () => {
        console.log('[Settings] Avatar updated successfully');
        alert('Avatar updated ✅');
      },
      error: (error) => {
        console.error('[Settings] Failed to update avatar:', error);
        alert('Could not update avatar on the server');
      },
    });
  }
}
