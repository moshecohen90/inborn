# Images one process's top-level window to a PNG: the Windows side of `qa-drive.mjs shot` (macOS uses screencapture -l).
# PrintWindow with PW_RENDERFULLCONTENT asks the window itself for its pixels, so nothing in front of it is captured.
param([Parameter(Mandatory = $true)][int]$ProcessId, [Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class InbornShot {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[void][InbornShot]::SetProcessDPIAware()
$proc = Get-Process -Id $ProcessId
$hwnd = $proc.MainWindowHandle
if ($hwnd -eq [IntPtr]::Zero) { throw "process $ProcessId has no main window" }
$rect = New-Object InbornShot+RECT
[void][InbornShot]::GetWindowRect($hwnd, [ref]$rect)
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) { throw "window of $ProcessId has no area" }
$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$hdc = $graphics.GetHdc()
$ok = [InbornShot]::PrintWindow($hwnd, $hdc, 2)
$graphics.ReleaseHdc($hdc)
$graphics.Dispose()
if (-not $ok) { throw "PrintWindow failed for $ProcessId" }
# An unpainted window is one or two flat colours; a 40x40 sample tells it apart from a light, sparse screen that PNG
# compresses as small as an empty one.
$colors = New-Object 'System.Collections.Generic.HashSet[int]'
for ($i = 0; $i -lt 40; $i++) { for ($j = 0; $j -lt 40; $j++) {
  [void]$colors.Add($bitmap.GetPixel([int](($width - 1) * $i / 39), [int](($height - 1) * $j / 39)).ToArgb())
} }
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
@{ file = $Out; width = $width; height = $height; title = $proc.MainWindowTitle; distinctColors = $colors.Count } | ConvertTo-Json -Compress
