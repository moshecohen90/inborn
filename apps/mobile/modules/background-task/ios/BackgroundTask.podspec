Pod::Spec.new do |s|
  s.name           = 'BackgroundTask'
  s.version        = '0.0.1'
  s.summary        = 'UIApplication background-task holds for Inborn'
  s.description    = 'Wraps beginBackgroundTask/endBackgroundTask so an answer that is still streaming when the app leaves the screen gets its grace window instead of being suspended.'
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
