import {
  engine,
  inputSystem,
  InputAction,
  PointerEventType,
  Entity,
  Transform,
  AvatarAttach,
  AvatarAnchorPointType,
  Animator,
  Schemas,
  NetworkParent,
  AudioSource,
  PointerEvents,
  GltfContainer,
  ColliderLayer
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { tryOpenNpcDialog } from './npcToolkit'
import { currentPlayerId, getPlayerPosition } from '../modules/helpers'
import { parentEntity, syncEntity, getParent, getChildren, removeParent } from '@dcl/sdk/network'
import { addGold, getGold } from '../modules/gold'


export const Grabbed = engine.defineComponent('Grabbed', { avatarId: Schemas.String })

export function addPointerEvents() {

  const grabbableEntities = engine.getEntitiesByTag('Grabbable')

  for (const entity of grabbableEntities) {
    PointerEvents.createOrReplace(entity, {
      pointerEvents: [
        {
          eventType: 1,
          eventInfo: {
            button: InputAction.IA_PRIMARY,
            hoverText: 'Pick Up',
            maxDistance: 10,
            showFeedback: true,
            showHighlight: true
          }
        }
      ]
    })
  }

  const surfaceEntities = engine.getEntitiesByTag('Surface')
  for (const entity of surfaceEntities) {
    PointerEvents.createOrReplace(entity, {
      pointerEvents: [
        {
          eventType: 1,
          eventInfo: {
            button: InputAction.IA_PRIMARY,
            hoverText: '',
            maxDistance: 10,
            showFeedback: false,
            showHighlight: false
          }
        }
      ]
    })
  }

  const stoneEntities = engine.getEntitiesByTag('Stone')
  for (const entity of stoneEntities) {
    PointerEvents.createOrReplace(entity, {
      pointerEvents: [
        {
          eventType: 1,
          eventInfo: {
            button: InputAction.IA_PRIMARY,
            hoverText: 'Mine',
            maxDistance: 10,
            showFeedback: true,
            showHighlight: true
          }
        }
      ]
    })
  }

  // NPC Toolkit handles NPC click/hover. Avoid duplicating hover hints.

}


export function grabSystem() {

  if (!currentPlayerId) {
    return
  }

  // NPC Toolkit handles dialog; intercept NPC clicks here to ensure deepest mesh clicks are handled
  const tryTalkCommand = inputSystem.getInputCommand(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  if (tryTalkCommand) {
    const hitEntity = tryTalkCommand.hit?.entityId as Entity
    if (hitEntity && tryOpenNpcDialog(hitEntity)) {
      return
    }
  }

  // Drop item first (so a click can drop before any pickup happens)
  for (const [entity, grabbed] of engine.getEntitiesWith(Grabbed)) {
    const tryToDropCommand = inputSystem.getInputCommand(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
    const pickedUpChild = Array.from(getChildren(entity))[0]
    if (grabbed.avatarId !== currentPlayerId || !pickedUpChild) continue
    //if (!pickedUpChild) break
    if (tryToDropCommand) {

      

      const hitPosition = tryToDropCommand.hit?.position || getPlayerPosition()
      const hitEntity = tryToDropCommand.hit?.entityId as Entity
      const hitParentEntity = getParent(hitEntity)

      console.log('TRYING TO DROP', entity, hitPosition, hitEntity, hitParentEntity)

      // If holding a Pickaxe and clicked a Stone, mine it (erase stone, maybe add gold)
      const isHoldingPickaxe = Array.from(engine.getEntitiesByTag('Pickaxe')).includes(pickedUpChild)
      if (isHoldingPickaxe && Array.from(engine.getEntitiesByTag('Stone')).includes(hitEntity)) {
        engine.removeEntity(hitEntity)
        if (Math.random() < 0.5) {
          addGold(1)
        }
        // Keep holding the tool; do not drop
        return
      }

      // If clicking an NPC, let the toolkit handle interaction; do not drop
      if (Array.from(engine.getEntitiesByTag('NPC')).includes(hitEntity)) {
        return
      }

      // Detach from hand and place at clicked position
      //removeParent(pickedUpChild)
      Transform.createOrReplace(pickedUpChild, {
        position: hitPosition,
        parent: engine.RootEntity
      })

      // Restore pointer collisions so it can be grabbed again
      if (GltfContainer.has(pickedUpChild)) {
        GltfContainer.getMutable(pickedUpChild).visibleMeshesCollisionMask = ColliderLayer.CL_POINTER
        GltfContainer.getMutable(pickedUpChild).invisibleMeshesCollisionMask = 0
      }

      // TODO: These line crashes the renderer
      AvatarAttach.deleteFrom(entity)
      // engine.removeEntity(entity)
      Grabbed.deleteFrom(entity)
      AudioSource.playSound(pickedUpChild, 'assets/scene/Audio/putDown.mp3', true)
      return
    }
  }

  // Prevent picking up a new item if the current player already holds one
  for (const [_, grabbed] of engine.getEntitiesWith(Grabbed)) {
    if (grabbed.avatarId === currentPlayerId) {
      return
    }
  }

  // Pick up item
  // Only happens when there isn't any PickedUp component
  const grabbableEntities = engine.getEntitiesByTag('Grabbable')

  for (const entity of grabbableEntities) {
    if (inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN, entity)) {

      console.log('ENTITY CLICKED', entity)

      const offsetParent = engine.addEntity()
      Grabbed.create(offsetParent, { avatarId: currentPlayerId })

      if(GltfContainer.has(entity)) {
        GltfContainer.getMutable(entity).visibleMeshesCollisionMask = 0
        GltfContainer.getMutable(entity).invisibleMeshesCollisionMask = ColliderLayer.CL_POINTER
      }

      AvatarAttach.create(offsetParent, {
        avatarId: currentPlayerId,
        anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
      })
      Transform.createOrReplace(entity, {
        position: Vector3.create(0, 0.225, 0),
        rotation: Quaternion.fromEulerDegrees(180, -90, -60),
        parent: offsetParent
      })

      syncEntity(offsetParent, [AvatarAttach.componentId, Transform.componentId, Grabbed.componentId])

      parentEntity(entity, offsetParent)

      AudioSource.playSound(entity, 'assets/scene/Audio/pickUp.mp3', true)
    }
  }
}
