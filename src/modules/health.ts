import { engine, Schemas, Transform, AvatarAttach, GltfContainer, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { resetGold } from './gold'
import { getChildren } from '@dcl/sdk/network'

// Tracks player health on PlayerEntity
export const Health = engine.defineComponent('Health', {
  current: Schemas.Number,
  max: Schemas.Number
})

export function initHealth(max: number = 10) {
  Health.createOrReplace(engine.PlayerEntity, { current: max, max })
}

export function getHealth(): number {
  return Health.getOrNull(engine.PlayerEntity)?.current ?? 0
}

export function getMaxHealth(): number {
  return Health.getOrNull(engine.PlayerEntity)?.max ?? 0
}

export function setHealth(amount: number) {
  const max = getMaxHealth() || 10
  Health.createOrReplace(engine.PlayerEntity, { current: Math.max(0, Math.min(amount, max)), max })
}

export function damage(amount: number) {
  const current = getHealth()
  if (current <= 0) return
  const next = Math.max(0, current - amount)
  setHealth(next)
  if (next <= 0) {
    handleDeath()
  }
}

// Respawn player to scene spawn (0,0,0 relative), clear gold, drop held items
export function handleDeath() {
  // Respawn: move player to spawn. Using Transform on PlayerEntity in SDK7
  const t = Transform.getMutable(engine.PlayerEntity)
  t.position = Vector3.create(1, 0, 1)

  // Reset gold
  resetGold()

  // Drop any grabbed items: look for AvatarAttach parents that are attached to the player
  // We infer held items by finding entities that are parents of any children with Transform parent = that entity
  // and that have AvatarAttach with this avatar (PlayerEntity implicit). The scene uses an offset parent with AvatarAttach.
  for (const [entity, _] of engine.getEntitiesWith(AvatarAttach)) {
    const children = Array.from(getChildren(entity))
    for (const child of children) {
      // Place child on ground near player and restore collisions
      const dropPos = Vector3.create(t.position.x, t.position.y, t.position.z)
      Transform.createOrReplace(child, { position: dropPos, parent: engine.RootEntity })
      if (GltfContainer.has(child)) {
        const gltf = GltfContainer.getMutable(child)
        gltf.visibleMeshesCollisionMask = ColliderLayer.CL_POINTER
        gltf.invisibleMeshesCollisionMask = 0
      }
    }
    // Detach the holder (let grab system cleanup its component if any)
    if (AvatarAttach.has(entity)) {
      AvatarAttach.deleteFrom(entity)
    }
  }

  // Restore health to full
  const max = getMaxHealth() || 10
  setHealth(max)
}



