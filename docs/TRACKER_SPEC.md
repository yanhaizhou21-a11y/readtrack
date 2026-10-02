# TRACKER_SPEC — Interactive Reading Tracker

Fitur inti. Semua logika di Rust (`services/tracker_service.rs`) sebagai fungsi murni + state machine, mudah di-unit-test.

## 1. Tujuan
Menjawab: bagian mana **sudah / sedang / belum / dilewati** dibaca, **kapan**, **berapa kali**, **berapa lama**, dan posisi terakhir.

## 2. Segment
Unit terkecil tracker.
- **PDF:** 1 segmen = 1 halaman. `word_count` dari teks halaman (diisi saat indexing; sebelum itu estimasi 250).
- **Rich text:** grup blok berurutan dalam satu section. Aturan pembentukan:
  1. Mulai segmen baru di tiap heading dan batas section.
  2. Tambah blok hingga `word_count ≥ 40`, atau blok berikut akan melewati 220 kata.
  3. Blok tunggal > 220 kata jadi satu segmen sendiri.
  4. Gambar/tabel/kode menyumbang kata ekuivalen (`image=30`, `table=cells*1.0`, `code=chars/6`) supaya dwell wajar.
- Dibuat saat import dengan `status='unread'`. Bila `parser_version` naik: regenerasi segmen, petakan status lama ke segmen baru yang tumpang tindih `linear_pos` (maks overlap menang).

## 3. Input dari reader
React mengirim ringkasan viewport (maks 1×/detik, saat berubah):
```ts
type ViewportReport = {
  sessionId: string;
  ts: number;                       // ms epoch
  visible: { segmentIndex: number; ratio: number }[]; // porsi segmen di "reading zone"
  position: LogicalPosition;        // posisi acuan (blok teratas di reading zone)
  interacting: boolean;             // ada scroll/tap dalam idle window
  foreground: boolean;
  jump: "none" | "toc" | "search" | "bookmark" | "resume" | "slider"; // asal perpindahan
};
```
**Reading zone** = pita vertikal 20%–80% tinggi viewport. Segmen dihitung "terlihat" bila `ratio ≥ 0.5` dalam zona, atau menutupi zona ≥ 60% bila lebih besar dari zona.

## 4. Akumulasi dwell
Per laporan, untuk segmen terlihat: `dwell_ms += Δt` (selisih ts sebelumnya, dibatasi maks 2000 ms per laporan) **hanya jika**:
- `foreground = true`
- `interacting = true` atau waktu sejak interaksi terakhir ≤ `idle_timeout_ms` (default 45 s)
- tidak ada jump besar pada laporan ini
Waktu idle > timeout tidak dihitung. Dwell dibagi rata antar segmen terlihat bila >1.

## 5. Threshold "dibaca"
```text
expected_ms   = word_count / max_wpm * 60_000          # max_wpm default 700 (batas membaca tercepat realistis)
required_ms   = max(min_dwell_ms, expected_ms * read_ratio)   # min_dwell 1200, read_ratio 0.5
```
Segmen → `read` bila `dwell_ms_sesi_ini ≥ required_ms`. Scroll cepat tidak memenuhi syarat → tetap `unread`/`skipped`, bukan `read`.
Contoh: 100 kata → expected 8.6 s → required 4.3 s. 20 kata → 1.2 s (min dwell).

## 6. State machine
```text
unread ──(dwell>0 terlihat)──────────► reading
reading ─(dwell ≥ required)──────────► read      (read_count++, first/last_read_at)
reading ─(keluar zona, dwell<required, tetap di sesi)► reading   (dwell dipertahankan)
unread  ─(dilewati: posisi maju melewati segmen tanpa dwell, jump=none)─► skipped
skipped ─(dwell ≥ required kemudian)─► read
read    ─(dibaca lagi, dwell sesi baru ≥ required)─► read (read_count++)
```
Catatan:
- `reading` = ada dwell parsial; segmen tempat posisi terakhir berada selalu ditandai `reading` jika belum `read`.
- `skipped` hanya diberikan untuk perpindahan **kontinu** (scroll) dengan `jump = none`. Lompat via TOC/search/bookmark/slider/resume **tidak** menandai segmen terlewat sebagai skipped. Segmen tetap `unread`.
- Pergerakan mundur tidak mengubah `read` menjadi status lain.
- `read_count` bertambah maksimal 1× per segmen per sesi.
- `last_read_at` = waktu segmen mencapai threshold terakhir kali.

