const SILENT = 0.0001;
const NOISE_SECONDS = 2;
const MAX_VOICES = 16;
const HEARING_DISTANCE = 45;
const MUSIC_TEMPO = 76;
const MUSIC_LOOKAHEAD_SECONDS = 0.25;
const MUSIC_TICK_MILLISECONDS = 90;
const PENTATONIC = [0, 2, 4, 7, 9];
const MOOD_CHORDS = {
  calm: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]],
  combat: [[57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [52, 55, 59, 64]],
  gull: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 58], [40, 47, 52, 55]],
};
const MOOD_ROOTS = { calm: 60, combat: 60, gull: 57 };

const midiToFrequency = (note) => 440 * Math.pow(2, (note - 69) / 12);

function createNoiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate * NOISE_SECONDS, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
  return buffer;
}

function createReverbImpulse(context, seconds, decay) {
  const length = Math.round(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = impulse.getChannelData(channel);
    for (let index = 0; index < length; index++) samples[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, decay);
  }
  return impulse;
}

function pluck(gain, at, peak, attack, decay) {
  gain.gain.setValueAtTime(SILENT, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(SILENT, at + attack + decay);
  return at + attack + decay;
}

export function createAudio({ context = null } = {}) {
  let audio = context;
  let nodes = null;
  let noiseBuffer = null;
  const voiceEnds = [];
  const volumes = { music: 0.55, effects: 0.8 };
  const music = { playing: false, mood: 'calm', nextBeat: 0, beat: 0, timer: 0, melodyNote: 2 };
  const ambience = { started: false, waveIntensity: 0.6, wind: 0, underwater: false };

  function ensure() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (nodes) return audio;
    noiseBuffer = createNoiseBuffer(audio);
    const master = audio.createDynamicsCompressor();
    master.threshold.value = -14;
    master.ratio.value = 4;
    master.connect(audio.destination);
    const underwaterFilter = audio.createBiquadFilter();
    underwaterFilter.type = 'lowpass';
    underwaterFilter.frequency.value = 20000;
    underwaterFilter.connect(master);
    const reverb = audio.createConvolver();
    reverb.buffer = createReverbImpulse(audio, 2.6, 3);
    const reverbReturn = audio.createGain();
    reverbReturn.gain.value = 0.32;
    reverb.connect(reverbReturn).connect(underwaterFilter);
    const effects = audio.createGain();
    effects.gain.value = volumes.effects;
    effects.connect(underwaterFilter);
    const effectsSend = audio.createGain();
    effectsSend.gain.value = 0.18;
    effects.connect(effectsSend).connect(reverb);
    const musicBus = audio.createGain();
    musicBus.gain.value = volumes.music;
    musicBus.connect(master);
    const musicSend = audio.createGain();
    musicSend.gain.value = 0.55;
    musicBus.connect(musicSend).connect(reverb);
    const ambienceBus = audio.createGain();
    ambienceBus.gain.value = volumes.effects;
    ambienceBus.connect(underwaterFilter);
    nodes = { master, underwaterFilter, reverb, effects, musicBus, ambienceBus };
    return audio;
  }

  function noise(at, duration, destination, { type = 'bandpass', frequency = 2000, endFrequency = frequency, q = 1, peak = 0.5, attack = 0.004 } = {}) {
    const source = audio.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = audio.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(frequency, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
    const gain = audio.createGain();
    const end = pluck(gain, at, peak, attack, Math.max(0.005, duration - attack));
    source.connect(filter).connect(gain).connect(destination);
    source.start(at, Math.random() * (NOISE_SECONDS - duration - 0.05));
    source.stop(end + 0.02);
    return end;
  }

  function tone(at, duration, destination, { type = 'sine', frequency = 440, endFrequency = frequency, peak = 0.3, attack = 0.003, detune = 0 } = {}) {
    const oscillator = audio.createOscillator();
    oscillator.type = type;
    oscillator.detune.value = detune;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
    const gain = audio.createGain();
    const end = pluck(gain, at, peak, attack, Math.max(0.005, duration - attack));
    oscillator.connect(gain).connect(destination);
    oscillator.start(at);
    oscillator.stop(end + 0.02);
    return end;
  }

  function marimba(at, note, destination, velocity = 1) {
    const frequency = midiToFrequency(note);
    let end = tone(at, 1.1, destination, { frequency, peak: 0.32 * velocity, attack: 0.004 });
    end = Math.max(end, tone(at, 0.22, destination, { frequency: frequency * 3.93, peak: 0.09 * velocity, attack: 0.002 }));
    end = Math.max(end, tone(at, 0.07, destination, { frequency: frequency * 9.24, peak: 0.03 * velocity, attack: 0.001 }));
    noise(at, 0.02, destination, { type: 'lowpass', frequency: 1800, peak: 0.05 * velocity, attack: 0.001 });
    return end;
  }

  function kalimba(at, note, destination, velocity = 1) {
    const frequency = midiToFrequency(note);
    let end = tone(at, 1.8, destination, { frequency, peak: 0.22 * velocity, attack: 0.002 });
    end = Math.max(end, tone(at, 0.35, destination, { frequency: frequency * 5.95, peak: 0.04 * velocity, attack: 0.001 }));
    end = Math.max(end, tone(at, 0.6, destination, { frequency: frequency * 2.01, peak: 0.05 * velocity, attack: 0.002 }));
    return end;
  }

  function gullFormantCall(at, destination, { length = 0.38, startFrequency = 1150, peakFrequency = 1550, endFrequency = 850, peak = 0.22 }) {
    const oscillator = audio.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(startFrequency, at);
    oscillator.frequency.linearRampToValueAtTime(peakFrequency, at + length * 0.3);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + length);
    const vibrato = audio.createOscillator();
    vibrato.frequency.value = 28;
    const vibratoDepth = audio.createGain();
    vibratoDepth.gain.value = 40;
    vibrato.connect(vibratoDepth).connect(oscillator.frequency);
    const gain = audio.createGain();
    const end = pluck(gain, at, peak, 0.03, length);
    for (const [formant, q, level] of [[1100, 6, 1], [2500, 8, 0.6], [3600, 10, 0.25]]) {
      const filter = audio.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = formant;
      filter.Q.value = q;
      const formantGain = audio.createGain();
      formantGain.gain.value = level * 3;
      oscillator.connect(filter).connect(formantGain).connect(gain);
    }
    gain.connect(destination);
    noise(at, length, destination, { type: 'bandpass', frequency: 2400, q: 2, peak: peak * 0.15, attack: 0.03 });
    for (const node of [oscillator, vibrato]) {
      node.start(at);
      node.stop(end + 0.02);
    }
    return end;
  }

  const variation = (amount) => 1 + (Math.random() * 2 - 1) * amount;

  const SOUNDS = {
    stepSand: (at, out) => noise(at, 0.035, out, { frequency: 3800 * variation(0.25), q: 0.8, peak: 0.32, attack: 0.003 }),
    stepWetSand: (at, out) => Math.max(noise(at, 0.07, out, { frequency: 1600 * variation(0.2), endFrequency: 600, q: 2.5, peak: 0.4 }), noise(at, 0.03, out, { type: 'highpass', frequency: 4000, peak: 0.05 })),
    stepSplash: (at, out) => {
      let end = noise(at, 0.16, out, { frequency: 900 * variation(0.2), endFrequency: 2600, q: 1.2, peak: 0.36, attack: 0.01 });
      for (let bubble = 0; bubble < 2; bubble++) end = Math.max(end, tone(at + 0.03 + bubble * 0.04 * variation(0.4), 0.05, out, { frequency: 700 * variation(0.3), endFrequency: 1300, peak: 0.06 }));
      return end;
    },
    gatherShellBits: (at, out) => {
      let end = 0;
      for (const [frequency, peak, decay] of [[2093, 0.18, 0.35], [3290, 0.1, 0.22], [5230, 0.05, 0.12]]) end = Math.max(end, tone(at, decay, out, { frequency: frequency * variation(0.02), peak }));
      return Math.max(end, tone(at + 0.09, 0.2, out, { frequency: 2637, peak: 0.08 }));
    },
    gatherDriftwood: (at, out) => {
      let end = 0;
      for (const delay of [0, 0.13]) {
        end = Math.max(end, tone(at + delay, 0.16, out, { type: 'triangle', frequency: 210 * variation(0.05), endFrequency: 140, peak: 0.32 }));
        end = Math.max(end, noise(at + delay, 0.05, out, { frequency: 900, q: 1.5, peak: 0.18 }));
      }
      return end;
    },
    gatherSeaLettuce: (at, out) => {
      let end = 0;
      for (let bite = 0; bite < 5; bite++) end = Math.max(end, noise(at + bite * 0.055 * variation(0.3), 0.03, out, { frequency: 2800 * variation(0.3), q: 1.5, peak: 0.26 }));
      return end;
    },
    gatherPearls: (at, out) => {
      let end = 0;
      [79, 84, 88, 91].forEach((note, index) => {
        end = Math.max(end, tone(at + index * 0.07, 0.9, out, { frequency: midiToFrequency(note), peak: 0.1, attack: 0.004 }));
        end = Math.max(end, tone(at + index * 0.07, 0.9, out, { frequency: midiToFrequency(note), peak: 0.04, detune: 9 }));
      });
      return end;
    },
    clawSnap: (at, out) => Math.max(noise(at, 0.012, out, { type: 'highpass', frequency: 3000, peak: 0.35, attack: 0.001 }), tone(at, 0.03, out, { frequency: 1900 * variation(0.1), endFrequency: 1100, peak: 0.12 })),
    hitThud: (at, out) => Math.max(tone(at, 0.16, out, { frequency: 140 * variation(0.1), endFrequency: 55, peak: 0.45 }), noise(at, 0.06, out, { type: 'lowpass', frequency: 700, peak: 0.25 })),
    stingHit: (at, out) => Math.max(SOUNDS.clawSnap(at, out), noise(at + 0.01, 0.09, out, { frequency: 2600, endFrequency: 800, q: 3, peak: 0.3 }), tone(at, 0.12, out, { type: 'square', frequency: 900, endFrequency: 250, peak: 0.07 }), SOUNDS.hitThud(at + 0.015, out)),
    shellClonk: (at, out) => Math.max(tone(at, 0.22, out, { type: 'triangle', frequency: 410 * variation(0.05), peak: 0.3 }), tone(at, 0.12, out, { frequency: 1060, peak: 0.12 }), noise(at, 0.04, out, { frequency: 1500, peak: 0.2 }), tone(at, 0.2, out, { frequency: 90, endFrequency: 50, peak: 0.25 })),
    alert: (at, out) => Math.max(tone(at, 0.09, out, { type: 'triangle', frequency: 740, peak: 0.16 }), tone(at + 0.08, 0.14, out, { type: 'triangle', frequency: 1108, peak: 0.16 })),
    hopperChirp: (at, out) => {
      let end = 0;
      for (let pulse = 0; pulse < 3; pulse++) end = Math.max(end, tone(at + pulse * 0.045, 0.03, out, { frequency: 5200 * variation(0.08), endFrequency: 6400, peak: 0.08 }));
      return end;
    },
    hopperJump: (at, out) => Math.max(noise(at, 0.09, out, { frequency: 1200, endFrequency: 3500, q: 1, peak: 0.08, attack: 0.01 }), tone(at + 0.07, 0.03, out, { frequency: 2400, peak: 0.04 })),
    crabClatter: (at, out) => {
      let end = 0;
      for (let click = 0; click < 6; click++) end = Math.max(end, noise(at + click * 0.028 * variation(0.25), 0.01, out, { frequency: 3400 * variation(0.3), q: 4, peak: 0.22, attack: 0.001 }));
      return end;
    },
    gullCall: (at, out) => {
      let end = gullFormantCall(at, out, {});
      end = Math.max(end, gullFormantCall(at + 0.45, out, { length: 0.3, startFrequency: 1200, peakFrequency: 1500, endFrequency: 950 }));
      return Math.max(end, gullFormantCall(at + 0.82, out, { length: 0.26, startFrequency: 1250, peakFrequency: 1450, endFrequency: 1000, peak: 0.17 }));
    },
    wingFlap: (at, out) => {
      let end = 0;
      for (let flap = 0; flap < 4; flap++) end = Math.max(end, noise(at + flap * 0.14, 0.12, out, { type: 'lowpass', frequency: 900, endFrequency: 300, peak: 0.32, attack: 0.02 }));
      return end;
    },
    fishPlop: (at, out) => Math.max(tone(at, 0.08, out, { frequency: 1100 * variation(0.2), endFrequency: 260, peak: 0.22 }), noise(at, 0.05, out, { frequency: 1800, q: 1, peak: 0.05 })),
    craft: (at, out) => {
      let end = 0;
      for (const delay of [0, 0.22, 0.44]) {
        end = Math.max(end, tone(at + delay, 0.12, out, { type: 'triangle', frequency: 520, endFrequency: 380, peak: 0.25 }));
        end = Math.max(end, noise(at + delay, 0.04, out, { frequency: 2400, peak: 0.15 }));
      }
      return Math.max(end, SOUNDS.gatherPearls(at + 0.6, out));
    },
    levelUp: (at, out) => {
      let end = 0;
      [60, 64, 67, 72, 76].forEach((note, index) => { end = Math.max(end, marimba(at + index * 0.09, note, out, 1.1)); });
      return Math.max(end, kalimba(at + 0.45, 84, out, 0.8));
    },
    death: (at, out) => {
      let end = 0;
      [69, 64, 60, 57].forEach((note, index) => { end = Math.max(end, marimba(at + index * 0.22, note, out, 0.9)); });
      return Math.max(end, tone(at, 2.2, out, { type: 'triangle', frequency: 55, peak: 0.18, attack: 0.4 }));
    },
    enchantSuccess: (at, out) => {
      let end = noise(at, 0.5, out, { type: 'highpass', frequency: 5200, endFrequency: 9000, peak: 0.05, attack: 0.25 });
      [72, 76, 79, 84, 88, 91, 96].forEach((note, index) => {
        end = Math.max(end, tone(at + index * 0.06, 0.8, out, { frequency: midiToFrequency(note), peak: 0.09, attack: 0.004 }));
        end = Math.max(end, tone(at + index * 0.06, 0.8, out, { frequency: midiToFrequency(note), peak: 0.035, detune: 11 }));
      });
      return Math.max(end, kalimba(at + 0.45, 96, out, 0.7));
    },
    enchantBreak: (at, out) => {
      let end = tone(at, 0.35, out, { type: 'sawtooth', frequency: 220, endFrequency: 70, peak: 0.12, attack: 0.005 });
      end = Math.max(end, tone(at, 0.35, out, { type: 'square', frequency: 233, endFrequency: 74, peak: 0.06 }));
      end = Math.max(end, noise(at + 0.04, 0.09, out, { type: 'highpass', frequency: 2400, peak: 0.4, attack: 0.001 }));
      for (let shard = 0; shard < 7; shard++) {
        const shardAt = at + 0.08 + shard * 0.045 * variation(0.4);
        end = Math.max(end, tone(shardAt, 0.12, out, { type: 'triangle', frequency: 1500 * variation(0.35), endFrequency: 900, peak: 0.08 }));
        end = Math.max(end, noise(shardAt, 0.025, out, { frequency: 4200 * variation(0.3), q: 3, peak: 0.16, attack: 0.001 }));
      }
      return Math.max(end, tone(at + 0.05, 0.4, out, { frequency: 110, endFrequency: 45, peak: 0.25 }));
    },
    recoverRemains: (at, out) => {
      let end = 0;
      [55, 60, 64, 67, 72].forEach((note, index) => { end = Math.max(end, kalimba(at + index * 0.06, note, out, 0.8)); });
      return end;
    },
  };
  Object.assign(SOUNDS, { gatherKelp: SOUNDS.gatherSeaLettuce, gatherPebbles: SOUNDS.gatherShellBits, gatherSand: SOUNDS.gatherShellBits, gatherClay: SOUNDS.gatherDriftwood });

  const PRIORITY_SOUNDS = new Set(['levelUp', 'death', 'recoverRemains', 'craft', 'alert', 'enchantSuccess', 'enchantBreak']);

  function play(name, { at = null, distance = 0, volume = 1 } = {}) {
    if (!SOUNDS[name]) return false;
    ensure();
    const now = audio.currentTime;
    while (voiceEnds.length && voiceEnds[0] < now) voiceEnds.shift();
    if (voiceEnds.length >= MAX_VOICES && !PRIORITY_SOUNDS.has(name)) return false;
    const loudness = volume * Math.max(0, 1 - distance / HEARING_DISTANCE);
    if (loudness <= 0.01) return false;
    const output = audio.createGain();
    output.gain.value = loudness;
    output.connect(nodes.effects);
    const end = SOUNDS[name](at ?? now + 0.01, output);
    voiceEnds.push(end);
    voiceEnds.sort((first, second) => first - second);
    return true;
  }

  function scheduleMusicBeat(at) {
    const chords = MOOD_CHORDS[music.mood];
    const beatsPerBar = 8;
    const bar = Math.floor(music.beat / beatsPerBar);
    const beatInBar = music.beat % beatsPerBar;
    const chord = chords[bar % chords.length];
    const bus = nodes.musicBus;
    if (beatInBar === 0) {
      const barSeconds = (60 / MUSIC_TEMPO) * 4;
      for (const note of chord) {
        const oscillator = audio.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.value = midiToFrequency(note - 12);
        oscillator.detune.value = (Math.random() - 0.5) * 10;
        const filter = audio.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = music.mood === 'gull' ? 500 : 900;
        const gain = audio.createGain();
        gain.gain.setValueAtTime(SILENT, at);
        gain.gain.linearRampToValueAtTime(0.045, at + barSeconds * 0.35);
        gain.gain.linearRampToValueAtTime(0.03, at + barSeconds * 0.85);
        gain.gain.linearRampToValueAtTime(SILENT, at + barSeconds * 1.08);
        oscillator.connect(filter).connect(gain).connect(bus);
        oscillator.start(at);
        oscillator.stop(at + barSeconds * 1.1);
      }
    }
    const melodyChance = music.mood === 'combat' ? 0.5 : beatInBar % 2 === 0 ? 0.42 : 0.18;
    if (Math.random() < melodyChance) {
      music.melodyNote = Math.max(0, Math.min(9, music.melodyNote + Math.round((Math.random() * 2 - 1) * 2)));
      const octave = Math.floor(music.melodyNote / 5);
      const note = MOOD_ROOTS[music.mood] + octave * 12 + PENTATONIC[music.melodyNote % 5] + (music.mood === 'gull' ? -12 : 0);
      if (Math.random() < 0.7) marimba(at, note, bus, 0.5 + Math.random() * 0.4);
      else kalimba(at, note + 12, bus, 0.5 + Math.random() * 0.3);
    }
    if (music.mood === 'combat') {
      if (beatInBar % 2 === 0) marimba(at, chord[0] - 12, bus, beatInBar === 0 ? 0.7 : 0.45);
      noise(at, 0.04, bus, { type: 'highpass', frequency: 6000, peak: beatInBar % 2 ? 0.035 : 0.02 });
    }
    music.beat++;
  }

  function musicTick() {
    if (!music.playing) return;
    const eighth = 60 / MUSIC_TEMPO / 2;
    while (music.nextBeat < audio.currentTime + MUSIC_LOOKAHEAD_SECONDS) {
      scheduleMusicBeat(music.nextBeat);
      music.nextBeat += eighth;
    }
  }

  function startMusic() {
    ensure();
    if (music.playing) return;
    music.playing = true;
    music.nextBeat = audio.currentTime + 0.1;
    music.beat = 0;
    music.timer = setInterval(musicTick, MUSIC_TICK_MILLISECONDS);
  }

  function stopMusic() {
    music.playing = false;
    clearInterval(music.timer);
  }

  function setMusicMood(mood) {
    if (!MOOD_CHORDS[mood] || music.mood === mood) return;
    music.mood = mood;
    music.beat = Math.ceil(music.beat / 8) * 8;
  }

  function startAmbience() {
    ensure();
    if (ambience.started) return;
    ambience.started = true;
    const waveSource = audio.createBufferSource();
    waveSource.buffer = noiseBuffer;
    waveSource.loop = true;
    const waveFilter = audio.createBiquadFilter();
    waveFilter.type = 'lowpass';
    waveFilter.frequency.value = 650;
    const waveSwell = audio.createGain();
    waveSwell.gain.value = 0;
    const waveLevel = audio.createGain();
    waveLevel.gain.value = ambience.waveIntensity * 0.5;
    waveSource.connect(waveFilter).connect(waveSwell).connect(waveLevel).connect(nodes.ambienceBus);
    waveSource.start();
    const windSource = audio.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;
    windSource.loopStart = 0.5;
    const windFilter = audio.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.8;
    const windLevel = audio.createGain();
    windLevel.gain.value = 0;
    windSource.connect(windFilter).connect(windLevel).connect(nodes.ambienceBus);
    windSource.start();
    const windWobble = audio.createOscillator();
    windWobble.frequency.value = 0.13;
    const windWobbleDepth = audio.createGain();
    windWobbleDepth.gain.value = 160;
    windWobble.connect(windWobbleDepth).connect(windFilter.frequency);
    windWobble.start();
    Object.assign(ambience, { waveSwell, waveLevel, waveFilter, windLevel, nextSwell: audio.currentTime });
    ambience.timer = setInterval(scheduleSwells, 500);
    scheduleSwells();
  }

  function scheduleSwells() {
    while (ambience.nextSwell < audio.currentTime + 2) {
      const at = ambience.nextSwell;
      const length = 5 + Math.random() * 4;
      const swell = ambience.waveSwell.gain;
      swell.setValueAtTime(0.18, at);
      swell.linearRampToValueAtTime(1, at + length * 0.35);
      swell.linearRampToValueAtTime(0.55, at + length * 0.55);
      swell.linearRampToValueAtTime(0.18, at + length);
      ambience.waveFilter.frequency.setValueAtTime(420, at);
      ambience.waveFilter.frequency.linearRampToValueAtTime(1100, at + length * 0.4);
      ambience.waveFilter.frequency.linearRampToValueAtTime(420, at + length);
      ambience.nextSwell = at + length;
    }
  }

  function setAmbience({ waveIntensity = ambience.waveIntensity, wind = ambience.wind, underwater = ambience.underwater } = {}) {
    Object.assign(ambience, { waveIntensity, wind, underwater });
    if (!nodes) return;
    const now = audio.currentTime;
    if (ambience.started) {
      ambience.waveLevel.gain.setTargetAtTime(waveIntensity * 0.5, now, 0.4);
      ambience.windLevel.gain.setTargetAtTime(wind * 0.35, now, 0.6);
    }
    nodes.underwaterFilter.frequency.setTargetAtTime(underwater ? 650 : 20000, now, 0.15);
  }

  function setVolumes({ music: musicVolume = volumes.music, effects: effectsVolume = volumes.effects } = {}) {
    Object.assign(volumes, { music: musicVolume, effects: effectsVolume });
    if (!nodes) return;
    nodes.musicBus.gain.setTargetAtTime(musicVolume, audio.currentTime, 0.05);
    nodes.effects.gain.setTargetAtTime(effectsVolume, audio.currentTime, 0.05);
    nodes.ambienceBus.gain.setTargetAtTime(effectsVolume, audio.currentTime, 0.05);
  }

  function unlock() {
    ensure();
    if (audio.state === 'suspended') audio.resume();
  }

  return {
    soundNames: Object.keys(SOUNDS),
    get context() {
      return ensure();
    },
    get activeVoices() {
      return voiceEnds.filter((end) => end > audio.currentTime).length;
    },
    unlock,
    play,
    renderSound: (name, at = 0) => {
      ensure();
      return SOUNDS[name](at, nodes.effects);
    },
    scheduleMusicBeat: (at) => {
      ensure();
      scheduleMusicBeat(at);
    },
    startMusic,
    stopMusic,
    setMusicMood,
    get musicMood() {
      return music.mood;
    },
    startAmbience,
    setAmbience,
    setVolumes,
    volumes,
  };
}
