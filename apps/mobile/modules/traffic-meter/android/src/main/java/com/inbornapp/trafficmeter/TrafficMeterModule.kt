package com.inbornapp.trafficmeter

import android.net.TrafficStats
import android.os.Process
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Exit meter source (spec §5.1): the kernel's per-uid byte counters, which no app code can fake. */
class TrafficMeterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TrafficMeter")

    // Counters are relative to boot; UNSUPPORTED (-1) becomes null so JS can say "no counter" instead of 0.
    Function("getUidBytes") {
      val uid = Process.myUid()
      val tx = TrafficStats.getUidTxBytes(uid)
      val rx = TrafficStats.getUidRxBytes(uid)
      if (tx == TrafficStats.UNSUPPORTED.toLong() || rx == TrafficStats.UNSUPPORTED.toLong()) null
      else mapOf("tx" to tx.toDouble(), "rx" to rx.toDouble())
    }
  }
}
