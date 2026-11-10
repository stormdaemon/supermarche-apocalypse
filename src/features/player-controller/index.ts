import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import type { RigAction } from '../../core/characterFactory';
import { PLAYER_CONTROLLER_CONFIG as CFG } from './config';
import { ArcadeMotor } from './motor';

const COMBO_ACTIONS: readonly RigAction[] = ['punchLeft', 'punchRight', 'uppercut'];

/** Bare-hand 1-2-3 combo, used only when no weapon is held. */
function addPunchSystem(game: Game): void {
  let step = 0;
  let lastPunch = -Infinity;
  game.addSystem({
    name: 'player-punch',
    priority: 110,
    fixedUpdate: () => {
      const player = game.player;
      const now = game.time.elapsed;
      if (!game.input.pressed('attack') || game.weapons.held || !player.canControl) return;
      if (game.motor instanceof ArcadeMotor && (game.motor.diving || game.motor.getUpTime > 0))
        return;
      if (now - lastPunch < CFG.punch.cooldown) return;
      step = now - lastPunch <= CFG.punch.comboWindow ? (step + 1) % CFG.punch.steps.length : 0;
      lastPunch = now;
      const stats = CFG.punch.steps[step] ?? CFG.punch.steps[0];
      const dir = game.aim.direction.clone();
      player.facing = Math.atan2(dir.x, dir.z);
      player.rig.trigger(COMBO_ACTIONS[step] ?? 'punchRight', step === 2 ? 0.35 : 0.2);
      const hits = game.combat.meleeSweep({
        origin: player.position.clone().setY(player.position.y + 1),
        direction: dir,
        range: CFG.punch.range,
        arc: CFG.punch.arc,
        exclude: player.entity,
        info: {
          damage: stats.damage,
          force: dir.clone().multiplyScalar(stats.force).setY(stats.lift),
          source: player.entity,
          kind: step === 2 ? 'uppercut' : 'punch',
          stun: stats.stun,
        },
      });
      game.events.emit('playerAttack', { combo: step + 1, hits: hits.length });
    },
  });
  game.events.on('reset', () => {
    step = 0;
    lastPunch = -Infinity;
  });
}

/** Belly-dive pose and jump/land squash, applied after the core walk animation. */
function addPoseSystem(game: Game): void {
  game.addSystem({
    name: 'player-pose',
    priority: 110,
    update: () => {
      const motor = game.motor;
      if (!(motor instanceof ArcadeMotor)) return;
      const rig = game.player.rig;
      const body = rig.parts.body;
      if (motor.diving) {
        body.rotation.x = Math.PI / 2.2;
        body.position.y = 0.35;
        rig.parts.armL.rotation.x = -Math.PI;
        rig.parts.armR.rotation.x = -Math.PI;
      } else if (motor.getUpTime > 0) {
        body.rotation.x = (motor.getUpTime / CFG.dive.getUp) * (Math.PI / 2.2);
      } else {
        body.rotation.x = 0;
      }
      const sinceLanding = game.time.elapsed - motor.landedAt;
      const squash = sinceLanding < 0.15 ? Math.sin((sinceLanding / 0.15) * Math.PI) * 0.25 : 0;
      const stretch = game.player.grounded
        ? 0
        : Math.min(Math.abs(game.player.velocity.y) / 40, 0.15);
      rig.root.scale.set(
        1 + squash - stretch * 0.5,
        1 - squash + stretch,
        1 + squash - stretch * 0.5,
      );
    },
  });
}

export default defineFeature({
  id: 'player-controller',
  register(registry) {
    registry.provide('playerMotor', () => new ArcadeMotor(), 10);
  },
  setup(game) {
    addPunchSystem(game);
    addPoseSystem(game);
  },
});
