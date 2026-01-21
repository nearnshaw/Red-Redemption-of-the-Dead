import type { Entity } from '@dcl/sdk/ecs';
import {
  Animator,
  ColliderLayer,
  engine,
  raycastSystem,
  Schemas,
  Transform,
  getWorldPosition
} from '@dcl/sdk/ecs';
import { Quaternion, Vector3 } from '@dcl/sdk/math';
import { syncEntity } from '@dcl/sdk/network';
//import { getActionEvents } from '@dcl/asset-packs/dist/events';

type ZombieState = 'WANDER' | 'CHASE' | 'ATTACK';

// Custom component to store zombie state data (synced across players)
export const ZombieStateData = engine.defineComponent(
  'ZombieStateData',
  {
    currentState: Schemas.String,
    targetEntityId: Schemas.Number,
    distanceToClosestFood: Schemas.Number,
  },
  {
    currentState: 'WANDER',
    targetEntityId: 0,
    distanceToClosestFood: Infinity,
  },
);

const ATTACK_RANGE_METERS = 1;
const ATTACK_TRIGGER_RANGE_METERS = 1.5; // buffer so attack can trigger without collision
const ATTACK_COOLDOWN_SECONDS = 1.2;

export class Zombie {
  public wanderTarget: Vector3 | null = null;
  public timeUntilRetargetSeconds: number = 2 + Math.random() * 3; // 2-5s
  public attackCooldownSeconds: number = 0;
  public currentAnim: 'NONE' | 'WALK' | 'ATTACK' = 'NONE';
  public blockedAhead: boolean = false;
  public avoidanceTarget: Vector3 | null = null;
  public avoidRightNext: boolean = false;
  public attackActionTimer: number = 0; // Timer for executing attack action (once per second)

  // Helper getters/setters for synced state data
  get currentState(): ZombieState {
    const data = ZombieStateData.getOrNull(this.entity);
    return (data?.currentState as ZombieState) || 'WANDER';
  }

  set currentState(value: ZombieState) {
    const data = ZombieStateData.getMutable(this.entity);
    data.currentState = value;
  }

  get targetEntityId(): number {
    const data = ZombieStateData.getOrNull(this.entity);
    return data?.targetEntityId ?? 0;
  }

  set targetEntityId(value: number) {
    const data = ZombieStateData.getMutable(this.entity);
    data.targetEntityId = value;
  }

  get distanceToClosestFood(): number {
    const data = ZombieStateData.getOrNull(this.entity);
    return data?.distanceToClosestFood ?? Infinity;
  }

  set distanceToClosestFood(value: number) {
    const data = ZombieStateData.getMutable(this.entity);
    data.distanceToClosestFood = value;
  }

  constructor(
    public src: string,
    public entity: Entity,

    public CHASE_RANGE_METERS: number = 20,
    public WANDER_RADIUS_METERS: number = 6,
    public WANDER_SPEED: number = 0.8,
    public CHASE_SPEED: number = 1.6,
    public OBSTACLE_CHECK_DISTANCE: number = 1.0,
  ) {}

  /**
   * Start function - called when the script is initialized
   */
  start() {
    // Create and initialize the synced state component
    ZombieStateData.create(this.entity, {
      currentState: 'WANDER',
      targetEntityId: 0,
      distanceToClosestFood: Infinity,
    });

    // Sync the component across all players
    // Note: You'll need to provide a unique entityEnumId for each zombie
    // For now, using the entity number as ID (you may want to use a proper enum)
    syncEntity(
      this.entity,
      [ZombieStateData.componentId, Transform.componentId, Animator.componentId],
      this.entity as unknown as number,
    );
  }


