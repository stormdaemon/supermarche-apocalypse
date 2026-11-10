import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { AUDIO_SFX_CONFIG as C, type ShoutSyllable } from './config';
import { Mixer } from './mixer';
import { Synth } from './synth';

type ImpactKind = 'boing' | 'paf' | 'pouet';

interface Impact {
  duration: number;
  play(synth: Synth, start: number): void;
}

const IMPACTS: Record<ImpactKind, Impact> = {
  boing: { duration: C.impact.boing.duration, play: (s, t) => s.boing(t) },
  paf: { duration: C.impact.paf.duration, play: (s, t) => s.paf(t) },
  pouet: { duration: C.impact.pouet.duration, play: (s, t) => s.pouet(t) },
};

/** Picks the cartoon sound of a hit from its damage and kind. */
function impactKind(damage: number, kind: string): ImpactKind {
  if (kind === 'explosion' || damage >= C.impact.heavyDamage) return 'paf';
  if (kind.startsWith('throw:') || damage >= C.impact.mediumDamage) return 'boing';
  return 'pouet';
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}

/** Seconds until the next crowd shout: shorter when many enemies are alive. */
function nextShoutDelay(enemyCount: number): number {
  const density = Math.min(enemyCount / C.crowd.saturationCount, 1);
  const base = C.crowd.maxInterval + (C.crowd.minInterval - C.crowd.maxInterval) * density;
  return base * (0.7 + Math.random() * 0.6);
}

/** Reads the persisted mute state; storage can be blocked, then sound stays on. */
function readStoredMute(): boolean {
  try {
    return window.localStorage.getItem(C.storageKey) === '1';
  } catch {
    // Private mode or blocked storage: the mute state simply is not remembered.
    return false;
  }
}

function writeStoredMute(muted: boolean): void {
  try {
    window.localStorage.setItem(C.storageKey, muted ? '1' : '0');
  } catch {
    // Blocked storage: the mute state only lasts for this page load.
  }
}

function setupAudioSfx(game: Game): void {
  const mixer = new Mixer(C.mixer.maxVoices);
  let synth: Synth | null = null;

  /**
   * Plays a sound on a channel when the mixer accepts it. Silent while muted or before
   * the audio context is unlocked by the first user gesture.
   */
  const trigger = (
    channel: string,
    cooldown: number,
    duration: number,
    play: (s: Synth, start: number) => void,
  ): void => {
    if (game.audio.muted) return;
    const ctx = game.audio.ctx;
    const out = game.audio.output;
    if (!ctx || !out || ctx.state !== 'running') return;
    let current = synth;
    if (!current || current.ctx !== ctx) {
      current = new Synth(ctx, out);
      synth = current;
    }
    const now = ctx.currentTime;
    if (!mixer.request(channel, now, cooldown, duration)) return;
    play(current, now);
  };

  const checkout = (): void =>
    trigger('checkout', C.checkout.cooldown, C.checkout.duration, (s, t) => s.beep(t));

  game.events.on('hit', (e) => {
    if (e.kind.includes(C.caddie.keyword)) {
      trigger('caddie', C.caddie.cooldown, C.caddie.duration, (s, t) => s.caddie(t));
      return;
    }
    const kind = impactKind(e.damage, e.kind);
    const impact = IMPACTS[kind];
    trigger(kind, C.impact.cooldown, impact.duration, (s, t) => impact.play(s, t));
  });

  game.events.on('scoreChange', (e) => {
    if (e.delta > 0) checkout();
  });
  game.events.on('pickup', () => checkout());

  game.events.on('announcement', () => {
    trigger('jingle', C.jingle.cooldown, C.jingle.duration, (s, t) => s.jingle(t));
  });

  // Crowd: sale shouts at random moments, more often when many enemies are alive.
  let shoutTimer: number | null = null;
  game.events.on('reset', () => {
    shoutTimer = null;
  });
  game.addSystem({
    name: 'audio-sfx-crowd',
    priority: 100,
    update: (dt: number) => {
      const count = game.enemies.count;
      if (count === 0) return;
      if (shoutTimer === null) shoutTimer = nextShoutDelay(count);
      shoutTimer -= dt;
      if (shoutTimer > 0) return;
      shoutTimer = nextShoutDelay(count);
      const syllables: readonly ShoutSyllable[] = pick(C.crowd.shouts);
      trigger('shout', C.crowd.cooldown, C.crowd.duration, (s, t) => s.shout(t, syllables));
    },
  });

  // Mute: DOM button in the top-right corner plus the M key.
  game.audio.setMuted(readStoredMute());
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'audio-sfx-mute';
  Object.assign(button.style, {
    font: 'inherit',
    fontSize: '22px',
    lineHeight: '1',
    padding: '6px 12px',
    borderRadius: '999px',
    border: '2px solid #ffe066',
    background: 'rgba(20, 18, 31, 0.75)',
    color: '#fff',
    cursor: 'pointer',
  });

  const refreshButton = (): void => {
    button.textContent = game.audio.muted ? '🔇' : '🔊';
    const label = game.audio.muted ? 'Activer le son' : 'Couper le son';
    button.setAttribute('aria-label', label);
    button.title = `${label} (touche ${C.muteKey.toUpperCase()})`;
  };

  const toggleMute = (): void => {
    const muted = !game.audio.muted;
    game.audio.setMuted(muted);
    writeStoredMute(muted);
    refreshButton();
  };

  button.addEventListener('click', () => {
    toggleMute();
    // Drop focus so that Space keeps jumping instead of re-clicking the button.
    button.blur();
  });
  game.ui.slot('top-right').append(button);
  refreshButton();

  game.input.bind(C.muteKey, 'custom:mute');
  game.input.onPress('custom:mute', toggleMute);
}

export default defineFeature({
  id: 'audio-sfx',
  setup(game) {
    setupAudioSfx(game);
  },
});
