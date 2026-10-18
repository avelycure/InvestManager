/** Accept only public web hosts for user-configured sources. */
export function publicSourceUrl(value: string, base?: string): string | undefined {
  try {
    const url = new URL(value, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return undefined;
    if (host.startsWith('[')) {
      if (host === '[::1]' || /^\[(?:fc|fd|fe[89ab])/.test(host) || host.includes('::ffff:')) return undefined;
    } else if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const octets = host.split('.').map(Number);
      const [a = 0, b = 0] = octets;
      if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
        || (a === 100 && b >= 64 && b <= 127)) return undefined;
    }
    return url.href;
  } catch { return undefined; }
}
