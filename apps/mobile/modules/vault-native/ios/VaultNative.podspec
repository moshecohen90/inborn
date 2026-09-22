Pod::Spec.new do |s|
  s.name           = 'VaultNative'
  s.version        = '0.0.1'
  s.summary        = 'Inborn model vault: streaming SHA-256, device memory, backup exclusion'
  s.description    = 'Local Expo module; no network.'
  s.license        = 'MIT'
  s.author         = 'Inborn'
  s.homepage       = 'https://inbornapp.com'
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
