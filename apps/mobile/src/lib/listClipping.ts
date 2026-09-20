/* Android's list default (removeClippedSubviews) adds and removes rows directly on the scroll content
   ViewGroup, outside React's mounting model, and it runs from onAttachedToWindow — which is exactly the
   walk react-native-screens triggers when a stack pop re-attaches a whole screen's view tree (QA F33). */
export const listClipping = { removeClippedSubviews: false } as const;
