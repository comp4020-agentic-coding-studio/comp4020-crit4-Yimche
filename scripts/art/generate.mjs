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

// Orchestra on TWO clean layers, a front deck and a raised back deck. The
// conductor, lead and bass stand on the LOWER (front) deck; harmony and perc
// stand on the UPPER (back) deck, set further right so they read over the gap:
//               [harmony]     [perc]
//   [conductor] [lead]     [bass]
// `top` is the y of the walking surface; sprites stand with their feet here.
// Mirrored by the `spot` map in index.astro.
const LOWER_TOP = 182;
const UPPER_TOP = 159; // back deck rides a touch higher, a taller top layer
// How far each deck arches up at its centre. The decks bow the OPPOSITE way to
// the main stage floor: the apron dips DOWN in the middle, so the decks ride UP
// in the middle. Mirrored by index.astro so the sprites sit on the same curve.
// Kept shallow so the deck crowns sit low rather than bowing high at centre.
const TIER_DEPTH = 5;
const RISERS = [
  { id: "lead", x0: 176, x1: 208, top: LOWER_TOP },
  { id: "harmony", x0: 214, x1: 246, top: UPPER_TOP },
  { id: "bass", x0: 264, x1: 296, top: LOWER_TOP },
  { id: "perc", x0: 307, x1: 339, top: UPPER_TOP },
];
// The conductor's podium is now a raised block of the stage itself (same wood,
// no gap), a step proud of the lower tier at the front-left where he stands.
const STAGE_LEFT = 126; // left edge of the platform, wide enough to carry the podium
const PODIUM = { x0: 128, x1: 166, top: 170 };
const APRON_BOTTOM = 212; // stage front ends here, low so it lines up with the
// bottom of the seating bank; below is a thin strip of understage shadow

