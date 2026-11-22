// Cyber-Virtual Synthesizer Audio Engine (Web Audio API)
class CyberAudio {
  constructor() {
    this.enabled = true;
    this.musicEnabled = true;
    this.ctx = null;
    this.ambientInterval = null;
    this.step = 0;

    // Load saved sound preference
    try {
      const saved = localStorage.getItem('cybercity_sound');
      if (saved !== null) {
        this.enabled = JSON.parse(saved);
      }
    } catch (e) {}
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setEnabled(val) {
    this.enabled = !!val;
    try {
      localStorage.setItem('cybercity_sound', JSON.stringify(this.enabled));
    } catch (e) {}
    if (!this.enabled) {
      this.stopAmbient();
    } else {
      this.startAmbient();
    }
  }

  toggle() {
    this.setEnabled(!this.enabled);
    if (this.enabled) this.playClick();
    return this.enabled;
  }

  playTone(freq, type = 'sine', duration = 0.08, gainVal = 0.08, slideTo = null) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    }

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  playClick() {
    this.playTone(880, 'triangle', 0.05, 0.06, 1320);
  }

  playPlace() {
    this.playTone(320, 'sine', 0.09, 0.08, 640);
    setTimeout(() => this.playTone(640, 'triangle', 0.08, 0.05, 960), 45);
  }

  playDemolish() {
    this.playTone(220, 'sawtooth', 0.16, 0.07, 65);
  }

  playError() {
    this.playTone(160, 'sawtooth', 0.12, 0.07, 120);
    setTimeout(() => this.playTone(130, 'sawtooth', 0.15, 0.07, 95), 90);
  }

  playUpgrade() {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, i) => {
      setTimeout(() => this.playTone(n, 'triangle', 0.12, 0.05), i * 55);
    });
  }

  playMegaCombo() {
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((n, i) => {
      setTimeout(() => this.playTone(n, 'sine', 0.22, 0.07), i * 65);
    });
  }

  playAlert() {
    this.playTone(587.33, 'square', 0.1, 0.04, 440);
  }

  startAmbient() {
    if (!this.enabled || this.ambientInterval) return;
    const scale = [110, 130.81, 146.83, 164.81, 196.00, 220, 261.63, 293.66];
    this.ambientInterval = setInterval(() => {
      if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
      const freq = scale[this.step % scale.length];
      this.step = (this.step + 3) % scale.length;
      this.playTone(freq, 'sine', 1.4, 0.012, freq * 1.005);
    }, 1800);
  }

  stopAmbient() {
    if (this.ambientInterval) {
      clearInterval(this.ambientInterval);
      this.ambientInterval = null;
    }
  }
}

window.cyberAudio = new CyberAudio();
