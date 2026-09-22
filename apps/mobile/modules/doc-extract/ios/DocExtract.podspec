require 'fileutils'

# Tesseract (Hebrew OCR, spec §5.5 / §14 M5) comes from INBORN_MODELS_DIR/ocr like the Android traineddata: `ios/libtesseract.xcframework`
# plus `tessdata/*.traineddata`, gitignored. Without them the module builds with Vision only and `ocrEngine()` says so.
models_dir = ENV['INBORN_MODELS_DIR'] || File.expand_path('../../../../../.models', __dir__)
ocr_dir = File.join(models_dir, 'ocr')
tess_framework = File.join(ocr_dir, 'ios', 'libtesseract.xcframework')
tess_data = File.join(ocr_dir, 'tessdata')
vendor = File.join(__dir__, 'vendor')
tesseract = File.directory?(tess_framework) && File.directory?(tess_data)
if tesseract
  # CocoaPods only vendors files under the pod root, so the build-time inputs are linked in (never committed).
  FileUtils.mkdir_p(vendor)
  { 'libtesseract.xcframework' => tess_framework, 'tessdata' => tess_data }.each do |name, target|
    link = File.join(vendor, name)
    FileUtils.rm_rf(link) if File.exist?(link) || File.symlink?(link)
    File.symlink(target, link)
  end
else
  FileUtils.rm_rf(vendor)
  Pod::UI.warn "[doc-extract] no Tesseract at #{ocr_dir} (ios/libtesseract.xcframework + tessdata/); iOS OCR is Vision only, Hebrew scans will not be read"
end

Pod::Spec.new do |s|
  s.name           = 'DocExtract'
  s.version        = '0.0.1'
  s.summary        = 'Inborn documents: PDFKit text + page images, Vision OCR (+ Tesseract for scripts Vision lacks), all on the device'
  s.description    = 'Local Expo module; no network.'
  s.license        = 'MIT'
  s.author         = 'Inborn'
  s.homepage       = 'https://inbornapp.com'
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit', 'Vision'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  if tesseract
    s.vendored_frameworks = 'vendor/libtesseract.xcframework'
    s.libraries = 'c++', 'z'
    s.resource_bundles = { 'DocExtractOcr' => ['vendor/tessdata'] }
  end
end
