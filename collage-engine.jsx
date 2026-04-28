import { useState, useRef, useCallback, useEffect } from "react";

const ASPECTS = {
  square:     { label: "SQUARE",     w: 1080, h: 1080 },
  horizontal: { label: "HORIZONTAL", w: 1920, h: 1080 },
  vertical:   { label: "VERTICAL",   w: 1080, h: 1920 },
};

function mkRand(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export default function CollageEngine() {
  const [imgs, setImgs] = useState([]);
  const [chaos, setChaos] = useState(0.4);
  const [seed, setSeed] = useState(1337);
  const [aspect, setAspect] = useState("horizontal");
  const [grunge, setGrunge] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [count, setCount] = useState(0);
  const [converting, setConverting] = useState(false);
  const canvasRef = useRef(null);
  const grainRef = useRef(null);

  const W = ASPECTS[aspect].w;
  const H = ASPECTS[aspect].h;

  const loadHeic2any = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (window.heic2any) return resolve(window.heic2any);
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
      s.onload = () => resolve(window.heic2any);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }, []);

  useEffect(() => {
    const g = document.createElement("canvas");
    g.width = 256; g.height = 256;
    const gc = g.getContext("2d");
    const id = gc.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.random() * 255 | 0;
      id.data[i] = id.data[i+1] = id.data[i+2] = v;
      id.data[i+3] = Math.random() * 22 | 0;
    }
    gc.putImageData(id, 0, 0);
    grainRef.current = g;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rand = mkRand(seed);

    ctx.clearRect(0, 0, W, H);

    // 1. Seeded dark background hue
    const BG_PALETTES = [
      [15, 10, 10],   // near-black warm
      [8, 10, 18],    // near-black cold blue
      [10, 14, 10],   // near-black olive
      [14, 8, 16],    // near-black purple
      [16, 10, 8],    // near-black burgundy
      [8, 14, 16],    // near-black teal
      [14, 12, 8],    // near-black khaki
      [10, 10, 10],   // pure near-black
    ];
    const pal = BG_PALETTES[Math.floor(rand() * BG_PALETTES.length)];
    ctx.fillStyle = `rgb(${pal[0]},${pal[1]},${pal[2]})`;
    ctx.fillRect(0, 0, W, H);

    // 5. Torn color blocks — chaos drives position, size, and color
    const blockCount = 2 + Math.floor(rand() * 3);
    const BLOCK_PALETTES = [
      [80, 30, 30],   // dark red
      [30, 40, 90],   // dark blue
      [35, 75, 40],   // dark green
      [80, 30, 85],   // dark purple
      [90, 35, 20],   // dark orange
      [20, 75, 80],   // dark teal
      [80, 75, 20],   // dark yellow
      [75, 30, 55],   // dark magenta
      [25, 60, 75],   // dark cyan
    ];
    const blockRand = mkRand(seed ^ 0xcafe1234);
    for (let b = 0; b < blockCount; b++) {
      // chaos blends between two seeded color picks
      const bp1 = BLOCK_PALETTES[Math.floor(blockRand() * BLOCK_PALETTES.length)];
      const bp2 = BLOCK_PALETTES[Math.floor(blockRand() * BLOCK_PALETTES.length)];
      const r = Math.round(bp1[0] + (bp2[0] - bp1[0]) * chaos);
      const g = Math.round(bp1[1] + (bp2[1] - bp1[1]) * chaos);
      const bv = Math.round(bp1[2] + (bp2[2] - bp1[2]) * chaos);

      const alpha = 0.65 + chaos * 0.25;

      // chaos offsets position from seed anchor
      const baseCx = blockRand() * W;
      const baseCy = blockRand() * H;
      const chaosCx = blockRand() * W;
      const chaosCy = blockRand() * H;
      const cx = baseCx + (chaosCx - baseCx) * chaos;
      const cy = baseCy + (chaosCy - baseCy) * chaos;

      // chaos drives size — more chaos = bigger, wilder blocks
      const baseW = 0.28 + blockRand() * 0.28;
      const baseH = 0.20 + blockRand() * 0.28;
      const bw = W * (baseW + chaos * 0.22);
      const bh = H * (baseH + chaos * 0.18);

      const angle = (blockRand() - 0.5) * (0.18 + chaos * 0.28);

      // torn edge jag scales with chaos
      const jag = () => (blockRand() - 0.5) * (18 + chaos * 52);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(-bw / 2 + jag(), -bh / 2 + jag());
      ctx.lineTo(-bw / 4 + jag(), -bh / 2 + jag());
      ctx.lineTo( bw / 2 + jag(), -bh / 2 + jag());
      ctx.lineTo( bw / 2 + jag(),  bh / 4 + jag());
      ctx.lineTo( bw / 2 + jag(),  bh / 2 + jag());
      ctx.lineTo( bw / 4 + jag(),  bh / 2 + jag());
      ctx.lineTo(-bw / 2 + jag(),  bh / 2 + jag());
      ctx.lineTo(-bw / 2 + jag(), -bh / 4 + jag());
      ctx.closePath();
      ctx.fillStyle = `rgb(${r},${g},${bv})`;
      ctx.fill();
      ctx.restore();
    }

    if (!imgs.length) return;

    // Each image gets a base z-score from seed, then chaos perturbs it
    // so moving the slider continuously reshuffles layer order
    const n = imgs.length;
    const baseZ = Array.from({ length: n }, () => rand());
    // chaos-driven second shuffle score — different RNG stream
    const chaosRand = mkRand(seed ^ 0xdeadbeef);
    const chaosZ = Array.from({ length: n }, () => chaosRand());
    const zScore = baseZ.map((b, i) => b * (1 - chaos) + chaosZ[i] * chaos);
    const order = [...Array(n).keys()].sort((a, b) => zScore[a] - zScore[b]);
    // zRank: 0 = deepest background, 1 = top foreground
    const zRank = new Array(n);
    order.forEach((imgIdx, rank) => { zRank[imgIdx] = rank / Math.max(1, n - 1); });
    const placed = [];
    const MAX_TRIES = 120;
    const MAX_OVERLAP = 0.40; // max fraction of area that can overlap

    const getBox = (cx, cy, dw, dh, angle) => ({
      cx, cy, dw, dh, angle,
      hw: (Math.abs(dw * Math.cos(angle)) + Math.abs(dh * Math.sin(angle))) / 2,
      hh: (Math.abs(dw * Math.sin(angle)) + Math.abs(dh * Math.cos(angle))) / 2,
    });

    const overlapFraction = (box) => {
      // check against all placed boxes, return worst overlap fraction vs this box's area
      let worst = 0;
      for (const p of placed) {
        const ox = Math.max(0, Math.min(box.cx + box.hw, p.cx + p.hw) - Math.max(box.cx - box.hw, p.cx - p.hw));
        const oy = Math.max(0, Math.min(box.cy + box.hh, p.cy + p.hh) - Math.max(box.cy - box.hh, p.cy - p.hh));
        const intersection = ox * oy;
        const boxArea = box.dw * box.dh;
        const frac = intersection / boxArea;
        if (frac > worst) worst = frac;
      }
      return worst;
    };

    for (const i of order) {
      const img = imgs[i];
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (!iw || !ih) continue;

      const zoom = 1 + rand() * chaos * 0.65;
      const sw = iw / zoom;
      const sh = ih / zoom;
      const sx = rand() * (iw - sw);
      const sy = rand() * (ih - sh);
      const maxDeg = 8 + chaos * 14;
      const angle = (rand() - 0.5) * 2 * maxDeg * (Math.PI / 180);

      const baseSize = 0.22 + rand() * 0.26 + chaos * 0.1;
      let dw = W * baseSize;
      let dh = dw / (iw / ih);
      if (dh > H * 0.72) { dh = H * 0.72; dw = dh * (iw / ih); }

      const tempBox = getBox(0, 0, dw, dh, angle);
      const padX = tempBox.hw + 2;
      const padY = tempBox.hh + 2;

      let bestBox = null;
      let bestOverlap = Infinity;

      for (let t = 0; t < MAX_TRIES; t++) {
        const cx = padX + rand() * Math.max(1, W - padX * 2);
        const cy = padY + rand() * Math.max(1, H - padY * 2);
        const box = getBox(cx, cy, dw, dh, angle);
        const frac = overlapFraction(box);

        if (frac < bestOverlap) {
          bestOverlap = frac;
          bestBox = box;
          if (frac <= MAX_OVERLAP) break; // good enough, stop searching
        }
      }

      // always place — use best found position even if overlap > 40%
      const { cx, cy } = bestBox;
      placed.push(bestBox);

      // depth cues: background = more faded + slightly smaller, foreground = sharp + full size
      const depth = zRank[i]; // 0 = back, 1 = front
      const alpha = 0.45 + depth * 0.55;
      const depthScale = 0.82 + depth * 0.18;
      const rdw = dw * depthScale;
      const rdh = dh * depthScale;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = "source-over";
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      const grungeRand = mkRand(seed ^ (i * 0xf1e2d3 + 1));
      if (grunge > 0) {
        const sat  = 1 - grunge * (0.3 + grungeRand() * 0.5);
        const cont = 1 + grunge * (0.05 + grungeRand() * 0.15);
        const sep  = grunge * (0.08 + grungeRand() * 0.22);
        ctx.filter = `saturate(${sat.toFixed(2)}) contrast(${cont.toFixed(2)}) sepia(${sep.toFixed(2)})`;
      }
      ctx.drawImage(img, sx, sy, sw, sh, -rdw / 2, -rdh / 2, rdw, rdh);
      ctx.filter = "none";

      if (grunge > 0) {
        // scratches
        const scratchCount = Math.floor(grunge * 6 * grungeRand() + grunge * 2);
        ctx.strokeStyle = `rgba(255,245,220,${(0.12 + grungeRand() * 0.18).toFixed(2)})`;
        ctx.lineWidth = 0.5 + grungeRand() * 0.8;
        for (let s = 0; s < scratchCount; s++) {
          const x1 = (grungeRand() - 0.5) * rdw;
          const y1 = (grungeRand() - 0.5) * rdh;
          const len = rdw * (0.2 + grungeRand() * 0.5);
          const ang = (grungeRand() - 0.5) * 0.4;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1 + Math.cos(ang) * len, y1 + Math.sin(ang) * len);
          ctx.stroke();
        }

        // vignette
        if (grunge > 0.05) {
          const vgAlpha = grunge * (0.4 + grungeRand() * 0.35);
          const grad = ctx.createRadialGradient(0, 0, rdw * 0.25, 0, 0, rdw * 0.75);
          grad.addColorStop(0, "rgba(0,0,0,0)");
          grad.addColorStop(1, `rgba(0,0,0,${vgAlpha.toFixed(2)})`);
          ctx.globalAlpha = alpha;
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = grad;
          ctx.fillRect(-rdw / 2, -rdh / 2, rdw, rdh);
          ctx.globalCompositeOperation = "source-over";
        }

        // per-image grain
        if (grainRef.current && grunge > 0.05) {
          const pat = ctx.createPattern(grainRef.current, "repeat");
          ctx.globalAlpha = grunge * (0.06 + grungeRand() * 0.08);
          ctx.globalCompositeOperation = "overlay";
          ctx.fillStyle = pat;
          ctx.fillRect(-rdw / 2, -rdh / 2, rdw, rdh);
          ctx.globalCompositeOperation = "source-over";
        }
      }

      if (rand() > 0.62) {
        ctx.globalAlpha = 0.07 + rand() * 0.1;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = rand() > 0.5 ? 0.5 : 1;
        ctx.strokeRect(-rdw / 2, -rdh / 2, rdw, rdh);
      }
      ctx.restore();
    }

    if (grainRef.current) {
      try {
        const pat = ctx.createPattern(grainRef.current, "repeat");
        ctx.globalAlpha = 0.055 + chaos * 0.035;
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, W, H);
      } catch {}
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }, [imgs, chaos, seed, aspect, grunge]);

  useEffect(() => { draw(); }, [draw]);

  const loadFiles = useCallback(async (files) => {
    const valid = Array.from(files).filter(f =>
      f.type.startsWith("image/") ||
      /\.(heic|heif)$/i.test(f.name)
    );
    if (!valid.length) return;

    const isHeicFile = f => /\.(heic|heif)$/i.test(f.name) || f.type === "image/heic" || f.type === "image/heif";
    const hasHeic = valid.some(isHeicFile);

    let h2a = null;
    if (hasHeic) {
      setConverting(true);
      try { h2a = await loadHeic2any(); } catch (e) { console.error("heic2any load failed", e); }
    }

    const toDataURL = (blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const loadImage = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

    const results = await Promise.allSettled(
      valid.map(async f => {
        let blob = f;
        if (isHeicFile(f) && h2a) {
          const converted = await h2a({ blob: f, toType: "image/jpeg", quality: 0.92 });
          blob = Array.isArray(converted) ? converted[0] : converted;
        }
        const dataUrl = await toDataURL(blob);
        return loadImage(dataUrl);
      })
    );

    const loaded = results.filter(r => r.status === "fulfilled").map(r => r.value);
    if (loaded.length) setImgs(p => { const next = [...p, ...loaded]; setCount(next.length); return next; });
    setConverting(false);
  }, [loadHeic2any]);

  const handleDrop = (e) => { e.preventDefault(); setDragging(false); loadFiles(e.dataTransfer.files); };
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };

  const [exportUrl, setExportUrl] = useState(null);

  const exportPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      const reader = new FileReader();
      reader.onload = () => setExportUrl(reader.result);
      reader.readAsDataURL(blob);
    }, "image/png");
  };

  const closeExport = () => setExportUrl(null);

  const reroll = () => setSeed(Math.random() * 99999 | 0);
  const clear = () => { setImgs([]); setCount(0); };

  const S = {
    root: {
      background: "#0c0c0c",
      height: "100vh",
      fontFamily: '"IBM Plex Mono", "Courier New", monospace',
      color: "#c8c4bc",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      padding: "14px",
      boxSizing: "border-box",
      overflow: "hidden",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: "9px",
      letterSpacing: "0.22em",
      color: "#333",
      userSelect: "none",
    },
    canvasWrap: {
      position: "relative",
      border: `1px solid ${dragging ? "#ff2a2a" : "#1c1c1c"}`,
      transition: "border-color 0.15s",
      lineHeight: 0,
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      minHeight: 0,
    },
    canvas: {
      aspectRatio: `${W}/${H}`,
      maxWidth: "100%",
      maxHeight: "100%",
      width: "auto",
      height: "auto",
      display: "block",
    },
    emptyState: {
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: "6px", pointerEvents: "none",
    },
    controls: {
      display: "flex", gap: "10px",
      alignItems: "center", flexWrap: "wrap",
    },
    sliderGroup: {
      display: "flex", alignItems: "center",
      gap: "5px", flex: "1 1 180px", minWidth: "160px",
    },
    label: { fontSize: "9px", letterSpacing: "0.18em", whiteSpace: "nowrap", userSelect: "none" },
  };

  const btn = (bg = "#181818", fg = "#c8c4bc", accent = false) => ({
    background: bg,
    color: accent ? "#0c0c0c" : fg,
    border: `1px solid ${accent ? "#ff2a2a" : "#282828"}`,
    padding: "7px 14px",
    fontSize: "9px",
    letterSpacing: "0.18em",
    fontFamily: "inherit",
    cursor: "pointer",
    outline: "none",
    whiteSpace: "nowrap",
  });

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=range] {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 1px; background: #2a2a2a; outline: none; cursor: pointer;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 10px; height: 10px;
          background: #ff2a2a; border-radius: 0; cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 10px; height: 10px; background: #ff2a2a;
          border: none; border-radius: 0; cursor: pointer;
        }
        button:hover { opacity: 0.7; }
        label:hover { opacity: 0.7; }
      `}</style>
      <div style={S.root}>
        <div style={S.header}>
          <span>COLLAGE.ENGINE — v0.1</span>
          <span>{count} IMG{count !== 1 ? "S" : ""} — SEED {seed}</span>
        </div>

        {exportUrl && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: "14px", zIndex: 100, padding: "20px",
          }}>
            <div style={{ fontSize: "9px", letterSpacing: "0.22em", color: "#555" }}>
              HOLD / RIGHT-CLICK IMAGE TO SAVE
            </div>
            <img
              src={exportUrl}
              alt="collage export"
              style={{ maxWidth: "100%", maxHeight: "75vh", display: "block", border: "1px solid #222" }}
            />
            <button onClick={closeExport} style={{ ...btn(), color: "#555", borderColor: "#222" }}>
              ✕ CLOSE
            </button>
          </div>
        )}

        <div
          style={S.canvasWrap}
          onDragOver={handleDragOver}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <canvas ref={canvasRef} width={W} height={H} style={S.canvas} />
          {!imgs.length && (
            <div style={S.emptyState}>
              {[
                "UPLOAD photos via the button below, or drag & drop onto the canvas",
                "RANDOMIZE to shuffle the layout, or set a seed to lock a composition",
                "ORDER ←→ CHAOS controls image layering and depth",
                "SQUARE / HORIZONTAL / VERTICAL sets the canvas shape",
                "EXPORT to preview the finished collage, then right-click to save",
              ].map((line, i) => (
                <div key={i} style={{ fontSize: "10.8px", letterSpacing: "0.14em", color: "#ffffff", opacity: 1, lineHeight: "2", textAlign: "center" }}>
                  — {line}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={S.controls}>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", flex: "1 1 180px", minWidth: "160px" }}>
            <div style={S.sliderGroup}>
              <span style={{ ...S.label, color: "#3a3a3a" }}>ORDER</span>
              <input
                type="range" min="0" max="1" step="0.01"
                value={chaos}
                onChange={e => setChaos(parseFloat(e.target.value))}
              />
              <span style={{ ...S.label, color: "#ff2a2a" }}>CHAOS</span>
            </div>
            <div style={S.sliderGroup}>
              <span style={{ ...S.label, color: "#3a3a3a" }}>CLEAN</span>
              <input
                type="range" min="0" max="1" step="0.01"
                value={grunge}
                onChange={e => setGrunge(parseFloat(e.target.value))}
              />
              <span style={{ ...S.label, color: "#ff2a2a" }}>GRUNGE</span>
            </div>
          </div>

          <button onClick={reroll} style={btn()}>↻ RANDOMIZE</button>

          <div style={{ display: "flex", gap: "4px" }}>
            {Object.entries(ASPECTS).map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => setAspect(key)}
                style={{
                  ...btn(),
                  borderColor: aspect === key ? "#ff2a2a" : "#282828",
                  color: aspect === key ? "#ff2a2a" : "#3a3a3a",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <label style={{ ...btn(), display: "inline-block", cursor: converting ? "wait" : "pointer", opacity: converting ? 0.5 : 1 }}>
            {converting ? "CONVERTING..." : "+ UPLOAD"}
            <input
              type="file" multiple accept="image/*,.heic,.heif"
              onChange={e => loadFiles(e.target.files)}
              style={{ display: "none" }}
              disabled={converting}
            />
          </label>

          {imgs.length > 0 && (
            <>
              <button onClick={exportPNG} style={btn("#ff2a2a", "#0c0c0c", true)}>
                ↓ EXPORT PNG
              </button>
              <button onClick={clear} style={{ ...btn(), color: "#2e2e2e", borderColor: "#1a1a1a" }}>
                CLEAR
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
