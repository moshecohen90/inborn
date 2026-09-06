Pod::Spec.new do |s|
  s.name           = 'SecureScreen'
  s.version        = '0.0.1'
  s.summary        = 'Screen-capture detection for Inborn'
  s.description    = 'Reports UIScreen.isCaptured so sensitive content can be hidden while the screen is mirrored or recorded.'
  s.author         = 'Inborn'
  s.homepage       = 'https://inbornapp.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,swift}"
end
