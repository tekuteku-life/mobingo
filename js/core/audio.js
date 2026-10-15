/**
 * Synthesizer sound generator using Web Audio API
 */

class SoundManager {
	constructor() {
		this.ctx = null;
		this.isMuted = false;
	}

	initContext() {
		if (!this.ctx && typeof window !== "undefined") {
			const AudioCtx = window.AudioContext || window.webkitAudioContext;
			if (AudioCtx) {
				this.ctx = new AudioCtx();
			}
		}
		if (this.ctx && this.ctx.state === "suspended") {
			this.ctx.resume().catch(() => {});
		}
	}

	unlock() {
		this.initContext();
		if (this.ctx && this.ctx.state === "suspended") {
			this.ctx.resume().catch(() => {});
		}
	}

	setMuted(muted) {
		this.isMuted = muted;
	}

	getMuted() {
		return this.isMuted;
	}

	// 1. Tactile Punch Sound ("Pako!")
	playPunch() {
		if (this.isMuted) return;
		this.initContext();
		if (!this.ctx) return;

		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc.type = "sine";
		osc.frequency.setValueAtTime(360, t);
		osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);

		gain.gain.setValueAtTime(0.7, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

		osc.connect(gain);
		gain.connect(this.ctx.destination);

		osc.start(t);
		osc.stop(t + 0.1);
	}

	// 2. Cell Restore Pop Sound ("Pon!")
	playRestore() {
		if (this.isMuted) return;
		this.initContext();
		if (!this.ctx) return;

		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc.type = "sine";
		osc.frequency.setValueAtTime(180, t);
		osc.frequency.exponentialRampToValueAtTime(520, t + 0.12);

		gain.gain.setValueAtTime(0.5, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

		osc.connect(gain);
		gain.connect(this.ctx.destination);

		osc.start(t);
		osc.stop(t + 0.15);
	}

	// 3. Barrel Rolling / Drumroll
	playRoll(durationMs = 1800) {
		if (this.isMuted) return;
		this.initContext();
		if (!this.ctx) return;

		const ctx = this.ctx;
		const startTime = ctx.currentTime;
		const clicks = 25;
		const step = (durationMs / 1000) / clicks;

		for (let i = 0; i < clicks; i++) {
			const clickTime = startTime + i * step + (Math.random() * 0.01 - 0.005);
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();

			osc.type = "triangle";
			osc.frequency.setValueAtTime(400 + Math.random() * 200, clickTime);

			gain.gain.setValueAtTime(0.2, clickTime);
			gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.03);

			osc.connect(gain);
			gain.connect(ctx.destination);

			osc.start(clickTime);
			osc.stop(clickTime + 0.035);
		}
	}

	// 4. Ball Ejection Ding / Clang
	playBallEjected() {
		if (this.isMuted) return;
		this.initContext();
		if (!this.ctx) return;

		const t = this.ctx.currentTime;
		const notes = [587.33, 880, 1174.66];
		notes.forEach((freq, idx) => {
			if (!this.ctx) return;
			const osc = this.ctx.createOscillator();
			const gain = this.ctx.createGain();

			osc.type = "sine";
			osc.frequency.setValueAtTime(freq, t + idx * 0.03);

			gain.gain.setValueAtTime(0.4 / (idx + 1), t + idx * 0.03);
			gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

			osc.connect(gain);
			gain.connect(this.ctx.destination);

			osc.start(t + idx * 0.03);
			osc.stop(t + 0.65);
		});
	}

	// 5. QR Scan Success Beep ("Pi-pi!")
	playScanBeep() {
		if (this.isMuted) return;
		this.initContext();
		if (!this.ctx) return;

		const t = this.ctx.currentTime;
		[0, 0.08].forEach((offset) => {
			if (!this.ctx) return;
			const osc = this.ctx.createOscillator();
			const gain = this.ctx.createGain();

			osc.type = "sine";
			osc.frequency.setValueAtTime(2200, t + offset);

			gain.gain.setValueAtTime(0.3, t + offset);
			gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.05);

			osc.connect(gain);
			gain.connect(this.ctx.destination);

			osc.start(t + offset);
			osc.stop(t + offset + 0.06);
		});
	}

	// 6. Bingo Fanfare
	playFanfare() {
		if (this.isMuted) return;
		this.initContext();
		if (!this.ctx) return;

		const t = this.ctx.currentTime;
		const melody = [
			{ f: 523.25, time: 0, dur: 0.12 },
			{ f: 523.25, time: 0.14, dur: 0.12 },
			{ f: 523.25, time: 0.28, dur: 0.12 },
			{ f: 659.25, time: 0.42, dur: 0.28 },
			{ f: 783.99, time: 0.72, dur: 0.2 },
			{ f: 1046.50, time: 0.95, dur: 0.8 },
		];

		melody.forEach((n) => {
			if (!this.ctx) return;
			const osc = this.ctx.createOscillator();
			const gain = this.ctx.createGain();

			osc.type = "triangle";
			osc.frequency.setValueAtTime(n.f, t + n.time);

			gain.gain.setValueAtTime(0.4, t + n.time);
			gain.gain.exponentialRampToValueAtTime(0.001, t + n.time + n.dur);

			osc.connect(gain);
			gain.connect(this.ctx.destination);

			osc.start(t + n.time);
			osc.stop(t + n.time + n.dur + 0.05);
		});
	}

	// 7. Hot Number Alert (Patlamp siren)
	playHotAlert() {
		if (this.isMuted) return;
		this.initContext();
		if (!this.ctx) return;

		const t = this.ctx.currentTime;
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();

		osc.type = "sawtooth";
		for (let i = 0; i < 4; i++) {
			const step = t + i * 0.15;
			osc.frequency.setValueAtTime(700, step);
			osc.frequency.linearRampToValueAtTime(1100, step + 0.07);
			osc.frequency.linearRampToValueAtTime(700, step + 0.14);
		}

		gain.gain.setValueAtTime(0.2, t);
		gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

		osc.connect(gain);
		gain.connect(this.ctx.destination);

		osc.start(t);
		osc.stop(t + 0.65);
	}

	// 8. Special Rule Unlock Chime
	playSpecialUnlock() {
		if (this.isMuted) return;
		this.initContext();
		if (!this.ctx) return;

		const t = this.ctx.currentTime;
		const freqs = [1046.5, 1318.5, 1567.98, 1975.53, 2093.0];
		freqs.forEach((freq, idx) => {
			if (!this.ctx) return;
			const osc = this.ctx.createOscillator();
			const gain = this.ctx.createGain();

			osc.type = "sine";
			osc.frequency.setValueAtTime(freq, t + idx * 0.06);

			gain.gain.setValueAtTime(0.35, t + idx * 0.06);
			gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 0.25);

			osc.connect(gain);
			gain.connect(this.ctx.destination);

			osc.start(t + idx * 0.06);
			osc.stop(t + idx * 0.06 + 0.28);
		});
	}
}

export const soundManager = new SoundManager();

