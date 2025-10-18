import ReactEcs, { UiEntity } from '@dcl/sdk/react-ecs'
import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { getGold } from './modules/gold'
import { isDialogOpen, getDialogText, advanceDialog } from './modules/dialog'

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

    {isDialogOpen() && (
      <UiEntity
        uiTransform={{
          width: '60%',
          height: '25%',
          positionType: 'absolute',
          position: { left: '20%', bottom: '10%' }
        }}
        uiBackground={{ color: Color4.fromHexString('#000000AA') }}
      >
        <UiEntity
          uiTransform={{
            width: '100%',
            height: '100%',
            padding: { top: '16px', right: '16px', bottom: '16px', left: '16px' }
          }}
          uiText={{
            value: getDialogText(),
            fontSize: 22,
            color: Color4.White(),
            textWrap: 'wrap'
          }}
          onMouseDown={() => advanceDialog()}
        />
      </UiEntity>
    )}
  </UiEntity>
)
