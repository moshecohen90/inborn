# Inborn Accessibility Statement

Spec basis: §9.3, §9.4, §10.8, §11.3. Last edited 23 September 2026.

Effective date: 23 September 2026
Owner: Cohen Apps (the developer account shown on the store listing)
Contact: support@inbornapp.com or +1-440-847-8502. We have no physical reception and offer no in-person service.

---

## 1. What this statement covers

The Inborn apps for iOS, Android, Windows and macOS, the Inborn web version, and this website. It describes what the product does for accessibility today, what it does not do yet, and how to tell us when something is in your way.

## 2. The standard we work to

We build Inborn to meet **WCAG 2.2 level AA**, and we treat that as the bar for every new screen. We operate under Israeli law: the Equal Rights for Persons with Disabilities Law 5758-1998 and the Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations 5773-2013, whose website chapter adopts the Israeli standard IS 5568. Where the app is sold in the European Union, the European Accessibility Act applies to it as a consumer product.

This is a statement of **partial conformance**. We have not commissioned an external audit and we publish no conformance report, so we do not claim that every screen meets every AA success criterion. Section 5 lists the gaps we know about, including the ones we have measured and not yet fixed. If you find one that is not listed, section 6 is how to tell us, and we treat it as a bug.

## 3. What the app does today

Each item below is a feature in the shipping code, not an intention.

- **Text size, two independent ways.** On iOS and Android, Inborn follows the system text size (Dynamic Type, the Android font scale). It also has its own **Text size** control in Settings, with seven steps from 0.9× to 2×, and that one works on every platform including the web version. On mobile the two multiply, so the largest app setting on a phone already at its largest system size is very large text. Most of the app's text is built from that scale. Some surfaces still use fixed sizes and follow only the system text size; section 5 says which.
- **Contrast.** The app's colour tokens are fixed so that body, secondary and tertiary text reach a contrast ratio of at least **4.5:1** on every surface they are allowed to sit on, in the dark theme and in the light theme. So does the text on the primary button, the text on the red delete and wipe buttons, and the red, amber and green semantic inks wherever they carry words. An automated test in our test suite asserts every one of those ratios and fails when a colour is changed to something that breaks them.
- **Reduced motion.** When Reduce Motion is on in the operating system, the seal on the chat screen does not breathe, pulse or animate its opening, and on Android the main floating button's press animation is skipped. Settings shows the current state of the system setting, read when the screen opens.
- **Screen readers (VoiceOver, TalkBack).** Controls carry roles and states, and icon-only controls and switches carry labels, with one exception named in section 5. While an answer streams, the sentences that have finished are announced as they complete, at most one announcement every 1.5 seconds, with the Markdown marks stripped out, and "Answer finished" is announced at the end. Two custom actions are offered, **Read latest answer** on the chat screen and **Read this answer** on each answer, so you can hear an answer again without hunting through it. On Android the safety notice is a polite live region.
- **Read aloud.** Any answer can be read aloud through the system speech synthesiser, using voices installed on the device. If nothing on the device can speak that language, the app says so rather than failing quietly.
- **Touch targets.** The shared list rows, buttons and text links are at least 52, 48 and 44 pt tall. Some smaller controls are between 28 and 36 pt; section 5 lists them.
- **Keyboard, on desktop and in a browser.** A message can be sent from the keyboard alone: with the composer focused, **Enter sends** and **Shift+Enter** breaks the line. On a phone or a tablet with only a touchscreen, Enter stays a newline, because there the keyboard is the on-screen one. The desktop app's menu bar carries accelerators for new chat, new incognito chat, toggle incognito, focus composer, search, stop, command palette, toggle sidebar, model picker, import and quit. In a browser window the same keys work for new chat, new incognito chat, search, the command palette, the model picker and the sidebar, and Esc stops generation; focus composer and import are on the desktop menu only.
- **Dictation.** On iOS and on Android 13 or later, dictation is available from the composer as an alternative to typing, and it runs on the device. The web and desktop versions have no dictation.
- **Eight interface languages.** English, German, Spanish, French, Japanese, Korean, Brazilian Portuguese and Traditional Chinese.

## 4. This website

The site is plain HTML and CSS. It ships **no JavaScript at all**, sets no cookies and makes no third-party request, so nothing can break a screen reader or a keyboard between you and the text. Every page declares its language, carries a description, opens with a "Skip to content" link, and gives keyboard focus a visible 2 px outline. The site's only motion is a short colour transition on links and buttons, and it runs only when the browser reports no preference for reduced motion. Those properties are checked automatically before the site is published: the check fails on a page without a language, without a description, or with a script in it. The site's palette is held to the same contrast rule as the app's, by a test that reads this stylesheet and compares it against the app's tested colours.

## 5. Known gaps

These are measured, not guessed. Each one is a bug on our list.

- **No right-to-left interface language ships.** None of the eight languages is written right to left, and the right-to-left layout path exists only behind a developer setting. Hebrew and Arabic interfaces are not available.
- **The screen-reader announcements have not had a full listening pass.** The announcement code is covered by unit tests and its labels by accessibility-tree dumps, but the last recorded end-to-end TalkBack session predates that code, and we have not repeated it on a device with VoiceOver. We know the labels are there; we have not sat with a screen reader through a long answer.
- **Some text does not grow with the text size.** Code blocks, inline code, maths and the headings inside an answer, and several secondary screens (documents, lock, licence key, licences), follow the system text size but not the app's own Text size control, so raising that control to 200 % leaves them where they were. The persona glyph in the personas and chat-settings sheets and the attachment counter badge on the composer grow with neither; the caption on a swipe action in the chat list follows the app's control but not the system size.
- **Wide content scrolls sideways.** Code blocks and tables inside an answer or a document scroll horizontally instead of reflowing, and the larger the text the more often that happens.
- **Some controls are smaller than the platform minimum.** The send button is 36 pt, the chips in a segmented control (including the Text size chooser itself) are 36 pt, and the inline actions under an answer are 28 pt.
- **One unlabelled control.** The selection checkbox on a row in the documents list has a role and a state but no label, so a screen reader announces it without naming what it selects.
- **Reduce Motion is read once per screen.** Turning it on while Inborn is open takes effect when the screen is opened again, not immediately.
- **Keyboard coverage is shortcuts, not an audited traversal.** The shortcuts in section 3 work; we have not audited every control on every screen for reachability and a visible focus ring by keyboard alone.
- **Dictation depends on the platform.** Inborn uses on-device speech recognition only, so where your device has no on-device recogniser for that language, dictation is refused rather than sent to a server.
- **No published conformance report.** There is no VPAT and no IS 5568 declaration to read.

## 6. Telling us about a problem

Write to **support@inbornapp.com** or call **+1-440-847-8502**. It helps if you say which device and operating system version you use, which assistive technology, and which screen the problem is on. We aim to answer within 14 days, and an accessibility problem is triaged as a bug rather than as a feature request.

If you are not satisfied with our answer, you may contact the Commission for Equal Rights of Persons with Disabilities at the Israeli Ministry of Justice.

## 7. How this statement is kept honest

The contrast rule, the announcement logic and the site's palette are covered by automated tests in the product's test suite; the site's language, description and no-script rules are checked before the site is published. Each of those fails when the claim above stops being true. The text-size scale is checked only for its 200 % ceiling, so the rest of that claim rests on review rather than on a test.

When a gap in section 5 is closed, the gap is deleted here in the same change, and the effective date at the top moves. The version of this statement that applies is the one published at inbornapp.com/accessibility. The copy inside the app is a snapshot taken when that version of the app was built, which is why every legal screen in the app offers to open the current version on the website.
