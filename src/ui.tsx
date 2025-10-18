import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { getGold } from './modules/gold'

export function setupUI() {
  ReactEcsRenderer.setUiRenderer(ui)
}

const ui = () => (
  <UiEntity
    uiTransform={{ width: '100%', height: '100%', positionType: 'absolute' }}
  >
    <UiEntity
      uiTransform={{
        width: 'auto',
        height: 'auto',
        positionType: 'absolute',
        position: { right: '48px', top: '16px' }
      }}
      uiText={{
        value: `Gold: ${getGold()}`,
        fontSize: 26,
        color: Color4.Yellow(),
        textWrap: 'nowrap'
      }}
    />

    {/* Toolkit's React UI disabled; using bubble UI instead */}
  </UiEntity>
)
