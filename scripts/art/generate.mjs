// Generates every pixel-art layer for the 8-Bit Orchestra from code:
//   - the stage: a SIDE-ON cross-section of the theatre (audience raked on the
//     left, orchestra on tiered risers to the right, lighting truss overhead)
//   - the conductor, in profile on the podium
//   - one sprite per orchestral section: a cluster of several silhouetted
//     musicians with a hue-tinted instrument (a section is people, not a prop)
//   - the 1200x630 link-preview card
// Run with `pnpm art`. Output is committed; this script is the source of truth.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Canvas, hx } from "./raster.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const save = (rel, canvas) => {
  const path = resolve(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, canvas.encodePNG());
  console.log("wrote", rel, `${canvas.w}x${canvas.h}`);
};

// ---- palette -----------------------------------------------------------
// Warm opera-house colours: deep maroon air, red velvet drapes and seats, gold
// trim, warm wood stage. A theatre, seen from the side.
const C = {
  wallTop: hx("#2c1020"),
  wallBot: hx("#0a0410"),
  curtain: hx("#8a1530"),
  curtainHi: hx("#bb2846"),
  curtainLo: hx("#560c1d"),
  gold: hx("#e7b23a"),
  goldHi: hx("#ffd76b"),
  goldLo: hx("#9c771f"),
  wood: hx("#6e4526"),
  woodHi: hx("#8a5730"),
  woodLo: hx("#43260f"),
  woodSeam: hx("#341c0b"),
  carpet: hx("#4a0c17"), // aisle / riser skirting
  seat: hx("#6e1524"), // red velvet seat back
  seatHi: hx("#93283a"),
  seatDark: hx("#3c0a13"),
  podium: hx("#33220f"),
  podiumHi: hx("#5a3a1c"),
  bulb: hx("#ffe6a0"),
  glow: hx("#ffcf6e"),
  sil: hx("#0e1020"), // shadowed musician silhouette
  silRim: hx("#5a3a52"), // warm rim light on a silhouette
  black: hx("#0c0810"),
};

// Section hues, kept in step with global.css so a lit sprite matches its light.
const HUE = {
  lead: hx("#ffd23f"),
  harmony: hx("#ff5d8f"),
  bass: hx("#34d1bf"),
  perc: hx("#b98bff"),
};

// ---- stage geometry (shared by the scene and the sprite placement) -----
// One source of truth for where the floor is, so the DOM sprites in
// index.astro can be anchored to the same tiers this scene paints.
const STAGE = { W: 384, H: 216 };

// Orchestra risers on TWO curved tiers, laid out left to right in a zig-zag:
// the sections alternate between a lower front step and an upper back step, so
// lead + bass sit low and harmony + perc sit high, interlocking. `top` is the y
// of the walking surface; sprites stand with their feet here. Mirrored by the
// `spot` map in index.astro.
const LOWER_TOP = 168;
const UPPER_TOP = 146;
const RISERS = [
  { id: "lead", x0: 142, x1: 188, top: LOWER_TOP },
  { id: "harmony", x0: 197, x1: 243, top: UPPER_TOP },
  { id: "bass", x0: 252, x1: 298, top: LOWER_TOP },
  { id: "perc", x0: 307, x1: 353, top: UPPER_TOP },
];
const STAGE_LEFT = 138; // left edge of the round platform
const PODIUM = { x0: 118, x1: 148, top: 158 };
const APRON_BOTTOM = 198; // stage front ends here; below is understage shadow

// The stage front is an arc, bowing toward the audience at its centre so the
// platform reads as a rounded amphitheatre floor. Shared by the stage body and
// the footlights so both trace the same curve.
const apronFrontY = (x) => {
  const mid = (STAGE_LEFT + STAGE.W) / 2;
  const half = (STAGE.W - STAGE_LEFT) / 2;
  const u = (x - mid) / half; // -1 .. 1
  return Math.round(APRON_BOTTOM - (1 - u * u) * 10);
};

