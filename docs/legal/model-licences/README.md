# Model licence texts that ship with the app

Apache-2.0 §4(d) and the MIT licence both require the licence text itself to travel with what we
distribute. The Licences screen used to show a name, an attribution line and a link; a link is not a
copy, and a device with no network cannot follow it. These files are that copy.

| File | Covers |
|---|---|
| `apache-2.0.txt` | Every Apache-2.0 model in `../NOTICE.json` (Qwen3.5 family and its vision projector, SmolLM3, Nomic Embed, Qwen embedding, all-MiniLM) |
| `mit.txt` | Every MIT model (Phi-4-mini-instruct, Whisper base). `{{COPYRIGHT}}` is replaced at render time by that component's `attribution` from `NOTICE.json`, which is where its copyright line lives |

`apache-2.0.txt` is the canonical text from <https://www.apache.org/licenses/LICENSE-2.0.txt>, byte for
byte. Do not reflow it.

These files are the source of truth. `packages/core/src/licence/licenceTexts.ts` carries the same bytes
so the app can render them with no file system and no network, and
`packages/core/test/licence-texts.test.ts` fails if the two ever drift. Change the `.txt` first, then the
module, then run the test.

A model whose licence is neither of these (a Hugging Face import, or a future catalogue entry) shows its
`licenseUrl` and asks the user to accept before the download starts; we do not ship a text we have not read.
