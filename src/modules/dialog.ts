let currentDialogText: string | undefined = undefined

export function openDialog(text: string) {
  currentDialogText = text
}

export function closeDialog() {
  currentDialogText = undefined
}

export function isDialogOpen(): boolean {
  return currentDialogText !== undefined
}

export function getDialogText(): string {
  return currentDialogText ?? ''
}


