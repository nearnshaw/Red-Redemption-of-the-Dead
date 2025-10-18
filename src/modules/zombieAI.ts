import { engine, Entity, Transform, Animator, raycastSystem, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { getPlayerPosition } from './helpers'

type ZombieState = 'WANDER' | 'CHASE' | 'ATTACK'

const CHASE_RANGE_METERS = 20
const ATTACK_RANGE_METERS = 1
const ATTACK_TRIGGER_RANGE_METERS = 1.5 // buffer so attack can trigger without collision
const WANDER_RADIUS_METERS = 6

const WANDER_SPEED = 0.8
const CHASE_SPEED = 1.6
const ATTACK_COOLDOWN_SECONDS = 1.2
const OBSTACLE_CHECK_DISTANCE = 1.0

let zombieEntity: Entity | null = null
let spawnPosition: Vector3 | null = null
let currentState: ZombieState = 'WANDER'
let wanderTarget: Vector3 | null = null
let timeUntilRetargetSeconds = 0
let attackCooldownSeconds = 0
let currentAnim: 'NONE' | 'WALK' | 'ATTACK' = 'NONE'
let blockedAhead = false
let avoidanceTarget: Vector3 | null = null
let avoidRightNext = true

export function setupZombieAI() {
    // Try to resolve immediately; the system will retry if not available yet
    zombieEntity = engine.getEntityOrNullByName('zombie')
    if (zombieEntity && Transform.has(zombieEntity)) {
        spawnPosition = Vector3.create(
            Transform.get(zombieEntity).position.x,
            Transform.get(zombieEntity).position.y,
            Transform.get(zombieEntity).position.z
        )
        ensureAnimator(zombieEntity)
    }
}

export function zombieSystem(dt: number) {
    // Ensure we have the zombie entity
    if (!zombieEntity) {
        zombieEntity = engine.getEntityOrNullByName('zombie')
        if (!zombieEntity) return
    }

    if (!Transform.has(zombieEntity)) return
    ensureAnimator(zombieEntity)

    // Capture spawn the first time we see a valid Transform
    if (!spawnPosition) {
        const t = Transform.get(zombieEntity)
        spawnPosition = Vector3.create(t.position.x, t.position.y, t.position.z)
    }

    const playerPos = getPlayerPosition()
    const zTransform = Transform.getMutable(zombieEntity)
    const zombiePos = zTransform.position

    const distanceToPlayer = horizontalDistance(playerPos, zombiePos)

    // Update cooldowns
    if (attackCooldownSeconds > 0) attackCooldownSeconds = Math.max(0, attackCooldownSeconds - dt)

    // State transitions
    if (distanceToPlayer <= ATTACK_TRIGGER_RANGE_METERS) {
        currentState = 'ATTACK'
    } else if (distanceToPlayer <= CHASE_RANGE_METERS) {
        currentState = 'CHASE'
    } else {
        currentState = 'WANDER'
    }

    switch (currentState) {
        case 'WANDER': {
            timeUntilRetargetSeconds -= dt

            // Retarget periodically or when reached target
            if (!wanderTarget || timeUntilRetargetSeconds <= 0 || Vector3.distance(zombiePos, wanderTarget) < 0.25) {
                wanderTarget = computeNewWanderTarget(spawnPosition ?? zombiePos)
                timeUntilRetargetSeconds = 2 + Math.random() * 3 // 2-5s
            }

            playWalk(zombieEntity)
            const desiredDir = directionTo(zombiePos, wanderTarget)
            if (blockedAhead) {
                wanderTarget = computeNewWanderTarget(spawnPosition ?? zombiePos)
            } else {
                moveTowards(zombieEntity, wanderTarget, WANDER_SPEED, dt, 0.1)
            }
            scheduleBlockCheck(zombieEntity, desiredDir, OBSTACLE_CHECK_DISTANCE)
            break
        }
        case 'CHASE': {
            wanderTarget = null
            playWalk(zombieEntity)
            const desiredDir = directionTo(zombiePos, playerPos)
            if (blockedAhead) {
                if (!avoidanceTarget) {
                    const side = perpendicular(desiredDir, avoidRightNext)
                    avoidRightNext = !avoidRightNext
                    avoidanceTarget = Vector3.create(
                        zombiePos.x + side.x * 2,
                        zombiePos.y,
                        zombiePos.z + side.z * 2
                    )
                }
                moveTowards(zombieEntity, avoidanceTarget, WANDER_SPEED, dt, 0.1)
                if (horizontalDistance(avoidanceTarget, zombiePos) < 0.15) {
                    avoidanceTarget = null
                }
            } else {
                avoidanceTarget = null
                // Stop within attack range, do not overlap the player
                moveTowards(zombieEntity, playerPos, CHASE_SPEED, dt, ATTACK_RANGE_METERS)
            }
            scheduleBlockCheck(zombieEntity, desiredDir, OBSTACLE_CHECK_DISTANCE)
            break
        }
        case 'ATTACK': {
            // Face the player but do not move
            faceTowards(zombieEntity, playerPos)
            tryAttack(zombieEntity)
            break
        }
    }
}

function computeNewWanderTarget(origin: Vector3): Vector3 {
    // Pick a random point within a circle around origin
    const angle = Math.random() * Math.PI * 2
    const radius = Math.random() * WANDER_RADIUS_METERS
    const offsetX = Math.cos(angle) * radius
    const offsetZ = Math.sin(angle) * radius
    return Vector3.create(origin.x + offsetX, origin.y, origin.z + offsetZ)
}

function moveTowards(entity: Entity, target: Vector3, speed: number, dt: number, stopDistance: number = 0) {
    const t = Transform.getMutable(entity)
    const pos = t.position
    const dx = target.x - pos.x
    const dz = target.z - pos.z
    const distance = Math.hypot(dx, dz)
    if (distance < Math.max(stopDistance, 1e-3)) return

    const remaining = Math.max(distance - stopDistance, 0)
    const step = Math.min(speed * dt, remaining)
    const nx = dx / distance
    const nz = dz / distance

    // Translate
    const moveX = nx * Math.min(step, distance)
    const moveZ = nz * Math.min(step, distance)
    t.position = Vector3.create(pos.x + moveX, pos.y, pos.z + moveZ)

    // Rotate to face movement direction
    const yaw = Math.atan2(nx, nz) * 180 / Math.PI
    t.rotation = Quaternion.fromEulerDegrees(0, yaw, 0)
}

function faceTowards(entity: Entity, target: Vector3) {
    const t = Transform.getMutable(entity)
    const pos = t.position
    const dx = target.x - pos.x
    const dz = target.z - pos.z
    const distance = Math.hypot(dx, dz)
    if (distance < 1e-3) return
    const nx = dx / distance
    const nz = dz / distance
    const yaw = Math.atan2(nx, nz) * 180 / Math.PI
    t.rotation = Quaternion.fromEulerDegrees(0, yaw, 0)
}

function ensureAnimator(entity: Entity) {
    if (!Animator.has(entity)) {
        Animator.create(entity, {
            states: [
                { clip: 'Walking', playing: false, loop: true, weight: 1.0, speed: 1.0 },
                { clip: 'Attacking', playing: false, loop: false, shouldReset: true, weight: 1.0, speed: 1.0 }
            ]
        })
        currentAnim = 'NONE'
    }
}

function playWalk(entity: Entity) {
    if (currentAnim !== 'WALK') {
        // Stop any attack
        Animator.stopAllAnimations(entity)
        const walk = Animator.getClip(entity, 'Walking')
        if (walk) {
            walk.loop = true
            walk.playing = true
        } else {
            Animator.playSingleAnimation(entity, 'Walking')
        }
        currentAnim = 'WALK'
    }
}

function tryAttack(entity: Entity) {
    // Cooldown gate based on accumulated dt
    if (attackCooldownSeconds <= 0) {
        Animator.stopAllAnimations(entity)
        const attack = Animator.getClip(entity, 'Attacking')
        if (attack) {
            attack.loop = false
            attack.playing = true
            attack.shouldReset = true
        } else {
            Animator.playSingleAnimation(entity, 'Attacking')
        }
        currentAnim = 'ATTACK'
        attackCooldownSeconds = ATTACK_COOLDOWN_SECONDS
    }
}

function horizontalDistance(a: Vector3, b: Vector3) {
    const dx = a.x - b.x
    const dz = a.z - b.z
    return Math.hypot(dx, dz)
}

function directionTo(from: Vector3, to: Vector3): Vector3 {
    const dx = to.x - from.x
    const dz = to.z - from.z
    const len = Math.hypot(dx, dz)
    if (len < 1e-5) return Vector3.create(0, 0, 0)
    return Vector3.create(dx / len, 0, dz / len)
}

function perpendicular(dir: Vector3, right: boolean): Vector3 {
    const x = dir.x
    const z = dir.z
    // Perpendicular on XZ plane
    return right ? Vector3.create(z, 0, -x) : Vector3.create(-z, 0, x)
}

function scheduleBlockCheck(entity: Entity, dir: Vector3, distance: number) {
    if (dir.x === 0 && dir.z === 0) {
        blockedAhead = false
        return
    }
    raycastSystem.registerGlobalDirectionRaycast(
        {
            entity,
            opts: {
                direction: dir,
                maxDistance: distance,
                collisionMask: (ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER) as unknown as number
            }
        },
        (result) => {
            blockedAhead = !!result && result.hits.length > 0
        }
    )
}