// ---- background: side-on cross-section of a theatre --------------------
function background() {
  const { W, H } = STAGE;
  const c = new Canvas(W, H);

  // Warm auditorium air: deep maroon at the top, near black at the floor.
  for (let y = 0; y < H; y++) {
    const t = y / H;
    c.hline(
      0,
      y,
      W,
      [
        Math.round(C.wallTop[0] + (C.wallBot[0] - C.wallTop[0]) * t),
        Math.round(C.wallTop[1] + (C.wallBot[1] - C.wallTop[1]) * t),
        Math.round(C.wallTop[2] + (C.wallBot[2] - C.wallTop[2]) * t),
        255,
      ],
    );
  }

  // Chandelier over the house, warm glow.
  drawChandelier(c, 58, 40);

  // The stage-left curtain is drawn FIRST, so the stage and its apron paint
  // over its lower half: the drape reads as wrapping around behind the stage
  // rather than hanging flat in front of it.
  drawLeftCurtain(c);

  // Auditorium: raked rows of red velvet seats on the left.
  drawAudience(c);

  // Stage: a raised, tiered platform the orchestra stands on.
  drawStage(c);
  drawPodium(c);

  // Proscenium front: gold arch, the stage-right leg, footlights and beams.
  // Drawn last so they frame everything; the left leg already sits behind.
  drawFootlights(c);
  drawProscenium(c);
  drawValance(c, W);

  return c;
}

function lerpCol(a, b, t, scale = 1) {
  return [
    Math.round((a[0] + (b[0] - a[0]) * t) * scale),
    Math.round((a[1] + (b[1] - a[1]) * t) * scale),
    Math.round((a[2] + (b[2] - a[2]) * t) * scale),
    255,
  ];
}

function drawChandelier(c, cx, cy) {
  // faint halo
  for (let r = 14; r >= 1; r--)
    c.ellipse(cx, cy, r, Math.round(r * 0.8), [...C.glow.slice(0, 3), 6]);
  c.vline(cx, 0, cy - 8, C.goldLo); // chain
  // tiers of gold arms with bulbs
  c.ellipse(cx, cy - 6, 6, 2, C.goldLo);
  c.ellipse(cx, cy, 9, 3, C.goldLo);
  for (let k = -3; k <= 3; k++) {
    c.set(cx + k * 3, cy + 2, C.bulb);
    c.set(cx + k * 3, cy + 3, C.gold);
  }
  for (let k = -2; k <= 2; k++) c.set(cx + k * 3, cy - 4, C.bulb);
}

