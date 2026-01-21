import { engine } from '@dcl/sdk/ecs'
import { addPointerEvents, grabSystem } from './modules/grabSystem' 
import { getPlayerID } from './modules/helpers'
import { onPlayerExpressionObservable } from '@dcl/sdk/observables'
import { addLights } from './modules/lights'
import { setupUI } from './ui'
import { setupToolkitNPCs } from './modules/npcToolkit'
import { resetGold } from './modules/gold'
import { initHealth } from './modules/health'


export function main() {

    getPlayerID()
    resetGold()
    initHealth(10)
    addPointerEvents()
    setupUI()
	engine.addSystem(grabSystem)
    addLights()
    setupToolkitNPCs()
    setupToolkitNPCs()
 
}