  /**
   * Update function - called every frame
   * @param dt - Delta time since last frame (in seconds)
   */
  update(dt: number) {
    if (!Transform.has(this.entity)) return;
    if (!Animator.has(this.entity)) return;

    const zTransform = Transform.getMutable(this.entity);
    const zombiePos = zTransform.position;

    // Update cooldowns
    if (this.attackCooldownSeconds > 0)
      this.attackCooldownSeconds = Math.max(0, this.attackCooldownSeconds - dt);

    // Find the closest food entity
    const closestFood = this.findClosestFood(zombiePos);
    
    if (closestFood) {
      this.targetEntityId = closestFood.entityId;
      this.distanceToClosestFood = closestFood.distance;
    } else {
      // No food found
      this.targetEntityId = 0;
      this.distanceToClosestFood = Infinity;
    }

    // State transitions based on stored distance
    // Priority: ATTACK > CHASE > WANDER
    // Don't transition away from CHASE/ATTACK unless truly out of range
    if (this.distanceToClosestFood <= ATTACK_TRIGGER_RANGE_METERS) {
      this.currentState = 'ATTACK';
    } else if (this.distanceToClosestFood <= this.CHASE_RANGE_METERS) {
      this.currentState = 'CHASE';
    } else {
      // Only transition to WANDER if we're truly out of range
      // And only clear targetEntityId if we're well beyond chase range (add hysteresis)
      const WANDER_HYSTERESIS = 5.0; // Must be 5m beyond chase range to clear
      if (this.distanceToClosestFood > this.CHASE_RANGE_METERS + WANDER_HYSTERESIS) {
        this.currentState = 'WANDER';
        // Clear target when truly wandering
        if (this.targetEntityId) {
          this.targetEntityId = 0;
          this.distanceToClosestFood = Infinity;
        }
      } else {
        // Still within hysteresis range - maintain current state if chasing/attacking
        // This prevents rapid state switching
        if (this.currentState === 'WANDER') {
          // Only transition to chase if we're within range
          if (this.distanceToClosestFood <= this.CHASE_RANGE_METERS) {
            this.currentState = 'CHASE';
          }
        }
        // Otherwise keep current state (CHASE or ATTACK)
      }
    }

    // All instances control their own movement since we're chasing entities, not players
    const isAuthoritative = true;

    switch (this.currentState) {
      case 'WANDER': {
        // Only authoritative instance controls movement
        if (isAuthoritative) {
          this.timeUntilRetargetSeconds -= dt;

          // Retarget periodically or when reached target
          if (
            !this.wanderTarget ||
            this.timeUntilRetargetSeconds <= 0 ||
            Vector3.distance(zombiePos, this.wanderTarget) < 0.25
          ) {
            this.wanderTarget = this.computeNewWanderTarget(zombiePos);
            this.timeUntilRetargetSeconds = 2 + Math.random() * 3; // 2-5s
          }

          this.playWalk(this.entity);
          const desiredDir = this.directionTo(zombiePos, this.wanderTarget);
          if (this.blockedAhead) {
            this.wanderTarget = this.computeNewWanderTarget(zombiePos);
          } else {
            this.moveTowards(this.entity, this.wanderTarget, this.WANDER_SPEED, dt, 0.1);
          }
          this.scheduleBlockCheck(this.entity, desiredDir, this.OBSTACLE_CHECK_DISTANCE);
        }
        break;
      }
      case 'CHASE': {
        // Chase the food entity
        if (isAuthoritative && this.targetEntityId && closestFood) {
          const targetPos = closestFood.position;

          this.wanderTarget = null;
          this.playWalk(this.entity);
          const desiredDir = this.directionTo(zombiePos, targetPos);

          // Check for obstacles in the desired direction
          this.scheduleBlockCheck(this.entity, desiredDir, this.OBSTACLE_CHECK_DISTANCE);

          if (this.blockedAhead) {
            if (!this.avoidanceTarget) {
              const side = this.perpendicular(desiredDir, this.avoidRightNext);
              this.avoidRightNext = !this.avoidRightNext;
              this.avoidanceTarget = Vector3.create(
                zombiePos.x + side.x * 2,
                zombiePos.y,
                zombiePos.z + side.z * 2,
              );
            }
            this.moveTowards(this.entity, this.avoidanceTarget, this.WANDER_SPEED, dt, 0.1);
            if (this.horizontalDistance(this.avoidanceTarget, zombiePos) < 0.15) {
              this.avoidanceTarget = null;
            }
          } else {
            this.avoidanceTarget = null;
            // Stop within attack range
            this.moveTowards(this.entity, targetPos, this.CHASE_SPEED, dt, ATTACK_RANGE_METERS);
          }
        }
        break;
      }
      case 'ATTACK': {
        // Attack the food entity
        if (isAuthoritative && this.targetEntityId && closestFood) {
          const targetPos = closestFood.position;

          // Face the food but do not move
          this.faceTowards(this.entity, targetPos);
          this.tryAttack(this.entity, targetPos);

          // Execute attack action once per second while attack animation is playing
          if (this.currentAnim === 'ATTACK') {
            this.attackActionTimer += dt;
            if (this.attackActionTimer >= 1.0) {
              this.attackActionTimer = 0;
              // Execute the "Attack" action from Actions component
              try {
                //getActionEvents(this.entity).emit('Attack', {});
              } catch (error) {
                // Action might not exist, ignore error
              }
            }
          } else {
            // Reset timer when not attacking
            this.attackActionTimer = 0;
          }
        }
        break;
      }
    }
  }

  computeNewWanderTarget(origin: Vector3): Vector3 {
    // Pick a random point within a circle around origin
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * this.WANDER_RADIUS_METERS;
    const offsetX = Math.cos(angle) * radius;
    const offsetZ = Math.sin(angle) * radius;
    return Vector3.create(origin.x + offsetX, origin.y, origin.z + offsetZ);
  }

