Pod::Spec.new do |s|
  s.name           = 'DeviceGuard'
  s.version        = '0.0.1'
  s.summary        = 'Thermal, memory-pressure and power signals for Inborn (spec §6.5)'
  s.description    = 'Local Expo module: ProcessInfo.thermalState, Low Power Mode, memory pressure, available memory.'
  s.author         = 'Inborn'
  s.homepage       = 'https://inbornapp.com'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
