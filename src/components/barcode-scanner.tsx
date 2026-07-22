"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";

interface BarcodeScannerProps {
    onDetected: (barcode: string) => void;
    onClose: () => void;
}

export function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let reader: import("@zxing/browser").BrowserMultiFormatReader;
        let active = true;

        async function start() {
            try {
                const { BrowserMultiFormatReader } = await import("@zxing/browser");
                reader = new BrowserMultiFormatReader();
                const devices = await BrowserMultiFormatReader.listVideoInputDevices();
                if (devices.length === 0) throw new Error("Nenhuma câmera encontrada.");

                // Prefere câmera traseira
                const device = devices.find((d) =>
                    d.label.toLowerCase().includes("back") ||
                    d.label.toLowerCase().includes("traseira") ||
                    d.label.toLowerCase().includes("rear")
                ) ?? devices[devices.length - 1];

                if (!videoRef.current || !active) return;
                setLoading(false);

                await reader.decodeFromVideoDevice(
                    device.deviceId,
                    videoRef.current,
                    (result, err) => {
                        if (result && active) {
                            onDetected(result.getText());
                        }
                        if (err) {
                            // Frame errors are normal, ignore
                        }
                    }
                );
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : "Erro ao acessar câmera.");
                setLoading(false);
            }
        }

        start();

        return () => {
            active = false;
            reader?.reset();
        };
    }, [onDetected]);

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
                    />

                    {/* Viewfinder corners */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-48 relative">
                            {/* Top-left */}
                            <span className="absolute top-0 left-0 w-8 h-8 border-orange-400 border-t-2 border-l-2" />
                            {/* Top-right */}
                            <span className="absolute top-0 right-0 w-8 h-8 border-orange-400 border-t-2 border-r-2" />
                            {/* Bottom-left */}
                            <span className="absolute bottom-0 left-0 w-8 h-8 border-orange-400 border-b-2 border-l-2" />
                            {/* Bottom-right */}
                            <span className="absolute bottom-0 right-0 w-8 h-8 border-orange-400 border-b-2 border-r-2" />
                        </div>
                    </div>

                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-stone-900">
                            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                        </div>
                    )}

                    {error && (
                        <div className="absolute inset-0 flex items-center justify-center bg-stone-900 p-6 text-center">
                            <p className="text-red-400 text-sm">{error}</p>
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
