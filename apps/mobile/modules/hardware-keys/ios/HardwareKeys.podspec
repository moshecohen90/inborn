Pod::Spec.new do |s|
  s.name           = 'HardwareKeys'
  s.version        = '0.0.1'
  s.summary        = 'Hardware-keyboard Enter for Inborn'
  s.description    = 'Enter on a physical keyboard sends the composer draft; Shift+Enter breaks the line.'
  s.author         = 'Inborn'
  s.homepage       = 'https://inbornapp.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,swift}"
end
