export function createGameAudio() {
  let context,
    master,
    ambient,
    effects,
    wind,
    paused = false,
    focused = true,
    settings = {};
  function levels() {
    if (!context) return;
    const enabled = !settings.muted && (!settings.muteOnBlur || focused) && !paused;
    master.gain.setTargetAtTime(enabled ? (settings.masterVolume ?? 0.7) : 0, context.currentTime, 0.08);
    ambient.gain.setTargetAtTime(settings.ambientVolume ?? 0.25, context.currentTime, 0.15);
    effects.gain.setTargetAtTime(settings.effectsVolume ?? 0.65, context.currentTime, 0.08);
  }
  async function start() {
    try {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        ambient = context.createGain();
        effects = context.createGain();
        ambient.connect(master);
        effects.connect(master);
        master.connect(context.destination);
        const data = context.createBuffer(1, context.sampleRate * 2, context.sampleRate),
          samples = data.getChannelData(0);
        let value = 0;
        for (let i = 0; i < samples.length; i++) {
          value = (value + (Math.random() * 2 - 1) * 0.03) / 1.02;
          samples[i] = value;
        }
        const source = context.createBufferSource();
        source.buffer = data;
        source.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;
        wind = context.createGain();
        wind.gain.value = 0.18;
        source.connect(filter).connect(wind).connect(ambient);
        source.start();
      }
      await context.resume();
      levels();
      return true;
    } catch {
      return false;
    }
  }
  function tone(kind) {
    if (!context || context.state !== 'running') return;
    const oscillator = context.createOscillator(),
      gain = context.createGain(),
      now = context.currentTime;
    const boost = kind === 'launch',
      fire = kind === 'fire',
      hit = kind === 'hit';
    oscillator.type = boost || hit ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(boost ? 240 : fire ? 950 : hit ? 1450 : 650, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      boost ? 1100 : fire ? 180 : hit ? 2100 : 400,
      now + (hit ? 0.06 : 0.12),
    );
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(boost ? 0.13 : 0.055, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
    oscillator.connect(gain).connect(effects);
    oscillator.start();
    oscillator.stop(now + 0.25);
  }
  async function preview() {
    if (!(await start())) return;
    master.gain.setTargetAtTime(settings.muted ? 0 : settings.masterVolume, context.currentTime, 0.01);
    tone('launch');
    setTimeout(levels, 330);
  }
  return {
    start,
    tone,
    preview,
    configure(value) {
      settings = value;
      levels();
    },
    pause(value) {
      paused = value;
      levels();
    },
    focus(value) {
      focused = value;
      levels();
    },
    speed(value) {
      if (wind && context)
        wind.gain.setTargetAtTime(0.16 + (Math.min(65, value) / 65) * 0.55, context.currentTime, 0.2);
    },
    get available() {
      return !!context;
    },
  };
}
