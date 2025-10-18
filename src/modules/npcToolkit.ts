import { engine, Transform, GltfContainer, Entity, pointerEventsSystem, InputAction, PointerEvents, ColliderLayer } from '@dcl/sdk/ecs'
import { Dialog } from 'dcl-npc-toolkit'
import { startDialog } from '../modules/dialog'
import { getGold } from '../modules/gold'

let wenmoonEntity: Entity | null = null

// Shared dialog sequences
const dialogsNoGold: Dialog[] = [
  { text: "Wenmoon: Empty pockets, huh?", isEndOfDialog: false } as Dialog,
  { text: "Wenmoon: It's dangerous outside—sand cuts, sky burns, and the dead have a terrific work ethic.", isEndOfDialog: false } as Dialog,
  { text: "Wenmoon: Come back with gold. I'm not a charity; I'm barely a person.", isEndOfDialog: true } as Dialog
]

const dialogsHasGold: Dialog[] = [
  { text: "Wenmoon: I hear the jingle of hope—gold.", isEndOfDialog: false } as Dialog,
  { text: "Wenmoon: Careful out there: roads bite, locals nibble, and sunrise is more of a threat than a promise.", isEndOfDialog: false } as Dialog,
  { text: "Wenmoon: I can sell you licor; it won't save you, but it pairs nicely with screaming.", isEndOfDialog: true } as Dialog
]

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

  // Dialogs are defined at module scope

  // We handle dialog via custom UI; no toolkit dialog attachment

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
      const dialogs = gold <= 0 ? dialogsNoGold : dialogsHasGold
      startDialog(dialogs.map(d => d.text))
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
  const dialogs = gold <= 0 ? dialogsNoGold : dialogsHasGold
  startDialog(dialogs.map(d => d.text))
  return true
}

