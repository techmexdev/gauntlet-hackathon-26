(() => {
  const HUD_ID = 'sdf-hud';

  function ensureHud() {
    let hud = document.getElementById(HUD_ID);
    if (!hud) {
      hud = document.createElement('div');
      hud.id = HUD_ID;
      hud.className = 'sdf-hud';
      hud.innerHTML = `
        <div id="sdf-quiet-ticker-slot" class="sdf-hud-ticker-slot"></div>
        <div id="sdf-dock-slot" class="sdf-hud-dock-slot"></div>
      `;
      document.body.appendChild(hud);
    }
    return hud;
  }

  window.sdfHudAnchor = {
    ensureHud,
    reposition: () => {},
    HUD_ID,
    tickerSlotId: 'sdf-quiet-ticker-slot',
    dockSlotId: 'sdf-dock-slot',
  };

  ensureHud();

  sdfRuntime?.onInvalidate?.(() => {
    document.getElementById(HUD_ID)?.remove();
  });
})();
