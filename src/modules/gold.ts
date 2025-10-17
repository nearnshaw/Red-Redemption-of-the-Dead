import { engine, Schemas } from '@dcl/sdk/ecs'

// Component to track player's gold on the PlayerEntity
export const Gold = engine.defineComponent('Gold', { amount: Schemas.Number })

export function getGold(): number {
  return Gold.getOrNull(engine.PlayerEntity)?.amount ?? 0
}

export function setGold(amount: number): void {
  Gold.createOrReplace(engine.PlayerEntity, { amount })
}

export function addGold(amount: number): void {
  setGold(getGold() + amount)
}

export function resetGold(): void {
  setGold(0)
}


