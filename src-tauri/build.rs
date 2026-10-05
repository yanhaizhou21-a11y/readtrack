fn main() {
    tauri_build::build();

    #[cfg(target_os = "windows")]
    {
        if let Ok(out_dir) = std::env::var("OUT_DIR") {
            let out_path = std::path::PathBuf::from(out_dir);
            if let Some(debug_dir) = out_path.ancestors().nth(3) {
                let deps_dir = debug_dir.join("deps");
                if deps_dir.exists() {
                    let src_dll = debug_dir.join("WebView2Loader.dll");
                    if src_dll.exists() {
                        let dest_dll = deps_dir.join("WebView2Loader.dll");
                        let _ = std::fs::copy(&src_dll, &dest_dll);
                    }
                }
            }

            // On Windows GNU/LLD target, embed the Common-Controls 6 manifest from tauri-build's
            // libresource.a into all binaries (including integration test executables).
            // Without whole-archive inclusion, integration tests fail to load TaskDialogIndirect
            // from comctl32.dll (STATUS_ENTRYPOINT_NOT_FOUND 0xc0000139).
            let lib_res = out_path.join("libresource.a");
            if lib_res.exists() {
                let path_str = lib_res.to_str().unwrap().replace('\\', "/");
                println!("cargo:rustc-link-arg=-Wl,--whole-archive");
                println!("cargo:rustc-link-arg={}", path_str);
                println!("cargo:rustc-link-arg=-Wl,--no-whole-archive");
            }
        }
    }
}


