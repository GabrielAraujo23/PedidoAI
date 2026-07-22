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
        let controls: { stop: () => void } | null = null;
        let active = true;

        setPermState(null);
        setOtherError(null);
        setLoading(true);

        async function start() {
            try {
                const { BrowserMultiFormatReader } = await import("@zxing/browser");
                const reader = new BrowserMultiFormatReader();
                const devices = await BrowserMultiFormatReader.listVideoInputDevices();
                if (devices.length === 0) throw new Error("Nenhuma câmera encontrada.");

                const device = devices.find((d) =>
                    d.label.toLowerCase().includes("back") ||
                    d.label.toLowerCase().includes("traseira") ||
                    d.label.toLowerCase().includes("rear")
                ) ?? devices[0];

                if (!videoRef.current || !active) return;
                setLoading(false);

                controls = await reader.decodeFromVideoDevice(
                    device.deviceId,
                    videoRef.current,
                    (result) => {
                        if (result && active) onDetectedRef.current(result.getText());
                    }
                );
            } catch (e) {
                if (!active) return;
                const msg = e instanceof Error ? e.message : String(e);
                const isPermission =
                    msg.toLowerCase().includes("permission") ||
                    msg.toLowerCase().includes("denied") ||
                    msg.toLowerCase().includes("notallowed");
                if (isPermission) {
                    setPermState("denied");
                } else {
                    setOtherError(msg || "Erro ao acessar câmera.");
                }
                setLoading(false);
            }
        }

        start();

        return () => {
            active = false;
            controls?.stop();
        };
    }, [retryCount]);

    async function requestPermission() {
        setRequesting(true);
        try {
            // Triggers the browser's native permission dialog
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach((t) => t.stop());
            // Permission granted — restart scanner
            setRetryCount((c) => c + 1);
        } catch {
            // User clicked "Block" — show manual instructions
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
                    <video
                        ref={videoRef}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                        autoPlay
                    />

                    {/* Viewfinder corners — only when active */}
                    {!hasError && !loading && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-48 h-48 relative">
                                <span className="absolute top-0 left-0 w-8 h-8 border-orange-400 border-t-2 border-l-2" />
                                <span className="absolute top-0 right-0 w-8 h-8 border-orange-400 border-t-2 border-r-2" />
                                <span className="absolute bottom-0 left-0 w-8 h-8 border-orange-400 border-b-2 border-l-2" />
                                <span className="absolute bottom-0 right-0 w-8 h-8 border-orange-400 border-b-2 border-r-2" />
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-stone-900">
                            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                        </div>
                    )}

                    {/* Permission denied — browser can still prompt */}
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
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Aguardando permissão...</>
                                    : <><span>🎥</span> Solicitar acesso à câmera</>
                                }
                            </button>
                        </div>
                    )}

                    {/* Permission permanently blocked — manual steps */}
                    {permState === "blocked" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 p-6 text-center gap-4">
                            <span className="text-4xl">🔒</span>
                            <div>
                                <p className="text-amber-400 text-[14px] font-semibold mb-1">Câmera bloqueada</p>
                                <p className="text-white/50 text-[11px] leading-relaxed">
                                    Libere manualmente nas configurações do navegador:
                                </p>
                            </div>
                            <ol className="w-full text-left space-y-2.5">
                                <li className="flex gap-3 items-start">
                                    <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                                    <span className="text-white/70 text-[12px] leading-relaxed">Clique no ícone <strong className="text-white">🔒</strong> ou <strong className="text-white">📷</strong> na barra de endereços</span>
                                </li>
                                <li className="flex gap-3 items-start">
                                    <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                                    <span className="text-white/70 text-[12px] leading-relaxed">Localize <strong className="text-white">Câmera</strong> e mude para <strong className="text-white">Permitir</strong></span>
                                </li>
                                <li className="flex gap-3 items-start">
                                    <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                                    <span className="text-white/70 text-[12px] leading-relaxed">Clique em <strong className="text-white">Tentar novamente</strong> abaixo</span>
                                </li>
                            </ol>
                            <button
                                onClick={() => setRetryCount((c) => c + 1)}
                                className="w-full h-9 bg-stone-700 hover:bg-stone-600 text-white rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Tentar novamente
                            </button>
                        </div>
                    )}

                    {/* Non-permission errors */}
                    {otherError && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900 p-6 text-center gap-4">
                            <span className="text-3xl">⚠️</span>
                            <p className="text-red-400 text-[13px] leading-relaxed">{otherError}</p>
                            <button
                                onClick={() => setRetryCount((c) => c + 1)}
                                className="w-full h-9 bg-stone-700 hover:bg-stone-600 text-white rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Tentar novamente
                            </button>
                        </div>
                    )}
                </div>

                <p className="text-white/60 text-sm text-center mt-4">
                    Aponte a câmera para o código de barras do produto
                </p>
            </div>
        </div>
    );
}
