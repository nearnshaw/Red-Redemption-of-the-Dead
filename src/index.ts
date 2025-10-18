import { engine } from '@dcl/sdk/ecs'
import { addPointerEvents, grabSystem } from './modules/grabSystem' 
import { getPlayerID } from './modules/helpers'
import { onPlayerExpressionObservable } from '@dcl/sdk/observables'
import { addLights } from './modules/lights'
import { setupUI } from './ui'
import { resetGold } from './modules/gold'


export function main() {

    getPlayerID()
    resetGold()
    addPointerEvents()
    setupUI()
	engine.addSystem(grabSystem)
    addLights()
 
}