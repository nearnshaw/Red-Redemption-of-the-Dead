import {} from '@dcl/sdk/math'
import { engine, Transform, AvatarShape, type Entity } from '@dcl/sdk/ecs'
import { onPlayerExpressionObservable } from '@dcl/sdk/observables'
import { getPlayer } from '@dcl/sdk/players'

type CloneEntry = {
  entity: Entity
  ttl: number
}

export const activeClones: CloneEntry[] = []

export function spawnAvatarClone(emoteUrn: string) {

  if(activeClones.length > 0) return

  const player = getPlayer()
  if (!player || !player.position) return

  const base = player.position
  const offsets = [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 }
  ]

  for (const off of offsets) {
    
    const e = engine.addEntity()

    Transform.create(e, {
      position: { x: base.x + off.x, y: base.y + off.y, z: base.z + off.z }
    })

    AvatarShape.createOrReplace(e, {
      id: `clone:${String(e)}`,
      name: player.name ? `${player.name}` : 'NPC',
      bodyShape: player.avatar?.bodyShapeUrn,
      skinColor: player.avatar?.skinColor,
      hairColor: player.avatar?.hairColor,
      eyeColor: player.avatar?.eyesColor,
      wearables: player.wearables ?? [],
      emotes: player.emotes ?? [],
      expressionTriggerId: emoteUrn,
      expressionTriggerTimestamp: Date.now()
    })

    activeClones.push({ entity: e, ttl: 6 })
  }
}

export function cleanupSystem(dt: number) {
  if (activeClones.length === 0) return
  for (let i = activeClones.length - 1; i >= 0; i--) {
    const c = activeClones[i]
    c.ttl -= dt
    if (c.ttl <= 0) {
      engine.removeEntity(c.entity)
      activeClones.splice(i, 1)
    }
  }
}