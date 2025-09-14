export const config = {
  // Get WebSocket URL based on current location
  getWebSocketUrl: (): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    // In development, use the dev server port
    if (host.includes('5000')) {
      return `${protocol}//${host.replace('5000', '3000')}`;
    }

    // In production, use the same host (nginx will proxy)
    return `${protocol}//${host}/ws`;
  },

  // Get API base URL
  getApiUrl: (): string => {
    const protocol = window.location.protocol;
    const host = window.location.host;

    // In development, use the dev server port for API
    if (host.includes('5000')) {
      return `${protocol}//${host.replace('5000', '3000')}/api`;
    }

    // In production, use the same host with /api prefix
    return `${protocol}//${host}/api`;
  },
};
