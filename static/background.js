// Painted-canvas background: washes, brush strokes, paint blobs, canvas texture, coloured symbols
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const bg = document.createElement("div");
  bg.className = "art-bg";
  bg.setAttribute("aria-hidden", "true");
  bg.innerHTML = `
    <div class="wash w1"></div><div class="wash w2"></div><div class="wash w3"></div><div class="wash w4"></div>
    <svg class="strokes" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
      <defs><filter id="rough"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="4"/><feDisplacementMap in="SourceGraphic" scale="22"/></filter></defs>
      <g fill="none" stroke-linecap="round" filter="url(#rough)">
        <path d="M-50 840 C 200 770, 380 910, 620 840 S 950 770, 1080 810" stroke="#6bb8e0" stroke-width="38"/>
        <path d="M70 190 C 160 140, 260 220, 350 170" stroke="#e2b55f" stroke-width="18"/>
        <path d="M420 560 C 470 540, 520 580, 560 555" stroke="#7f9cc4" stroke-width="12"/>
      </g>
    </svg>
    <div class="splats"></div>
    <div class="texture"></div>
    <div class="doodles"></div>
    <svg width="0" height="0" style="position:absolute">
      <defs>
        <filter id="wobble"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="1.3"/></filter>
        <filter id="paint-edge"><feTurbulence type="fractalNoise" baseFrequency=".04" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="8"/></filter>
        <symbol id="splat" viewBox="0 0 200 280">
          <g fill="currentColor">
            <path d="M100 22 C140 18 172 44 176 84 C180 122 160 150 128 158 C110 163 92 162 74 156 C40 146 22 118 26 82 C30 46 62 25 100 22Z"/>
            <path d="M62 146 C64 170 66 190 66 205 a6.5 6.5 0 0 0 13 0 C79 190 80 170 82 146Z"/>
            <path d="M94 155 C96 185 97 215 97 238 a8 8 0 0 0 16 0 C113 215 114 185 116 155Z"/>
            <path d="M128 150 C130 165 131 178 131 186 a6 6 0 0 0 12 0 C143 178 144 165 146 146Z"/>
            <circle cx="105" cy="262" r="6"/>
            <circle cx="186" cy="60" r="5"/><circle cx="16" cy="120" r="4"/><circle cx="182" cy="140" r="3"/>
            <circle cx="30" cy="38" r="3"/><circle cx="150" cy="10" r="3.5"/>
          </g>
          <ellipse cx="78" cy="62" rx="26" ry="12" fill="#fff" opacity=".3" transform="rotate(-25 78 62)"/>
        </symbol>
        <symbol id="d-heartbeat" viewBox="0 0 24 24"><path d="M1 12h5l2-6 4 13 2.5-7H23"/></symbol>
        <symbol id="d-stethoscope" viewBox="0 0 24 24"><path d="M5 2v2M11 2v2M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/></symbol>
        <symbol id="d-cross" viewBox="0 0 24 24"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></symbol>
        <symbol id="d-pill" viewBox="0 0 24 24"><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7Z"/><path d="m7 10 7 7"/></symbol>
        <symbol id="d-heart" viewBox="0 0 24 24"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/></symbol>
        <symbol id="d-palette" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.7-1.7h2c3 0 5.5-2.5 5.5-5.5C22 6 17.5 2 12 2z"/><circle cx="13.5" cy="6.5" r=".9"/><circle cx="17.5" cy="10.5" r=".9"/><circle cx="8.5" cy="7.5" r=".9"/><circle cx="6.5" cy="12.5" r=".9"/></symbol>
        <symbol id="d-brush" viewBox="0 0 24 24"><path d="M18.4 2.6 14 7l-1.6-1.6a2 2 0 0 0-2.8 0L8 7l9 9 1.6-1.6a2 2 0 0 0 0-2.8L17 10l4.4-4.4a2.1 2.1 0 1 0-3-3Z"/><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/></symbol>
      </defs>
    </svg>`;
  document.body.prepend(bg);

  // Coloured symbols: [name, left %, top %, size, rotation, colour, extra = hidden on phones]
  const DOODLES = [
    ["heartbeat", 4, 14, 90, -6, "#e0674f"], ["stethoscope", 84, 9, 70, 12, "#2f9c8a"],
    ["cross", 12, 64, 34, -10, "#d6453d"], ["pill", 88, 62, 46, 30, "#4a78c2"],
    ["palette", 46, 3, 56, -8, "#d9a21b"], ["heart", 72, 86, 40, 10, "#e0674f"],
    ["brush", 5, 84, 64, -20, "#9b4f8f"], ["heartbeat", 58, 50, 110, 4, "#2f9c8a", 1],
    ["stethoscope", 25, 30, 52, -14, "#4a78c2", 1], ["cross", 66, 20, 26, 18, "#d6453d", 1],
    ["pill", 36, 80, 36, -35, "#d9a21b", 1], ["heart", 93, 36, 30, -12, "#9b4f8f", 1],
    ["palette", 18, 46, 44, 16, "#2f9c8a", 1],
  ];
  const doodleBox = bg.querySelector(".doodles");
  for (const [name, x, y, size, rot, color, extra] of DOODLES) {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", size);
    s.setAttribute("height", size);
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.5");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    if (extra) s.classList.add("extra");
    s.style.cssText = `left:${x}%;top:${y}%;transform:rotate(${rot}deg);color:${color}`;
    const use = document.createElementNS(NS, "use");
    use.setAttribute("href", `#d-${name}`);
    s.append(use);
    doodleBox.append(s);
  }

  // Dripping paint blobs: [left %, top %, size px, rotation, colour]
  const SPLATS = [
    [80, 4, 150, 8, "#d6453d"],   // red
    [2, 38, 115, -6, "#87ceeb"],  // light blue
    [76, 64, 90, 4, "#9fd8a8"],   // light green
  ];
  const splatBox = bg.querySelector(".splats");
  for (const [x, y, size, rot, color] of SPLATS) {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 200 280");
    s.style.cssText = `left:${x}%;top:${y}%;--sz:${size}px;transform:rotate(${rot}deg);color:${color}`;
    const use = document.createElementNS(NS, "use");
    use.setAttribute("href", "#splat");
    s.append(use);
    splatBox.append(s);
  }
})();