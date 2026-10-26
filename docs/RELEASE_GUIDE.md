# Panduan Rilis APK ReadTrack (GitHub Release)

Dokumen ini menjelaskan cara membuild APK Android ReadTrack, mengekstrak file `.apk`, dan mengunggahnya ke GitHub Release.

---

## 1. Lokasi File APK Setelah Build Lokal

Saat Anda menjalankan build Android secara lokal:
```bash
# Build APK rilis Android
pnpm tauri android build --apk
```

File APK yang dihasilkan berada di salah satu folder berikut:
```text
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-v8a-release-unsigned.apk
```
Atau untuk build debug:
```text
src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

---

## 2. Cara Mengunggah APK ke GitHub Release (Manual Drag-and-Drop)

Jika Anda sudah mengekstrak `.apk` di laptop/komputer Anda:

1. Buka repositori GitHub ReadTrack Anda di browser:
   `https://github.com/<username>/readtrack/releases`
2. Klik tombol **"Draft a new release"** (atau ikon *"Create a new release"*).
3. Isi kolom:
   - **Choose a tag**: Buat tag baru, misal `v0.1.0`.
   - **Target**: `main`.
   - **Release title**: `ReadTrack v0.1.0 - Android APK`.
   - **Description**: Catatan rilis (opsional).
4. Di bagian kotak **"Attach binaries by dropping them here or selecting them"**:
   - Tarik (drag & drop) file `.apk` yang sudah Anda extract ke dalam kotak tersebut.
5. Klik **"Publish release"** (atau simpan sebagai *"Save draft"* jika belum ingin dipublikasikan ke publik).

---

## 3. Rilis Otomatis via GitHub Actions (Workflow)

Kami telah menyiapkan GitHub Actions di [`.github/workflows/release.yml`](../.github/workflows/release.yml).

### Menjalankan Rilis Manual dari Web GitHub:
1. Buka tab **Actions** di repositori GitHub Anda.
2. Di sidebar kiri, pilih workflow **"Release ReadTrack (APK & Desktop)"**.
3. Klik tombol **"Run workflow"** di kanan atas.
4. Masukkan tag (contoh: `v0.1.0`) dan nama rilis.
5. GitHub Actions akan otomatis membuat Release di halaman Releases dan melampirkan file APK jika build CI berhasil.

### Menjalankan Rilis via Git Tag Push:
```bash
git tag v0.1.0
git push origin v0.1.0
```
GitHub Actions akan otomatis terpicu begitu tag `v*` di-push.
