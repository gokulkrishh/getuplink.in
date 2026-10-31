"use client";

// A light tap of the phone's haptics when a control is tapped. Pass as a ref: <button ref={haptic}>.
//
// iPhone: Safari has no vibration API, but since Safari 17.4 a native switch (<input type="checkbox" switch>)
// taps the haptics when it toggles. So the control gets a transparent label over it, tied to a hidden switch:
// the owner's own tap toggles the switch, and the tap's click still bubbles to the control's handler. Only a
// real tap works (iOS ignores a switch toggled from code), it is the system's one tap, and the owner's System
// Haptics setting turns it off. The trick is ios-haptics' (github.com/tijnjh/ios-haptics, MIT), written out
// here so a submit button still submits: the label takes the click's default action, so for one we submit the
// form ourselves. Never put it on a <label> (a label inside a label stops the outer one working).
//
// Android: navigator.vibrate, 10 ms, on a tap. Elsewhere (a desktop, a mouse) it does nothing.

const HAPTIC = "data-haptic";
const VIBRATE_MS = 10;

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function haptic(el: HTMLElement | null): (() => void) | void {
  if (!el || typeof window === "undefined") return;
  if (isIOS()) {
    if (el.querySelector(`:scope > [${HAPTIC}]`)) return;
    const label = document.createElement("label");
    label.setAttribute(HAPTIC, "");
    label.setAttribute("aria-hidden", "true");
    // Above the control's own content (a highlight or label inside may be positioned), so the tap lands on it.
    Object.assign(label.style, { position: "absolute", inset: "0", zIndex: "50", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" });
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.setAttribute("switch", "");
    toggle.tabIndex = -1;
    Object.assign(toggle.style, { position: "absolute", width: "1px", height: "1px", margin: "0", visibility: "hidden" });
    toggle.addEventListener("click", (e) => e.stopPropagation());
    label.append(toggle);
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.append(label);
    // A tap on the label is the label's click, so a submit button wouldn't submit: do it here.
    const submit = (e: MouseEvent) => {
      if (e.target === label && el instanceof HTMLButtonElement && el.type === "submit" && !el.disabled) el.form?.requestSubmit(el);
    };
    el.addEventListener("click", submit);
    return () => {
      el.removeEventListener("click", submit);
      label.remove();
    };
  }
  if (typeof navigator.vibrate !== "function") return;
  // On the click, so a drag that ends on the control doesn't buzz; a click is a PointerEvent in Chrome.
  const buzz = (e: MouseEvent) => {
    if ((e as PointerEvent).pointerType === "touch") navigator.vibrate(VIBRATE_MS);
  };
  el.addEventListener("click", buzz);
  return () => el.removeEventListener("click", buzz);
}
