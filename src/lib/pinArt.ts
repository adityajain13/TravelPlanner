/*
 * Map pin artwork, drawn on a canvas at 2x: a glossy teardrop in the day's colour with a white
 * rim and soft shadow, and a white badge on the head holding the stop number (or a plane/H).
 * One image per colour+label, so overlapping pins stack whole.
 */

export const PIN = { w: 38, h: 50, tipY: 45 } as const; // logical px; the tip sits 5px above the bottom (shadow below)

/** Lucide icon outlines (24×24, ISC licence) drawn in the badge for bookings and airports. */
export const GLYPHS = {
  "plane": "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  "bed": "M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8 M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4 M12 4v6 M2 18h20",
  "car": "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2 M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M9 17h6 M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  "train": "M8 3.1V7a4 4 0 0 0 8 0V3.1 M9 15 l-1-1 M15 15 l1-1 M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z M8 19 l-2 3 M16 19 l2 3",
  "food": "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
  "ticket": "M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z M13 5v2 M13 17v2 M13 11v2"
} as const;
export type Glyph = keyof typeof GLYPHS;

const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (hex: string, to: number, t: number) =>
  `rgb(${rgb(hex)
    .map((v) => Math.round(v + (to - v) * t))
    .join(",")})`;
const luma = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export function drawPin(color: string, label = "", glyph = "", scale = 2): ImageData {
  const c = document.createElement("canvas");
  c.width = PIN.w * scale;
  c.height = PIN.h * scale;
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  const cx = PIN.w / 2;
  if (glyph === "waypoint") {
    // A navigation point: just a dot on the spot (no teardrop, no number), same canvas and tip so anchoring holds
    g.save();
    g.shadowColor = "rgba(0,0,0,0.35)";
    g.shadowBlur = 3;
    g.shadowOffsetY = 1;
    g.beginPath();
    g.arc(cx, PIN.tipY, 4, 0, Math.PI * 2); // fits the 5px below the tip, rim included
    g.fillStyle = color;
    g.fill();
    g.restore();
    g.lineWidth = 1.5;
    g.strokeStyle = "#ffffff";
    g.stroke();
    return g.getImageData(0, 0, c.width, c.height);
  }
  const cy = 17; // head centre
  const r = 14; // head radius
  // Very light colours (hotels, airports) get a dark body so the white badge still reads
  const body = luma(color) > 0.82 ? "#2b3330" : color;

  // Ground shadow under the tip
  g.save();
  g.filter = "blur(1.5px)";
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath();
  g.ellipse(cx, PIN.tipY + 0.5, 5.5, 2, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // Teardrop: head circle flowing into the tip
  // Straight sides tangent to the head, so the outline is one smooth shape
  const drop = new Path2D();
  const al = Math.acos(r / (PIN.tipY - cy));
  drop.moveTo(cx, PIN.tipY);
  drop.lineTo(cx - r * Math.sin(al), cy + r * Math.cos(al));
  drop.arc(cx, cy, r, Math.PI / 2 + al, Math.PI / 2 - al + Math.PI * 2, false);
  drop.lineTo(cx, PIN.tipY);
  drop.closePath();

  // Soft drop shadow for lift, then a glossy vertical gradient
  g.save();
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowBlur = 4;
  g.shadowOffsetY = 1.5;
  g.fillStyle = body;
  g.fill(drop);
  g.restore();
  const grad = g.createLinearGradient(0, cy - r, 0, PIN.tipY);
  grad.addColorStop(0, mix(body, 255, 0.28));
  grad.addColorStop(0.45, body);
  grad.addColorStop(1, mix(body, 0, 0.3));
  g.fillStyle = grad;
  g.fill(drop);

  // Rim
  g.lineWidth = 1.75;
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.stroke(drop);

  // Sheen on the upper left of the head
  g.save();
  g.clip(drop);
  const sheen = g.createRadialGradient(cx - 5, cy - 8, 0, cx - 5, cy - 8, 11);
  sheen.addColorStop(0, "rgba(255,255,255,0.35)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = sheen;
  g.fillRect(0, 0, PIN.w, PIN.h);
  g.restore();

  // Badge
  g.beginPath();
  g.arc(cx, cy, 9.5, 0, Math.PI * 2);
  g.fillStyle = "#ffffff";
  g.fill();
  const ink = body === color ? mix(color, 0, 0.62) : "#1b211e";
  if (glyph && glyph in GLYPHS) {
    g.save();
    g.translate(cx - 6.6, cy - 6.6);
    g.scale(0.55, 0.55);
    g.strokeStyle = ink;
    g.lineWidth = 2.6;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.stroke(new Path2D(GLYPHS[glyph as Glyph]));
    g.restore();
  } else if (label) {
    g.fillStyle = ink;
    g.font = `700 ${label.length > 2 ? 9.5 : label.length > 1 ? 11.5 : 12.5}px "Source Sans 3 Variable", "Source Sans 3", system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, cx, cy + 0.6);
  }
  return g.getImageData(0, 0, c.width, c.height);
}

/** Symbol for each kind of booking pin. */
export const RES_GLYPH: Record<"lodging" | "restaurant" | "car" | "train" | "flight" | "other", Glyph> = {
  lodging: "bed",
  restaurant: "food",
  car: "car",
  train: "train",
  flight: "plane",
  other: "ticket",
};
