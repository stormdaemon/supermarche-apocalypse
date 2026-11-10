/** Balancing values of the pickle jar pyramid trap. All durations are simulated seconds. */
export const PYRAMID_CONFIG = {
  /** Indexes into game.arena.layout.trapSpots where a tower is built. */
  spotIndices: [2],
  jar: {
    /** Outer radius of one glass jar, in metres. */
    radius: 0.27,
    /** Height of one jar body, lid included, in metres. */
    height: 0.5,
    /** Empty space between two neighbouring jars, in metres. */
    gap: 0.03,
    /** Mass of one glass jar, in kilograms. */
    mass: 1.2,
    /** Jars along one side of the bottom layer. */
    baseSide: 3,
    /** Layers built before the stack narrows by one jar on each side. */
    layersPerStep: 4,
    /** Space kept between the top of the tower and the ceiling, in metres. */
    ceilingMargin: 0.6,
  },
  collapse: {
    /** Horizontal speed given to the top of the tower when it falls, in m/s. */
    toppleSpeed: 4,
    /** Delay between the collapse and the magical re-stacking. */
    rebuildDelay: 5,
    /** Time after a rebuild during which impacts are ignored (prevents an instant re-collapse). */
    rebuildGrace: 1.5,
    /** Radius around the tower centre whose characters are knocked out when it falls. */
    crushRadius: 2.2,
    /** How long a character stays knocked out under the falling tower. */
    knockoutDuration: 2.5,
    /** Shadow map refresh period while the jars are moving. */
    shadowRefreshInterval: 0.5,
  },
  impact: {
    /** Relative speed (m/s) of a hit that shatters a jar. */
    breakSpeed: 5,
    /** Relative speed (m/s) a falling jar needs to hurt a character. */
    minDamageSpeed: 4,
    /** Damage of one jar hitting a character. */
    damage: 8,
    /** Horizontal push given to a character hit by a jar, in m/s. */
    knockback: 6,
    /** Stagger time of a character hit by a jar, in seconds. */
    stun: 0.6,
    /** Minimum time between two jar hits on the same character, in seconds. */
    targetCooldown: 0.8,
  },
  puddle: {
    /** Radius of the slippery puddle left by a broken jar, in metres. */
    radius: 0.9,
    /** Lifetime of the puddle, in seconds. */
    duration: 8,
    /** Steering grip on the puddle (1 = normal floor, 0.1 = ice). */
    control: 0.15,
  },
  sign: {
    text: 'Record du monde !',
    /** Distance between the tower centre and the sign, in metres. */
    offset: 2.6,
    /** Width of the sign board, in metres. */
    boardWidth: 3,
    /** Height of the text label on the board, in metres. */
    labelHeight: 0.34,
  },
} as const;
