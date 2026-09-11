#!/usr/bin/env ruby
# Proof builds for a real iPhone without UI automation: adds ios-dev/StoreKitTestHarness.swift and the Inborn.storekit file
# to the APP target and calls the harness first thing in AppDelegate. Run after `expo prebuild -p ios`, never for a store build.
#   ruby scripts/ios-add-storekit-harness.rb ios/<Project>.xcodeproj <AppTargetName>
require "xcodeproj"

project_path, app_target_name = ARGV
abort "usage: ios-add-storekit-harness.rb <xcodeproj> <app target>" unless project_path && app_target_name
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |t| t.name == app_target_name } or abort "no target #{app_target_name}"
ios_dir = File.dirname(project_path)
app_dir = File.join(ios_dir, app_target_name)

src = File.expand_path("../ios-dev/StoreKitTestHarness.swift", __dir__)
FileUtils.cp(src, File.join(app_dir, "StoreKitTestHarness.swift"))
group = project.main_group.find_subpath(app_target_name, true)
# The app group has no path of its own (Expo references files as "<Target>/File.swift"), so mirror that.
unless group.files.any? { |f| f.path.to_s.end_with?("StoreKitTestHarness.swift") }
  target.add_file_references([group.new_file("#{app_target_name}/StoreKitTestHarness.swift")])
end
storekit = project.main_group.files.find { |f| f.path == "Inborn.storekit" } || project.main_group.new_file("Inborn.storekit")
target.add_resources([storekit]) unless target.resources_build_phase.files_references.include?(storekit)
project.save

delegate = File.join(app_dir, "AppDelegate.swift")
code = File.read(delegate)
unless code.include?("StoreKitTestHarness.start()")
  code.sub!(/(didFinishLaunchingWithOptions launchOptions: \[UIApplication\.LaunchOptionsKey: Any\]\? = nil\n  \) -> Bool \{\n)/, "\\1    StoreKitTestHarness.start()\n")
  abort "AppDelegate pattern not found" unless code.include?("StoreKitTestHarness.start()")
  File.write(delegate, code)
end
puts "harness added to #{app_target_name}"
