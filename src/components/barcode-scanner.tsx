"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, RefreshCw } from "lucide-react";

interface BarcodeScannerProps {
    onDetected: (barcode: string) => void;
    onClose: () => void;
}

type PermState = "denied" | "blocked" | null;

export function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [permState, setPermState] = useState<PermState>(null);
    const [otherError, setOtherError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [retryCount, setRetryCount] = useState(0);
    const [requesting, setRequesting] = useState(false);

    const onDetectedRef = useRef(onDetected);
    useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

    useEffect(() => {
        let stream: MediaStream | null = null;
        let animId: number | null = null;
        let active = true;
        let detected = false;

        setPermState(null);
        setOtherError(null);
        setLoading(true);

        async function start() {
            // Guard: getUserMedia requires HTTPS or localhost
            if (!navigator.mediaDevices?.getUserMedia) {
                if (active) {
                    setOtherError("Câmera indisponível. Use HTTPS ou acesse via Chrome/Safari moderno.");
                    setLoading(false);
                }
                return;
            }

            try {
                // 1. Request camera stream directly — works on iOS, Android, desktop
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: "environment" }, // back camera on mobile
                        width:  { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                });

                if (!videoRef.current || !active) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }

                // 2. Attach stream to <video> and wait for playback to start
                const video = videoRef.current;
                video.srcObject = stream;
                try { await video.play(); } catch { /* some browsers auto-play with muted */ }

                if (active) setLoading(false);

                // 3. Load ZXing reader (already in node_modules, no extra install)
                const {
                    MultiFormatReader,
                    BinaryBitmap,
                    HTMLCanvasElementLuminanceSource,
                    HybridBinarizer,
                    DecodeHintType,
                    BarcodeFormat,
                } = await import("@zxing/library");

                const hints = new Map();
                hints.set(DecodeHintType.POSSIBLE_FORMATS, [
                    BarcodeFormat.EAN_13,
                    BarcodeFormat.EAN_8,
                    BarcodeFormat.CODE_128,
                    BarcodeFormat.CODE_39,
                    BarcodeFormat.UPC_A,
                    BarcodeFormat.UPC_E,
                    BarcodeFormat.QR_CODE,
                    BarcodeFormat.DATA_MATRIX,
                ]);
                hints.set(DecodeHintType.TRY_HARDER, true);

                const reader = new MultiFormatReader();
                reader.setHints(hints);

                // Offscreen canvas for frame capture
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d", { willReadFrequently: true });

                // Throttle: decode at ~10 fps to avoid blocking the main thread
                let lastAttempt = 0;

                // 4. RAF decode loop — runs until cleanup or first detection
                function decodeFrame(now: number) {
                    if (!active || detected || !ctx) return;

                    if (now - lastAttempt >= 100 && video.readyState >= 2 && video.videoWidth > 0) {
                        lastAttempt = now;
                        canvas.width  = video.videoWidth;
                        canvas.height = video.videoHeight;
                        ctx.drawImage(video, 0, 0);

                        try {
                            const luminance = new HTMLCanvasElementLuminanceSource(canvas);
                            const bitmap    = new BinaryBitmap(new HybridBinarizer(luminance));
                            const result    = reader.decode(bitmap);
                            if (result && active && !detected) {
                                detected = true;
                                onDetectedRef.current(result.getText());
                                return; // parent will unmount → cleanup runs
                            }
                        } catch {
                            // NotFoundException is thrown for every frame without a barcode — expected
                        }
                    }

                    animId = requestAnimationFrame(decodeFrame);
                }

                if (active) animId = requestAnimationFrame(decodeFrame);

            } catch (e) {
                if (!active) return;
                const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
                if (/permission|denied|notallowed/.test(msg)) {
                    setPermState("denied");
                } else {
                    setOtherError((e instanceof Error ? e.message : String(e)) || "Erro ao acessar câmera.");
                }
                setLoading(false);
            }
        }

        start();

        return () => {
            active = false;
            if (animId !== null) cancelAnimationFrame(animId);
            if (stream) stream.getTracks().forEach((t) => t.stop());
        };
    }, [retryCount]);

    async function requestPermission() {
        setRequesting(true);
        try {
            const s = await navigator.mediaDevices.getUserMedia({ video: true });
            s.getTracks().forEach((t) => t.stop());
            setRetryCount((c) => c + 1);
        } catch {
            setPermState("blocked");
        } finally {
            setRequesting(false);
        }
    }

    const hasError = permState !== null || otherError !== null;

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
            <div className="relative w-full max-w-sm">
                <button
                    onClick={onClose}
                    className="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>

                <div className="relative rounded-2xl overflow-hidden bg-stone-900 aspect-square">
                    {/* The video element is always mounted so srcObject can be set */}
                    <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                        autoPlay
                    />

                    {/* Viewfinder — shown only while actively scanning */}
                    {!hasError && !loading && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-52 h-52 relative">
                                <span className="absolute top-0 left-0 w-8 h-8 border-orange-400 border-t-[3px] border-l-[3px] rounded-tl-sm" />
                                <span className="absolute top-0 right-0 w-8 h-8 border-orange-400 border-t-[3px] border-r-[3px] rounded-tr-sm" />
                                <span className="absolute bottom-0 left-0 w-8 h-8 border-orange-400 border-b-[3px] border-l-[3px] rounded-bl-sm" />
                                <span className="absolute bottom-0 right-0 w-8 h-8 border-orange-400 border-b-[3px] border-r-[3px] rounded-br-sm" />
                                {/* Scan line animation */}
                                <div className="absolute left-1 right-1 top-0 h-0.5 bg-orange-400/80 animate-[scanline_2s_ease-in-out_infinite]" />
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 gap-3">
                            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                            <p className="text-white/50 text-[12px]">Iniciando câmera…</p>
                        </div>
                    )}

                    {/* Permission denied — can re-prompt */}
                    {permState === "denied" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 p-6 text-center gap-4">
                            <span className="text-4xl">📷</span>
                            <div>
                                <p className="text-white text-[14px] font-semibold mb-1">Câmera sem permissão</p>
                                <p className="text-white/50 text-[12px] leading-relaxed">
                                    Clique abaixo para solicitar acesso. O navegador irá exibir um aviso de permissão.
                                </p>
                            </div>
                            <button
                                onClick={requestPermission}
                                disabled={requesting}
                                className="w-full h-10 bg-orange-500 hover:bg-orange-400 disabled:opacity-60 text-white rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-2"
                            >
                                {requesting
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Aguardando…</>
                                    : <><span>🎥</span> Solicitar acesso à câmera</>
                                }
                            </button>
                        </div>
                    )}

                    {/* Permission permanently blocked */}
                    {permState === "blocked" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 p-6 text-center gap-4">
                            <span className="text-4xl">🔒</span>
                            <div>
                                <p className="text-amber-400 text-[14px] font-semibold mb-1">Câmera bloqueada</p>
                                <p className="text-white/50 text-[11px] leading-relaxed">Libere manualmente:</p>
                            </div>
                            <ol className="w-full text-left space-y-2.5">
                                {[
                                    <>Clique no ícone <strong className="text-white">🔒</strong> ou <strong className="text-white">📷</strong> na barra de endereços</>,
                                    <>Localize <strong className="text-white">Câmera</strong> → mude para <strong className="text-white">Permitir</strong></>,
                                    <>Clique em <strong className="text-white">Tentar novamente</strong> abaixo</>,
                                ].map((step, i) => (
                                    <li key={i} className="flex gap-3 items-start">
                                        <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                        <span className="text-white/70 text-[12px] leading-relaxed">{step}</span>
                                    </li>
                                ))}
                            </ol>
                            <button
                                onClick={() => setRetryCount((c) => c + 1)}
                                className="w-full h-9 bg-stone-700 hover:bg-stone-600 text-white rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                            </button>
                        </div>
                    )}

                    {/* Other errors */}
                    {otherError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 p-6 text-center gap-4">
                            <span className="text-3xl">⚠️</span>
                            <p className="text-red-400 text-[13px] leading-relaxed">{otherError}</p>
                            <button
                                onClick={() => setRetryCount((c) => c + 1)}
                                className="w-full h-9 bg-stone-700 hover:bg-stone-600 text-white rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                            </button>
                        </div>
                    )}
                </div>

                <p className="text-white/50 text-[13px] text-center mt-4">
                    Aponte para o código de barras do produto
                </p>
            </div>
        </div>
    );
}
