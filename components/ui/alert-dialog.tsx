"use client"

import * as React from "react"
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { cn } from "cn"

// A confirmation: a sheet from the bottom on a phone and a centred dialog from sm up, like every dialog in
// Uplink (components/ui/drawer.tsx). A tap outside doesn't close it, so a choice is never made by accident;
// Cancel, Esc and a swipe down do.
function AlertDialog({ disablePointerDismissal = true, ...props }: React.ComponentProps<typeof Drawer>) {
  return <Drawer data-slot="alert-dialog" disablePointerDismissal={disablePointerDismissal} {...props} />
}

function AlertDialogTrigger({ ...props }: React.ComponentProps<typeof DrawerTrigger>) {
  return <DrawerTrigger data-slot="alert-dialog-trigger" {...props} />
}

// 420px at most from sm up; full width on a phone.
function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof DrawerContent>) {
  return (
    <DrawerContent
      data-slot="alert-dialog-content"
      role="alertdialog"
      className={cn("sm:w-105", className)}
      bodyClassName="grid gap-3 px-6 pt-6 pb-5 sm:p-6"
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof DrawerTitle>) {
  return <DrawerTitle data-slot="alert-dialog-title" className={cn("text-base font-medium tracking-normal", className)} {...props} />
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof DrawerDescription>) {
  return <DrawerDescription data-slot="alert-dialog-description" className={className} {...props} />
}

// Cancel first in the DOM (so it gets focus), the action last. Right-aligned on desktop; on a phone the
// buttons stack full width and tall (44px or more, as on iOS), the action on top.
function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end max-sm:[&>*]:h-12 max-sm:[&>*]:w-full", className)}
      {...props}
    />
  )
}

function AlertDialogClose({ ...props }: React.ComponentProps<typeof DrawerClose>) {
  return <DrawerClose data-slot="alert-dialog-close" {...props} />
}

export { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogClose }
