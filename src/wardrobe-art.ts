import type { Item } from "./simulation/data";

/** The collection thumbnails mirror each outfit's cut, rather than its palette. */
export function wardrobeArt(item: Item) {
  const c = item.color;
  const a = item.accent;
  const gold = "#c8a267";
  const ink = "#6a557d";
  const shape = Math.max(0, Math.min(5, item.shape));
  const uid = `art-${item.id}`;
  const pearl = (x: number, y: number, r = 1.5) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${a}" stroke="${gold}" stroke-width=".55"/>`;
  const star = (x: number, y: number, size = 4) =>
    `<path d="M${x} ${y - size}l${size * 0.3} ${size * 0.7} ${size * 0.7} ${size * 0.3}-${size * 0.7} ${size * 0.3}-${size * 0.3} ${size * 0.7}-${size * 0.3}-${size * 0.7}-${size * 0.7}-${size * 0.3} ${size * 0.7}-${size * 0.3}z" fill="${gold}"/>`;
  const flower = (x: number, y: number, r = 4, color = c) =>
    `<g fill="${color}" stroke="${gold}" stroke-width=".45">${Array.from({ length: 5 }, (_, n) => `<ellipse cx="${x}" cy="${y - r * 0.6}" rx="${r * 0.48}" ry="${r * 0.73}" transform="rotate(${n * 72} ${x} ${y})"/>`).join("")}</g>${pearl(x, y, r * 0.28)}`;
  const bow = (x: number, y: number, color = a, size = 6) =>
    `<path d="M${x} ${y}l-${size}-${size * 0.6}v${size * 1.2}zM${x} ${y}l${size}-${size * 0.6}v${size * 1.2}z" fill="${color}" stroke="${gold}" stroke-width=".6"/>${pearl(x, y, 1.7)}`;
  const shimmer = `url(#${uid}-silk)`;
  let body = "";
  if (item.category === "dress") {
    const bodies = [
      // Fitted cream inset, puff sleeves, scalloped bell skirt and star brooch.
      `<path d="M35 23q15 8 30 0l-4 25q16 23 23 61-34 12-68 0 7-38 23-61z" fill="${shimmer}"/><path d="M34 23q-10-4-12 7l2 11 12-1 6-11m24-6q10-4 12 7l-2 11-12-1-6-11" fill="${c}" stroke="${a}" stroke-width="2"/><path d="M42 26h16l-2 20H44z" fill="${a}"/><path d="M39 49q11 4 22 0 13 14 17 35-8 13-17 5-11 14-22 0-9 8-17-5 4-21 17-35z" fill="${c}" stroke="${a}" stroke-width="3"/><path d="M17 107q33 10 66 0" stroke="${a}" stroke-width="6" fill="none"/>${bow(50, 48, a, 8)}${star(50, 47, 4)}${star(31, 96, 3)}${star(67, 101, 3)}${star(49, 96, 2.5)}<path d="M50 30l3 4-3 4-3-4z" fill="#83bfe0"/>`,
      // Short Lolita skirt, puff sleeves, ruffles and embroidered apron.
      `<path d="M34 22q16 9 32 0l-3 26q19 19 25 42-38 20-76 0 6-23 25-42z" fill="${shimmer}"/><path d="M32 23q-15 0-14 18l14 3 8-12m28-9q15 0 14 18l-14 3-8-12" fill="${c}" stroke="${a}" stroke-width="2"/><path d="M40 23h20l-1 23H41zM38 50h24l11 29q-23 10-46 0z" fill="${a}"/><path d="M13 88q3 14 8 5 3 15 9 5 5 13 11 3 9 12 16 0 6 10 12-3 6 10 10-5 6 9 9-5" fill="${a}" stroke="${gold}" stroke-width=".8"/><path d="M37 49h26M33 75q17 5 34 0" stroke="${gold}" fill="none"/>${bow(50, 46, c, 8)}${bow(25, 36, a, 4)}${bow(75, 36, a, 4)}${flower(50, 63, 4, c)}${[32, 40, 60, 68].map((x) => pearl(x, 85, 1)).join("")}`,
      // Forest one-shoulder bodice with overlapping pointed leaves.
      `<path d="M34 23l14 8 15-15-2 31 15 17-20 44-18-9-17-27 18-25z" fill="${shimmer}"/><path d="M39 48Q18 55 14 82q17 0 28-24Q27 86 32 101q17-3 21-40Q49 94 62 112q13-16-1-51Q78 88 88 87q-3-25-27-39z" fill="${c}" stroke="${a}" stroke-width="1.2"/><path d="M40 50l-20 27m27-22-10 39m17-38 7 43m-1-47 22 28" fill="none" stroke="${gold}" stroke-width=".9"/><path d="M36 29l-7 20 10 1 5-16M60 18q12-9 17-1l-15 10" fill="${a}"/>${flower(61, 21, 5, a)}${flower(47, 48, 5, a)}${pearl(58, 58)}${pearl(37, 65)}${pearl(60, 83)}`,
      // Fitted mermaid dress and a sculpted ice-fan hem.
      `<path d="M37 22q13 10 26 0l-4 23 4 25-7 20 19 23q-25 6-50 0l19-23-7-20 4-25z" fill="${shimmer}"/><path d="M37 22l-11 11 8 7 10-12m19-6 11 11-8 7-10-12" fill="${a}"/><path d="M44 83l-20 25 7-4-4 11 15-7 8 7 8-7 15 7-4-11 7 4-20-25z" fill="${a}" stroke="${c}" stroke-width="1.4"/><path d="M44 88l-8 21m12-22-1 22m6-22 2 22m1-22 9 22M39 42l22 12-22 12 22 12" stroke="${gold}" fill="none" stroke-width=".8"/>${pearl(50, 30, 3)}${[46, 54].map((x) => pearl(x, 70, 1)).join("")}<path d="M50 46l5 8-5 8-5-8z" fill="${a}" stroke="${gold}"/>`,
      // Tailcoat overskirt, high collar, stars and asymmetric train.
      `<path d="M34 20l10-3 6 10 6-10 10 3-5 27 14 34q-25 9-50 0l14-34z" fill="${shimmer}"/><path d="M37 47l-13 50 10 11 10-23 6 28 6-28 13 21 8-9-15-50z" fill="${c}" stroke="${gold}" stroke-width="1"/><path d="M40 48l-13 30q23 8 46 0L60 48z" fill="${a}"/><path d="M35 22L24 39l11 6 8-20m22-3 11 17-11 6-8-20" fill="${c}"/><path d="M41 21l9 16 9-16M38 45h24" fill="none" stroke="${gold}" stroke-width="2"/>${star(50, 38, 4)}${star(32, 73, 2.4)}${star(48, 70, 2)}${star(63, 76, 2.8)}${star(36, 95, 3)}${pearl(64, 54)}${bow(50, 47, c, 6)}`,
      // Wide coronation crinoline, patterned front panel and royal train.
      `<path d="M35 21q15 7 30 0l-3 24q18 21 32 66-44 10-88 0 14-45 32-66z" fill="${shimmer}"/><path d="M34 22l-9 7 8 17 10-18m23-6 9 7-8 17-10-18" fill="${a}"/><path d="M41 47h18l17 61q-26 10-52 0z" fill="${a}"/><path d="M37 46q-6 31-23 45 15 2 24-9m25-36q6 31 23 45-15 2-24-9" fill="${c}" stroke="${gold}" stroke-width="1.2"/><path d="M8 108q42 11 84 0M30 98q20 6 40 0" fill="none" stroke="${gold}" stroke-width="2"/><path d="M50 57v39m-10-32 10 8 10-8m-15 12 5 8 5-8" stroke="${gold}" fill="none"/>${bow(50, 45, a, 8)}${flower(50, 30, 4, a)}${[22, 32, 68, 78].map((x) => pearl(x, 99 + (x === 32 || x === 68 ? 5 : 0), 1.4)).join("")}${star(50, 100, 4)}`,
    ];
    body = bodies[shape];
  } else if (item.category === "hair") {
    const face = `<ellipse cx="50" cy="53" rx="18" ry="23" fill="#ffe3d5"/><path d="M38 51q4-3 8 0m8 0q4-3 8 0" stroke="${ink}" fill="none" stroke-width="1.3"/><path d="M47 64q3 3 6 0" stroke="#c78992" fill="none" stroke-width="1.2"/>`;
    const hair = [
      `<path d="M24 55Q14 18 50 16q36 2 26 40l6 48-23 6-4-35-10 1-6 34-22-7z" fill="${shimmer}"/>${face}<path d="M27 52q-7-33 22-34 27 0 24 32L60 31 48 45l-8-16z" fill="${c}"/><path d="M29 48q-6 33-1 53m43-53q6 33 1 53M35 76l-3 25m31-25 4 25" stroke="${a}" fill="none" stroke-width="2"/>${star(30, 44, 3)}`,
      `<path d="M30 30Q7 21 12 59l-6 31 20 14 10-47m34-27q23-9 18 29l6 31-20 14-10-47" fill="${shimmer}"/><path d="M25 54Q15 18 50 15q35 3 25 39z" fill="${c}"/>${face}<path d="M27 46Q25 16 49 16q27 0 24 30L58 31l-7 15-9-17-10 17" fill="${c}"/><path d="M17 48q-9 25 4 47m62-47q9 25-4 47" stroke="${a}" fill="none" stroke-width="2"/>${bow(27, 36, a, 7)}${bow(73, 36, a, 7)}`,
      `<path d="M26 57Q13 20 49 16q37 0 26 42L66 99H36z" fill="${shimmer}"/>${face}<path d="M26 43q-2-26 23-27 29-2 27 29L62 28Q46 52 29 54z" fill="${c}"/><path d="M67 49q-9 10 1 16-11 9-3 17-12 5-5 15l-8 8-4-8 7-14-1-14 6-18z" fill="${c}" stroke="${a}" stroke-width="1.5"/>${flower(30, 37, 5, a)}${bow(56, 99, a, 5)}`,
      `<path d="M22 48Q15 15 51 15q35 1 28 36 10 7 0 17 10 6-1 16 10 8-3 18l-18 6-10-32-9 29-18-3q-12-9-2-17-13-8-1-17-12-9 4-20z" fill="${shimmer}"/>${face}<path d="M27 48Q18 20 50 17q32 1 25 31L59 30l-11 15-10-19z" fill="${c}"/><path d="M25 51q-8 10 3 16-10 10-1 17-11 9 1 15m43-48q10 10-1 16 10 10 1 17 11 9-1 15" stroke="${a}" stroke-width="2" fill="none"/>${pearl(71, 40, 3)}${pearl(73, 46)}`,
      `<path d="M23 57Q15 20 49 16q33 0 29 40l-4 29-12-3-7-10-15 4-16 4z" fill="${shimmer}"/>${face}<path d="M25 51Q18 19 48 16q29-2 29 29L65 29 51 52 41 37 28 53" fill="${c}"/><path d="M25 59l4 14m43-19-5 23" stroke="${a}" stroke-width="2"/>${star(70, 35, 4)}`,
      `<path d="M25 54Q14 18 50 15q34 0 26 38l8 49-19 7-12-24-16 26-19-10z" fill="${shimmer}"/><ellipse cx="50" cy="23" rx="21" ry="12" fill="${c}"/>${face}<path d="M27 46Q25 19 50 18q25 0 23 29L59 29Q43 43 27 46z" fill="${c}"/><path d="M31 60q-6 14 4 19-13 12 0 22m34-41q6 14-4 19 13 12 0 22" stroke="${a}" stroke-width="2" fill="none"/>${bow(50, 18, a, 8)}${pearl(35, 25)}${pearl(65, 25)}`,
    ];
    body = hair[shape];
  } else if (item.category === "crown") {
    body = [
      `<path d="M17 65l8-28 13 20 12-32 12 32 13-20 8 28-8 13H25z" fill="${shimmer}" stroke="${gold}" stroke-width="1.4"/><path d="M24 68h52" stroke="${a}" stroke-width="6"/>${star(50, 43, 8)}${[25, 38, 62, 75].map((x) => pearl(x, 60, 2.2)).join("")}`,
      `<path d="M18 67Q17 34 49 33q34 0 34 34M21 63q29-11 59 0" stroke="${gold}" fill="none" stroke-width="3"/>${[21, 33, 47, 61, 77].map((x, n) => flower(x, 55 - Math.sin((n * Math.PI) / 4) * 14, 7, n % 2 ? a : c)).join("")}<path d="M24 69l-6 22 12-9m46-13 6 22-12-9" fill="${a}"/>`,
      `<path d="M20 72Q6 36 48 28m32 44q14-36-28-44" fill="none" stroke="${gold}" stroke-width="2"/>${[0, 1, 2, 3, 4].map((n) => `<path d="M${22 + n * 5} ${68 - n * 7}q-15-5-9-14 13 2 9 14m${56 - n * 5} 0q15-5 9-14-13 2-9 14" fill="${n % 2 ? a : c}" stroke="${gold}" stroke-width=".65"/>`).join("")}${flower(50, 30, 6, a)}`,
      `<path d="M17 75l4-21 12 6 5-24 12 16 12-16 5 24 12-6 4 21z" fill="${a}" stroke="${gold}" stroke-width="1.2"/><path d="M24 68l3-21 7 21m8-2 8-40 8 40m8 2 7-21 3 21" fill="${c}" stroke="${a}" stroke-width="1.2"/><path d="M21 73h58" stroke="${c}" stroke-width="5"/>${pearl(50, 58, 4)}`,
      `<ellipse cx="50" cy="64" rx="32" ry="11" fill="none" stroke="${gold}" stroke-width="4"/><path d="M51 23a20 20 0 1 0 21 28 18 18 0 0 1-21-28" fill="${shimmer}" stroke="${gold}" stroke-width="1"/>${star(27, 35, 4)}${star(75, 41, 6)}${star(40, 48, 3)}<path d="M28 67l-4 15m50-15 4 15" stroke="${gold}"/>${pearl(24, 84, 2)}${pearl(78, 84, 2)}`,
      `<path d="M13 68l8-22 10 8 3-24 16 18 16-18 3 24 10-8 8 22-7 14H20z" fill="${shimmer}" stroke="${gold}" stroke-width="2"/><path d="M20 72h60" stroke="${a}" stroke-width="7"/><circle cx="50" cy="57" r="10" fill="${a}" stroke="${gold}"/>${star(50, 57, 7)}${[23, 34, 66, 77].map((x) => pearl(x, 65, 2)).join("")}`,
    ][shape];
  } else if (item.category === "shoes") {
    const shoe = (x: number, y: number, n: number) =>
      `<g transform="translate(${x} ${y}) rotate(${n})">${
        [
          `<path d="M3 9h17l-2 21 21 10q6 9-7 10H3l-3-10z" fill="${shimmer}"/><path d="M4 18l13 9M18 18L4 29" stroke="${a}" stroke-width="3"/><path d="M1 45h36M5 48v7" stroke="${gold}" stroke-width="2"/>${bow(20, 35, a, 5)}`,
          `<path d="M4 17h16l-2 19 21 4q8 11-6 13H3l-3-11z" fill="${shimmer}"/><path d="M4 23h14M3 42h29" stroke="${a}" stroke-width="5"/><path d="M5 51v7m28-6 3 6" stroke="${gold}" stroke-width="3"/>${flower(19, 35, 5, a)}`,
          `<path d="M4 7h21l-4 28 19 7q5 12-7 13H0l-2-15z" fill="${shimmer}"/><path d="M3 9h22l-4 11-9-5-11 5M1 48h36" fill="${a}"/><path d="M13 23l-6 5 8 5-9 6" stroke="${gold}" fill="none" stroke-width="1.2"/>${pearl(23, 14, 2)}`,
          `<path d="M3 20l17-7-2 24 24 5q6 10-8 12H4l-4-11z" fill="${a}" opacity=".9" stroke="${c}" stroke-width="1.5"/><path d="M5 49h35M6 51v8m28-7 3 6" stroke="${c}" stroke-width="3"/><path d="M19 35l6 6-6 6-6-6z" fill="${c}"/>${star(24, 30, 3)}`,
          `<path d="M2 0h23l-6 37 22 8q4 10-10 11H0l-1-17z" fill="${shimmer}"/><path d="M3 6h20M0 48h37" stroke="${a}" stroke-width="3"/><path d="M10 13l7 5-9 5 8 5-10 5" stroke="${gold}" stroke-width="1" fill="none"/>${star(11, 9, 3)}<path d="M2 54v6" stroke="${gold}" stroke-width="4"/>`,
          `<path d="M4 14h16l-1 24 21 5q7 10-6 12H3l-3-11z" fill="${shimmer}"/><path d="M4 19l13 9M17 19L4 31M2 50h36" stroke="${gold}" stroke-width="2.6"/><path d="M5 52v7" stroke="${gold}" stroke-width="4"/>${flower(20, 38, 5, a)}`,
        ][shape]
      }</g>`;
    body = shoe(14, 34, -8) + shoe(53, 24, 8);
  } else if (item.category === "wings") {
    const half = [
      `<path d="M49 67Q-1 3 9 48q3 23 33 21Q5 76 21 103q22 10 28-34z" fill="${shimmer}" stroke="${gold}" stroke-width=".8"/><path d="M45 62L16 32m29 34L16 50m31 23-20 19" stroke="${a}" stroke-width="1.7"/>${star(22, 51, 3)}`,
      `<path d="M49 64Q9 5 8 28q-10 24 13 38-12 0-17 14 9 28 33 14l12-28z" fill="${shimmer}" stroke="${a}" stroke-width="1.6"/><path d="M46 63Q24 28 16 31M44 67Q19 58 16 55M45 76Q20 77 17 85" fill="none" stroke="${gold}"/>${flower(22, 48, 5, a)}`,
      `<path d="M49 68Q31 2 5 31q-4 36 35 38-36 5-26 36 25 5 35-37z" fill="${shimmer}" stroke="${a}"/><path d="M45 64L15 30m26 32L18 48m31 22-25 25m20-33L25 25m11 31L10 54" fill="none" stroke="${gold}" stroke-width="1.1"/>`,
      `<path d="M48 70L7 22l4 31-8 8 28 13-16 24 21-5 6 18z" fill="${a}" stroke="${c}" stroke-width="1.8"/><path d="M47 70L15 34l7 24-9 5 29 8-19 20 17-2" fill="${c}" opacity=".7"/><path d="M47 70L15 34m32 36L13 63m34 7L24 94" fill="none" stroke="${gold}"/>`,
      `<path d="M49 67Q39 1 10 23q-18 26 23 40Q5 60 5 78q0 28 29 24l15-33z" fill="${shimmer}" stroke="${gold}"/><path d="M46 64Q20 33 16 30M42 66Q20 85 17 91" fill="none" stroke="${a}" stroke-width="1.6"/>${star(20, 45, 4)}${star(28, 57, 3)}${star(21, 86, 5)}${pearl(30, 78)}${pearl(15, 67)}`,
      `<path d="M48 70Q28 50 9 13q-8 21 3 41L6 39q-3 31 23 38L9 63q-4 20 26 24l-16-7q6 27 29 12z" fill="${a}" stroke="${gold}" stroke-width=".8"/><path d="M46 75Q23 54 14 28m30 52L16 54m29 32-20-11" fill="none" stroke="${c}" stroke-width="1.7"/>`,
    ][shape];
    body =
      half +
      `<g transform="translate(100 0) scale(-1 1)">${half}</g><ellipse cx="50" cy="72" rx="3" ry="15" fill="${gold}"/>${pearl(50, 68, 3)}`;
  } else {
    const staff = `<path d="M29 110L62 39" stroke="${gold}" stroke-width="4"/><path d="M32 104l28-61" stroke="${a}" stroke-width="1.2"/>`;
    body = [
      `${staff}<path d="M65 11l6 15 16 2-12 12 3 17-15-9-14 8 3-17-12-12 18-2z" fill="${shimmer}" stroke="${gold}" stroke-width="1.3"/>${star(64, 34, 5)}${bow(53, 58, a, 9)}<path d="M51 61l-8 16m13-16 2 20" stroke="${a}" stroke-width="3"/>`,
      `${staff}<path d="M64 39Q43 34 46 20q7-14 19-7 16-9 20 8 2 17-21 18z" fill="${c}" stroke="${gold}"/><path d="M54 25q-1-11 9-7 11-5 10 6-4 9-14 7 12-4 5-9" fill="none" stroke="${a}" stroke-width="2"/><path d="M55 54q-15-16-20-5 7 14 20 5m5-8q14-16 18-6-6 12-18 6" fill="${a}"/>${bow(51, 64, a, 7)}`,
      `<path d="M28 112q6-27 17-41 19-18 12-38l10-21m-11 27-15-8m17 10 19-13" stroke="${gold}" stroke-width="4" fill="none"/><path d="M63 21q-4-15 9-19 6 12-9 19M46 33q-17 2-19-12 15-5 19 12m23 1q2-18 16-17 4 15-16 17M43 69q-19-2-18-17 15-2 18 17" fill="${shimmer}" stroke="${a}"/>${flower(57, 44, 7, a)}`,
      `${staff}<path d="M66 9l13 20-14 20-15-20z" fill="${c}" stroke="${a}" stroke-width="2"/><path d="M66 9v40m-16-20h29" stroke="${a}"/><path d="M44 27l9 13m30-15-9 15m-23 7 14 10 14-10" stroke="${gold}" fill="none" stroke-width="2"/>${star(42, 14, 4)}${star(88, 41, 4)}`,
      `${staff}<circle cx="65" cy="28" r="20" stroke="${gold}" stroke-width="2" fill="none"/><path d="M70 12a17 17 0 1 0 9 28 15 15 0 0 1-9-28" fill="${shimmer}"/>${star(72, 28, 7)}${star(39, 39, 4)}<path d="M47 42l-7 16m44-17 2 18" stroke="${gold}"/>${pearl(39, 61, 2)}${pearl(86, 61, 2)}`,
      `${staff}<circle cx="65" cy="29" r="15" fill="${a}" stroke="${gold}" stroke-width="2"/>${Array.from({ length: 8 }, (_, n) => `<path d="M65 7v-5l3-5-3-5-3 5 3 5" transform="rotate(${n * 45} 65 29)" fill="${c}" stroke="${gold}" stroke-width="1"/>`).join("")}${star(65, 29, 9)}${bow(52, 59, a, 10)}`,
    ][shape];
  }
  return `<svg viewBox="0 0 100 120" aria-hidden="true" focusable="false" class="item-art" data-art-shape="${item.category}-${shape}"><defs><linearGradient id="${uid}-silk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset=".68" stop-color="${c}"/><stop offset=".68" stop-color="${a}"/><stop offset="1" stop-color="${a}"/></linearGradient><filter id="${uid}-shadow" x="-30%" y="-20%" width="160%" height="155%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#897293" flood-opacity=".16"/></filter></defs><g filter="url(#${uid}-shadow)">${body}</g></svg>`;
}
