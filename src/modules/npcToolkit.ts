import { engine, Transform, GltfContainer, Entity, pointerEventsSystem, InputAction, PointerEvents, ColliderLayer } from '@dcl/sdk/ecs'
import { openDialogWindow, talkBubble, Dialog } from 'dcl-npc-toolkit'
import { addDialog } from 'dcl-npc-toolkit/dist/dialog'
import { getGold } from '../modules/gold'

let wenmoonEntity: Entity | null = null

export function setupToolkitNPCs() {
  // Find the existing NPC placed in the visual editor
  const existingNPCsIterable = engine.getEntitiesByTag('NPC')
  const existingNPCs = Array.from(existingNPCsIterable)
  let npcEntity: Entity | undefined = undefined

  if (existingNPCs.length > 0) {
    npcEntity = existingNPCs[0]
  } else {
    // Fallback: search by GLTF src containing wenmoon/npc
    for (const [entity] of engine.getEntitiesWith(GltfContainer)) {
      const gltf = GltfContainer.getOrNull(entity)
      if (gltf && (gltf.src?.toLowerCase().includes('wenmoon') || gltf.src?.toLowerCase().includes('npc'))) {
        npcEntity = entity
        break
      }
    }
  }

  // Prefer direct name if available
  const named = engine.getEntityOrNullByName('Wenmoon')
  if (named) npcEntity = named

  if (!npcEntity) return
  wenmoonEntity = npcEntity

  const dialogs: Dialog[] = [
    { text: 'Wenmoon: You have no gold. Go away.', isEndOfDialog: true } as Dialog,
    { text: 'Wenmoon: I see you have some gold. I can sell you licor.', isEndOfDialog: true } as Dialog
  ]

  // Attach toolkit dialog UI to the existing NPC entity
  addDialog(npcEntity)

  // Ensure pointer collisions and a single pointer event are set on the NPC
  if (GltfContainer.has(npcEntity)) {
    const mut = GltfContainer.getMutable(npcEntity)
    const curVisible = (mut.visibleMeshesCollisionMask ?? 0) as unknown as number
    const curInvisible = (mut.invisibleMeshesCollisionMask ?? 0) as unknown as number
    mut.visibleMeshesCollisionMask = (curVisible | ColliderLayer.CL_POINTER) as unknown as number
    mut.invisibleMeshesCollisionMask = (curInvisible | ColliderLayer.CL_POINTER) as unknown as number
  }
  PointerEvents.createOrReplace(npcEntity, {
    pointerEvents: [
      {
        eventType: 1,
        eventInfo: {
          button: InputAction.IA_PRIMARY,
          hoverText: 'Talk',
          maxDistance: 10,
          showFeedback: true,
          showHighlight: true
        }
      }
    ]
  })

  // Bind click directly on the resolved entity
  pointerEventsSystem.onPointerDown(
    { entity: npcEntity, opts: { button: InputAction.IA_PRIMARY, hoverText: 'Talk', showFeedback: true, showHighlight: true, maxDistance: 10 } },
    () => {
      console.log('NPC clicked -> opening dialog via NPC Toolkit')
      const gold = getGold()
      const startIndex = gold <= 0 ? 0 : 1
      // Use bubble UI to avoid React-based toolkit UI crashes
      talkBubble(npcEntity as Entity, dialogs, startIndex)
    }
  )
}

export function tryOpenNpcDialog(entityHit: Entity): boolean {
  // Detect if the clicked entity is the Wenmoon NPC or any of its parents
  let current: Entity | undefined = entityHit
  while (current) {
    if (wenmoonEntity && current === wenmoonEntity) break
    if (!Transform.has(current)) { current = undefined; break }
    const parent = (Transform.get(current) as any).parent as Entity | undefined
    if (!parent || parent === engine.RootEntity) { current = undefined; break }
    current = parent
  }
  if (!current) return false

  // Open dialog on the resolved NPC entity
  const gold = getGold()
  const startIndex = gold <= 0 ? 0 : 1
  const dialogs: Dialog[] = [
    { text: 'Wenmoon: You have no gold. Go away.', isEndOfDialog: true } as Dialog,
    { text: 'Wenmoon: I see you have some gold. I can sell you licor.', isEndOfDialog: true } as Dialog
  ]
  addDialog(current)
  // Use bubble UI fallback
  talkBubble(current, dialogs, startIndex)
  return true
}

