# Probe: Instant photo read at 512 vs 1024 px on the web CPU path (28.9.2026)

Question: the web journey's Instant answered the CAT photo with "The red circle has no shape; there are no words associated with it", while the phone's Instant reads "red circle… CAT". Is it the 512 px CPU scale (F417), the 512 image-token cap (`IMAGE_MAX_TOKENS`), or neither?

Setup: wllama 3.6.1 driven directly in chrome-headless-shell (Playwright), no WebGPU layers (`n_gpu_layers: 0`), 2 threads, `n_ctx` 4096, the app's exact photo turn for Instant (system prompt from `turnSystemPrompt`, thinking off, `max_tokens` 512, temperature 0.7, top_p 0.9, repeat_penalty 1.1 / last 64). Images go through the app's path: picker JPEG 0.9 at ≤1024 px on white, then the CPU re-scale to the engine edge. Question: "What colour is the shape in this photo, what shape is it, and what word is written under it?". Four samples per variant: three at temperature 0.7 and one greedy. Only the first sample encodes the photo; the rest reuse the cached image.

Images: `cat-320.png` is the 320×320 photo the web journey (e3d19ac) sent. `cat-1024x768.png` is `scripts/fixtures/photo/red-circle-cat.png`, the phones' fixture.

Encode seconds = time to the image batch minus the text before it (125 tokens × the measured text prefill rate: Instant 40.4 ms/token, Fast 94.0 ms/token). "Image decode" is the LLM prefill of the image tokens (llama.cpp log). First word = time to first token of the first sample.

## Instant (Qwen3.5-0.8B + mmproj-Qwen3.5-0.8B-F16)

| Variant | Engine image | Image tokens | CAT read | Encode s | Image decode s | First word s | Total s | First answer, verbatim |
|---|---|---|---|---|---|---|---|---|
| Journey photo as shipped (320 px, cap 512) | 320×320 | 100 | 0/4 | 10.2 | 3.7 | 20.3 | 21.2 | The shape is a circle and the word underneath is 'S'. |
| (a) Phone fixture as shipped: 512 px, cap 512 | 512×384 | 192 | 0/4 | 19.8 | 7.1 | 33.4 | 39.8 | The red circle in the image represents a traditional Japanese flag's symbol (Hanko), while the black letter 'T' below stands for Japan. … |
| (b) 1024 px, cap 512 | 1024×768 | 494 | 4/4 | 54.9 | 18.9 | 80.4 | 81.6 | The red circle has a circular shape, and the text below says "CAT". |
| (b') Journey photo upscaled to 1024 px, cap 512 | 1024×1024 | 484 | 4/4 | 54.7 | 22.1 | 83.7 | 84.8 | The shape is a red circle with the word "CAT" underneath it. |
| (c) 1024 px, cap 1024 | 1024×768 | 768 | 1/4 (greedy spells "'C' followed by 'A' and 'T'") | 105.1 | 29.1 | 141.5 | 144.6 | The red circle represents a circle; 'C' stands for CIRCLE and 'A' stands for AROUND. |
| (c') Journey photo upscaled to 1024 px, cap 1024 | 1024×1024 | 1024 | 4/4 | 135.9 | 39.0 | 181.9 | 183.4 | The red circle is a dot or shape, and the text written underneath it is CAT. |
| Journey photo as shipped + `image_min_tokens` 1024 | 320×320 | 1024 | 4/4 | 129.0 | 40.9 | 176.9 | 178.4 | The red circle shape is a flag of Japan, and the words written below are CAT. |
| Journey photo as shipped + `image_min_tokens` 512 | 320×320 | 529 | 4/4 | 61.1 | 21.2 | 89.0 | 90.3 | The red circle is a flag of Japan, and below it, the letters CAT are printed. |
| Phone fixture as shipped (512 px) + `image_min_tokens` 512 | 512×384 | 540 | 4/4 | 61.0 | 20.8 | 88.5 | 91.3 | The red circle symbol signifies that this image contains a cat. The text below indicates "CAT", … |

Other samples (greedy): 320 px "…the word written underneath is 'R'."; 512 px "…the word written underneath is \"GOT\"."; 1024 px "The red circle is a flag's symbol, and the text below reads \"CAT\"."; `image_min_tokens` 512 on the 320 px photo "The shape is a red circle, and the word written underneath is CAT." All samples are in `results-instant.json`.

## Fast (Qwen3.5-2B + mmproj-Qwen3.5-2B-F16), shipped sizes only

| Variant | Engine image | Image tokens | CAT read | Encode s | Image decode s | First word s | Total s | First answer, verbatim |
|---|---|---|---|---|---|---|---|---|
| Journey photo as shipped | 320×320 | 100 | 4/4 | 39.5 | 9.8 | 64.4 | 67.8 | The shape is a circle, and its color is red. The text "CAT" appears below the shape. |
| (a) Phone fixture as shipped (512 px) | 512×384 | 192 | 4/4 | 74.9 | 18.0 | 108.1 | 110.8 | The red circle. The shape is a circle, and the word CAT is written below it. |

## Findings

1. The misread is the image-token count, not the token cap. Instant reads the word only with about 500 image tokens. At 100 tokens (the 320 px journey photo) and 192 tokens (a 1024 px photo scaled to 512 px) it guesses 'S', 'R', 'T', 'GOT', 'COM' or 'JAPAN' in every sample.
2. The 512 px scale is the cause only for photos larger than 512 px. The journey photo is 320 px and the app never enlarges, so it reaches the projector at 100 tokens with or without F417.
3. The 512 image-token cap is not the cause. Raising it to 1024 adds nothing that 494 tokens did not already give, and costs another 60 to 100 s.
4. `image_min_tokens: 512` fixes both photo sizes with one load parameter, 4/4 on each, and leaves 1024 px photos untouched. It costs about 89 s to the first word on this CPU instead of 20 to 33 s.
5. Fast reads the word at the shipped sizes, so only Instant needs the change.

Timings share the Mac with other sessions' work; treat them as ±15 %.

Scripts: `server.mjs.txt` (port 8941), `probe.js.txt` + `probe.html`, `driver.mjs.txt` (`TIER=instant|fast ONLY=<ids>`), `calib.mjs.txt` (text prefill rate). Rename to `.mjs`/`.js` to rerun.
