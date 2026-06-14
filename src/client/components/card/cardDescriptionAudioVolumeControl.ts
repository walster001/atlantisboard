/** Cached result — volume programmability does not change at runtime. */
let mediaElementVolumeProgrammable: boolean | null = null;

export interface CardDescriptionAudioGainRoute {
  readonly context: AudioContext;
  readonly gain: GainNode;
}

const gainRoutes = new WeakMap<HTMLAudioElement, CardDescriptionAudioGainRoute>();
const persistedGainVolume = new WeakMap<HTMLAudioElement, number>();

function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) {
    return true;
  }
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * iOS (and some other mobile browsers) treat `HTMLMediaElement.volume` as read-only.
 * Web Audio `GainNode` is the supported workaround.
 */
export function isMediaElementVolumeProgrammable(): boolean {
  if (mediaElementVolumeProgrammable !== null) {
    return mediaElementVolumeProgrammable;
  }
  if (typeof document === 'undefined') {
    mediaElementVolumeProgrammable = true;
    return true;
  }
  if (isAppleTouchDevice()) {
    mediaElementVolumeProgrammable = false;
    return false;
  }
  try {
    const audio = document.createElement('audio');
    audio.volume = 0.37;
    mediaElementVolumeProgrammable = Math.abs(audio.volume - 0.37) < 0.01;
    return mediaElementVolumeProgrammable;
  } catch {
    mediaElementVolumeProgrammable = true;
    return true;
  }
}

export function ensureCardDescriptionAudioGainRoute(
  element: HTMLAudioElement,
  initialVolume: number,
): CardDescriptionAudioGainRoute | null {
  const existing = gainRoutes.get(element);
  if (existing != null && existing.context.state !== 'closed') {
    return existing;
  }

  const AudioContextCtor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AudioContextCtor == null) {
    return null;
  }

  try {
    const context = new AudioContextCtor();
    const source = context.createMediaElementSource(element);
    const gain = context.createGain();
    const stored = persistedGainVolume.get(element);
    const clamped = Math.max(0, Math.min(1, stored ?? initialVolume));
    gain.gain.value = clamped;
    source.connect(gain);
    gain.connect(context.destination);
    const route: CardDescriptionAudioGainRoute = { context, gain };
    gainRoutes.set(element, route);
    if (stored == null) {
      persistedGainVolume.set(element, clamped);
    }
    return route;
  } catch {
    return null;
  }
}

export function readCardDescriptionAudioGainVolume(element: HTMLAudioElement): number | null {
  const route = gainRoutes.get(element);
  if (route != null && route.context.state !== 'closed') {
    return route.gain.gain.value;
  }
  const stored = persistedGainVolume.get(element);
  return stored ?? null;
}

export function readCardDescriptionAudioGainVolumePercent(element: HTMLAudioElement): number | null {
  const normalized = readCardDescriptionAudioGainVolume(element);
  if (normalized == null) {
    return null;
  }
  return Math.round(normalized * 100);
}

export function applyCardDescriptionAudioGainVolume(
  element: HTMLAudioElement,
  volume: number,
): boolean {
  const clamped = Math.max(0, Math.min(1, volume));
  const route = ensureCardDescriptionAudioGainRoute(element, clamped);
  if (route == null) {
    return false;
  }
  void route.context.resume().catch(() => undefined);
  route.gain.gain.value = clamped;
  persistedGainVolume.set(element, clamped);
  if (clamped > 0 && element.muted) {
    element.muted = false;
  }
  return true;
}
