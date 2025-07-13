import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private currentTheme: Theme = 'dark';
  private themeSubject = new BehaviorSubject<Theme>(this.currentTheme);

  public theme$ = this.themeSubject.asObservable();

  constructor() {
    this.initializeTheme();
  }

  private initializeTheme(): void {
    // Check localStorage first
    const savedTheme = localStorage.getItem('theme') as Theme;

    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
      this.currentTheme = savedTheme;
    } else {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.currentTheme = prefersDark ? 'dark' : 'dark';
    }

    this.applyTheme(this.currentTheme);
    this.themeSubject.next(this.currentTheme);
  }

  public getCurrentTheme(): Theme {
    return this.currentTheme;
  }

  public toggleTheme(): void {
    const newTheme: Theme = this.currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  public setTheme(theme: Theme): void {
    // Setting theme
    this.currentTheme = theme;
    this.applyTheme(theme);
    this.saveTheme(theme);
    this.themeSubject.next(theme);
    // Theme change emitted
  }

  private applyTheme(theme: Theme): void {
    const root = document.documentElement;

    // Remove existing theme classes
    root.classList.remove('light-theme', 'dark-theme');

    // Add new theme class
    root.classList.add(`${theme}-theme`);

    // Update theme-color meta tag for mobile browsers
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      const themeColor = theme === 'dark' ? '#0c2524' : '#0077cc';
      themeColorMeta.setAttribute('content', themeColor);
    }
  }

  private saveTheme(theme: Theme): void {
    localStorage.setItem('theme', theme);
  }

  public isDarkTheme(): boolean {
    return this.currentTheme === 'dark';
  }

  public isLightTheme(): boolean {
    return this.currentTheme === 'light';
  }
}