## 7. Progress
- `segment_weight = word_count`.
- `progress_percent = Σ word_count(read) / Σ word_count(all)` (0..1). `reading` tidak dihitung.
- **Per section/bab:** rumus sama dalam section. Dipakai di reading map.
- `completed = true` jika `progress_percent ≥ 0.98` ATAU semua segmen non-skipped `read` DAN posisi mencapai segmen terakhir. Set `completed_at`. Bisa dibatalkan manual (`reading_mark_unread`) / diset manual (`reading_mark_completed`, menandai semua segmen `read` tanpa mengubah dwell — pencatatan `manual` di detail).
- `furthest_pos` = linear_pos terjauh yang pernah dicapai.
- `current_*` = posisi terakhir dilaporkan (untuk resume), **bukan** furthest.

## 8. Sesi
- `reading_start_session`: buat baris dengan `ended_at NULL`, `start_position`.
- Heartbeat tiap flush (5 s) memperbarui `last_heartbeat_at`, `duration_seconds`, `active_seconds`, `end_pos`.
- `reading_end_session`: set `ended_at`, hitung final. Sesi < 5 detik aktif dan tanpa segmen berubah → **dihapus** (noise).
- Auto-end: app ke background > 60 s, atau reader ditutup, atau idle > 10 menit.
- Crash recovery saat startup: sesi dengan `ended_at NULL` → `ended_at = last_heartbeat_at`.
- `pages_read` = jumlah halaman unik yang menjadi `read` pada sesi (PDF); rich: bagi `segments_read`, `pages_read` = 0.

## 9. Persistensi (throttle)
- Akumulator in-memory per sesi di `TrackerState` (Mutex).
- Flush ke DB (satu transaksi) setiap 5 s jika ada perubahan, plus pada: pause/background, close reader, end_session, perubahan status ke `read`.
- Setelah flush emit `reading_progress_updated { document_id, progress, current_section_id, completed }`.
- Tidak ada write tiap scroll event. Frontend men-throttle laporan ≥ 1 s.

## 10. Visual tracker (data yang dibutuhkan UI)
`tracker_get_map(document_id)` mengembalikan:
```ts
type ReadingMap = {
  documentId: string; progress: number; completed: boolean;
  totalReadMs: number; sessions: number; lastReadAt?: number;
  sections: {
    sectionId: string; index: number; title: string;
    progress: number; status: "unread"|"reading"|"read";
    lastReadAt?: number; readMs: number; sessions: number;
    segments: { index: number; status: SegmentStatus; wordCount: number }[]; // untuk spine/heatmap
    startPos: LogicalPosition;                                               // untuk Continue Reading
  }[];
  current: LogicalPosition;
};
```
Section status: `read` jika progress ≥ 0.98; `reading` jika >0 atau memuat posisi saat ini; selain itu `unread`.
Tap segmen/section → kartu info (posisi %, terakhir dibaca, durasi, sesi). Tap kedua → `Continue Reading` = navigasi ke `startPos` atau segmen `reading` pertama di section.

## 11. Test wajib (lihat `TESTING.md`)
- Scroll cepat melewati 10 segmen → tidak ada `read`.
- 100 kata, dwell 5 s → `read`; dwell 3 s → `reading`.
- Idle 60 s tidak menambah dwell.
- Jump TOC tidak membuat `skipped`.
- Scroll kontinu melewati segmen tanpa dwell → `skipped`; kemudian dibaca → `read`.
- Progress tertimbang kata benar; chapter 1=100%, chapter 2=63%, chapter 3=0% pada fixture.
- Crash recovery sesi yatim.
- Flush throttled: 100 laporan/5 s → ≤ 2 transaksi.
