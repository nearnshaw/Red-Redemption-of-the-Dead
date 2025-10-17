import { engine, LightSource } from "@dcl/sdk/ecs"
import { Color3 } from "@dcl/sdk/math"


export function addLights() {
  const lights = engine.getEntitiesByTag('LightSource')
  for (const entity of lights) {
    LightSource.create(entity, {
      type: LightSource.Type.Point({}),
      color: Color3.White(),
      intensity: 30000
    })
  }
}