# Fixture sources

Every photo was sampled from `photos/sized/`: the long edge scaled to 1024 px (`sips -Z 1024`), as the phone does
(`apps/mobile/src/images/scale.ts`). Full-size originals and the one image kept out of the repo live in
`~/dev/inborn-docs/v1-basics/fixtures/`.

## Photos from Wikimedia Commons (licence checked on the file page, 4.10.2026)

| File in `photos/sized/` | Commons page | Licence | Author |
|---|---|---|---|
| alexander-s-supermarket-receipt-late-twentieth-cen.jpg | https://commons.wikimedia.org/wiki/File:Alexander%27s_Supermarket_receipt,_late_twentieth_century.tif | CC0 | Struthious Bandersnatch |
| kassenbon-kreiller-str-1.jpg | https://commons.wikimedia.org/wiki/File:Kassenbon_Kreiller_Str,_1.png | Public domain | Renardo la vulpo |
| street-sign-in-karakol.jpg | https://commons.wikimedia.org/wiki/File:Street_sign_in_Karakol.jpg | CC0 | Bgag |
| menu-of-the-garden-caf-2023-05-21.jpg | https://commons.wikimedia.org/wiki/File:Menu_of_The_Garden_Caf%C3%A9_2023-05-21.jpg | CC0 | Andy Li |
| handwritten-note-ca-1918-december-dpla-65285abb9b0.jpg | https://commons.wikimedia.org/wiki/File:Handwritten_note,_ca._1918_December_-_DPLA_-_65285abb9b084add5d8d6ea988e22400.jpg | Public domain | Franklin Newton Taylor |
| nutrition-facts-label-with-94-saturated-fat-per-se.jpg | https://commons.wikimedia.org/wiki/File:Nutrition_Facts_label_with_94%25_saturated_fat_per_serving.jpg | CC0 | B137 |
| titanic-survivor-by-class-bar-charts.jpg | https://commons.wikimedia.org/wiki/File:Titanic_survivor_by_class_bar_charts.png | CC0 | Ldecola |
| dogs-at-marymoor-park-3618931116.jpg | https://commons.wikimedia.org/wiki/File:Dogs_at_Marymoor_Park_(3618931116).jpg | CC0 | Chiara Coetzee |
| polka-dot-mug-unsplash.jpg | https://commons.wikimedia.org/wiki/File:Polka-dot_mug_(Unsplash).jpg | CC0 | andrea di anddante |

Kept outside the repo: `wikipedia-screenshot-mobil` (https://commons.wikimedia.org/wiki/File:Wikipedia_Screenshot_mobil.png,
CC0 for the screenshot, but it shows Wikimedia logos). It is the "phone screenshot (real)" row of Set B.

Dropped before sampling: a CC0 money-transfer receipt that shows a private person's name and phone number.

## Made for this baseline

- `photo-receipt.png`, `photo-street-sign.png`: the repo's own clean fixtures (`docs/qa/ios-device-pass-28/photos`), scaled to 1024 px.
- `receipt-blurred.jpg` (rotated, blurred, JPEG q55 copy of `photo-receipt.png`) and `letter-at-angle.jpg` (a letter
  written for this test, perspective-warped, blurred and noised): `harness/make_degraded.py`.
- `docs/*.md`: all four documents were written for this test. `product-manual.md` is produced by `harness/make_manual.py`;
  about 30,000 characters are manual text and the last ~15,000 are a blank maintenance-log table, to reach 15 pages of
  3,000 characters (`TEXT_PAGE_CHARS`).
