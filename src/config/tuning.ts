/**
 * Every gameplay, camera and effect constant lives here (BRIEF.md §5.3).
 * The F1 panel edits this object live; "Copy values" exports it as JSON.
 *
 * Units: speeds marked km/h are converted to m/s where they are used. Other values are
 * metres, seconds, m/s, m/s² or degrees as noted.
 */
export const tuning = {
  physics: {
    /** Fixed simulation rate, steps per second. */
    stepRate: 120,
    /** Most simulation steps run in one rendered frame before time is dropped. */
    maxStepsPerFrame: 12,
  },

  movement: {
    /** Collision body: half width and full height, m. */
    bodyRadius: 0.35,
    bodyHeight: 1.8,

    // Running (target band 38–60 km/h, sprint ~70 km/h)
    runSpeed: 46,
    sprintSpeed: 70,
    /** Seconds from standstill to run speed. */
    runAccelTime: 0.3,
    /** Seconds from run speed to sprint speed. */
    sprintAccelTime: 0.6,
    /** Seconds to stop from run speed when no key is held. */
    brakeTime: 0.2,
    /** How fast the velocity turns toward the input, 1/s. Lower = more slide in turns. */
    turnGrip: 10,
    /** Speed lost per second when faster than the target on the ground (landing out of a swing), km/h. */
    overspeedDecel: 34,
    /** Ledges up to this height are stepped over (kerbs, slabs), m. */
    stepHeight: 0.45,

    // Jumping and falling
    /** m/s². Stronger than real gravity for snappy arcs. */
    gravity: 26,
    /** Gravity multiplier while falling. */
    fallGravityMult: 1.3,
    /** Full jump height when Space is held, m. */
    jumpHeight: 3.2,
    /** Share of the upward speed kept when Space is released early (short hop). */
    jumpCut: 0.45,
    /** Extra forward speed for a jump out of a sprint, km/h. */
    sprintJumpBoost: 10,
    /** Grace time to still jump after running off a ledge, s. */
    coyoteTime: 0.12,
    /** A jump pressed this long before landing still happens, s. */
    jumpBuffer: 0.15,
    /** Steering acceleration in the air, m/s². */
    airControl: 12,
    /** Quadratic air drag coefficient, 1/m. */
    airDrag: 0.0022,
    /** Fastest normal fall, km/h. */
    maxFallSpeed: 150,
    /** Hard cap on any speed, km/h (target top speed ~170). */
    topSpeed: 175,

    // Wall run (~80 km/h)
    wallRunSpeed: 80,
    /** Minimum speed along the wall to start a wall run, km/h. */
    wallRunMinSpeed: 32,
    /** Largest angle between velocity and wall that still starts a wall run, degrees. */
    wallRunMaxAngle: 42,
    /** Seconds before gravity wins. */
    wallRunMaxTime: 1.6,
    /** Extra entry speed lost per second until wallRunSpeed, km/h. */
    wallRunDecel: 40,
    wallRunGravityMult: 0.2,
    /** Upward speed when a wall run starts, m/s. */
    wallRunUpBoost: 3,
    /** No wall run closer than this to the ground, m. */
    wallRunMinHeight: 1.2,
    /** Wall jump: speed away from the wall and upward, m/s, and share of run speed kept. */
    wallJumpOut: 13,
    wallJumpUp: 9,
    wallJumpKeep: 0.8,

    // Wall climb (18–25 km/h)
    climbSpeed: 21,
    /** Climb speed with Shift held, km/h. */
    climbSprintSpeed: 25,
    climbSideSpeed: 14,
    /** Push into a wall this long on the ground before climbing starts, s. */
    climbStartDelay: 0.1,
    climbJumpOut: 9,
    climbJumpUp: 10,
    /** Ledges up to this height above the feet are mantled (climbed onto) automatically, m. */
    mantleReach: 1.6,
    mantleTime: 0.3,
    /** Speed onto the roof after a mantle, km/h. */
    mantleExitSpeed: 12,

    // Dive
    diveGravityMult: 1.9,
    /** Fastest fall while diving, km/h. */
    diveMaxFallSpeed: 175,
    /** How fast WASD bends the dive, rad/s. */
    diveSteerRate: 1.4,
    /** Shift starts a swing only after diving this long, s. */
    diveMinTime: 0.2,

    // Landing (impact = vertical speed at touchdown, m/s)
    /** Below this impact the landing is soft (no stop). */
    softLandSpeed: 16,
    /** Superhero landing above this impact (lower after a dive). */
    heroLandSpeed: 30,
    heroLandSpeedDive: 20,
    /** A fast-moving landing rolls instead of a superhero landing above this ground speed, km/h. */
    heroMaxRunSpeed: 40,
    /** A hard landing rolls (keeps speed) when moving faster than this, km/h. */
    rollMinSpeed: 30,
    rollTime: 0.42,
    rollKeep: 0.92,
    crouchTime: 0.18,
    heroLandTime: 0.6,
    /** Superhero landing can be cancelled into a jump or run after this, s. */
    heroLandCancel: 0.28,
    /** Share of ground speed kept by a superhero landing. */
    heroLandKeep: 0.1,

    // Near miss (creative): passing close to a wall at speed gives a small boost
    nearMissBoost: 10,
    nearMissDistance: 1.8,
    /** km/h. */
    nearMissMinSpeed: 90,
  },

  rope: {
    // Anchor search
    /** Longest rope, m. */
    maxRange: 75,
    /** Anchors closer than this are ignored, m. */
    minRange: 10,
    /** Preferred rope length and anchor height above the body, m. */
    idealDistance: 32,
    idealHeight: 20,
    /** Anchors must be at least this far above the body, m. */
    minHeightAbove: 4,
    /** Anchors must lie ahead: cosine of the largest angle from the travel direction. */
    forwardMinDot: 0.3,
    /** How much the camera (vs. the velocity) steers anchor choice, 0..1. */
    aimWeight: 0.35,
    /** Score bonus for anchoring on the other side of the street than last time. */
    sideAlternation: 0.15,
    /** Rope point on the body above the feet, m. */
    bobHeight: 1.5,

    // Swing
    /**
     * 0..1. The rope is drawn to the real anchor on the facade, but the swing pivots on a point
     * moved this far toward the line of travel, so arcs carry the hero along the street instead
     * of into the wall. 0 = pure physics.
     */
    swingPlaneAssist: 0.95,
    /** Damps sideways drift during a swing when A/D are not held, 1/s. */
    lateralDamping: 2.5,
    swingGravityMult: 1.5,
    /** WASD push along the swing ("pumping"), m/s². */
    pumpAccel: 10,
    /** Push along the swing at the bottom of the arc, m/s². Keeps chains flowing. */
    swingAssist: 8,
    /** Rope reel-in speed when it is longer than the swing needs, m/s. */
    reelSpeed: 16,
    /** Lowest point of a swing stays this high above the street, m. */
    swingClearance: 5,
    /** Release kick: forward (km/h) and upward (m/s). */
    releaseForwardBoost: 14,
    releaseUpBoost: 3.5,
    /** Holding Shift lets go at the end of each arc and fires the next rope automatically. */
    autoChain: true,
    /** Auto-release when the rope is this far past vertical on the way up, degrees. */
    autoReleaseAngle: 45,
    /** Shortest swing before auto-release, s. */
    minSwingTime: 0.4,
    /** Wait after a release before the next rope, s. */
    reattachDelay: 0.1,
    /** Next rope fires once the rise slows below this, m/s. */
    reattachMaxRise: 6,
    /** Time in the air before the first rope, s. */
    minAirTime: 0.05,
    /** Space while swinging without a zip target: let go with this upward kick, m/s. */
    ropeJumpUp: 8,
    /** A released rope (Shift up, landing, wall) whips and reels back into the hand in this time, s. */
    retractTime: 0.25,

    // Zip
    zipSpeed: 150,
    zipRange: 85,
    zipMinRange: 6,
    zipCooldown: 1,
    /** Aiming this close below a roof edge zips onto the roof, m. */
    zipLedgeSnap: 4,
    /** Share of zip speed kept when popping over a roof edge. */
    zipPerchKeep: 0.35,
    /** Ring on the zip target under the crosshair (fills up during the cooldown). */
    showZipTarget: true,

    // Look and launch (E): the rope pulls the hero onto the ledge under the crosshair.
    /** Farthest ledge, m. */
    launchRange: 80,
    /** km/h. */
    launchSpeed: 140,
    launchCooldown: 0.35,
    /** Hop from the end of the pull onto the ledge, s. */
    perchHopTime: 0.2,
    /** Space on a ledge: leap forward (m/s, along the camera) and up (m). */
    perchLeapForward: 13,
    perchLeapHeight: 2.6,
    /** Glow on the ledge under the crosshair. */
    showLedgeHighlight: true,

    /** Show where the next rope will attach while in the air. */
    showAnchorPreview: true,
  },

  /** Titan mode: slow but strong (BRIEF.md §3.2). */
  titan: {
    /** These replace the Movement values while Titan is on (speeds km/h, as there). */
    movement: {
      runSpeed: 32,
      sprintSpeed: 48,
      runAccelTime: 0.55,
      sprintAccelTime: 0.9,
      brakeTime: 0.32,
      turnGrip: 6,
      jumpHeight: 2.2,
      gravity: 30,
      airControl: 7,
      climbSpeed: 9,
      climbSprintSpeed: 12,
      climbSideSpeed: 6,
      softLandSpeed: 22,
      heroLandSpeed: 18,
      heroMaxRunSpeed: 400,
      rollMinSpeed: 400,
      heroLandKeep: 0.05,
    },
    /** Charged super jump: seconds to full charge and crouched walk speed while charging (km/h). */
    chargeTime: 0.9,
    chargeWalkSpeed: 8,
    /** Jump height for a tap and for a full charge, m. */
    superJumpMin: 3,
    superJumpMax: 32,
    /** Forward push at full charge, m/s. */
    superJumpForward: 10,
    /** Ground pound (C in the air): hang before the slam (s) and slam speed (m/s). */
    poundHang: 0.16,
    poundSpeed: 62,
    /** No pound closer than this to the ground, m. */
    poundMinHeight: 2.5,
    /** Shockwave: radius (m), push (m/s) and damage. */
    shockRadius: 15,
    shockForce: 24,
    shockDamage: 45,
    /** A heavy landing also sends a smaller shockwave above this impact, m/s. */
    landShockImpact: 22,
  },

  camera: {
    /** Arm length at rest and at top speed, m. */
    distance: 6.5,
    distanceAtSpeed: 9,
    /** Look-at point above the feet, m. */
    height: 1.7,
    /** Field of view at rest and at top speed, degrees. */
    fov: 68,
    fovAtSpeed: 92,
    /** FOV and arm start growing at this speed and peak at the second, km/h. */
    speedRangeStart: 40,
    speedRangeEnd: 170,
    /** Smoothing rates, 1/s (higher = snappier). */
    fovDamping: 4,
    followDamping: 16,
    /** radians per pixel. */
    mouseSensitivity: 0.0022,
    invertY: false,
    /**
     * Pitch limits, radians. Positive = camera above looking down. The camera itself never goes
     * below groundClearance: looking further up tilts the view instead (stage 1A feedback: low
     * angles between buildings were disorienting).
     */
    minPitch: -0.5,
    maxPitch: 1.25,
    /** Pitch the camera drifts back to while the mouse rests, radians. */
    restPitch: 0.32,
    /** The camera stays this high above the street or roof below it (rises instead of dipping), m. */
    groundClearance: 1.1,
    /** Mouse wheel: arm length multipliers for near and far (mid = 1). */
    zoomNear: 0.62,
    zoomFar: 1.5,
    /** Framing by state, as arm multipliers and extra height (m) / pitch (rad). */
    groundDistance: 0.85,
    swingDistance: 1.3,
    swingHeight: 1.4,
    swingPitch: 0.1,
    airDistance: 1.15,
    /** Wall run: camera slides this far away from the wall, m. */
    wallRunSide: 1.8,
    /** Arm multiplier while a fight is on nearby. */
    combatDistance: 1.25,
    /** How fast the framing follows the state, 1/s. */
    framingDamping: 2.5,
    /** Camera roll while swinging and wall running, degrees. */
    swingRoll: 7,
    wallRunRoll: 12,
    rollDamping: 5,
    /** Look ahead along the velocity, seconds of travel (capped at 5 m). */
    lookAhead: 0.3,
    /** Landing on a ledge with E: a short framed shot of the hero against the city (signature moment). */
    perchCinematic: true,
    /** Slowly turn behind the direction of travel when the mouse rests this long (s). */
    autoAlign: true,
    autoAlignDelay: 1.5,
    autoAlignRate: 1.1,
    /** Camera keeps this distance from walls, m. */
    collisionRadius: 0.3,
    /** Arm speeds when it has to shorten (camera inside a building) and when it grows back, 1/s. */
    collisionPullIn: 14,
    collisionRecover: 3,
    /**
     * Buildings between the camera and the hero turn see-through (dithered) instead of the camera
     * jumping: 0 = off … 1 = fully open. Radius of the see-through tunnel at the hero, m.
     */
    xray: 0.85,
    xrayRadius: 1.3,
    /** Extra arm length while climbing, m. */
    climbExtraDistance: 2.5,
    shake: true,
    shakeIntensity: 1,
  },

  fx: {
    bloomIntensity: 1.1,
    bloomThreshold: 0.62,
    bloomSmoothing: 0.3,
    /** Speed lines appear at the first speed and peak at the second, km/h. */
    speedLinesStart: 105,
    speedLinesFull: 170,
    speedLinesIntensity: 1,
    /** Extra speed lines while diving, 0..1. */
    diveSpeedLines: 0.35,
    /** Chromatic aberration at top speed (0 = off). */
    chromaticAberration: 0.0028,
    /** Vignette darkness at rest and extra at top speed. */
    vignette: 0.32,
    vignetteAtSpeed: 0.22,
    /** Colour grade: purple shadows, warm highlights, 0..1. */
    grade: 0.6,
    /** Lit window brightness; above 1 feeds the bloom. */
    windowGlow: 1.7,
    /** Exponential fog density; higher = thicker purple haze. */
    fogDensity: 0.0024,
    /** Sky light and moonlight on building faces. */
    skyLight: 1.6,
    moonLight: 0.8,
    /** Warm glow pools under street lamps. */
    lampPools: 0.8,
    /** Dust ring on hard landings. */
    landingDust: true,
    /** Freeze frames on a superhero landing, s (creative; 0 = off). */
    hitStop: 0.07,
    /** Mode switch show (signature moment): comic panel, power burst and a beat of slow motion. */
    modeSwitchShow: true,
    /** Time scale and real seconds of the mode switch slow motion. */
    modeSwitchSlowMo: 0.3,
    modeSwitchTime: 0.3,
    /** Comic "THUD!" lettering on superhero landings (creative). */
    comicImpact: true,
  },

  hero: {
    /** Character poses update 12 times a second (comic "on twos" look); camera and world stay smooth. */
    animateOnTwos: true,
    /** Ink outline around the hero. */
    outline: true,
    outlineWidth: 0.022,
    /** Front flip when letting go of a fast rope (creative). */
    releaseFlip: true,
    /** Distance covered by one running cycle, m. */
    strideLength: 2.6,
  },

  city: {
    seed: 6102026,
    /** Half of the city's side length, m. */
    halfSize: 520,
    /** Avenues (north–south) and streets (east–west): spacing and road width, m. */
    avenueSpacing: 200,
    avenueRoad: 26,
    streetSpacing: 100,
    streetRoad: 16,
    boulevardRoad: 26,
    sidewalk: 5,
    /** Building lot width range, m. */
    lotMin: 22,
    lotMax: 44,
    alleyChance: 0.3,
    /** Typical heights in the centre, at the edges and along the main avenue, m. */
    centerHeight: 230,
    edgeHeight: 28,
    corridorHeight: 120,
    towerChance: 0.08,
    /** Share of tall buildings built as stepped towers. */
    tierChance: 0.55,
    waterTankChance: 0.5,
    acChance: 0.85,
    /** Buildings taller than this get antennas, m. */
    antennaMinHeight: 150,
    lampSpacing: 32,
    signChance: 0.4,
    billboardCount: 28,
    /** Cars per lane per km. */
    carsPerKm: 9,
    traffic: true,
    /** Traffic speed multiplier. */
    trafficSpeed: 1,
    billboards: true,
    /** Share of lit windows per building, and the share of those that blink. */
    litMin: 0.18,
    litMax: 0.55,
    windowBlink: 0.015,
  },

  quality: {
    /** 'auto' picks low, medium or high from the frame rate. */
    preset: 'auto' as 'auto' | 'low' | 'medium' | 'high',
  },

  audio: {
    /** Wind and rope sounds made in code (Web Audio). */
    enabled: true,
    volume: 0.5,
  },

  debug: {
    showFps: true,
    /** Time scale while slow motion (T) is on. */
    slowMoScale: 0.25,
  },
};

export type Tuning = typeof tuning;
export type MovementTuning = Tuning['movement'];
export type TitanTuning = Tuning['titan'];
export type RopeTuning = Tuning['rope'];
export type CameraTuning = Tuning['camera'];
export type CityTuning = Tuning['city'];
export type QualityPreset = Tuning['quality']['preset'];

/** km/h → m/s. */
export const KMH = 1 / 3.6;
