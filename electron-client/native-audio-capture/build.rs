fn main() {
    napi_build::setup();

    // На macOS: screencapturekit-rs использует Swift bridge,
    // поэтому нужно добавить rpath для Swift runtime библиотек.
    // Без этого Electron не сможет найти libswift_Concurrency.dylib
    #[cfg(target_os = "macos")]
    {
        // Системный Swift runtime
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        // Xcode toolchain Swift runtime (fallback)
        println!("cargo:rustc-link-arg=-Wl,-rpath,/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx");
        // Command Line Tools Swift runtime (fallback)
        println!("cargo:rustc-link-arg=-Wl,-rpath,/Library/Developer/CommandLineTools/usr/lib/swift/macosx");
    }
}
