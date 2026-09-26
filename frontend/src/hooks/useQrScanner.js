import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Camera QR scanning with qr-scanner (loaded on demand). The same code is ignored for `repeatMs`
 * so one ticket held in front of the camera is not submitted many times.
 * Browsers only allow camera access on https:// or http://localhost.
 */
export default function useQrScanner(onDecode, { repeatMs = 3000 } = {}) {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const lastRef = useRef({ value: null, at: 0 });
  const handlerRef = useRef(onDecode);
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    handlerRef.current = onDecode;
  }, [onDecode]);

  const stop = useCallback(() => {
    scannerRef.current?.stop();
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      if (!window.isSecureContext) throw Object.assign(new Error('insecure'), { name: 'InsecureContext' });
      if (!scannerRef.current) {
        const { default: QrScanner } = await import('qr-scanner');
        if (!(await QrScanner.hasCamera())) throw Object.assign(new Error('no camera'), { name: 'NotFoundError' });
        scannerRef.current = new QrScanner(
          videoRef.current,
          (result) => {
            const now = Date.now();
            if (result.data === lastRef.current.value && now - lastRef.current.at < repeatMs) return;
            lastRef.current = { value: result.data, at: now };
            handlerRef.current(result.data);
          },
          { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 5, returnDetailedScanResult: true }
        );
      }
      await scannerRef.current.start();
      setActive(true);
    } catch (err) {
      const messages = {
        NotAllowedError: 'Camera permission was denied. Allow camera access in your browser settings, or type ticket codes below.',
        NotFoundError: 'No camera found on this device. Type ticket codes below instead.',
        InsecureContext: 'The camera only works on a secure (https) connection. Type ticket codes below instead.',
      };
      setError(messages[err?.name] ?? (typeof err === 'string' ? err : 'Could not start the camera. Type ticket codes below instead.'));
      setActive(false);
    } finally {
      setStarting(false);
    }
  }, [repeatMs]);

  useEffect(
    () => () => {
      scannerRef.current?.destroy();
      scannerRef.current = null;
    },
    []
  );

  return { videoRef, active, starting, error, start, stop };
}

let audioContext;
/** Short beep + vibration so gate staff notice the result without looking. */
export function scanFeedback(allowed) {
  try {
    navigator.vibrate?.(allowed ? 80 : [120, 80, 120]);
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    const tones = allowed ? [880] : [220, 180];
    tones.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.frequency.value = freq;
      osc.type = allowed ? 'sine' : 'square';
      gain.gain.value = 0.08;
      osc.connect(gain).connect(audioContext.destination);
      const at = audioContext.currentTime + i * 0.18;
      osc.start(at);
      osc.stop(at + 0.14);
    });
  } catch {
    /* sound/vibration not available */
  }
}
