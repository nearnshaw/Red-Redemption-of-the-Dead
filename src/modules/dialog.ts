let currentDialogText: string | undefined = undefined
let dialogLines: string[] = []
let dialogIndex: number = -1

export function openDialog(text: string) {
  // Single-line dialog mode
  dialogLines = []
  dialogIndex = -1
  currentDialogText = text
}

export function closeDialog() {
  currentDialogText = undefined
  dialogLines = []
  dialogIndex = -1
}

export function isDialogOpen(): boolean {
  return currentDialogText !== undefined || dialogIndex >= 0
}

export function getDialogText(): string {
  if (dialogIndex >= 0 && dialogIndex < dialogLines.length) {
    return dialogLines[dialogIndex]
  }
  return currentDialogText ?? ''
}

export function startDialog(lines: string[]) {
  // Multi-line dialog mode
  currentDialogText = undefined
  dialogLines = lines
  dialogIndex = lines.length > 0 ? 0 : -1
}

export function advanceDialog() {
  if (dialogIndex < 0) {
    closeDialog()
    return
  }
  if (dialogIndex < dialogLines.length - 1) {
    dialogIndex += 1
    return
  }
  closeDialog()
}


