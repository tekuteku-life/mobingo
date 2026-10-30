interface Window {
	webkitAudioContext?: typeof AudioContext;
	QRCode?: {
		toCanvas(canvas: HTMLCanvasElement, text: string, options: {
			width: number; margin: number; color: { dark: string; light: string };
		}): Promise<void>;
	};
	jsQR?: (data: Uint8ClampedArray, width: number, height: number,
		options?: { inversionAttempts: string }) => { data: string } | null;
}
