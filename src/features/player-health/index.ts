import { defineFeature } from '../../core/feature';
import { PLAYER_HEALTH_CONFIG as CFG } from './config';

const STYLE_ID = 'player-health-style';

const STYLE_TEXT = `
.ui-fullscreen > .player-health-vignette {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(180, 0, 0, 0) 40%, rgba(210, 20, 20, 0.9) 100%);
}
.ui-slot > .player-health-hint {
  pointer-events: none;
  font-size: 28px;
  font-weight: bold;
  text-shadow: 0 3px 0 #000;
}
`;

/** Adds the feature's stylesheet once, so ui.css stays untouched. */
function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.append(style);
}

export default defineFeature({
  id: 'player-health',
  setup(game) {
    injectStyle();
    const player = game.player;
    const vignette = game.ui.add('fullscreen', 'player-health-vignette');
    const hint = game.ui.add('bottom-center', 'player-health-hint', 'R : réapparaître');
    hint.style.display = 'none';

    /** Simulated time of the last damage taken by the player. */
    let lastDamageTime = Number.NEGATIVE_INFINITY;
    /** Remaining seconds of the red flash after a hit. */
    let flash = 0;
    /** Seconds since the guard fell over, or -1 while standing. */
    let fallTime = -1;
    let shownOpacity = -1;
    let hintShown = false;

    const standUp = (): void => {
      fallTime = -1;
      player.rig.parts.body.rotation.x = 0;
    };

    game.events.on('hit', ({ target }) => {
      if (target !== player.entity) return;
      lastDamageTime = game.time.elapsed;
      player.setInvulnerable(CFG.invulnerableSeconds);
      flash = CFG.vignette.hitFadeSeconds;
    });

    game.events.on('playerDeath', () => {
      fallTime = 0;
      game.ui.toast('Stagiaire K.O. !');
    });

    game.events.on('reset', () => {
      standUp();
      flash = 0;
      lastDamageTime = Number.NEGATIVE_INFINITY;
    });

    game.events.on('playerRespawn', standUp);

    game.input.bind(CFG.respawn.key, CFG.respawn.action);
    game.input.onPress(CFG.respawn.action, () => {
      if (game.paused) return;
      if (player.health.dead) {
        game.restart();
        return;
      }
      // Debug shortcut: refill health without restarting the run.
      player.health.current = player.health.max;
    });

    game.addSystem({
      name: 'player-health',
      priority: 110,
      fixedUpdate(dt: number) {
        const health = player.health;
        if (health.dead || health.current >= health.max) return;
        if (game.time.elapsed - lastDamageTime < CFG.regenDelaySeconds) return;
        health.current = Math.min(health.max, health.current + CFG.regenPerSecond * dt);
      },
      update(dt: number) {
        flash = Math.max(0, flash - dt);

        const low = player.health.ratio < CFG.lowHealthRatio;
        const base = low ? CFG.vignette.lowHealthOpacity : CFG.vignette.idleOpacity;
        const flashAmount = CFG.vignette.hitOpacity * (flash / CFG.vignette.hitFadeSeconds);
        const opacity = Math.min(1, base + flashAmount);
        if (Math.abs(opacity - shownOpacity) > 0.002) {
          vignette.style.opacity = String(opacity);
          shownOpacity = opacity;
        }

        if (player.health.dead !== hintShown) {
          hintShown = player.health.dead;
          hint.style.display = hintShown ? '' : 'none';
        }

        if (fallTime >= 0) {
          fallTime = Math.min(fallTime + dt, CFG.fall.seconds);
          const t = CFG.fall.seconds > 0 ? fallTime / CFG.fall.seconds : 1;
          const eased = 1 - (1 - t) * (1 - t) * (1 - t);
          player.rig.parts.body.rotation.x = -CFG.fall.angle * eased;
        }
      },
    });
  },
});
