// Lets other parts of the page (the phone account menu) open the feedback form that FeedbackButton owns.
export const FEEDBACK_EVENT = "uplink:feedback";

export function openFeedback() {
  window.dispatchEvent(new Event(FEEDBACK_EVENT));
}
