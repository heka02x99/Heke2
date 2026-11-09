// Prosedürel ses efektleri (WebAudio) — harici dosya gerektirmez.
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // Ses kaynağının dinleyiciye göre konumu: ses seviyesi ve stereo pan
  function spatial(pos, listener) {
    if (!pos || !listener) return { vol: 1, pan: 0 };
    const dx = pos.x - listener.pos.x, dz = pos.z - listener.pos.z;
    const dist = Math.hypot(dx, dz);
    const vol = Math.max(0, 1 - dist / 70) ** 1.6;
    // dinleyicinin sağ vektörü
    const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);
    const pan = dist > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) : 0;
    return { vol, pan };
  }

  function out(vol, pan) {
    const g = ctx.createGain();
    g.gain.value = vol;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(master);
    } else g.connect(master);
    return g;
  }

  function noise(dest, dur, freq, q, vol, type = 'bandpass', attack = 0.002) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  function tone(dest, freq, dur, vol, type = 'sine', endFreq) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const api = {
    init,
    get ready() { return !!ctx; },
    shot(kind, pos, listener) {
      if (!ctx) return;
      const s = spatial(pos, listener);
      if (s.vol < 0.01) return;
      const d = out(s.vol, s.pan);
      switch (kind) {
        case 'pistol': noise(d, 0.18, 1800, 0.8, 0.9); tone(d, 160, 0.08, 0.5, 'square', 60); break;
        case 'deagle': noise(d, 0.35, 900, 0.6, 1.0); tone(d, 110, 0.15, 0.7, 'square', 40); break;
        case 'smg': noise(d, 0.12, 2200, 0.9, 0.7); tone(d, 200, 0.05, 0.3, 'square', 80); break;
        case 'shotgun': noise(d, 0.45, 700, 0.5, 1.0); tone(d, 90, 0.2, 0.8, 'sawtooth', 35); break;
        case 'sniper': noise(d, 0.7, 600, 0.4, 1.0); tone(d, 80, 0.3, 0.9, 'sawtooth', 30); break;
        case 'knife': noise(d, 0.12, 4000, 2, 0.3, 'highpass'); break;
        default: noise(d, 0.22, 1300, 0.7, 0.9); tone(d, 130, 0.09, 0.6, 'square', 50);
      }
    },
    hit(head) {
      if (!ctx) return;
      const d = out(0.5, 0);
      if (head) { tone(d, 1800, 0.12, 0.5, 'triangle', 1200); noise(d, 0.08, 5000, 3, 0.4); }
      else tone(d, 900, 0.07, 0.35, 'triangle', 700);
    },
    hurt() { if (!ctx) return; const d = out(0.6, 0); noise(d, 0.2, 400, 1, 0.8, 'lowpass'); },
    step(pos, listener) {
      if (!ctx) return;
      const s = spatial(pos, listener);
      if (s.vol < 0.02) return;
      noise(out(s.vol * 0.35, s.pan), 0.07, 300 + Math.random() * 200, 1.5, 0.8, 'lowpass');
    },
    reload() { if (!ctx) return; const d = out(0.4, 0); noise(d, 0.06, 3000, 4, 0.6); setTimeout(() => ctx && noise(out(0.4, 0), 0.08, 2000, 4, 0.7), 350); },
    empty() { if (!ctx) return; tone(out(0.3, 0), 2400, 0.03, 0.4, 'square'); },
    beep(urgent) { if (!ctx) return; tone(out(urgent ? 0.5 : 0.35, 0), urgent ? 1900 : 1500, 0.08, 0.6, 'sine'); },
    explosion(pos, listener) {
      if (!ctx) return;
      const s = spatial(pos, listener);
      const d = out(Math.max(0.15, s.vol), s.pan);
      noise(d, 1.6, 200, 0.5, 1.0, 'lowpass', 0.01);
      noise(d, 0.6, 1200, 0.5, 0.6);
      tone(d, 70, 1.0, 0.9, 'sine', 25);
    },
    bounce(pos, listener) { if (!ctx) return; const s = spatial(pos, listener); if (s.vol > 0.02) tone(out(s.vol * 0.4, s.pan), 500, 0.05, 0.5, 'triangle', 300); },
    buy() { if (!ctx) return; tone(out(0.3, 0), 700, 0.06, 0.4, 'triangle'); setTimeout(() => ctx && tone(out(0.3, 0), 1000, 0.08, 0.4, 'triangle'), 60); },
    plant() { if (!ctx) return; for (let i = 0; i < 4; i++) setTimeout(() => ctx && tone(out(0.3, 0), 1200 + i * 150, 0.05, 0.4, 'square'), i * 90); },
    roundStart() { if (!ctx) return; tone(out(0.35, 0), 440, 0.25, 0.4, 'triangle'); setTimeout(() => ctx && tone(out(0.35, 0), 660, 0.35, 0.4, 'triangle'), 180); },
    win() { if (!ctx) return; [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => ctx && tone(out(0.3, 0), f, 0.3, 0.4, 'triangle'), i * 120)); },
    lose() { if (!ctx) return; [392, 330, 262].forEach((f, i) => setTimeout(() => ctx && tone(out(0.3, 0), f, 0.35, 0.4, 'triangle'), i * 160)); },
  };
  return api;
})();
