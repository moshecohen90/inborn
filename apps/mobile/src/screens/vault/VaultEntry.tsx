import { VaultScreen, type VaultScreenProps } from "./VaultScreen";

export type VaultEntryProps = VaultScreenProps;

/** S30 on the phones; the web resolves VaultEntry.web.tsx instead so llama.rn never enters that bundle. */
export function VaultEntry(props: VaultEntryProps) {
  return <VaultScreen {...props} />;
}
