/** One platform hold at a time; `begin` returning a negative token means the OS gave nothing and there is nothing to release. */
export interface BackgroundHoldApi {
  begin(name: string): number;
  end(token: number): void;
}

export interface BackgroundHold {
  /** The hold is wanted exactly while an answer is streaming off-screen (spec §10.3 #21); every other pair gives it back. */
  sync(backgrounded: boolean, generating: boolean): void;
  /** iOS is reclaiming the hold: give it back, and take no other one until the app is in front again. */
  expire(): void;
  token(): number | null;
}

/**
 * The §10.3 #21 grace is a 15 s JS budget, and on iOS the process is suspended seconds after it leaves the screen,
 * so the budget is only real while a UIApplication background task is held. This keeps at most one, from the two
 * facts that decide it, so a hold cannot outlive the answer it was taken for.
 */
export function createBackgroundHold(api: BackgroundHoldApi, name: string): BackgroundHold {
  let current: number | null = null;
  /* After the OS takes its time back, asking for more of it in the same background episode is how an app gets killed. */
  let reclaimed = false;

  const release = (): void => {
    if (current === null) return;
    const token = current;
    current = null;
    api.end(token);
  };

  return {
    sync(backgrounded, generating) {
      if (!backgrounded) reclaimed = false;
      if (!backgrounded || !generating || reclaimed) return release();
      if (current !== null) return;
      const token = api.begin(name);
      if (token >= 0) current = token;
    },
    expire() {
      reclaimed = true;
      release();
    },
    token: () => current,
  };
}