function drawAudience(c) {
  const { H } = STAGE;
  // A curved amphitheatre bowl of red velvet seats seen from the side. The rake
  // is CONCAVE: it drops fast near the stage and flattens toward the back, so
  // the seating sweeps up-and-around like a Greek theatron rather than a flat
  // ramp. Each bench also bows, and the bowl is packed full of patrons.
  const xNear = 150; // front row, right up against the round stage front
  const xFar = 2;
  const yNear = 204; // front baseline, low by the apron
  const yFar = 56; // back baseline, high up-left
  // concave bowl curve: t is 0 back .. 1 front, raised to a power so the near
  // rows fall away steeply and the far rows stack tightly up the back wall.
  const rake = (x) => {
    const t = (x - xFar) / (xNear - xFar);
    return Math.round(yFar + (yNear - yFar) * Math.pow(Math.max(0, t), 1.7));
  };

  // Carpeted bowl beneath the seats.
  for (let x = xFar; x <= xNear; x++) c.vline(x, rake(x), H - rake(x), C.seatDark);

  // Draw back rows first so nearer rows overlap them. Eight tightly-stacked rows
  // fill the whole bowl.
  const rows = 8;
  for (let r = rows - 1; r >= 0; r--) {
    const t = r / (rows - 1); // 0 front .. 1 back
    const cx = Math.round(xNear - 10 - t * (xNear - xFar - 18));
    const half = Math.round(34 - t * 15); // wider in front
    const h = Math.round(15 - t * 7); // taller in front
    const bow = Math.max(1, Math.round(5 - t * 3)); // row curvature, less at back
    const baseY = rake(cx);
    // Bowed velvet bench, drawn column by column so the row curves: the ends dip
    // toward the viewer and the centre sits back and higher.
    for (let dx = -half; dx <= half; dx++) {
      const u = dx / half; // -1 .. 1
      const y = baseY - Math.round(bow * (1 - u * u)); // centre highest
      const px = cx + dx;
      c.vline(px, y - h, h, C.seat);
      c.set(px, y - h, C.seatHi);
      c.set(px, y - h + 1, C.seatHi);
      c.set(px, y, C.gold); // brass rail along the row front
    }
    // Patrons packed along the bowed row, following the same curve.
    const w = half * 2;
    const patrons = Math.max(6, Math.round(w / 8));
    const step = w / patrons;
    const hr = Math.max(2, Math.round(5 - t * 2)); // bigger heads in front
    for (let p = 0; p < patrons; p++) {
      const dx = -half + step * (p + 0.5);
      const u = dx / half;
      const px = Math.round(cx + dx);
      const y = baseY - Math.round(bow * (1 - u * u));
      c.rect(px - hr - 1, y - h - hr - 1, hr * 2 + 3, hr + 3, C.sil); // shoulders
      c.ellipse(px, y - h - hr - 3, hr, hr, C.sil); // head
      // warm rim along the top of the head so the crowd reads against the dark
      c.hline(px - 1, y - h - hr * 2 - 3, 3, C.silRim);
      c.set(px + hr - 1, y - h - hr - 3, C.silRim);
    }
  }
}

// A shallow arc across a ledge: the surface bows so the platform reads as a
// rounded thrust rather than a flat plank. Returns y for a given x, dipping
// `depth` px lower at the outer ends (concave, curving away toward the centre).
function ledgeArc(x, a, b, top, depth) {
  const mid = (a + b) / 2;
  const half = (b - a) / 2 || 1;
  const u = (x - mid) / half; // -1 .. 1
  return top + Math.round(depth * u * u);
}

// The stage: a solid raised platform whose FRONT edge curves out toward the
// audience like an amphitheatre's rounded orchestra floor. Gold-nosed tier
// ledges (also gently bowed) carry each section; below is the footlit apron and
// dark understage.
function drawStage(c) {
  const { W, H } = STAGE;
  const x0 = STAGE_LEFT;
  const backTop = UPPER_TOP;
  // solid stage body (dark warm wood), from the back tier down to the curved apron
  for (let x = x0; x < W; x++) c.vline(x, backTop, apronFrontY(x) - backTop, C.woodLo);
  // vertical support beams for structure, not a flat plank wall
  for (let sx = x0 + 6; sx < W; sx += 24) c.vline(sx, backTop, apronFrontY(sx) - backTop, C.woodSeam);
  // tier ledges: a lit, bowed walking surface + gold nosing where each stands
  for (const { x0: a, x1: b, top } of RISERS) {
    for (let x = a; x <= b; x++) {
      const y = ledgeArc(x, a, b, top, 2);
      c.vline(x, y, 3, C.wood);
      c.set(x, y, C.woodHi);
      c.set(x, y + 3, C.gold); // nosing
      c.set(x, y + 4, C.goldLo);
    }
    // slim music stand at the back of each ledge
    const sx = Math.round((a + b) / 2) + 12;
    c.vline(sx, top - 11, 11, C.black);
    c.rect(sx - 4, top - 14, 9, 3, C.woodLo);
    c.hline(sx - 4, top - 14, 9, C.gold);
  }
  // curved apron front edge (red skirt) tracing the same arc, then understage
  for (let x = x0; x < W; x++) {
    const y = apronFrontY(x);
    c.vline(x, y - 6, 3, C.carpet); // red skirt just above the edge
    c.set(x, y, C.black); // dark nosing along the round front
    c.vline(x, y + 1, H - y - 1, C.seatDark); // understage shadow
  }
}

