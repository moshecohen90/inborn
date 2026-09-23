#!/usr/bin/env ruby
# Adds the InbornUITests XCUITest target (StoreKitTest-driven paywall proof) and the Inborn.storekit reference to the
# prebuilt Xcode project. Run after `expo prebuild -p ios` (which regenerates ios/), before `xcodebuild test`.
#   ruby scripts/ios-add-storekit-tests.rb ios/<Project>.xcodeproj <AppTargetName>
require "xcodeproj"
require "rexml/document"

project_path, app_target_name = ARGV
abort "usage: ios-add-storekit-tests.rb <xcodeproj> <app target>" unless project_path && app_target_name

project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |t| t.name == app_target_name } or abort "no target #{app_target_name}"
# Read from the target, never a literal: the dev/QA variant builds under com.inbornapp.mobile.qa (F265).
app_bundle_id = app_target.build_configurations.first.build_settings["PRODUCT_BUNDLE_IDENTIFIER"]
ios_dir = File.dirname(project_path)
tests_name = "InbornUITests"

# .storekit file at the project root, visible in Xcode's navigator for manual runs.
storekit_ref = project.main_group.files.find { |f| f.path == "Inborn.storekit" } || project.main_group.new_file("Inborn.storekit")

tests = project.targets.find { |t| t.name == tests_name }
if tests.nil?
  tests = project.new_target(:ui_test_bundle, tests_name, :ios, app_target.deployment_target)
  tests.add_dependency(app_target)
  group = project.main_group.find_subpath(tests_name, true)
  group.set_source_tree("<group>")
  group.set_path(tests_name)
  Dir[File.join(ios_dir, tests_name, "*.swift")].sort.each { |f| tests.add_file_references([group.new_file(File.basename(f))]) }
  tests.add_resources([storekit_ref])
  tests.frameworks_build_phase.add_file_reference(project.frameworks_group.new_file("System/Library/Frameworks/StoreKitTest.framework", :sdk_root)) rescue nil
  project.save
  puts "added #{tests_name} to #{project_path}"
else
  puts "#{tests_name} already present"
end
# Build settings are (re)applied every run so a script fix reaches an existing target.
tests.build_configurations.each do |c|
  c.build_settings["PRODUCT_NAME"] = "$(TARGET_NAME)"
  c.build_settings["TEST_TARGET_NAME"] = app_target_name
  c.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] = "#{app_bundle_id}.uitests"
  c.build_settings["SWIFT_VERSION"] = "5.0"
  c.build_settings["CODE_SIGN_STYLE"] = "Automatic"
  c.build_settings["DEVELOPMENT_TEAM"] = app_target.build_configurations.first.build_settings["DEVELOPMENT_TEAM"]
  c.build_settings["GENERATE_INFOPLIST_FILE"] = "YES"
  c.build_settings["USES_XCTRUNNER"] = "YES"
  c.build_settings["TARGETED_DEVICE_FAMILY"] = "1,2"
end
project.save

# Shared scheme: run the app under the StoreKit configuration and include the UI tests in the Test action.
scheme_path = File.join(project_path, "xcshareddata", "xcschemes", "#{app_target_name}.xcscheme")
if File.exist?(scheme_path)
  doc = REXML::Document.new(File.read(scheme_path))
  launch = doc.elements["Scheme/LaunchAction"]
  if launch && launch.elements["StoreKitConfigurationFileReference"].nil?
    launch.add_element("StoreKitConfigurationFileReference", { "identifier" => "../../Inborn.storekit" })
  end
  test_action = doc.elements["Scheme/TestAction"]
  if test_action
    testables = test_action.elements["Testables"] || test_action.add_element("Testables")
    unless testables.elements.to_a.any? { |e| e.elements["BuildableReference"]&.attributes&.[]("BlueprintName") == tests_name }
      tests = project.targets.find { |t| t.name == tests_name }
      ref = testables.add_element("TestableReference", { "skipped" => "NO" })
      ref.add_element("BuildableReference", { "BuildableIdentifier" => "primary", "BlueprintIdentifier" => tests.uuid, "BuildableName" => "#{tests_name}.xctest", "BlueprintName" => tests_name, "ReferencedContainer" => "container:#{File.basename(project_path)}" })
    end
  end
  File.write(scheme_path, doc.to_s)
  puts "scheme updated: #{scheme_path}"
else
  warn "no shared scheme at #{scheme_path}; skipping scheme edit"
end

# Simulator Keychain (expo-secure-store) needs an application-identifier entitlement; Expo's generated file is empty.
ent_path = File.join(ios_dir, app_target_name, "#{app_target_name}.entitlements")
team = ENV["DEVELOPMENT_TEAM"] || app_target.build_configurations.first.build_settings["DEVELOPMENT_TEAM"]
if File.exist?(ent_path) && (team.nil? || team.empty?) == false
  ent = Xcodeproj::Plist.read_from_path(ent_path) || {}
  unless ent.key?("application-identifier")
    ent["application-identifier"] = "#{team}.#{app_bundle_id}"
    ent["keychain-access-groups"] = ["#{team}.#{app_bundle_id}"]
    Xcodeproj::Plist.write_to_path(ent, ent_path)
    puts "entitlements: application-identifier + keychain-access-groups for team #{team}"
  end
end
