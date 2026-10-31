/**
 * Realistic Bingo Drum / Cage Canvas Component
 * Simulates a classic wire-mesh rotary bingo cage with tumbling physics and colorful balls.
 */

export class BingoBarrel {
	constructor(canvas) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.animId = null;

		this.isSpinning = false;
		this.rotationAngle = 0;
		this.rotationSpeed = 0;

		// Physical balls inside the drum
		this.balls = [];
		this.initBalls();

		// Ejected ball animation state
		this.ejectedBall = null; // { value, letter, color, x, y, size, progress, opacity }

		// Resize handling with ResizeObserver
		this.width = 300;
		this.height = 300;
		this.updateSize();

		if (typeof ResizeObserver !== "undefined") {
			this.resizeObserver = new ResizeObserver(() => {
				this.updateSize();
				this.draw();
			});
			this.resizeObserver.observe(this.canvas);
		}

		this.draw();
	}

	destroy() {
		if (this.animId) {
			cancelAnimationFrame(this.animId);
			this.animId = null;
		}
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
	}

	updateSize() {
		const rect = this.canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		this.width = rect.width || 280;
		this.height = rect.height || 280;

		this.canvas.width = Math.round(this.width * dpr);
		this.canvas.height = Math.round(this.height * dpr);
		this.ctx.resetTransform?.();
		this.ctx.scale(dpr, dpr);
	}

	initBalls() {
		const colors = [
			{ bg: "#ef4444", text: "#fff" }, // Red B
			{ bg: "#f97316", text: "#fff" }, // Orange I
			{ bg: "#eab308", text: "#000" }, // Yellow N
			{ bg: "#22c55e", text: "#fff" }, // Green G
			{ bg: "#3b82f6", text: "#fff" }, // Blue O
			{ bg: "#a855f7", text: "#fff" }, // Purple
		];

		this.balls = [];
		const numBalls = 22;
		for (let i = 0; i < numBalls; i++) {
			const col = colors[i % colors.length];
			const r = 11 + (i % 3);
			// Spawn near bottom
			const angle = Math.PI * 0.5 + (Math.random() * 1.2 - 0.6);
			const dist = Math.random() * 55;
			this.balls.push({
				x: Math.cos(angle) * dist,
				y: Math.sin(angle) * dist + 15,
				vx: (Math.random() - 0.5) * 2,
				vy: (Math.random() - 0.5) * 2,
				r,
				bg: col.bg,
				textColor: col.text,
				num: (i * 3 + 7) % 75 + 1,
			});
		}
	}

	startSpin() {
		this.isSpinning = true;
		this.rotationSpeed = 0.22; // Initial fast rotational velocity
		this.ejectedBall = null;

		if (!this.animId) {
			this.loop = this.loop.bind(this);
			this.animId = requestAnimationFrame(this.loop);
		}
	}

	stopSpin(ejectedNum = null) {
		this.isSpinning = false;
		this.rotationSpeed = 0.05;

		if (ejectedNum !== null) {
			const getLetter = (n) => {
				if (n <= 15) return "B";
				if (n <= 30) return "I";
				if (n <= 45) return "N";
				if (n <= 60) return "G";
				return "O";
			};
			const getColor = (n) => {
				if (n <= 15) return "#ef4444";
				if (n <= 30) return "#f97316";
				if (n <= 45) return "#eab308";
				if (n <= 60) return "#22c55e";
				return "#3b82f6";
			};

			this.ejectedBall = {
				value: ejectedNum,
				letter: getLetter(ejectedNum),
				color: getColor(ejectedNum),
				x: 0,
				y: 65,
				size: 14,
				targetSize: 58,
				progress: 0,
				opacity: 0,
			};
		}
	}

	loop() {
		this.update();
		this.draw();

		// Continue loop if spinning or if ejected ball is animating or balls are settling
		if (this.isSpinning || this.rotationSpeed > 0.005 || (this.ejectedBall && this.ejectedBall.progress < 1)) {
			this.animId = requestAnimationFrame(this.loop);
		} else {
			this.animId = null;
			this.rotationSpeed = 0;
		}
	}

	update() {
		this.rotationAngle += this.rotationSpeed;

		if (!this.isSpinning) {
			this.rotationSpeed *= 0.94; // Friction damping
		}

		const cageRadius = 78;

		// Physics update for tumble balls
		for (const ball of this.balls) {
			if (this.isSpinning) {
				// Drag along with cage rotation
				const tangX = -ball.y;
				const tangY = ball.x;
				ball.vx += tangX * 0.012 + (Math.random() - 0.5) * 1.5;
				ball.vy += tangY * 0.012 + (Math.random() - 0.5) * 1.5;
			}

			// Gravity pulls down
			ball.vy += 0.38;

			// Air resistance
			ball.vx *= 0.96;
			ball.vy *= 0.96;

			ball.x += ball.vx;
			ball.y += ball.vy;

			// Circular cage wall boundary collision
			const dist = Math.hypot(ball.x, ball.y);
			const maxDist = cageRadius - ball.r;
			if (dist > maxDist) {
				const nx = ball.x / dist;
				const ny = ball.y / dist;
				ball.x = nx * maxDist;
				ball.y = ny * maxDist;

				// Bounce reflection with restitution
				const dot = ball.vx * nx + ball.vy * ny;
				ball.vx = (ball.vx - 1.6 * dot * nx) * 0.75;
				ball.vy = (ball.vy - 1.6 * dot * ny) * 0.75;
			}
		}

		// Ejected ball animation
		if (this.ejectedBall && this.ejectedBall.progress < 1) {
			this.ejectedBall.progress += 0.04;
			if (this.ejectedBall.progress > 1) this.ejectedBall.progress = 1;

			// Ease out cubic
			const p = this.ejectedBall.progress;
			const ease = 1 - Math.pow(1 - p, 3);

			this.ejectedBall.opacity = Math.min(1, p * 2.5);
			this.ejectedBall.size = 14 + (this.ejectedBall.targetSize - 14) * ease;
			this.ejectedBall.y = 65 + (0 - 65) * ease; // Moves to center (0,0)
		}
	}

	draw() {
		const ctx = this.ctx;
		const cx = this.width / 2;
		const cy = this.height / 2;

		ctx.clearRect(0, 0, this.width, this.height);
		ctx.save();
		ctx.translate(cx, cy);

		const baseScale = Math.min(this.width, this.height) / 240;
		ctx.scale(baseScale, baseScale);

		const cageR = 82;

		// 1. Stand / Support Legs (Metallic Tri-pod / A-frame behind cage)
		ctx.strokeStyle = "#475569";
		ctx.lineWidth = 4;
		ctx.lineCap = "round";

		// Left leg
		ctx.beginPath();
		ctx.moveTo(-15, 0);
		ctx.lineTo(-cageR - 18, cageR + 32);
		ctx.stroke();

		// Right leg
		ctx.beginPath();
		ctx.moveTo(15, 0);
		ctx.lineTo(cageR + 18, cageR + 32);
		ctx.stroke();

		// Cross-bar base
		ctx.strokeStyle = "#334155";
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.moveTo(-cageR - 28, cageR + 32);
		ctx.lineTo(cageR + 28, cageR + 32);
		ctx.stroke();

		// 2. Chute / Ball Collector at bottom
		ctx.strokeStyle = "#64748b";
		ctx.lineWidth = 3;
		ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
		ctx.beginPath();
		ctx.arc(0, cageR - 6, 18, Math.PI * 0.1, Math.PI * 0.9);
		ctx.lineTo(24, cageR + 18);
		ctx.lineTo(-24, cageR + 18);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();

		// 3. Cage Back Wires (Rotating)
		ctx.save();
		ctx.rotate(this.rotationAngle);

		ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
		ctx.lineWidth = 1.2;
		const wires = 14;
		for (let i = 0; i < wires; i++) {
			const a = (i * Math.PI * 2) / wires;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(Math.cos(a) * cageR, Math.sin(a) * cageR);
			ctx.stroke();
		}
		// Inner concentric wire rings
		[cageR * 0.45, cageR * 0.75].forEach((r) => {
			ctx.beginPath();
			ctx.arc(0, 0, r, 0, Math.PI * 2);
			ctx.stroke();
		});
		ctx.restore();

		// 4. Tumbling Balls Inside Cage
		for (const b of this.balls) {
			ctx.save();
			ctx.translate(b.x, b.y);

			// Ball shadow
			ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
			ctx.beginPath();
			ctx.arc(1.5, 2, b.r, 0, Math.PI * 2);
			ctx.fill();

			// Ball sphere gradient (3D look)
			const grad = ctx.createRadialGradient(
				-b.r * 0.35,
				-b.r * 0.35,
				b.r * 0.1,
				0,
				0,
				b.r
			);
			grad.addColorStop(0, "#ffffff");
			grad.addColorStop(0.3, b.bg);
			grad.addColorStop(1, "#0f172a");

			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.arc(0, 0, b.r, 0, Math.PI * 2);
			ctx.fill();

			// Mini number
			ctx.fillStyle = b.textColor;
			ctx.font = `bold ${Math.round(b.r * 0.85)}px sans-serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(b.num, 0, 0.5);

			ctx.restore();
		}

		// 5. Cage Front Wires & Outer Rim (Rotating)
		ctx.save();
		ctx.rotate(this.rotationAngle);

		// Outer brass/chrome rim
		const rimGrad = ctx.createLinearGradient(-cageR, -cageR, cageR, cageR);
		rimGrad.addColorStop(0, "#fbbf24");
		rimGrad.addColorStop(0.5, "#94a3b8");
		rimGrad.addColorStop(1, "#f59e0b");

		ctx.strokeStyle = rimGrad;
		ctx.lineWidth = 4.5;
		ctx.beginPath();
		ctx.arc(0, 0, cageR, 0, Math.PI * 2);
		ctx.stroke();

		// Wire grid lines on front
		ctx.strokeStyle = "rgba(226, 232, 240, 0.4)";
		ctx.lineWidth = 1.5;
		for (let i = 0; i < wires; i++) {
			const a = (i * Math.PI * 2) / wires;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(Math.cos(a) * cageR, Math.sin(a) * cageR);
			ctx.stroke();
		}
		ctx.restore();

		// 6. Central Axle & Turning Crank Handle
		// Center axle hub
		ctx.fillStyle = "#334155";
		ctx.strokeStyle = "#94a3b8";
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.arc(0, 0, 11, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();

		// Crank handle
		ctx.save();
		ctx.rotate(this.rotationAngle);
		ctx.strokeStyle = "#f59e0b";
		ctx.lineWidth = 4;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(26, -14);
		ctx.lineTo(26, -34);
		ctx.stroke();

		// Wooden handle knob
		ctx.fillStyle = "#b45309";
		ctx.beginPath();
		ctx.arc(26, -34, 6.5, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();

		// 7. Ejected Ball Zoom Animation (Req 3.1)
		if (this.ejectedBall && this.ejectedBall.opacity > 0) {
			const eb = this.ejectedBall;
			ctx.save();
			ctx.translate(eb.x, eb.y);
			ctx.globalAlpha = eb.opacity;

			// Glow behind ejected ball
			ctx.shadowColor = eb.color;
			ctx.shadowBlur = 24;

			// Ball 3D Gradient
			const grad = ctx.createRadialGradient(
				-eb.size * 0.35,
				-eb.size * 0.35,
				eb.size * 0.1,
				0,
				0,
				eb.size
			);
			grad.addColorStop(0, "#ffffff");
			grad.addColorStop(0.35, eb.color);
			grad.addColorStop(1, "#090d16");

			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.arc(0, 0, eb.size, 0, Math.PI * 2);
			ctx.fill();

			// White center circle for number label
			ctx.shadowBlur = 0;
			ctx.fillStyle = "#ffffff";
			ctx.beginPath();
			ctx.arc(0, 0, eb.size * 0.58, 0, Math.PI * 2);
			ctx.fill();

			// Letter & Number text
			ctx.fillStyle = "#0f172a";
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";

			const letterSize = Math.max(8, eb.size * 0.28);
			const numSize = Math.max(12, eb.size * 0.56);

			ctx.font = `900 ${letterSize}px sans-serif`;
			ctx.fillText(eb.letter, 0, -eb.size * 0.22);

			ctx.font = `900 ${numSize}px ui-monospace, SFMono-Regular, monospace`;
			ctx.fillText(eb.value, 0, eb.size * 0.16);

			ctx.restore();
		}

		ctx.restore();
	}

}