function drawPodium(c) {
  const { x0, x1, top } = PODIUM;
  const { H } = STAGE;
  for (let y = top; y < H - 6; y++) {
    const band = Math.floor((y - top) / 4) % 2;
    c.hline(x0, y, x1 - x0, band ? C.podium : C.podiumHi);
  }
  c.hline(x0, top, x1 - x0, C.gold); // gilt edge
  c.vline(x0, top, H - 6 - top, C.black);
  c.vline(x1 - 1, top, H - 6 - top, C.black);
}

function drawFootlights(c) {
  // A row of warm bulbs along the curved front edge of the stage apron, each
  // sitting just above the arc so the footlights hug the round nosing.
  for (let x = STAGE_LEFT + 8; x < STAGE.W - 6; x += 16) {
    const y = apronFrontY(x) - 4;
    // soft pool of light above each bulb
    for (let ry = 1; ry <= 9; ry++)
      for (let rx = -ry; rx <= ry; rx++)
        c.set(x + rx, y - ry, [...C.glow.slice(0, 3), Math.max(0, 20 - ry * 2)]);
    c.rect(x - 1, y, 3, 3, C.goldLo);
    c.set(x, y, C.bulb);
  }
}

// Shared proscenium geometry, so the left curtain (drawn behind the stage) and
// the front frame (drawn over it) agree on where the arch springs from.
const PROS = { leftX: PODIUM.x0 - 8, rightX: STAGE.W - 6, archY: 30 };

function drawGiltPillar(c, px, dir) {
  const { H } = STAGE;
  const x = dir > 0 ? px : px - 5; // 6px gilt pillar
  c.rect(x, PROS.archY, 6, H - PROS.archY, C.curtainLo);
  c.vline(dir > 0 ? x : x + 5, PROS.archY, H - PROS.archY, C.gold);
  c.vline(dir > 0 ? x + 5 : x, PROS.archY, H - PROS.archY, C.goldLo);
}

// The stage-left pillar and its red drape, drawn before the stage so the apron
// and podium paint over the lower half: the drape wraps behind the stage. It is
// wide enough to overlap the podium, which is what makes the tuck read.
function drawLeftCurtain(c) {
  const { H } = STAGE;
  drawGiltPillar(c, PROS.leftX, 1);
  drawLeg(c, PROS.leftX + 6, PROS.archY + 4, H, 20);
}

function drawProscenium(c) {
  const { H } = STAGE;
  const { leftX, rightX, archY } = PROS;
  // Stage-right pillar (the left one is already behind the stage).
  drawGiltPillar(c, rightX, -1);
  // arch band with a gentle sag, springing between both pillars
  for (let x = leftX; x <= rightX; x++) {
    const t = (x - leftX) / (rightX - leftX);
    const sag = Math.round(Math.sin(t * Math.PI) * 6);
    c.hline(x, archY + sag, 1, C.gold);
    c.set(x, archY + sag + 1, C.goldLo);
  }
  // red stage-right leg (drape) hanging just inside the far pillar
  drawLeg(c, rightX - 5 - 12, archY + 4, H - 8, 12);
  // Soft ambient beams, both hung from the same height just below the arch and
  // dropping straight down, so the resting stage already reads as lit from one
  // consistent truss (matching the interactive cones the page overlays).
  beam(c, 210, archY + 6, 210, 152);
  beam(c, 300, archY + 6, 300, 138);
}

function drawLeg(c, x0, y0, y1, w) {
  for (let x = 0; x < w; x++) {
    const fold = Math.sin(x / 2.2) * 0.5 + 0.5;
    const col = lerpCol(C.curtainLo, C.curtainHi, fold, 0.9);
    // ragged inner hem so it reads as a hanging drape, not a bar
    const hem = y1 - Math.round(Math.abs(Math.sin(x / 3)) * 10) - (x > w - 4 ? 30 : 0);
    c.vline(x0 + x, y0, hem - y0, col);
  }
  c.vline(x0, y0, y1 - y0 - 20, C.gold); // trim
}

