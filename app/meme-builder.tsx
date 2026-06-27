"use client";

import {
  ChangeEvent,
  FormEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

type PickedImage = {
  id: string;
  title: string;
  url: string;
  width: number | null;
  height: number | null;
  type: string;
};

type TextLayer = {
  id: string;
  text: string;
  fontSize: number;
  fill: string;
  stroke: string;
  x: number;
  y: number;
};

type TextBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type ThemeMode = "system" | "light" | "dark";

const INITIAL_IMAGES: PickedImage[] = [
  {
    id: "sample-1",
    title: "サンプル画像",
    url: "/globe.svg",
    width: 512,
    height: 512,
    type: "image/svg+xml",
  },
];

const INITIAL_TEXTS: TextLayer[] = [
  {
    id: "text-1",
    text: "ここにテキスト",
    fontSize: 56,
    fill: "#ffffff",
    stroke: "#111827",
    x: 50,
    y: 85,
  },
];

function loadImage(src: string, needsCors: boolean) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (needsCors) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした。"));
    image.src = src;
  });
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines.length ? lines : [""];
}

function clampPercent(value: number) {
  return Math.min(95, Math.max(5, Math.round(value)));
}

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function subscribeToSystemTheme(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export default function MemeBuilder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const textBoundsRef = useRef(new Map<string, TextBounds>());
  const [images, setImages] = useState<PickedImage[]>(INITIAL_IMAGES);
  const [selected, setSelected] = useState<PickedImage>(INITIAL_IMAGES[0]);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [query, setQuery] = useState("meme");
  const [textLayers, setTextLayers] = useState<TextLayer[]>(INITIAL_TEXTS);
  const [activeTextId, setActiveTextId] = useState(INITIAL_TEXTS[0].id);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemTheme,
    () => "light",
  );
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [message, setMessage] = useState("");
  const isDarkMode =
    themeMode === "system" ? systemTheme === "dark" : themeMode === "dark";

  const activeText = useMemo(
    () => textLayers.find((layer) => layer.id === activeTextId) ?? textLayers[0],
    [activeTextId, textLayers],
  );

  const panelClass = isDarkMode
    ? "border-zinc-800 bg-zinc-900 text-zinc-50"
    : "border-zinc-200 bg-white text-zinc-950";
  const fieldClass = isDarkMode
    ? "border-zinc-700 bg-zinc-950 text-zinc-50 placeholder:text-zinc-500"
    : "border-zinc-300 bg-white text-zinc-950";
  const mutedPanelClass = isDarkMode
    ? "bg-zinc-800 text-zinc-200"
    : "bg-zinc-100 text-zinc-700";

  useEffect(() => {
    let cancelled = false;
    loadImage(selected.url, selected.url.startsWith("http"))
      .then((image) => {
        if (!cancelled) {
          setLoadedImage(image);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setLoadedImage(null);
          setMessage(error.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const updateActiveText = useCallback(
    (patch: Partial<TextLayer>) => {
      if (!activeText) {
        return;
      }

      setTextLayers((current) =>
        current.map((layer) =>
          layer.id === activeText.id ? { ...layer, ...patch } : layer,
        ),
      );
    },
    [activeText],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedImage) {
      return;
    }

    const maxWidth = 1100;
    const scale = Math.min(maxWidth / loadedImage.naturalWidth, 1);
    const width = Math.round(loadedImage.naturalWidth * scale) || 800;
    const height = Math.round(loadedImage.naturalHeight * scale) || 800;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#f3f4f6";
    context.fillRect(0, 0, width, height);
    context.drawImage(loadedImage, 0, 0, width, height);
    textBoundsRef.current.clear();

    textLayers.forEach((layer) => {
      const effectiveFontSize = Math.max(
        18,
        Math.min(layer.fontSize, Math.round(width / 6)),
      );
      context.font = `900 ${effectiveFontSize}px Arial, Helvetica, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineJoin = "round";
      context.fillStyle = layer.fill;
      context.strokeStyle = layer.stroke;
      context.lineWidth = Math.max(4, Math.round(effectiveFontSize / 9));

      const lines = wrapText(context, layer.text.toUpperCase(), width * 0.9);
      const lineHeight = effectiveFontSize * 1.12;
      const startY = (height * layer.y) / 100 - ((lines.length - 1) * lineHeight) / 2;
      const x = (width * layer.x) / 100;
      const longestLineWidth = lines.reduce(
        (longest, line) => Math.max(longest, context.measureText(line).width),
        0,
      );

      textBoundsRef.current.set(layer.id, {
        left: x - longestLineWidth / 2,
        right: x + longestLineWidth / 2,
        top: startY - effectiveFontSize / 2,
        bottom: startY + (lines.length - 1) * lineHeight + effectiveFontSize / 2,
      });

      lines.forEach((line, index) => {
        const y = startY + index * lineHeight;
        context.strokeText(line, x, y);
        context.fillText(line, x, y);
      });
    });
  }, [loadedImage, textLayers]);

  useEffect(() => {
    draw();
  }, [draw]);

  function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
      canvas,
    };
  }

  function moveTextToPoint(layerId: string, x: number, y: number, canvas: HTMLCanvasElement) {
    setTextLayers((current) =>
      current.map((layer) =>
        layer.id === layerId
          ? {
              ...layer,
              x: clampPercent((x / canvas.width) * 100),
              y: clampPercent((y / canvas.height) * 100),
            }
          : layer,
      ),
    );
  }

  function findTextAtPoint(x: number, y: number) {
    for (const layer of [...textLayers].reverse()) {
      const bounds = textBoundsRef.current.get(layer.id);
      if (!bounds) {
        continue;
      }

      const padding = Math.max(24, layer.fontSize * 0.35);
      const isInsideText =
        x >= bounds.left - padding &&
        x <= bounds.right + padding &&
        y >= bounds.top - padding &&
        y <= bounds.bottom + padding;

      if (isInsideText) {
        return layer;
      }
    }

    return null;
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }

    const hitText = findTextAtPoint(point.x, point.y);
    if (!hitText) {
      return;
    }

    setActiveTextId(hitText.id);
    const textCenterX = (point.canvas.width * hitText.x) / 100;
    const textCenterY = (point.canvas.height * hitText.y) / 100;
    dragOffsetRef.current = {
      x: point.x - textCenterX,
      y: point.y - textCenterY,
    };
    setIsDraggingText(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDraggingText) {
      return;
    }

    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }

    moveTextToPoint(
      activeTextId,
      point.x - dragOffsetRef.current.x,
      point.y - dragOffsetRef.current.y,
      point.canvas,
    );
  }

  function stopDragging(event: PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsDraggingText(false);
  }

  function addTextLayer() {
    const next: TextLayer = {
      id: `text-${Date.now()}`,
      text: "新しいテキスト",
      fontSize: 48,
      fill: "#ffffff",
      stroke: "#111827",
      x: 50,
      y: 50,
    };
    setTextLayers((current) => [...current, next]);
    setActiveTextId(next.id);
  }

  function deleteActiveText() {
    if (textLayers.length <= 1 || !activeText) {
      setMessage("テキストは最低1つ必要です。");
      return;
    }

    const nextLayers = textLayers.filter((layer) => layer.id !== activeText.id);
    setTextLayers(nextLayers);
    setActiveTextId(nextLayers[nextLayers.length - 1].id);
  }

  async function searchImgur(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/imgur?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "画像を取得できませんでした。");
      }

      const nextImages = payload.images as PickedImage[];
      setImages(nextImages.length ? nextImages : INITIAL_IMAGES);
      if (nextImages[0]) {
        setSelected(nextImages[0]);
      }
      setMessage(
        `Imgur から ${nextImages.length} 件取得しました。残り ${payload.rateLimit.remaining} 回です。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "画像を取得できませんでした。");
    } finally {
      setIsLoading(false);
    }
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("画像ファイルを選択してください。");
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const uploaded = {
      id: `upload-${file.name}-${file.lastModified}`,
      title: file.name,
      url,
      width: null,
      height: null,
      type: file.type,
    };

    setImages((current) => [uploaded, ...current]);
    setSelected(uploaded);
    setIsSourceMenuOpen(false);
    setMessage("アップロード画像を読み込みました。");
  }

  function saveImage() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          setMessage("保存用の画像を作成できませんでした。");
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "meme-builder.png";
        link.click();
        URL.revokeObjectURL(url);
        setSaveFlash(true);
        window.setTimeout(() => setSaveFlash(false), 900);
        setMessage("PNG として保存しました。");
      }, "image/png");
    } catch {
      setMessage("この画像はブラウザの制限により保存できません。別の画像を選択してください。");
    }
  }

  return (
    <main
      className={
        isDarkMode
          ? "h-[100dvh] overflow-hidden bg-zinc-950 text-zinc-50"
          : "h-[100dvh] overflow-hidden bg-stone-50 text-zinc-950"
      }
    >
      <div className="mx-auto grid h-full min-h-0 w-full max-w-7xl grid-rows-1 gap-2 px-2 py-2 sm:gap-3 sm:px-3 sm:py-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside
          className={`hidden min-h-0 animate-panel-in flex-col gap-2 overflow-hidden rounded-lg border p-2 shadow-sm transition-colors duration-300 sm:p-3 lg:flex ${panelClass}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-sm font-medium ${isDarkMode ? "text-cyan-300" : "text-cyan-700"}`}>
                ミームビルダー
              </p>
              <h1 className="text-xl font-bold sm:text-2xl">画像ソース</h1>
            </div>
            <div className={`grid grid-cols-3 rounded-md border p-1 ${fieldClass}`}>
              {(["system", "light", "dark"] as ThemeMode[]).map((mode) => (
                <button
                  key={mode}
                  className={`rounded px-2 py-1 text-xs font-semibold transition-all duration-200 hover:scale-105 active:scale-95 ${
                    themeMode === mode
                      ? "bg-cyan-600 text-white"
                      : isDarkMode
                        ? "text-zinc-300"
                        : "text-zinc-700"
                  }`}
                  onClick={() => setThemeMode(mode)}
                  type="button"
                >
                  {mode === "system" ? "Auto" : mode === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </div>

          <form className="grid gap-1" onSubmit={searchImgur}>
            <label className="text-xs font-semibold sm:text-sm" htmlFor="imgur-query">
              画像検索
            </label>
            <div className="flex gap-2">
              <input
                id="imgur-query"
                className={`min-w-0 flex-1 rounded-md border px-2 py-2 text-sm outline-none focus:border-cyan-600 ${fieldClass}`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="cat, reaction, anime..."
              />
              <button
                className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-600 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-zinc-400"
                disabled={isLoading}
                type="submit"
                onClick={() => setIsSourceMenuOpen(false)}
              >
                {isLoading ? "取得中" : "取得"}
              </button>
            </div>
          </form>

          <label
            className={`grid cursor-pointer gap-1 rounded-md border border-dashed p-2 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-600 ${
              isDarkMode ? "border-zinc-700" : "border-zinc-300"
            }`}
          >
            独自画像をアップロード
            <input className="text-sm" type="file" accept="image/*" onChange={handleUpload} />
          </label>

          <section className="grid min-h-0 gap-1">
            <h2 className="text-xs font-semibold sm:text-sm">画像ピッカー</h2>
            <div className="grid min-h-0 grid-cols-6 gap-1 overflow-hidden lg:grid-cols-3">
              {images.map((image) => (
                <button
                  key={image.id}
                  className={`aspect-square overflow-hidden rounded-md border transition-all duration-200 hover:scale-[1.03] active:scale-95 ${
                    selected.id === image.id
                      ? "border-cyan-600 ring-2 ring-cyan-300"
                      : isDarkMode
                        ? "border-zinc-700 bg-zinc-800"
                        : "border-zinc-200 bg-zinc-100"
                  }`}
                  onClick={() => setSelected(image)}
                  onPointerUp={() => setIsSourceMenuOpen(false)}
                  title={image.title}
                  type="button"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="h-full w-full object-cover" src={image.url} alt={image.title} />
                </button>
              ))}
            </div>
          </section>

          {message ? (
            <p className={`line-clamp-2 animate-toast-in rounded-md px-2 py-1 text-xs ${mutedPanelClass}`}>{message}</p>
          ) : null}
        </aside>

        <section
          className={`grid min-h-0 animate-panel-in grid-rows-[auto_minmax(0,1fr)_auto] gap-2 rounded-lg border p-2 shadow-sm transition-colors duration-300 sm:p-3 ${panelClass}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap gap-2">
              {textLayers.map((layer, index) => (
                <button
                  key={layer.id}
                  className={`rounded-md border px-2 py-1 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 sm:px-3 sm:py-2 sm:text-sm ${
                    layer.id === activeTextId
                      ? "animate-selected-tab border-cyan-500 bg-cyan-600 text-white"
                      : fieldClass
                  }`}
                  onClick={() => setActiveTextId(layer.id)}
                  type="button"
                >
                  Text {index + 1}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-md bg-cyan-700 px-2 py-1 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-600 active:translate-y-0 sm:px-3 sm:py-2 sm:text-sm"
                onClick={addTextLayer}
                type="button"
              >
                追加
              </button>
              <button
                className={`rounded-md border px-2 py-1 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 sm:px-3 sm:py-2 sm:text-sm ${fieldClass}`}
                onClick={deleteActiveText}
                type="button"
              >
                削除
              </button>
              <button
                className={`rounded-md px-2 py-1 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 sm:px-3 sm:py-2 sm:text-sm ${
                  saveFlash ? "animate-save-pop" : ""
                } ${
                  isDarkMode
                    ? "bg-cyan-500 text-zinc-950 hover:bg-cyan-400"
                    : "bg-zinc-950 text-white hover:bg-zinc-800"
                }`}
                onClick={saveImage}
                type="button"
              >
                保存
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 items-center justify-center overflow-hidden">
            {isLoading ? (
              <div className="absolute right-2 top-2 z-10 flex items-center gap-2 rounded-md bg-cyan-600 px-2 py-1 text-xs font-semibold text-white shadow">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Loading
              </div>
            ) : null}
            <canvas
              key={selected.id}
              ref={canvasRef}
              className={`animate-canvas-in max-h-full max-w-full touch-none rounded-md border object-contain transition-shadow duration-300 ${
                isDraggingText ? "cursor-grabbing" : "cursor-grab"
              } ${isDarkMode ? "border-zinc-700 bg-zinc-800 shadow-cyan-950/30" : "border-zinc-200 bg-zinc-100 shadow-zinc-300/40"}`}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
            />
          </div>

          {activeText ? (
            <div className={`animate-editor-in grid gap-2 rounded-lg border p-2 transition-colors duration-300 ${isDarkMode ? "border-zinc-800 bg-zinc-950" : "border-zinc-200 bg-stone-50"}`}>
              <textarea
                className={`h-14 resize-none rounded-md border px-2 py-1 text-sm outline-none focus:border-cyan-600 sm:h-16 ${fieldClass}`}
                value={activeText.text}
                onChange={(event) => updateActiveText({ text: event.target.value })}
              />
              <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-3">
                <label className="grid min-w-0 gap-1 text-xs font-medium sm:text-sm">
                  サイズ: {activeText.fontSize}px
                  <input
                    className="w-full min-w-0"
                    type="range"
                    min="18"
                    max="120"
                    value={activeText.fontSize}
                    onChange={(event) => updateActiveText({ fontSize: Number(event.target.value) })}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-xs font-medium sm:text-sm">
                  横位置: {activeText.x}%
                  <input
                    className="w-full min-w-0"
                    type="range"
                    min="5"
                    max="95"
                    value={activeText.x}
                    onChange={(event) => updateActiveText({ x: Number(event.target.value) })}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-xs font-medium sm:text-sm">
                  縦位置: {activeText.y}%
                  <input
                    className="w-full min-w-0"
                    type="range"
                    min="5"
                    max="95"
                    value={activeText.y}
                    onChange={(event) => updateActiveText({ y: Number(event.target.value) })}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
                <label className="grid gap-1 text-xs font-medium sm:text-sm">
                  文字色
                  <input
                    className="h-8 w-full rounded-md border border-zinc-300 sm:h-10"
                    type="color"
                    value={activeText.fill}
                    onChange={(event) => updateActiveText({ fill: event.target.value })}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium sm:text-sm">
                  縁取り
                  <input
                    className="h-8 w-full rounded-md border border-zinc-300 sm:h-10"
                    type="color"
                    value={activeText.stroke}
                    onChange={(event) => updateActiveText({ stroke: event.target.value })}
                  />
                </label>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <button
        className="fixed bottom-4 right-4 z-30 rounded-full bg-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-950/30 transition-all duration-200 hover:scale-105 active:scale-95 lg:hidden"
        onClick={() => setIsSourceMenuOpen((current) => !current)}
        type="button"
      >
        画像
      </button>

      {isSourceMenuOpen ? (
        <div className="fixed inset-0 z-20 lg:hidden">
          <button
            aria-label="画像メニューを閉じる"
            className="absolute inset-0 bg-black/45"
            onClick={() => setIsSourceMenuOpen(false)}
            type="button"
          />
          <aside
            className={`absolute bottom-16 right-3 flex max-h-[76dvh] w-[min(360px,calc(100vw-1.5rem))] animate-menu-in flex-col gap-2 overflow-hidden rounded-lg border p-3 shadow-2xl ${panelClass}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-sm font-medium ${isDarkMode ? "text-cyan-300" : "text-cyan-700"}`}>
                  
                </p>
                <h1 className="text-xl font-bold">画像ソース</h1>
              </div>
              <div className={`grid grid-cols-3 rounded-md border p-1 ${fieldClass}`}>
                {(["system", "light", "dark"] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`rounded px-2 py-1 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                      themeMode === mode
                        ? "bg-cyan-600 text-white"
                        : isDarkMode
                          ? "text-zinc-300"
                          : "text-zinc-700"
                    }`}
                    onClick={() => setThemeMode(mode)}
                    type="button"
                  >
                    {mode === "system" ? "Auto" : mode === "light" ? "Light" : "Dark"}
                  </button>
                ))}
              </div>
            </div>

            <form className="grid gap-1" onSubmit={searchImgur}>
              <label className="text-xs font-semibold" htmlFor="mobile-imgur-query">
                画像検索
              </label>
              <div className="flex gap-2">
                <input
                  id="mobile-imgur-query"
                  className={`min-w-0 flex-1 rounded-md border px-2 py-2 text-sm outline-none focus:border-cyan-600 ${fieldClass}`}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="cat, reaction, anime..."
                />
                <button
                  className="rounded-md bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:bg-zinc-400"
                  disabled={isLoading}
                  type="submit"
                >
                  {isLoading ? "取得中" : "取得"}
                </button>
              </div>
            </form>

            <label
              className={`grid cursor-pointer gap-1 rounded-md border border-dashed p-2 text-sm font-semibold hover:border-cyan-600 ${
                isDarkMode ? "border-zinc-700" : "border-zinc-300"
              }`}
            >
              独自画像をアップロード
              <input className="text-sm" type="file" accept="image/*" onChange={handleUpload} />
            </label>

            <section className="grid min-h-0 gap-1">
              <h2 className="text-xs font-semibold">画像ピッカー</h2>
              <div className="grid max-h-[30dvh] grid-cols-4 gap-1 overflow-auto pr-1">
                {images.map((image) => (
                  <button
                    key={image.id}
                    className={`aspect-square overflow-hidden rounded-md border transition-all duration-200 active:scale-95 ${
                      selected.id === image.id
                        ? "border-cyan-600 ring-2 ring-cyan-300"
                        : isDarkMode
                          ? "border-zinc-700 bg-zinc-800"
                          : "border-zinc-200 bg-zinc-100"
                    }`}
                    onClick={() => {
                      setSelected(image);
                      setIsSourceMenuOpen(false);
                    }}
                    title={image.title}
                    type="button"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="h-full w-full object-cover" src={image.url} alt={image.title} />
                  </button>
                ))}
              </div>
            </section>

            {message ? (
              <p className={`line-clamp-2 animate-toast-in rounded-md px-2 py-1 text-xs ${mutedPanelClass}`}>{message}</p>
            ) : null}
          </aside>
        </div>
      ) : null}
    </main>
  );
}
