import { contentMeta } from "../../modules/share-target";

/** What the provider calls a file opened with Inborn; a MediaStore URI's last segment (content://media/…/1000050223) is only an id. */
export const openedFileName = (url: string): string | undefined => contentMeta(url)?.name ?? undefined;
