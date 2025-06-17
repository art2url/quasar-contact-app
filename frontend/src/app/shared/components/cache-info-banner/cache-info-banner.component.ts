import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-cache-info-banner',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: '../cache-info-banner/cache-info-banner.component.html',
  styleUrl: '../cache-info-banner/cache-info-banner.component.css',
})
export class CacheInfoBannerComponent {
  @Input() showBanner = false;

  dismissBanner() {
    this.showBanner = false;
    localStorage.setItem('cacheInfoDismissed', 'true');
  }
}
