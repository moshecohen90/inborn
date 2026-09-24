/** Only the browser tier fetches a catalog over the network; every native platform ships one. */
export const catalogFailed = (): boolean => false;
