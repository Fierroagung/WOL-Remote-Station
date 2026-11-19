Pod::Spec.new do |s|
  s.name           = 'ExpoWol'
  s.version        = '1.0.0'
  s.summary        = 'Native Wake-On-LAN UDP Broadcast for iOS'
  s.description    = 'Native Wake-On-LAN UDP Broadcast for iOS'
  s.author         = ''
  s.homepage       = 'https://github.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.swift"
end
