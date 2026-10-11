declare const tapped: unique symbol;

/** A tap on a button that named the download's size: the only thing that may start a download (S02). */
export type UserTap = { readonly [tapped]: true; readonly bytes: number };

export const userTap = (bytes: number): UserTap => ({ bytes }) as UserTap;

export const isUserTap = (tap: unknown): tap is UserTap => typeof tap === "object" && tap !== null && typeof (tap as { bytes?: unknown }).bytes === "number" && (tap as UserTap).bytes > 0;
