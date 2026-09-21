/* `nextFocusForward` is in React Native's Flow props (Libraries/Components/View/ViewPropTypes.js) and in
   ReactViewManager (`View.setNextFocusForwardId`), but 0.86's .d.ts omits it. Chat.tsx needs it for F27. */
import "react-native";

declare module "react-native/Libraries/Components/View/ViewPropTypes" {
  interface ViewProps {
    /** Android only: the view a hardware keyboard's TAB moves to from here, as a `findNodeHandle` tag. */
    nextFocusForward?: number | undefined;
  }
}
