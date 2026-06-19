import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

export function SignaturePad({
  onChange,
  height = 180,
}: {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
  }, []);

  const pointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    lastPoint.current = pointer(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !lastPoint.current) return;
    const p = pointer(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint.current = p;
    setEmpty(false);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    const dataUrl = canvasRef.current?.toDataURL("image/png") ?? null;
    onChange(dataUrl);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-xl border-2 border-dashed border-outline-variant bg-white"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {empty ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-secondary">
            Signez ici avec votre doigt ou votre souris
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={clear}
        className="inline-flex items-center gap-1 text-xs text-secondary hover:text-on-surface"
      >
        <Eraser className="h-3.5 w-3.5" /> Effacer
      </button>
    </div>
  );
}