  moveTowards(
    entity: Entity,
    target: Vector3,
    speed: number,
    dt: number,
    stopDistance: number = 0,
  ) {
    const t = Transform.getMutable(entity);
    const pos = t.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const distance = Math.hypot(dx, dz);

    if (distance < Math.max(stopDistance, 1e-3)) return;

    const remaining = Math.max(distance - stopDistance, 0);
    const step = Math.min(speed * dt, remaining);
    const nx = dx / distance;
    const nz = dz / distance;

    // Translate
    const moveX = nx * Math.min(step, distance);
    const moveZ = nz * Math.min(step, distance);
    const newPos = Vector3.create(pos.x + moveX, pos.y, pos.z + moveZ);
    t.position = newPos;

    // Rotate to face movement direction
    const yaw = (Math.atan2(nx, nz) * 180) / Math.PI;
    t.rotation = Quaternion.fromEulerDegrees(0, yaw, 0);
  }

  faceTowards(entity: Entity, target: Vector3) {
    const t = Transform.getMutable(entity);
    const pos = t.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-3) return;
    const nx = dx / distance;
    const nz = dz / distance;
    const yaw = (Math.atan2(nx, nz) * 180) / Math.PI;
    t.rotation = Quaternion.fromEulerDegrees(0, yaw, 0);
  }

  playWalk(entity: Entity) {
    if (this.currentAnim !== 'WALK') {
      // Stop any attack
      Animator.stopAllAnimations(entity);
      const walk = Animator.getClip(entity, 'Walking');
      if (walk) {
        walk.loop = true;
        walk.playing = true;
      } else {
        Animator.playSingleAnimation(entity, 'Walking');
      }
      this.currentAnim = 'WALK';
    }
  }

  tryAttack(entity: Entity, targetPos: Vector3) {
    // Cooldown gate based on accumulated dt
    if (this.attackCooldownSeconds <= 0) {
      Animator.stopAllAnimations(entity);
      const attack = Animator.getClip(entity, 'Attacking');
      if (attack) {
        attack.loop = false;
        attack.playing = true;
        attack.shouldReset = true;
      } else {
        Animator.playSingleAnimation(entity, 'Attacking');
      }
      this.currentAnim = 'ATTACK';
      // Apply damage once per attack trigger if within striking range
      const zPos = Transform.get(entity).position;
      if (this.horizontalDistance(targetPos, zPos) <= ATTACK_RANGE_METERS + 0.05) {
        //damage(2)
      }
      this.attackCooldownSeconds = ATTACK_COOLDOWN_SECONDS;
    }
  }

  /**
   * Find the closest food entity to the zombie
   * @param zombiePos - Zombie's current position
   * @returns Object with entityId, position, and distance, or null if no food found
   */
  findClosestFood(
    zombiePos: Vector3,
  ): { entityId: number; position: Vector3; distance: number } | null {
    let closestFood: { entityId: number; position: Vector3; distance: number } | null = null;
    let closestDistance = Infinity;

    // Get all entities with the "Food" tag
    const foodEntities = engine.getEntitiesByTag('Food');
    
    for (const foodEntity of foodEntities) {
      // Use getWorldPosition to calculate the food entity's position
      const foodPos = getWorldPosition(engine, foodEntity);
      const distance = this.horizontalDistance(zombiePos, foodPos);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestFood = {
          entityId: foodEntity as number,
          position: foodPos,
          distance: distance,
        };
      }
    }

    // console.log('closestFood', closestFood?.distance);

    return closestFood;
  }


  horizontalDistance(a: Vector3, b: Vector3) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.hypot(dx, dz);
  }

  directionTo(from: Vector3, to: Vector3): Vector3 {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-5) return Vector3.create(0, 0, 0);
    return Vector3.create(dx / len, 0, dz / len);
  }

  perpendicular(dir: Vector3, right: boolean): Vector3 {
    const x = dir.x;
    const z = dir.z;
    // Perpendicular on XZ plane
    return right ? Vector3.create(z, 0, -x) : Vector3.create(-z, 0, x);
  }

  scheduleBlockCheck(entity: Entity, dir: Vector3, distance: number) {
    if (dir.x === 0 && dir.z === 0) {
      this.blockedAhead = false;
      return;
    }
    raycastSystem.registerGlobalDirectionRaycast(
      {
        entity,
        opts: {
          direction: dir,
          maxDistance: distance,
          collisionMask: (ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER) as unknown as number,
        },
      },
      result => {
        this.blockedAhead = !!result && result.hits.length > 0;
      },
    );
  }
}
