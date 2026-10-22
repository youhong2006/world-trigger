// Character dimensions and speeds are metres and seconds, independent of FPS.
import { PERSON } from './building-metrics.js';
export const CHARACTER = Object.freeze({
  radius: .28,
  standingHeight: PERSON.height,
  crouchingHeight: PERSON.crouchHeight,
  standingEyeHeight: PERSON.eyeHeight,
  crouchingEyeHeight: PERSON.crouchEyeHeight,
  walkSpeed: 2.2,
  sprintSpeed: 6.2,
  crouchSpeed: 1.15,
  gravity: 24,
  jumpSpeed: 7.2,
  stepHeight: .38,
  maximumSlope: 43 * Math.PI / 180,
  coyoteTime: .10,
  jumpBuffer: .12,
});

const EPSILON = 1e-5;
const MAX_SUBSTEP = 1 / 120;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const approachAngle = (from, to, alpha) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * alpha;

export function createCharacterMotor({ groundHeight, collision = {} }) {
  const position = { x: 0, y: groundHeight(0, 0), z: 0 };
  const velocity = { x: 0, y: 0, z: 0 };
  let grounded = true, crouched = false, heading = 0, viewYaw = 0;
  let animation = 'idle', lastLandingSpeed = 0, boostTime = 0;
  const tuning = { walkSpeed:CHARACTER.walkSpeed, sprintSpeed:CHARACTER.sprintSpeed, jumpSpeed:CHARACTER.jumpSpeed };
  function configure(values = {}) {
    for (const key of Object.keys(tuning)) if (Number.isFinite(values[key])) tuning[key] = clamp(values[key], 1, key === 'sprintSpeed' ? 30 : 20);
    tuning.sprintSpeed = Math.max(tuning.walkSpeed,tuning.sprintSpeed);
  }
  function launch(value) {
    if (![value.x,value.y,value.z].every(Number.isFinite)) return false;
    velocity.x=clamp(value.x,-80,80);velocity.y=clamp(value.y,0,65);velocity.z=clamp(value.z,-80,80);
    grounded=false;if(canOccupy(position.x,position.z,position.y,CHARACTER.standingHeight))crouched=false;coyote=jumpBuffer=landing=0;boostTime=1.4;animation='jump';
    if(Math.hypot(value.x,value.z)>.1) heading=Math.atan2(-value.x,-value.z);
    return true;
  }
  let coyote = CHARACTER.coyoteTime, jumpBuffer = 0, jumpHeld = false, landing = 0;

  const height = () => crouched ? CHARACTER.crouchingHeight : CHARACTER.standingHeight;
  const eyeHeight = () => crouched ? CHARACTER.crouchingEyeHeight : CHARACTER.standingEyeHeight;
  const speed = () => Math.hypot(velocity.x, velocity.z);
  function canOccupy(x, z, y, bodyHeight = height()) {
    if (collision.canOccupy) return collision.canOccupy(x, z, y, bodyHeight, CHARACTER.radius);
    if (collision.blockedAt) return !collision.blockedAt(x, z, y, bodyHeight, CHARACTER.radius);
    return !collision.blocked?.(x, z);
  }
  function supportAt(x, z, feetY = position.y) {
    const terrain = groundHeight(x, z);
    const solid = collision.surfaceHeightAt?.(x, z, feetY, CHARACTER.stepHeight);
    return Number.isFinite(solid) ? Math.max(terrain, solid) : terrain;
  }
  function teleport(point, facing = 0) {
    position.x = point.x;position.z = point.z;
    position.y = Number.isFinite(point.y) ? point.y : groundHeight(point.x, point.z);
    velocity.x = velocity.y = velocity.z = 0;
    heading = viewYaw = facing;crouched = false;
    grounded = Math.abs(position.y - supportAt(position.x, position.z)) < .04;
    coyote = grounded ? CHARACTER.coyoteTime : 0;
    jumpBuffer = landing = lastLandingSpeed = boostTime = 0;jumpHeld = false;
    animation = grounded ? 'idle' : 'fall';
  }

  function moveAxisPart(axis, distance) {
    if (Math.abs(distance) < EPSILON) return;
    const nextX = position.x + (axis === 'x' ? distance : 0);
    const nextZ = position.z + (axis === 'z' ? distance : 0);
    const support = supportAt(nextX, nextZ);
    const rise = support - position.y;
    let nextFeet = position.y;
    if (!grounded && groundHeight(nextX, nextZ) > position.y + .03) { velocity[axis] = 0;return; }
    if (grounded) {
      // A curb can be stepped onto; a high ledge needs an actual jump.
      if (rise > CHARACTER.stepHeight + EPSILON) { velocity[axis] = 0;return; }
      if (rise > .001) {
        // Sample over half a metre so a small curb is not mistaken for a
        // vertical cliff, while long steep hills cannot be walked straight up.
        const sample = .25;
        const gradeX = (groundHeight(nextX + sample, nextZ) - groundHeight(nextX - sample, nextZ)) / (sample * 2);
        const gradeZ = (groundHeight(nextX, nextZ + sample) - groundHeight(nextX, nextZ - sample)) / (sample * 2);
        const grade = Math.hypot(gradeX, gradeZ);
        if (grade > Math.tan(CHARACTER.maximumSlope)) { velocity[axis] = 0;return; }
      }
      if (rise >= -CHARACTER.stepHeight) nextFeet = support;
    }
    if (!canOccupy(nextX, nextZ, nextFeet)) { velocity[axis] = 0;return; }
    position[axis] += distance;
    if (grounded) {
      if (rise < -CHARACTER.stepHeight) grounded = false;
      else position.y = nextFeet;
    }
  }

  function moveAxis(axis, distance) {
    const count=Math.max(1,Math.ceil(Math.abs(distance)/.12));
    for(let i=0;i<count;i++) {
      const before=position[axis];moveAxisPart(axis,distance/count);
      if(Math.abs(position[axis]-before)<EPSILON) break;
    }
  }

  function step(dt, input, yaw) {
    landing = Math.max(0, landing - dt);boostTime = Math.max(0,boostTime-dt);
    jumpBuffer = Math.max(0, jumpBuffer - dt);
    if (input.crouch) crouched = true;
    else if (!crouched || canOccupy(position.x, position.z, position.y, CHARACTER.standingHeight)) crouched = false;

    const floor = supportAt(position.x, position.z);
    if (grounded && floor < position.y - .04) grounded = false;
    if (grounded) coyote = CHARACTER.coyoteTime;
    else coyote = Math.max(0, coyote - dt);
    if (jumpBuffer > 0 && coyote > 0) {
      velocity.y = tuning.jumpSpeed;
      grounded = false;coyote = jumpBuffer = landing = 0;
    }

    let forward = clamp(Number(input.forward) || 0, -1, 1);
    let strafe = clamp(Number(input.strafe) || 0, -1, 1);
    const magnitude = Math.hypot(forward, strafe);
    if (magnitude > 1) { forward /= magnitude;strafe /= magnitude; }
    const desiredSpeed = crouched ? CHARACTER.crouchSpeed : input.sprint && forward > 0 ? tuning.sprintSpeed : tuning.walkSpeed;
    const targetX = (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * desiredSpeed;
    const targetZ = (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * desiredSpeed;
    const response = grounded ? (magnitude > 0 ? 16 : 20) : boostTime > 0 ? (magnitude > 0 ? .65 : .03) : magnitude > 0 ? 3.4 : .25;
    const alpha = 1 - Math.exp(-response * dt);
    velocity.x += (targetX - velocity.x) * alpha;
    velocity.z += (targetZ - velocity.z) * alpha;
    // Axis-separated checks preserve movement parallel to a wall.
    moveAxis('x', velocity.x * dt);
    moveAxis('z', velocity.z * dt);

    if (!grounded) {
      let travel = velocity.y * dt - CHARACTER.gravity * dt * dt / 2;
      velocity.y -= CHARACTER.gravity * dt;
      const count=Math.max(1,Math.ceil(Math.abs(travel)/.12));
      for(let part=0;part<count;part++) {
        const previousY=position.y;
        let nextY=previousY+travel/count;
        const support=supportAt(position.x,position.z,previousY);
        if(velocity.y<=0 && previousY>=support-.04 && nextY<=support) {
          lastLandingSpeed=Math.max(0,-velocity.y);position.y=support;velocity.y=0;grounded=true;boostTime=0;
          coyote=CHARACTER.coyoteTime;if(lastLandingSpeed>1) landing=.12;break;
        }
        if(nextY>previousY && !canOccupy(position.x,position.z,nextY)) {
          let low=previousY,high=nextY;
          for(let i=0;i<8;i++) {const middle=(low+high)/2;if(canOccupy(position.x,position.z,middle)) low=middle;else high=middle;}
          position.y=low;velocity.y=0;break;
        }
        position.y=nextY;
      }
    } else velocity.y = 0;

    const horizontalSpeed = speed();
    if (horizontalSpeed > .06) heading = approachAngle(heading, Math.atan2(-velocity.x, -velocity.z), 1 - Math.exp(-16 * dt));
    if (!grounded) animation = velocity.y > .3 ? 'jump' : 'fall';
    else if (landing > 0) animation = 'land';
    else if (crouched) animation = horizontalSpeed > .12 ? 'crouch-walk' : 'crouch';
    else if (horizontalSpeed < .12) animation = 'idle';
    else animation = horizontalSpeed > tuning.walkSpeed + .5 ? 'run' : 'walk';
  }

  function update(elapsed, input = {}, yaw = viewYaw) {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return;
    if (Number.isFinite(yaw)) viewYaw = yaw;
    if (input.jumpPressed || (input.jump && !jumpHeld)) jumpBuffer = CHARACTER.jumpBuffer;
    jumpHeld = !!input.jump;
    let remaining = Math.min(elapsed, .25);
    while (remaining > EPSILON) {
      const dt = Math.min(remaining, MAX_SUBSTEP);
      step(dt, input, viewYaw);remaining -= dt;
    }
  }

  return {
    position, velocity, teleport, update, configure, launch,
    get grounded() { return grounded; },
    get crouched() { return crouched; },
    get height() { return height(); },
    get eyeHeight() { return eyeHeight(); },
    get heading() { return heading; },
    get animation() { return animation; },
    get speed() { return speed(); },
    get lastLandingSpeed() { return lastLandingSpeed; },
    get state() { return { position: { ...position }, velocity: { ...velocity }, grounded, crouched, height: height(), eyeHeight: eyeHeight(), heading, animation, speed: speed(), lastLandingSpeed, boosted:boostTime>0, boostTime, tuning:{...tuning} }; },
  };
}
