/**
 * Convert various timestamp formats to epoch milliseconds
 * Handles edge cases and provides better error handling
 */
export function toEpoch(v: string | number | Date | undefined): number {
  // Handle null/undefined
  if (v == null || v === undefined) {
    console.warn('[DateUtil] toEpoch received null/undefined, using current time');
    return Date.now();
  }

  // Handle number (already epoch)
  if (typeof v === 'number') {
    // Check if it's a valid timestamp
    if (isNaN(v) || v <= 0) {
      console.warn('[DateUtil] Invalid numeric timestamp:', v);
      return Date.now();
    }

    // Handle seconds vs milliseconds (if less than year 2000, assume seconds)
    if (v < 946684800000) {
      // Jan 1, 2000 in ms
      return v * 1000; // Convert seconds to milliseconds
    }

    return v;
  }

  // Handle Date object
  if (v instanceof Date) {
    const timestamp = v.getTime();
    if (isNaN(timestamp)) {
      console.warn('[DateUtil] Invalid Date object:', v);
      return Date.now();
    }
    return timestamp;
  }

  // Handle string
  if (typeof v === 'string') {
    // Try different parsing methods
    let timestamp: number;

    // First try ISO string parsing
    timestamp = Date.parse(v);

    // If that fails, try treating as number string
    if (isNaN(timestamp)) {
      timestamp = parseInt(v, 10);

      // Handle seconds vs milliseconds for number strings
      if (!isNaN(timestamp) && timestamp < 946684800000) {
        timestamp = timestamp * 1000;
      }
    }

    // If still NaN, try parseFloat
    if (isNaN(timestamp)) {
      timestamp = parseFloat(v);

      // Handle seconds vs milliseconds for float strings
      if (!isNaN(timestamp) && timestamp < 946684800000) {
        timestamp = timestamp * 1000;
      }
    }

    // Final validation
    if (isNaN(timestamp) || timestamp <= 0) {
      console.warn('[DateUtil] Could not parse timestamp from string:', v);
      return Date.now();
    }

    return timestamp;
  }

  // Fallback for unknown types
  console.warn('[DateUtil] Unknown timestamp type:', typeof v, v);
  return Date.now();
}

/**
 * Format epoch timestamp to readable string
 */
export function formatTimestamp(epoch: number): string {
  try {
    const date = new Date(epoch);
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    return date.toLocaleString();
  } catch (error) {
    console.error('[DateUtil] Error formatting timestamp:', error);
    return 'Invalid Date';
  }
}

/**
 * Check if a timestamp is valid
 */
export function isValidTimestamp(
  timestamp: string | number | Date | null | undefined
): boolean {
  if (timestamp == null) return false;

  const epoch = toEpoch(timestamp);
  return !isNaN(epoch) && epoch > 0 && epoch <= Date.now() + 86400000; // Allow up to 1 day in future
}

/**
 * Check if two timestamps are on the same day
 */
export function isSameDay(timestamp1: number, timestamp2: number): boolean {
  const date1 = new Date(timestamp1);
  const date2 = new Date(timestamp2);

  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Get the start of day timestamp for a given timestamp
 */
export function getStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * UPDATED: Format date for group headers (Today, Yesterday, or "May 26" format)
 */
export function formatDateHeader(timestamp: number): string {
  const messageDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Check if it's today
  if (isSameDay(timestamp, today.getTime())) {
    return 'Today';
  }

  // Check if it's yesterday
  if (isSameDay(timestamp, yesterday.getTime())) {
    return 'Yesterday';
  }

  // UPDATED: For all other dates, show "May 26" format (Telegram style)
  return messageDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * UPDATED: Format time for message display (always shows only time in 24H format)
 */
export function formatMessageTime(timestamp: number): string {
  const messageDate = new Date(timestamp);

  // UPDATED: Always show only time in 24H format, regardless of date
  return messageDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Get relative time string (Just now, 5 minutes ago, etc.)
 */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    // Less than 1 minute
    return 'Just now';
  }

  if (diff < 3600000) {
    // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  if (diff < 86400000) {
    // Less than 1 day
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  // For older messages, use formatDateHeader
  return formatDateHeader(timestamp);
}
