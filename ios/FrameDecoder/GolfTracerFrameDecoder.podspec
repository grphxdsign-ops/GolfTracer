Pod::Spec.new do |s|
  s.name         = "GolfTracerFrameDecoder"
  s.version      = "0.1.0"
  s.summary      = "Grayscale video frame decoder native module for GolfTracer AI."
  s.description  = <<-DESC
                   Classic React Native bridge module that decodes upright,
                   downscaled grayscale frames from video files using
                   AVAssetImageGenerator, exposed to JS as
                   NativeModules.GolfTracerFrameDecoder.
                   DESC
  s.homepage     = "https://example.invalid/golftracer-ai"
  s.license      = { :type => "UNLICENSED", :text => "Proprietary" }
  s.author       = { "GolfTracer AI" => "dev@example.invalid" }
  s.source       = { :git => "" }
  s.platforms    = { :ios => "13.4" }
  s.source_files = "*.{h,mm}"

  s.dependency "React-Core"
end