function beam(c, apexX, apexY, footX, footY) {
  for (let y = apexY; y < footY; y++) {
    const t = (y - apexY) / (footY - apexY);
    const cxb = Math.round(apexX + (footX - apexX) * t);
    const half = Math.round(2 + t * 22);
    const a = Math.max(0, 16 - t * 14);
    for (let x = cxb - half; x <= cxb + half; x++) c.set(x, y, [...C.glow.slice(0, 3), a]);
  }
}

function drawValance(c, W) {
  // Grand red valance across the very top, scalloped lower edge, gold fringe.
  const valH = 26;
  for (let x = 0; x < W; x++) {
    const scallop = Math.round(Math.abs(Math.sin(x / 14)) * 9);
    const fold = Math.sin(x / 6) * 0.5 + 0.5;
    for (let y = 0; y < valH - scallop; y++) {
      const shade = 0.72 + fold * 0.28 - (y / valH) * 0.18;
      c.set(x, y, lerpCol(C.curtain, C.curtainHi, fold * 0.6, shade));
    }
    if (x % 14 === 7) c.set(x, valH - scallop, C.gold); // fringe ball
  }
  c.hline(0, 0, W, C.curtainLo);
}

// ---- musicians ---------------------------------------------------------
// A single seated player, in profile facing LEFT (toward the conductor), as a
// dark silhouette with a cool rim light and a hue-tinted instrument. Feet sit
// at footY; cx is the seat centre.
function drawPlayer(c, cx, footY, type, hue) {
  const S = C.sil;
  const R = C.silRim;
  // stool
  c.vline(cx - 4, footY - 6, 6, S);
  c.vline(cx + 4, footY - 6, 6, S);
  c.rect(cx - 5, footY - 8, 10, 2, S);
  // seated legs: thighs jut forward-left, shins drop
  c.rect(cx - 8, footY - 12, 11, 3, S);
  c.rect(cx - 8, footY - 9, 3, 8, S);
  c.rect(cx - 3, footY - 9, 3, 8, S);
  c.rect(cx - 9, footY - 2, 5, 2, S); // foot
  // torso trapezoid
  const shoY = footY - 24;
  for (let y = shoY; y <= footY - 12; y++) {
    const t = (y - shoY) / (footY - 12 - shoY);
    const half = Math.round(3 + t * 3);
    c.hline(cx - half, y, half * 2, S);
  }
  // head + rim
  c.ellipse(cx, shoY - 4, 3, 4, S);
  c.hline(cx - 2, shoY - 8, 4, R);
  c.set(cx + 3, shoY - 2, R);
  c.set(cx - 4, shoY + 4, R);
  // instrument, in the section hue
  drawInstrument(c, cx, shoY, footY, type, hue);
}

function drawInstrument(c, cx, shoY, footY, type, hue) {
  const S = C.sil;
  if (type === "trumpet") {
    // arm up, horn pointing left with a bell
    c.rect(cx - 9, shoY, 6, 2, S); // forearm
    c.rect(cx - 12, shoY - 3, 7, 2, hue); // tube
    c.rect(cx - 14, shoY - 4, 3, 5, hue); // bell
    c.set(cx - 4, shoY - 1, hue);
  } else if (type === "violin") {
    // violin tucked under the chin on the left, bow across
    c.rect(cx - 9, shoY - 1, 6, 2, hue); // body
    c.set(cx - 10, shoY, hue);
    for (let i = 0; i < 8; i++) c.set(cx - 12 + i, shoY + 4 - i, hue); // bow
    c.rect(cx - 6, shoY, 4, 2, S); // arm
  } else if (type === "bass") {
    // upright bass beside the player, neck rising above the head
    c.ellipse(cx - 9, footY - 15, 4, 7, hue); // body
    c.vline(cx - 9, shoY - 10, footY - 15 - (shoY - 10), hue); // neck
    c.set(cx - 9, shoY - 11, hue); // scroll
    c.rect(cx - 6, shoY, 4, 2, S); // bowing arm
  } else if (type === "drum") {
    // snare in the lap, sticks crossed above
    c.ellipse(cx - 6, footY - 12, 5, 3, hue);
    c.rect(cx - 11, footY - 13, 10, 2, hue);
    for (let i = 0; i < 6; i++) c.set(cx - 10 + i, shoY + 2 - i, S); // stick
    for (let i = 0; i < 6; i++) c.set(cx - 4 + i, shoY - 4 + i, S); // stick
  }
}

