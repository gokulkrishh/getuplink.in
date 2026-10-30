// The guest tour is for someone viewing a shared car. It opens once per browser: closing it any way sets this
// cookie, and while the cookie is there it never opens. No account, no server, nothing stored for the car.
export const GUEST_TOUR_COOKIE = "uplink-guest-tour";

export function guestTourSeen(cookies: string): boolean {
  return cookies.split(";").some((c) => c.trim() === `${GUEST_TOUR_COOKIE}=seen`);
}

// The cookie to set on closing: a year, for the whole site.
export const guestTourSeenCookie = (): string => `${GUEST_TOUR_COOKIE}=seen; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
