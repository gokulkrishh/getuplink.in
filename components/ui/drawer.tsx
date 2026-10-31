"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { cn } from "cn"

// Every dialog in Uplink is this: a sheet from the bottom on a phone, which a swipe down closes, and a
// centred dialog from `sm` up. Base UI's Drawer (a Dialog with gestures), cut down from shadcn's base-nova
// drawer to the one direction Uplink uses. A mouse drag inside Content selects text rather than swiping, so
// on a desktop it behaves as a plain dialog.

// The backdrop fades as the sheet is swiped away. `opaque` keeps it solid instead, for a sheet that must hide
// the page behind it the whole time (the place-naming sheet hides the map while it lists Google's places).
const BACKDROP =
  "fixed inset-0 z-50 min-h-dvh bg-black/50 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] supports-backdrop-filter:backdrop-blur-xs data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-swiping:duration-0 motion-reduce:transition-none supports-[-webkit-touch-callout:none]:absolute sm:duration-150"
const BACKDROP_OPAQUE = "fixed inset-0 z-50 min-h-dvh bg-background supports-[-webkit-touch-callout:none]:absolute"

// Phone: pinned to the bottom, following the finger (--y), sliding in and out. From sm: centred, fading and
// scaling a little, the swipe ignored (its transform is fixed). --y keeps the two from fighting over transform.
const POPUP = cn(
  "relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col rounded-t-2xl border-t bg-background text-sm text-foreground shadow-2xl outline-none",
  "[--y:var(--drawer-swipe-movement-y)] [transform:translate3d(0,var(--y),0)] data-starting-style:[--y:100%] data-ending-style:[--y:100%]",
  "transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:duration-0 data-swiping:select-none data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] motion-reduce:transition-none",
  "sm:max-h-[calc(100dvh-4rem)] sm:w-auto sm:rounded-xl sm:border sm:[transform:none] sm:transition-[opacity,scale] sm:duration-150 sm:data-starting-style:scale-[0.97] sm:data-starting-style:opacity-0 sm:data-ending-style:scale-[0.97] sm:data-ending-style:opacity-0",
)

function Drawer({ swipeDirection = "down", ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" swipeDirection={swipeDirection} {...props} />
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

// The grab bar at the top of the sheet, on a phone only.
function DrawerHandle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="drawer-handle" aria-hidden="true" className={cn("flex shrink-0 cursor-grab justify-center pt-2 pb-1 active:cursor-grabbing sm:hidden", className)} {...props}>
      <span className="h-1 w-10 rounded-full bg-border" />
    </div>
  )
}

// The backdrop, the viewport that places the sheet, and the sheet with its handle. `className` sizes and pads
// the sheet (its width from sm up); `bodyClassName` lays out what's inside. `handle={false}` for a sheet
// that draws its own (the tour, whose picture runs to the top edge).
function DrawerContent({
  className,
  bodyClassName,
  opaque = false,
  handle = true,
  keyboard = false,
  children,
  ...props
}: DrawerPrimitive.Popup.Props & { bodyClassName?: string; opaque?: boolean; handle?: boolean; keyboard?: boolean }) {
  const sheet = (
    <DrawerPrimitive.Viewport data-slot="drawer-viewport" className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <DrawerPrimitive.Popup data-slot="drawer-popup" className={cn(POPUP, className)} {...props}>
        {handle && <DrawerHandle />}
        <DrawerPrimitive.Content data-slot="drawer-content" className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain", bodyClassName)}>
          {children}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Popup>
    </DrawerPrimitive.Viewport>
  )
  const portal = (
    <DrawerPrimitive.Portal data-slot="drawer-portal">
      <DrawerPrimitive.Backdrop data-slot="drawer-backdrop" className={opaque ? BACKDROP_OPAQUE : BACKDROP} />
      {sheet}
    </DrawerPrimitive.Portal>
  )
  // For sheets with text fields: on a phone the open keyboard never covers the field being typed in.
  return keyboard ? <DrawerPrimitive.VirtualKeyboardProvider>{portal}</DrawerPrimitive.VirtualKeyboardProvider> : portal
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn("text-lg font-medium tracking-heading", className)} {...props} />
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return <DrawerPrimitive.Description data-slot="drawer-description" className={cn("text-muted-foreground", className)} {...props} />
}

export { BACKDROP, POPUP, Drawer, DrawerTrigger, DrawerClose, DrawerHandle, DrawerContent, DrawerTitle, DrawerDescription }