// A section: `n` players in a short receding row, so the group is clearly
// several people. Returns a transparent sprite with feet along the bottom.
function sectionSprite(type, hue, n) {
  const dx = 15;
  const rise = 3; // back players sit a little higher
  const tall = type === "bass";
  const W = 12 + (n - 1) * dx + 16;
  const H = (tall ? 46 : 40) + 2;
  const c = new Canvas(W, H);
  for (let i = n - 1; i >= 0; i--) {
    const cx = 12 + i * dx;
    const footY = H - 2 - i * rise;
    drawPlayer(c, cx, footY, type, hue);
  }
  return c;
}

// ---- conductor ---------------------------------------------------------
// In profile, facing RIGHT toward the orchestra, baton raised.
function conductorSprite() {
  const c = new Canvas(20, 40);
  const S = C.sil;
  const R = C.silRim;
  const cx = 9;
  const footY = 38;
  // legs (standing)
  c.rect(cx - 3, footY - 12, 3, 12, S);
  c.rect(cx + 1, footY - 12, 3, 12, S);
  c.rect(cx - 4, footY - 1, 5, 2, S);
  c.rect(cx + 1, footY - 1, 5, 2, S);
  // tailcoat torso
  for (let y = footY - 26; y <= footY - 12; y++) {
    const t = (y - (footY - 26)) / 14;
    const half = Math.round(3 + t * 2);
    c.hline(cx - half, y, half * 2, S);
  }
  c.rect(cx - 3, footY - 14, 7, 4, S); // coat tails flare
  // head + rim
  c.ellipse(cx, footY - 30, 3, 3, S);
  c.hline(cx - 1, footY - 33, 4, R);
  c.set(cx + 3, footY - 29, R);
  // raised right arm + baton (light), reaching up-right
  c.rect(cx + 2, footY - 27, 5, 2, S);
  for (let i = 0; i < 6; i++) c.set(cx + 7 + i, footY - 28 - i, C.bulb); // baton
  return c;
}

// ---- link-preview card -------------------------------------------------
function scaleUp(src, f) {
  const c = new Canvas(src.w * f, src.h * f);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if (src.d[i + 3] > 0)
        c.rect(x * f, y * f, f, f, [src.d[i], src.d[i + 1], src.d[i + 2], src.d[i + 3]]);
    }
  return c;
}

// Anchor a sprite by its bottom-centre at (leftFrac, bottomFrac) of a canvas,
// the same coordinate model index.astro uses, so the card matches the page.
function placeFoot(c, s, leftFrac, bottomFrac) {
  const x = Math.round(c.w * leftFrac - s.w / 2);
  const y = Math.round(c.h * (1 - bottomFrac) - s.h);
  for (let j = 0; j < s.h; j++)
    for (let i = 0; i < s.w; i++) {
      const k = (j * s.w + i) * 4;
      if (s.d[k + 3] > 0) c.set(x + i, y + j, [s.d[k], s.d[k + 1], s.d[k + 2], s.d[k + 3]]);
    }
}

