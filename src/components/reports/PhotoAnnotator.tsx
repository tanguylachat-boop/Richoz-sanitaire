'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Save, Undo2, Trash2, Type,
  MoveRight, Circle, Square, Minus, Eraser, Loader2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type Tool = 'arrow' | 'circle' | 'rectangle' | 'text' | 'line' | 'eraser';
type StrokeWidth = 'fin' | 'moyen' | 'epais';

interface DrawAction {
  tool: Tool;
  color: string;
  strokeWidth: number;
  points: { x: number; y: number }[];
  text?: string;
  fontSize?: number;
}

interface PhotoAnnotatorProps {
  photoUrl: string;
  onSave: (newUrl: string) => void;
  onCancel: () => void;
  storagePath?: string;
}

const STROKE_WIDTHS: Record<StrokeWidth, number> = {
  fin: 2,
  moyen: 4,
  epais: 8,
};

const STROKE_LABELS: Record<StrokeWidth, string> = {
  fin: 'Fin',
  moyen: 'Moyen',
  epais: 'Épais',
};

const COLOR = '#ef4444';
const ERASER_RADIUS = 20;

export default function PhotoAnnotator({ photoUrl, onSave, onCancel, storagePath }: PhotoAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [tool, setTool] = useState<Tool>('arrow');
  const [strokeWidthKey, setStrokeWidthKey] = useState<StrokeWidth>('moyen');
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputPos, setTextInputPos] = useState({ x: 0, y: 0 });
  const [textValue, setTextValue] = useState('');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  // Store natural image dimensions for export
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

  const strokeWidth = STROKE_WIDTHS[strokeWidthKey];

  // Load image and set canvas size
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      setImageLoaded(true);
    };
    img.onerror = () => {
      toast.error('Impossible de charger la photo');
      onCancel();
    };
    img.src = photoUrl;
  }, [photoUrl, onCancel]);

  // Resize canvas to fit container while maintaining aspect ratio
  const updateCanvasSize = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const img = imageRef.current;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    let w: number, h: number;
    if (containerW / containerH > imgRatio) {
      h = containerH;
      w = h * imgRatio;
    } else {
      w = containerW;
      h = w / imgRatio;
    }
    setCanvasSize({ width: Math.floor(w), height: Math.floor(h) });
  }, []);

  useEffect(() => {
    if (imageLoaded) {
      updateCanvasSize();
      window.addEventListener('resize', updateCanvasSize);
      return () => window.removeEventListener('resize', updateCanvasSize);
    }
  }, [imageLoaded, updateCanvasSize]);

  // Draw everything
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const img = imageRef.current;
    if (!canvas || !ctx || !img) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const allActions = currentAction ? [...actions, currentAction] : actions;
    for (const action of allActions) {
      if (action.tool === 'eraser') continue;
      drawAction(ctx, action);
    }
  }, [actions, currentAction]);

  useEffect(() => {
    if (canvasSize.width > 0) redraw();
  }, [canvasSize, redraw]);

  function drawAction(ctx: CanvasRenderingContext2D, action: DrawAction) {
    ctx.strokeStyle = action.color;
    ctx.fillStyle = action.color;
    ctx.lineWidth = action.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pts = action.points;
    if (pts.length === 0) return;

    switch (action.tool) {
      case 'line': {
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
        break;
      }
      case 'arrow': {
        if (pts.length < 2) return;
        const start = pts[0];
        const end = pts[pts.length - 1];
        // Shaft
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        // Arrowhead
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLen = Math.max(15, action.strokeWidth * 4);
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
          end.x - headLen * Math.cos(angle - Math.PI / 6),
          end.y - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(
          end.x - headLen * Math.cos(angle + Math.PI / 6),
          end.y - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
        break;
      }
      case 'circle': {
        if (pts.length < 2) return;
        const cx = (pts[0].x + pts[pts.length - 1].x) / 2;
        const cy = (pts[0].y + pts[pts.length - 1].y) / 2;
        const rx = Math.abs(pts[pts.length - 1].x - pts[0].x) / 2;
        const ry = Math.abs(pts[pts.length - 1].y - pts[0].y) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'rectangle': {
        if (pts.length < 2) return;
        const x = Math.min(pts[0].x, pts[pts.length - 1].x);
        const y = Math.min(pts[0].y, pts[pts.length - 1].y);
        const w = Math.abs(pts[pts.length - 1].x - pts[0].x);
        const h = Math.abs(pts[pts.length - 1].y - pts[0].y);
        ctx.strokeRect(x, y, w, h);
        break;
      }
      case 'text': {
        if (!action.text) return;
        const fontSize = action.fontSize || 20;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillText(action.text, pts[0].x, pts[0].y);
        break;
      }
    }
  }

  function getCanvasPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (showTextInput) return;
    const pos = getCanvasPos(e);

    if (tool === 'text') {
      setTextInputPos(pos);
      setTextValue('');
      setShowTextInput(true);
      return;
    }

    if (tool === 'eraser') {
      // Remove any action whose points are near the click
      setActions((prev) =>
        prev.filter((a) => {
          return !a.points.some(
            (p) => Math.hypot(p.x - pos.x, p.y - pos.y) < ERASER_RADIUS
          );
        })
      );
      setIsDrawing(true);
      return;
    }

    setIsDrawing(true);
    setCurrentAction({
      tool,
      color: COLOR,
      strokeWidth,
      points: [pos],
    });
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);

    if (tool === 'eraser') {
      setActions((prev) =>
        prev.filter((a) => {
          return !a.points.some(
            (p) => Math.hypot(p.x - pos.x, p.y - pos.y) < ERASER_RADIUS
          );
        })
      );
      return;
    }

    if (!currentAction) return;
    setCurrentAction({
      ...currentAction,
      points: [...currentAction.points, pos],
    });
  }

  function handlePointerUp() {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentAction && currentAction.points.length >= 2) {
      setActions((prev) => [...prev, currentAction]);
    }
    setCurrentAction(null);
  }

  function handleTextConfirm() {
    if (textValue.trim()) {
      const fontSize = strokeWidth * 6 + 8;
      setActions((prev) => [
        ...prev,
        {
          tool: 'text',
          color: COLOR,
          strokeWidth,
          points: [textInputPos],
          text: textValue.trim(),
          fontSize,
        },
      ]);
    }
    setShowTextInput(false);
    setTextValue('');
  }

  function handleUndo() {
    setActions((prev) => prev.slice(0, -1));
  }

  function handleClearAll() {
    setActions([]);
  }

  async function handleSave() {
    if (!imageRef.current) return;
    setIsSaving(true);

    try {
      // Create an export canvas at the natural image resolution
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = naturalSize.width;
      exportCanvas.height = naturalSize.height;
      const ctx = exportCanvas.getContext('2d')!;

      // Draw the original image at full resolution
      ctx.drawImage(imageRef.current, 0, 0, naturalSize.width, naturalSize.height);

      // Scale factor from display to natural
      const scaleX = naturalSize.width / canvasSize.width;
      const scaleY = naturalSize.height / canvasSize.height;

      // Redraw all actions scaled up
      for (const action of actions) {
        if (action.tool === 'eraser') continue;
        const scaledAction: DrawAction = {
          ...action,
          strokeWidth: action.strokeWidth * scaleX,
          fontSize: action.fontSize ? action.fontSize * scaleX : undefined,
          points: action.points.map((p) => ({
            x: p.x * scaleX,
            y: p.y * scaleY,
          })),
        };
        drawAction(ctx, scaledAction);
      }

      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        exportCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas blob failed'))),
          'image/jpeg',
          0.92
        );
      });

      // Upload to Supabase Storage
      const supabase = createClient();
      const timestamp = Date.now();
      const path = storagePath
        ? `${storagePath}/annotated_${timestamp}.jpg`
        : `annotated-photos/annotated_${timestamp}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        // Fallback to photos bucket
        const { error: fallbackError } = await supabase.storage
          .from('photos')
          .upload(path, blob, {
            contentType: 'image/jpeg',
            upsert: false,
          });
        if (fallbackError) throw fallbackError;

        const { data: urlData } = supabase.storage.from('photos').getPublicUrl(path);
        onSave(urlData.publicUrl);
      } else {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        onSave(urlData.publicUrl);
      }

      toast.success('Photo annotée sauvegardée');
    } catch (error) {
      console.error('Erreur sauvegarde annotation:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  }

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'arrow', icon: <MoveRight className="w-5 h-5" />, label: 'Flèche' },
    { id: 'circle', icon: <Circle className="w-5 h-5" />, label: 'Cercle' },
    { id: 'rectangle', icon: <Square className="w-5 h-5" />, label: 'Rectangle' },
    { id: 'line', icon: <Minus className="w-5 h-5" />, label: 'Trait' },
    { id: 'text', icon: <Type className="w-5 h-5" />, label: 'Texte' },
    { id: 'eraser', icon: <Eraser className="w-5 h-5" />, label: 'Gomme' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-1">
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              className={`p-2.5 rounded-lg transition-colors ${
                tool === t.id
                  ? 'bg-red-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {t.icon}
            </button>
          ))}

          <div className="w-px h-8 bg-gray-600 mx-2" />

          {/* Stroke width */}
          <div className="flex items-center gap-1">
            {(Object.keys(STROKE_WIDTHS) as StrokeWidth[]).map((key) => (
              <button
                key={key}
                onClick={() => setStrokeWidthKey(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  strokeWidthKey === key
                    ? 'bg-gray-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {STROKE_LABELS[key]}
              </button>
            ))}
          </div>

          <div className="w-px h-8 bg-gray-600 mx-2" />

          {/* Undo / Clear */}
          <button
            onClick={handleUndo}
            disabled={actions.length === 0}
            title="Annuler"
            className="p-2.5 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 className="w-5 h-5" />
          </button>
          <button
            onClick={handleClearAll}
            disabled={actions.length === 0}
            title="Tout effacer"
            className="p-2.5 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 px-4 py-2 text-gray-300 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4" />
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || actions.length === 0}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden p-4"
      >
        {!imageLoaded ? (
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-gray-400 animate-spin mx-auto mb-3" />
            <p className="text-gray-400">Chargement de la photo...</p>
          </div>
        ) : (
          <div className="relative" style={{ width: canvasSize.width, height: canvasSize.height }}>
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className={`rounded-lg ${
                tool === 'eraser'
                  ? 'cursor-cell'
                  : tool === 'text'
                  ? 'cursor-text'
                  : 'cursor-crosshair'
              }`}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            />

            {/* Floating text input */}
            {showTextInput && (
              <div
                className="absolute"
                style={{ left: textInputPos.x, top: textInputPos.y }}
              >
                <div className="flex items-center gap-1 bg-white rounded-lg shadow-lg p-1">
                  <input
                    type="text"
                    autoFocus
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTextConfirm();
                      if (e.key === 'Escape') {
                        setShowTextInput(false);
                        setTextValue('');
                      }
                    }}
                    placeholder="Texte..."
                    className="px-2 py-1 text-sm border-none focus:outline-none w-40"
                  />
                  <button
                    onClick={handleTextConfirm}
                    className="px-2 py-1 bg-red-500 text-white text-xs rounded font-medium hover:bg-red-600"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
