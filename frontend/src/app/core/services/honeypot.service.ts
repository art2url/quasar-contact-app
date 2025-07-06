import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class HoneypotService {
  // These field names must match the backend middleware
  private readonly HONEYPOT_FIELDS = [
    'website',
    'url', 
    'phone',
    'address',
    'company',
    'firstname',
    'lastname',
  ];

  /**
   * Get honeypot field names for form creation
   */
  getHoneypotFieldNames(): string[] {
    return [...this.HONEYPOT_FIELDS];
  }

  /**
   * Create honeypot form data object with empty values
   */
  createHoneypotData(): Record<string, string> {
    const honeypotData: Record<string, string> = {};
    this.HONEYPOT_FIELDS.forEach(field => {
      honeypotData[field] = '';
    });
    return honeypotData;
  }

  /**
   * Validate that honeypot fields are empty (client-side check)
   */
  validateHoneypotFields(formData: Record<string, unknown>): boolean {
    for (const field of this.HONEYPOT_FIELDS) {
      const value = formData[field];
      if (value && typeof value === 'string' && value.trim() !== '') {
        console.warn(`⚠️ Honeypot field '${field}' was filled!`);
        return false;
      }
    }
    return true;
  }

  /**
   * Add form start time for timing validation
   */
  addFormStartTime(): number {
    return Date.now();
  }

  /**
   * Get CSS styles for honeypot fields (makes them invisible)
   */
  getHoneypotStyles(): string {
    return `
      position: absolute !important;
      left: -9999px !important;
      top: -9999px !important;
      width: 1px !important;
      height: 1px !important;
      opacity: 0 !important;
      pointer-events: none !important;
      z-index: -1 !important;
      overflow: hidden !important;
    `;
  }

  /**
   * Create honeypot input attributes
   */
  getHoneypotInputAttributes(): Record<string, string | number | boolean> {
    return {
      type: 'text',
      style: this.getHoneypotStyles(),
      tabindex: -1,
      autocomplete: 'off',
      'aria-hidden': 'true',
      readonly: true,
    };
  }

  /**
   * Prepare form data with honeypot fields for submission
   */
  prepareFormDataWithHoneypot(formData: Record<string, unknown>, formStartTime: number): Record<string, unknown> {
    const honeypotData = this.createHoneypotData();
    
    return {
      ...formData,
      ...honeypotData,
      formStartTime: formStartTime,
    };
  }
}