function card() {
  const W = 1200;
  const H = 630;
  const c = new Canvas(W, H);
  const bg = background();
  const sx = W / bg.w;
  const sy = H / bg.h;
  for (let y = 0; y < H; y++) {
    const by = Math.min(bg.h - 1, Math.floor(y / sy));
    for (let x = 0; x < W; x++) {
      const bx = Math.min(bg.w - 1, Math.floor(x / sx));
      const i = (by * bg.w + bx) * 4;
      c.set(x, y, [bg.d[i], bg.d[i + 1], bg.d[i + 2], 255]);
    }
  }
  // Place performers with the same fractional anchors as the page (zig-zag:
  // lead + bass low, harmony + perc high).
  const f = 4;
  placeFoot(c, scaleUp(conductorSprite(), f), 0.36, 0.26);
  placeFoot(c, scaleUp(sectionSprite("trumpet", HUE.lead, 3), f), 0.43, 0.22);
  placeFoot(c, scaleUp(sectionSprite("violin", HUE.harmony, 3), f), 0.57, 0.32);
  placeFoot(c, scaleUp(sectionSprite("bass", HUE.bass, 2), f), 0.72, 0.22);
  placeFoot(c, scaleUp(sectionSprite("drum", HUE.perc, 2), f), 0.86, 0.32);
  // Title band.
  c.rect(0, H - 150, W, 150, [10, 10, 24, 175]);
  text(c, "8-BIT ORCHESTRA", 60, H - 120, 10, hx("#ffd23f"));
  text(c, "CONDUCT A CHIPTUNE ENSEMBLE LIVE", 60, H - 60, 4, hx("#eef0ff"));
  return c;
}

// Minimal 5x7 uppercase pixel font, only the glyphs the card needs.
const FONT = {
  "8": ["111", "101", "111", "101", "111"],
  "-": ["000", "000", "111", "000", "000"],
  B: ["110", "101", "110", "101", "110"],
  I: ["111", "010", "010", "010", "111"],
  T: ["111", "010", "010", "010", "010"],
  O: ["111", "101", "101", "101", "111"],
  R: ["110", "101", "110", "101", "101"],
  C: ["111", "100", "100", "100", "111"],
  H: ["101", "101", "111", "101", "101"],
  E: ["111", "100", "110", "100", "111"],
  S: ["111", "100", "111", "001", "111"],
  A: ["111", "101", "111", "101", "101"],
  D: ["110", "101", "101", "101", "110"],
  U: ["101", "101", "101", "101", "111"],
  N: ["101", "111", "111", "111", "101"],
  L: ["100", "100", "100", "100", "111"],
  V: ["101", "101", "101", "101", "010"],
  M: ["101", "111", "111", "101", "101"],
  P: ["111", "101", "111", "100", "100"],
  " ": ["000", "000", "000", "000", "000"],
};

function text(c, str, x, y, scale, color) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT[" "];
    for (let ry = 0; ry < glyph.length; ry++) {
      for (let rx = 0; rx < glyph[ry].length; rx++) {
        if (glyph[ry][rx] === "1") c.rect(cx + rx * scale, y + ry * scale, scale, scale, color);
      }
    }
    cx += 4 * scale;
  }
}

// ---- run ---------------------------------------------------------------
save("src/assets/art/stage.png", background());
save("src/assets/art/conductor.png", conductorSprite());
save("src/assets/art/lead.png", sectionSprite("trumpet", HUE.lead, 3));
save("src/assets/art/harmony.png", sectionSprite("violin", HUE.harmony, 3));
save("src/assets/art/bass.png", sectionSprite("bass", HUE.bass, 2));
save("src/assets/art/perc.png", sectionSprite("drum", HUE.perc, 2));
save("public/card.png", card());

// Contact sheet that composites the sprites onto the scene at their real page
// anchors, so `pnpm art --sheet` shows what the live stage will look like.
if (process.argv.includes("--sheet")) {
  const c = background();
  placeFoot(c, conductorSprite(), 0.36, 0.26);
  placeFoot(c, sectionSprite("trumpet", HUE.lead, 3), 0.43, 0.22);
  placeFoot(c, sectionSprite("violin", HUE.harmony, 3), 0.57, 0.32);
  placeFoot(c, sectionSprite("bass", HUE.bass, 2), 0.72, 0.22);
  placeFoot(c, sectionSprite("drum", HUE.perc, 2), 0.86, 0.32);
  writeFileSync("/tmp/contact.png", scaleUp(c, 3).encodePNG());
  console.log("wrote /tmp/contact.png");
}
