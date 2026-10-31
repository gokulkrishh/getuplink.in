"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { X } from "lucide-react"
import { cn } from "cn"

// Every dialog in Uplink is this: a sheet from the bottom on a phone, which a swipe down closes, and a
// centred dialog from `sm` up. Styled like an iOS sheet: a card 8px in from the screen's edges, rounded
// 16px, a shade lighter than the page in the dark theme, with a grab bar and no border. Buttons and fields
// inside keep the app's own style. Base UI's Drawer (a Dialog with gestures), cut down from shadcn's
// base-nova drawer to the one direction Uplink uses. A mouse drag inside Content selects text rather than swiping, so
// on a desktop it behaves as a plain dialog.

// The backdrop fades as the sheet is swiped away. `opaque` keeps it solid instead, for a sheet that must hide
// the page behind it the whole time (the place-naming sheet hides the map while it lists Google's places).
// Both are fixed and run 25vh past the top and bottom of the screen, so they cover it wherever the page is
// scrolled and behind a browser bar that slides away (iOS), rather than sitting at the top of the page.
const COVER = "fixed inset-x-0 -top-[25vh] -bottom-[25vh] z-50"
const BACKDROP = cn(
  COVER,
  "bg-black/50 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] supports-backdrop-filter:backdrop-blur-xs data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-swiping:duration-0 motion-reduce:transition-none sm:duration-150 sm:data-ending-style:duration-150",
)
// Solid, but not the sheet's own colour, so the sheet still reads as a card on top (iOS's grouped grey in
// the light theme, the page's black in the dark one).
const BACKDROP_OPAQUE = cn(COVER, "bg-[#f2f2f7] dark:bg-background")

// Where the sheet sits: 8px off the bottom and sides of a phone, lifted above the keyboard while one is open
// (the inset is set by Drawer.VirtualKeyboardProvider), and in the middle from sm up.
const VIEWPORT = "fixed inset-0 z-50 flex items-end justify-center px-2 pb-[calc(0.5rem+var(--drawer-keyboard-inset,0px))] sm:items-center sm:p-4"

// The sheet's surface: white on the light theme; iOS's raised grey on the dark one, so it stands off the page.
const SURFACE = "bg-background dark:bg-[#1c1c1e]"

// Phone: pinned to the bottom, following the finger (--y), sliding in and out. From sm: centred, fading and
// scaling a little, the swipe ignored (its transform is fixed). --y keeps the two from fighting over transform.
const POPUP = cn(
  "relative flex max-h-[calc(100dvh-2.5rem)] w-full flex-col overflow-hidden rounded-2xl text-sm text-foreground shadow-2xl outline-none",
  SURFACE,
  "[--y:var(--drawer-swipe-movement-y)] [transform:translate3d(0,var(--y),0)] data-starting-style:[--y:calc(100%+1rem)] data-ending-style:[--y:calc(100%+1rem)]",
  "transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:duration-0 data-swiping:select-none data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] motion-reduce:transition-none",
  "sm:max-h-[calc(100dvh-4rem)] sm:w-auto sm:rounded-xl sm:[transform:none] sm:transition-[opacity,scale] sm:duration-150 sm:data-ending-style:duration-150 sm:data-starting-style:scale-[0.97] sm:data-starting-style:opacity-0 sm:data-ending-style:scale-[0.97] sm:data-ending-style:opacity-0",
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

// The grab bar at the top of the sheet, on a phone only: a short pill, as on iOS.
function DrawerHandle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="drawer-handle" aria-hidden="true" className={cn("flex shrink-0 cursor-grab justify-center pt-2 pb-1 active:cursor-grabbing sm:hidden", className)} {...props}>
      <span className="h-1.5 w-12 rounded-full bg-foreground/20 dark:bg-white/25" />
    </div>
  )
}

// The round close button of a sheet's header, as on iOS: 32px everywhere (in px, so a phone's larger rem doesn't grow it), its tap area 44px on a phone.
function DrawerCloseButton({ className }: { className?: string }) {
  return (
    <DrawerPrimitive.Close
      aria-label="Close"
      className={cn(
        "tap-target inline-flex size-[32px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground/[0.07] text-foreground transition-colors hover:bg-foreground/12 focus-visible:outline-2 focus-visible:outline-ring dark:bg-white/12 dark:hover:bg-white/18",
        className,
      )}
    >
      <X className="size-[16px]" aria-hidden="true" />
    </DrawerPrimitive.Close>
  )
}

// The backdrop, the viewport that places the sheet, and the sheet. `className` sizes the sheet (its width from
// sm up); `bodyClassName` pads and lays out what's inside.
// With a `title`, the sheet has a header that stays put while the body scrolls under it, as on iOS: the grab
// bar (on a phone), a round close button on the right (unless `close={false}`) and the title centred, on a
// frosted bar that gains a line once the body has scrolled. Without one, only the grab bar (`handle`), for a
// sheet that titles itself (a confirmation).
function DrawerContent({
  className,
  bodyClassName,
  title,
  close = true,
  opaque = false,
  handle = true,
  keyboard = false,
  children,
  ...props
}: DrawerPrimitive.Popup.Props & { bodyClassName?: string; title?: React.ReactNode; close?: boolean; opaque?: boolean; handle?: boolean; keyboard?: boolean }) {
  const [scrolled, setScrolled] = React.useState(false)
  const sheet = (
    <DrawerPrimitive.Viewport data-slot="drawer-viewport" className={VIEWPORT}>
      <DrawerPrimitive.Popup data-slot="drawer-popup" className={cn(POPUP, className)} {...props}>
        {handle && title === undefined && <DrawerHandle />}
        <DrawerPrimitive.Content data-slot="drawer-content" className="relative flex min-h-0 flex-1 flex-col">
          {title !== undefined && (
            // 72px on a phone (the grab bar over the row), 68px from sm up. The body's spacer matches, and so
            // does its scroll padding, so a field focused or scrolled to is never left under the header.
            <div
              data-slot="drawer-header"
              data-scrolled={scrolled || undefined}
              className={cn(
                "absolute inset-x-0 top-0 z-10 border-b border-transparent px-4 pt-5 pb-3 transition-colors duration-150 sm:px-5 sm:pt-4",
                "bg-background/80 backdrop-blur-xl data-scrolled:border-border dark:bg-[#1c1c1e]/80",
              )}
            >
              {handle && <DrawerHandle className="absolute inset-x-0 top-0" />}
              <div className="relative flex min-h-10 items-center justify-center px-12">
                {close && <DrawerCloseButton className="absolute top-1/2 right-0 -translate-y-1/2" />}
                <DrawerTitle className="truncate text-center text-base font-medium tracking-normal">{title}</DrawerTitle>
              </div>
            </div>
          )}
          <div
            data-slot="drawer-body"
            onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
            className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain", title !== undefined && "scroll-pt-[4.5rem] sm:scroll-pt-[4.25rem]", bodyClassName)}
          >
            {/* The header's room: an element, not padding, so a sheet's own padding can't take it away. */}
            {title !== undefined && <div aria-hidden="true" className="h-[4.5rem] shrink-0 sm:h-[4.25rem]" />}
            {children}
          </div>
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

export { BACKDROP, POPUP, VIEWPORT, Drawer, DrawerTrigger, DrawerClose, DrawerHandle, DrawerCloseButton, DrawerContent, DrawerTitle, DrawerDescription }