// The stage front is an arc. It now bows the OTHER way: the centre dips DOWN
// toward the audience (nearest) and the sides ride up, so the platform reads as
// curving out toward the house. Shared by the stage body and the footlights.
const apronFrontY = (x) => {
  const mid = (STAGE_LEFT + STAGE.W) / 2;
  const half = (STAGE.W - STAGE_LEFT) / 2;
  const u = (x - mid) / half; // -1 .. 1
  return Math.round(APRON_BOTTOM - u * u * 12);
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

  // The stage's rear wall, filling the proscenium opening in a cool blue so the
  // volume behind the orchestra is clearly not the warm house behind the crowd.
  // Drawn before the curtain and stage so both hang and sit in front of it.
  drawStageBackWall(c);

  // The right drape starts here, its foot tucked behind the stage; the
  // front-of-house layer redraws its upper length over the deck.
  drawRightLeg(c);

  // The overhead beams hang from behind, so the top deck occludes their lower
  // ends. Drawn before the stage for the same reason the curtain is.
  drawAmbientBeams(c);

  // Auditorium: the whole crowd, carpet bank then seated rows.
  drawAudienceGround(c);
  drawAudienceRows(c);

  // The left frame and drape hang over the crowd, covering the patrons nearest
  // the stage, but BEFORE the deck so the stage still hides the curtain's feet.
  drawLeftPillar(c);
  drawLeftLeg(c);
  tuckLeftLegBehindPlanks(c); // plank wall cuts the drape's foot, so it reads as behind the stage

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

// A transparent overlay holding only the front-of-house elements: the stage
// platform, podium, footlights, proscenium frame, valance and the crowd. The
// page stacks it ABOVE the spotlight beams and BELOW the performers, so a beam
// descends over the back wall, lights the musician, and is then cut off by the
// deck in front of it. That is what puts the spotlight beams behind the top
// section: the stage occludes their lower ends, the same way the painted curtain
// hangs behind the deck.
function foreground() {
  const { W, H } = STAGE;
  const c = new Canvas(W, H);
  // Same crowd layering as the background so this top layer stays consistent:
  // the whole crowd, then the left curtain over it. Without the curtain here the
  // redrawn crowd would cover it.
  drawAudienceGround(c);
  drawAudienceRows(c);
  drawLeftPillar(c);
  drawLeftLeg(c);
  tuckLeftLegBehindPlanks(c);
  drawStage(c, { stands: false }); // stands live in the background, behind the beam
  drawPodium(c);
  drawFootlights(c);
  // The RIGHT drape frames over the stage here; the right gilt pillar and the
  // arch come with the proscenium, the valance over their tops.
  drawRightLeg(c);
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

// The house crowd, kept in two functions (carpeted BANK and RAKED ROWS of
// patrons) so the draw order stays explicit; the left curtain now hangs over
// both. A raked bank of red velvet seats fills the whole left
// of the house; the rows bleed off the left edge and the border hard-cuts them,
// so the crowd runs right off screen. Each bench curves so its LEFT end sits
// lower and its RIGHT end (toward the stage) rides higher; the right end also
// recedes leftward with depth and the baselines climb from the apron up under
// the valance.
const AUD = {
  xStart: -26, // bleed off the left edge; the border clips it
  xFront: 150, // front row meets the round stage front
  yFront: 214, // front baseline, low by the apron
  yBack: 40, // back baseline, high up-left under the valance
  rows: 12,
};

// The dark carpeted bank beneath the seats, bled off the left edge too, so no
// bare floor shows between the rows or in the corners.
function drawAudienceGround(c) {
  const { H } = STAGE;
  const { xStart, xFront, yFront, yBack } = AUD;
  for (let x = xStart; x <= xFront; x++) {
    const tx = Math.max(0, (x - xStart) / (xFront - xStart));
    const topY = Math.round(yBack + (yFront - yBack) * Math.pow(tx, 1.4)) - 42;
    const y = Math.max(0, topY);
    c.vline(x, y, H - y, C.seatDark);
  }
}

// The seated patrons on their raked benches.
function drawAudienceRows(c) {
  const { xStart, xFront, yFront, yBack, rows } = AUD;
  // Draw back rows first so nearer rows overlap them.
  for (let r = rows - 1; r >= 0; r--) {
    const t = r / (rows - 1); // 0 front .. 1 back
    const baseY = Math.round(yFront - t * (yFront - yBack));
    const rightEnd = Math.round(xFront - t * (xFront - 30)); // recedes left with depth
    const leftEnd = Math.round(xStart + t * 12); // bled off the left edge
    const h = Math.round(14 - t * 7); // taller in front
    const rise = Math.max(2, Math.round(11 - t * 4)); // left low, right high
    const width = Math.max(1, rightEnd - leftEnd);
    // Sloped velvet bench, drawn column by column: the left end sits low and the
    // surface curves up toward the stage-side (right) end.
    for (let x = leftEnd; x <= rightEnd; x++) {
      const s = (x - leftEnd) / width; // 0 left .. 1 right
      const y = baseY - Math.round(rise * Math.pow(s, 1.3)); // right end highest
      c.vline(x, y - h, h, C.seat);
      c.set(x, y - h, C.seatHi);
      c.set(x, y - h + 1, C.seatHi);
      c.set(x, y, C.gold); // brass rail along the row front
    }
    // Patrons packed along the sloped row, following the same curve.
    const hr = Math.max(2, Math.round(5 - t * 2)); // bigger heads in front
    const patrons = Math.max(3, Math.round(width / (hr * 2 + 3)));
    const step = width / patrons;
    for (let p = 0; p < patrons; p++) {
      const px = Math.round(leftEnd + step * (p + 0.5));
      const s = (px - leftEnd) / width;
      const y = baseY - Math.round(rise * Math.pow(s, 1.3));
      c.rect(px - hr - 1, y - h - hr - 1, hr * 2 + 3, hr + 3, C.sil); // shoulders
      c.ellipse(px, y - h - hr - 3, hr, hr, C.sil); // head
      // warm rim along the top of the head so the crowd reads against the dark
      c.hline(px - 1, y - h - hr * 2 - 3, 3, C.silRim);
      c.set(px + hr - 1, y - h - hr - 3, C.silRim);
    }
  }
}

// A shallow arc across a deck, bowing the OPPOSITE way to the apron floor: the
// surface rides UP `depth` px at its CENTRE and drops to `top` at the ends, so
// the tiers arch against the rounded front rather than echoing it.
function ledgeArc(x, a, b, top, depth) {
  const mid = (a + b) / 2;
  const half = (b - a) / 2 || 1;
  const u = (x - mid) / half; // -1 .. 1
  return top - Math.round(depth * (1 - u * u));
}

// The stage's rear: a cool-blue cyclorama filling the upper opening (a distinct
// colour from the warm house behind the crowd), with a wooden plank wall rising
// from the back deck only as high as the stage light reaches, just above the
// seated back sections. So the background stays its own colour, but from the top
// sections' feet up past their heads the wall is the same plank surface as the
// stage below, grounding them rather than floating them against open sky.
const STAGE_WALL = { top: hx("#1c2a5a"), bot: hx("#0b1230") };
// The plank band caps about halfway up the seated back players (feet ~157, head
// ~126), so it grounds them from the waist down; blue cyclorama above.
const BACK_WALL_TOP = 141;

function drawStageBackWall(c) {
  const x0 = PROS.leftX;
  const x1 = PROS.rightX;
  const yTop = PROS.archY;
  const yBot = UPPER_TOP;
  // cool-blue cyclorama across the whole opening, darkening toward the floor
  for (let y = yTop; y < yBot; y++) {
    const t = (y - yTop) / (yBot - yTop);
    c.hline(x0, y, x1 - x0, lerpCol(STAGE_WALL.top, STAGE_WALL.bot, t));
  }
  // plank wall over the lower band only, from the light line down to the deck
  for (let x = x0; x < x1; x++) c.vline(x, BACK_WALL_TOP, yBot - BACK_WALL_TOP, C.woodLo);
  // vertical support beams, aligned with the stage body's, up the plank band
  for (let sx = STAGE_LEFT + 6; sx < x1; sx += 24)
    c.vline(sx, BACK_WALL_TOP, yBot - BACK_WALL_TOP, C.woodSeam);
  // a lit top edge where the planks meet the cyclorama, catching the stage light
  for (let x = x0; x < x1; x++) c.set(x, BACK_WALL_TOP, C.woodHi);
}

// One clean, stage-wide tier: a lit, gently bowed walking surface with gold
// nosing, so each deck reads as a single layer rather than scattered ledges.
function drawTier(c, a, b, top) {
  for (let x = a; x < b; x++) {
    const y = ledgeArc(x, a, b, top, TIER_DEPTH);
    c.vline(x, y, 4, C.wood);
    c.set(x, y, C.woodHi);
    c.set(x, y + 1, C.woodHi);
    c.set(x, y + 4, C.gold); // nosing
    c.set(x, y + 5, C.goldLo);
  }
}

// The back deck is drawn at the same line the top sprites are anchored to
// (UPPER_FOOT in index.astro = UPPER_TOP + 2), exactly as the front deck's tier
// matches its own sprites, so the top sections stand ON the deck rather than a
// couple of pixels above it. Below it is plain plank riser down to the front
// deck, and behind it the plank back wall, so they read as standing on a tier of
// the same plank stage as everyone else.
const BACK_DECK_TOP = UPPER_TOP + 2;

// The stage: a solid raised platform whose FRONT edge curves out toward the
// audience like an amphitheatre's rounded orchestra floor. It is built as TWO
// clean layers: a raised back deck (harmony + perc) stepping down to a front
// deck (conductor + lead + bass). Below is the footlit apron and dark
// understage.
// `stands` draws a slim music stand behind each section. They belong ONLY in the
// background: there they sit behind the spotlight beam and read as a lit detail.
// The foreground redraws the deck OVER the beam, so a stand drawn there paints a
// black pole across the lit musician (a stray vertical line); the foreground
// passes stands:false to leave the front of the lit performer clean.
function drawStage(c, { stands = true } = {}) {
  const { W, H } = STAGE;
  const x0 = STAGE_LEFT;
  // solid stage body (dark warm wood), from the crown of the arched back deck
  // down to the curved apron (so the arch never opens a gap above the wood)
  const bodyTop = UPPER_TOP - TIER_DEPTH;
  for (let x = x0; x < W; x++) c.vline(x, bodyTop, apronFrontY(x) - bodyTop, C.woodLo);
  // vertical support beams for structure, not a flat plank wall
  for (let sx = x0 + 6; sx < W; sx += 24) c.vline(sx, bodyTop, apronFrontY(sx) - bodyTop, C.woodSeam);
  // the two full-width decks: the back deck at the top sections' feet, then the
  // front tier over it
  drawTier(c, x0, W, BACK_DECK_TOP);
  drawTier(c, x0, W, LOWER_TOP);
  // a slim music stand behind each section (background only; see stands note)
  if (stands) {
    for (const { x0: a, x1: b, top } of RISERS) {
      const sx = Math.round((a + b) / 2) + 12;
      c.vline(sx, top - 11, 11, C.black);
      c.rect(sx - 4, top - 14, 9, 3, C.woodLo);
      c.hline(sx - 4, top - 14, 9, C.gold);
    }
  }
  // curved apron front edge (red skirt) tracing the same arc, then understage
  for (let x = x0; x < W; x++) {
    const y = apronFrontY(x);
    c.vline(x, y - 6, 3, C.carpet); // red skirt just above the edge
    c.set(x, y, C.black); // dark nosing along the round front
    c.vline(x, y + 1, H - y - 1, C.seatDark); // understage shadow
  }
}

// The conductor's podium: a raised wooden dais that is part of the stage, not a
// separate block. Same wood, gold nosing, a short front face down to the lower
// tier, so it reads as a step proud of the deck at the front-left.
function drawPodium(c) {
  const { x0, x1, top } = PODIUM;
  const foot = LOWER_TOP + 6; // front face runs down to just past the lower tier
  for (let x = x0; x <= x1; x++) {
    const y = ledgeArc(x, x0, x1, top, 2);
    c.vline(x, y, foot - y, C.wood); // dais body
    c.set(x, y, C.woodHi); // lit top
    c.set(x, y + 1, C.woodHi);
    c.set(x, y + 3, C.gold); // gold nosing
    c.set(x, y + 4, C.goldLo);
  }
  // side shadows so the dais stands proud of the surrounding deck
  c.vline(x0, top, foot - top, C.woodLo);
  c.vline(x1, top, foot - top, C.woodLo);
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
// The gilt frame around the opening: its top bar rides high near the very top of
// the stage, and its right pillar reaches the right border of the stage box.
const PROS = { leftX: PODIUM.x0 - 8, rightX: STAGE.W - 1, archY: 12 };

// The main curtain: its legs hang from the raised frame all the way down to the
// bottom of the stage, so the drapes frame the full opening at both sides rather
// than stopping at the deck. Drawn in the front-of-house layer (over the stage,
// under the performers) so the full length reads; the side legs sit clear of the
// musicians, and the conductor renders on top of the near leg.
const CURTAIN_HEM = APRON_BOTTOM;

function drawGiltPillar(c, px, dir) {
  const { H } = STAGE;
  const x = dir > 0 ? px : px - 5; // 6px gilt pillar
  c.rect(x, PROS.archY, 6, H - PROS.archY, C.curtainLo);
  c.vline(dir > 0 ? x : x + 5, PROS.archY, H - PROS.archY, C.gold);
  c.vline(dir > 0 ? x + 5 : x, PROS.archY, H - PROS.archY, C.goldLo);
}

// The curtain in separable pieces, so the page can layer each one independently.
// The left gilt frame and its drape live only in the background, behind the
// stage; the right drape is drawn behind the stage AND redrawn in the
// front-of-house layer so it frames the opening over the deck. Each leg is hung
// just inside its pillar.
function drawLeftPillar(c) {
  drawGiltPillar(c, PROS.leftX, 1);
}
function drawLeftLeg(c) {
  drawLeg(c, PROS.leftX + 6, PROS.archY + 4, CURTAIN_HEM, 20);
}

// Tuck the left curtain leg behind the plank wall. The drape hangs full length,
// then the plank band is redrawn over its foot so the plank's top edge cleanly
// cuts it: the curtain reads as descending behind the stage rather than hanging
// in front of the deck. Scoped to the drape's own column so the beams and the
// rest of the back wall are untouched.
function tuckLeftLegBehindPlanks(c) {
  const x0 = STAGE_LEFT;
  const x1 = STAGE_LEFT + 28;
  const yBot = UPPER_TOP;
  for (let x = x0; x < x1; x++) c.vline(x, BACK_WALL_TOP, yBot - BACK_WALL_TOP, C.woodLo);
  for (let sx = STAGE_LEFT + 6; sx < x1; sx += 24)
    c.vline(sx, BACK_WALL_TOP, yBot - BACK_WALL_TOP, C.woodSeam);
  for (let x = x0; x < x1; x++) c.set(x, BACK_WALL_TOP, C.woodHi);
}
function drawRightLeg(c) {
  drawLeg(c, PROS.rightX - 6 - 20, PROS.archY + 4, CURTAIN_HEM, 20);
}

function drawProscenium(c) {
  const { leftX, rightX, archY } = PROS;
  // Stage-right pillar (both drapes are already behind the stage).
  drawGiltPillar(c, rightX, -1);
  // arch band with a gentle sag, springing between both pillars
  for (let x = leftX; x <= rightX; x++) {
    const t = (x - leftX) / (rightX - leftX);
    const sag = Math.round(Math.sin(t * Math.PI) * 6);
    c.hline(x, archY + sag, 1, C.gold);
    c.set(x, archY + sag + 1, C.goldLo);
  }
}

// Soft ambient beams, both hung from the same height just below the arch and
// dropping straight down, so the resting stage already reads as lit from one
// consistent truss (matching the interactive cones the page overlays).
function drawAmbientBeams(c) {
  const { archY } = PROS;
  // Run down past the lowered deck crown so the stage body cuts each cone at the
  // deck, the same as before the stage was lowered.
  beam(c, 210, archY + 6, 210, UPPER_TOP + 6);
  beam(c, 300, archY + 6, 300, UPPER_TOP + 6);
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
  // Hangs well down over the opening: its arched scallops droop into the top of
  // the frame so the gilt reads as hanging from beneath it, and the arcs
  // themselves reach a good way down the proscenium.
  const valH = 34;
  for (let x = 0; x < W; x++) {
    const scallop = Math.round(Math.abs(Math.sin(x / 14)) * 13);
    const fold = Math.sin(x / 6) * 0.5 + 0.5;
    for (let y = 0; y < valH - scallop; y++) {
      const shade = 0.72 + fold * 0.28 - (y / valH) * 0.18;
      c.set(x, y, lerpCol(C.curtain, C.curtainHi, fold * 0.6, shade));
    }
    if (x % 14 === 7) c.set(x, valH - scallop, C.gold); // fringe ball
  }
  c.hline(0, 0, W, C.curtainLo);
}

// The valance alone on a full-stage transparent canvas, so the page can lay the
// arcs BACK OVER the conductor's front follow-spot: the scalloped edge occludes
// the cone's top exactly as the baked valance does the section beams, while the
// rest stays transparent so it covers nothing else (no box, no curtain leg over
// the light). Same coordinates as foreground()'s valance, so it lines up.
function stageArcs() {
  const { W, H } = STAGE;
  const c = new Canvas(W, H);
  drawValance(c, W);
  return c;
}

// A single seamless tile of the same grand valance, for the greeter's pelmet.
// It copies drawValance's arc verbatim: the scallop abs(sin(pi*x/44)) is the
// integer-period twin of abs(sin(x/14)) (1/14 == pi/44), so one lobe fills the
// 44px tile and repeats cleanly. Same fold shading and gold fringe balls; the
// hem is transparent below each cusp so the stage shows through the arcs. The
// page scales this up with image-rendering:pixelated, so the greeter's arcs are
// the exact pixel-art of the scene's valance, not a smoothed CSS approximation.
function greeterValanceTile() {
  const period = 44;
  const valH = 34;
  const c = new Canvas(period, valH);
  for (let x = 0; x < period; x++) {
    const scallop = Math.round(Math.abs(Math.sin((Math.PI * x) / period)) * 13);
    const fold = Math.sin((x * 2 * Math.PI) / period) * 0.5 + 0.5;
    for (let y = 0; y < valH - scallop; y++) {
      const shade = 0.72 + fold * 0.28 - (y / valH) * 0.18;
      c.set(x, y, lerpCol(C.curtain, C.curtainHi, fold * 0.6, shade));
    }
    if (x % 14 === 7) c.set(x, valH - scallop, C.gold); // fringe ball
  }
  return c;
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
  // lead + bass low, harmony + perc high), at the small crowd-matched scale.
  const f = 2;
  placeFoot(c, scaleUp(conductorSprite(), f), 0.37, 0.27);
  placeFoot(c, scaleUp(sectionSprite("trumpet", HUE.lead, 3), f), 0.5, 0.23);
  placeFoot(c, scaleUp(sectionSprite("violin", HUE.harmony, 3), f), 0.6, 0.33);
  placeFoot(c, scaleUp(sectionSprite("bass", HUE.bass, 2), f), 0.73, 0.24);
  placeFoot(c, scaleUp(sectionSprite("drum", HUE.perc, 2), f), 0.84, 0.32);
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
save("src/assets/art/stage-fg.png", foreground());
save("src/assets/art/conductor.png", conductorSprite());
save("src/assets/art/lead.png", sectionSprite("trumpet", HUE.lead, 3));
save("src/assets/art/harmony.png", sectionSprite("violin", HUE.harmony, 3));
save("src/assets/art/bass.png", sectionSprite("bass", HUE.bass, 2));
save("src/assets/art/perc.png", sectionSprite("drum", HUE.perc, 2));
save("src/assets/art/valance.png", greeterValanceTile());
save("src/assets/art/arcs.png", stageArcs());
save("public/card.png", card());

// Contact sheet that composites the sprites onto the scene at their real page
// anchors, so `pnpm art --sheet` shows what the live stage will look like.
if (process.argv.includes("--sheet")) {
  const c = background();
  placeFoot(c, conductorSprite(), 0.37, 0.27);
  placeFoot(c, sectionSprite("trumpet", HUE.lead, 3), 0.5, 0.23);
  placeFoot(c, sectionSprite("violin", HUE.harmony, 3), 0.6, 0.33);
  placeFoot(c, sectionSprite("bass", HUE.bass, 2), 0.73, 0.24);
  placeFoot(c, sectionSprite("drum", HUE.perc, 2), 0.84, 0.32);
  writeFileSync("/tmp/contact.png", scaleUp(c, 3).encodePNG());
  console.log("wrote /tmp/contact.png");
}
