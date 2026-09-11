package com.inbornapp.mobile.uitest;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.UiAutomation;
import android.os.Bundle;
import android.util.Log;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

/** Drives any app on the phone through accessibility node actions (no input injection): -e steps "click:Select all;sleep:500;..." */
public class DriveTest {
  private static final String TAG = "UIDRIVE";
  private UiAutomation ua;

  @Test
  public void drive() throws Exception {
    ua = InstrumentationRegistry.getInstrumentation().getUiAutomation();
    AccessibilityServiceInfo info = ua.getServiceInfo();
    info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS | AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
    ua.setServiceInfo(info);
    String steps = InstrumentationRegistry.getArguments().getString("steps", "dump");
    for (String step : steps.split(";")) {
      step = step.trim();
      if (step.isEmpty()) continue;
      String[] p = step.split(":", 2);
      String cmd = p[0], arg = p.length > 1 ? p[1] : "";
      Log.i(TAG, "step " + step);
      switch (cmd) {
        case "sleep": Thread.sleep(Long.parseLong(arg)); break;
        case "dump": dump(); break;
        case "click": act(arg, AccessibilityNodeInfo.ACTION_CLICK, null); break;
        case "longclick": act(arg, AccessibilityNodeInfo.ACTION_LONG_CLICK, null); break;
        case "focus": act(arg, AccessibilityNodeInfo.ACTION_FOCUS, null); break;
        case "setsel": { // setsel:<label>:<start>:<end>
          String[] q = arg.split(":"); Bundle b = new Bundle();
          b.putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, Integer.parseInt(q[1]));
          b.putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, Integer.parseInt(q[2]));
          act(q[0], AccessibilityNodeInfo.ACTION_SET_SELECTION, b); break; }
        case "settext": { // settext:<label>:<text>
          String[] q = arg.split(":", 2); Bundle b = new Bundle();
          b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, q[1]);
          act(q[0], AccessibilityNodeInfo.ACTION_SET_TEXT, b); break; }
        default: throw new IllegalArgumentException("unknown step " + step);
      }
    }
  }

  private List<AccessibilityNodeInfo> roots() {
    List<AccessibilityNodeInfo> out = new ArrayList<>();
    for (int i = 0; i < 10 && out.isEmpty(); i++) {
      List<AccessibilityWindowInfo> ws = ua.getWindows();
      for (AccessibilityWindowInfo w : ws) { AccessibilityNodeInfo r = w.getRoot(); if (r != null) out.add(r); }
      AccessibilityNodeInfo active = ua.getRootInActiveWindow();
      if (out.isEmpty() && active != null) out.add(active);
      Log.i(TAG, "windows=" + ws.size() + " roots=" + out.size() + " active=" + (active != null));
      if (out.isEmpty()) try { Thread.sleep(300); } catch (InterruptedException e) { break; }
    }
    return out;
  }

  private static String label(AccessibilityNodeInfo n) {
    String t = n.getText() == null ? "" : n.getText().toString();
    String d = n.getContentDescription() == null ? "" : n.getContentDescription().toString();
    return t + "|" + d;
  }

  private static boolean matches(AccessibilityNodeInfo n, String want, boolean exact) {
    String t = n.getText() == null ? "" : n.getText().toString();
    String d = n.getContentDescription() == null ? "" : n.getContentDescription().toString();
    String id = n.getViewIdResourceName() == null ? "" : n.getViewIdResourceName();
    if (exact) return t.equalsIgnoreCase(want) || d.equalsIgnoreCase(want) || id.equals(want);
    return t.toLowerCase().contains(want.toLowerCase()) || d.toLowerCase().contains(want.toLowerCase()) || id.endsWith(want);
  }

  private void collect(AccessibilityNodeInfo n, String want, boolean exact, List<AccessibilityNodeInfo> out) {
    if (n == null) return;
    if (matches(n, want, exact)) out.add(n);
    for (int i = 0; i < n.getChildCount(); i++) collect(n.getChild(i), want, exact, out);
  }

  private void act(String want, int action, Bundle args) throws Exception {
    for (int attempt = 0; attempt < 20; attempt++) {
      List<AccessibilityNodeInfo> found = new ArrayList<>();
      for (AccessibilityNodeInfo r : roots()) collect(r, want, true, found);
      if (found.isEmpty()) for (AccessibilityNodeInfo r : roots()) collect(r, want, false, found);
      for (AccessibilityNodeInfo n : found) {
        AccessibilityNodeInfo target = n;
        if (action == AccessibilityNodeInfo.ACTION_CLICK || action == AccessibilityNodeInfo.ACTION_LONG_CLICK) {
          while (target != null && !(action == AccessibilityNodeInfo.ACTION_CLICK ? target.isClickable() : target.isLongClickable())) target = target.getParent();
          if (target == null) target = n;
        }
        boolean ok = target.performAction(action, args);
        Log.i(TAG, "action " + action + " on [" + label(target) + "] class " + target.getClassName() + " -> " + ok);
        if (ok) return;
      }
      Thread.sleep(500);
    }
    throw new AssertionError("node not found or action refused: " + want);
  }

  private void dump() {
    for (AccessibilityNodeInfo r : roots()) dumpNode(r, 0);
  }

  private void dumpNode(AccessibilityNodeInfo n, int depth) {
    if (n == null) return;
    String l = label(n);
    if (!l.equals("|") || n.isFocused())
      Log.i(TAG, "node " + n.getClassName() + " [" + l + "] id=" + n.getViewIdResourceName() + " clickable=" + n.isClickable() + " focused=" + n.isFocused() + " bounds=" + boundsOf(n));
    for (int i = 0; i < n.getChildCount(); i++) dumpNode(n.getChild(i), depth + 1);
  }

  private static String boundsOf(AccessibilityNodeInfo n) { android.graphics.Rect r = new android.graphics.Rect(); n.getBoundsInScreen(r); return r.toShortString(); }
}
