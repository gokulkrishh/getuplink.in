"use client"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  )
}

// Closed, the content stays in the page (hidden="until-found"), as a <details> kept it: find-in-page opens
// the section on a match, and search engines read a closed answer (the home page's FAQ). A panel hidden that
// way keeps its own box, so its padding and border would still show as an empty band: `className` goes on
// an inner wrapper, and the panel itself has none.
function CollapsibleContent({ hiddenUntilFound = true, className, children, ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel data-slot="collapsible-content" hiddenUntilFound={hiddenUntilFound} {...props}>
      {className ? <div className={typeof className === "function" ? undefined : className}>{children}</div> : children}
    </CollapsiblePrimitive.Panel>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
