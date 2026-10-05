use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use crate::errors::AppError;
use crate::storage::paths::StoragePaths;

pub const DEFAULT_MAX_IMPORT_BYTES: u64 = 200 * 1024 * 1024; // 200 MiB
const STREAM_BUFFER_SIZE: usize = 64 * 1024; // 64 KiB bounded memory buffer
const SNIFF_BUFFER_SIZE: usize = 4096; // 4 KiB for signature detection

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DetectedFormat {
    Txt,
    Md,
    Epub,
    Pdf,
    Docx,
    Rtf,
}

impl DetectedFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Txt => "txt",
            Self::Md => "md",
            Self::Epub => "epub",
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Rtf => "rtf",
        }
    }

    pub fn mime_type(&self) -> &'static str {
        match self {
            Self::Txt => "text/plain",
            Self::Md => "text/markdown",
            Self::Epub => "application/epub+zip",
            Self::Pdf => "application/pdf",
            Self::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            Self::Rtf => "application/rtf",
        }
    }

    pub fn from_extension(ext: &str) -> Option<Self> {
        let clean = ext.trim_start_matches('.').to_ascii_lowercase();
        match clean.as_str() {
            "txt" => Some(Self::Txt),
            "md" | "markdown" => Some(Self::Md),
            "epub" => Some(Self::Epub),
            "pdf" => Some(Self::Pdf),
            "docx" => Some(Self::Docx),
            "rtf" => Some(Self::Rtf),
            _ => None,
        }
    }
}

pub type Blake3Hash = String;

#[derive(Debug)]
pub struct TempFileGuard {
    path: PathBuf,
    committed: bool,
}

impl TempFileGuard {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            committed: false,
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn mark_committed(&mut self) {
        self.committed = true;
    }

    pub fn rollback(mut self) -> Result<(), std::io::Error> {
        self.committed = true;
        if self.path.exists() {
            std::fs::remove_file(&self.path)
        } else {
            Ok(())
        }
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if !self.committed && self.path.exists() {
            if let Err(err) = std::fs::remove_file(&self.path) {
                tracing::warn!(
                    "Failed to clean up uncommitted temp file {:?}: {}",
                    self.path,
                    err
                );
            } else {
                tracing::debug!(
                    "Successfully unlinked uncommitted temp file {:?}",
                    self.path
                );
            }
        }
    }
}

pub struct StagedFile {
    pub guard: TempFileGuard,
    pub hash: Blake3Hash,
    pub format: DetectedFormat,
    pub size_bytes: u64,
}

impl From<StagedFile> for (TempFileGuard, Blake3Hash, DetectedFormat) {
    fn from(s: StagedFile) -> Self {
        (s.guard, s.hash, s.format)
    }
}

#[derive(Debug, Clone)]
pub struct FileStore {
    paths: StoragePaths,
}

impl FileStore {
    pub fn new(paths: StoragePaths) -> Self {
        Self { paths }
    }

    pub fn paths(&self) -> &StoragePaths {
        &self.paths
    }

    /// Stages a file into `library/documents/tmp-<uuid>` with constant memory streaming,
    /// simultaneous BLAKE3 hashing, mid-stream 200MB limit guard, and magic byte validation.
    pub fn stage_file(&self, source: &Path, max_bytes: u64) -> Result<StagedFile, AppError> {
        // 1. Validate source existence & file type
        if !source.exists() {
            return Err(AppError::NotFound {
                entity: format!("Source file: {}", source.display()),
            });
        }
        if !source.is_file() {
            return Err(AppError::InvalidInput {
                field: "source (must be a regular file)".to_string(),
            });
        }

        // 2. Pre-check file size if metadata is available
        if let Ok(meta) = source.metadata() {
            if meta.len() > max_bytes {
                return Err(AppError::FileTooLarge {
                    max_bytes,
                    actual_bytes: meta.len(),
                    max_mb: max_bytes / (1024 * 1024),
                });
            }
        }

        // 3. Candidate format from extension
        let ext = source
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default();
        let candidate_format =
            DetectedFormat::from_extension(ext).ok_or_else(|| AppError::UnsupportedFormat {
                ext: ext.to_string(),
            })?;

        // 4. Ensure destination directory exists
        let docs_dir = self.paths.documents_dir();
        if !docs_dir.exists() {
            std::fs::create_dir_all(&docs_dir).map_err(AppError::from)?;
        }

        // 5. Create temporary file directly in `library/documents/`
        let temp_filename = format!("tmp-{}", uuid::Uuid::new_v4());
        let temp_path = docs_dir.join(&temp_filename);
        let temp_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(AppError::from)?;

        // Wrap immediately in RAII guard: any subsequent error drops guard -> unlinks temp_path!
        let guard = TempFileGuard::new(temp_path);

        // 6. Open source and prepare streaming buffers
        let source_file = File::open(source).map_err(AppError::from)?;
        let mut reader = BufReader::with_capacity(STREAM_BUFFER_SIZE, source_file);
        let mut writer = BufWriter::with_capacity(STREAM_BUFFER_SIZE, temp_file);

        let mut hasher = blake3::Hasher::new();
        let mut sniff_buffer = Vec::with_capacity(SNIFF_BUFFER_SIZE);
        let mut buffer = [0u8; STREAM_BUFFER_SIZE];
        let mut total_bytes: u64 = 0;

        // 7. Streaming loop: constant memory, mid-stream guard, hash update
        loop {
            let bytes_read = reader.read(&mut buffer).map_err(AppError::from)?;
            if bytes_read == 0 {
                break;
            }

            total_bytes += bytes_read as u64;
            if total_bytes > max_bytes {
                // Abort mid-stream before consuming disk!
                return Err(AppError::FileTooLarge {
                    max_bytes,
                    actual_bytes: total_bytes,
                    max_mb: max_bytes / (1024 * 1024),
                });
            }

            hasher.update(&buffer[..bytes_read]);
            writer
                .write_all(&buffer[..bytes_read])
                .map_err(AppError::from)?;

            // Accumulate first 4KB for magic bytes signature verification
            if sniff_buffer.len() < SNIFF_BUFFER_SIZE {
                let needed = SNIFF_BUFFER_SIZE - sniff_buffer.len();
                let take = std::cmp::min(needed, bytes_read);
                sniff_buffer.extend_from_slice(&buffer[..take]);
            }
        }

        writer.flush().map_err(AppError::from)?;
        drop(writer); // Close write handle before any inspection/rename

        // 8. Sniff magic bytes & validate against candidate format
        Self::validate_magic_bytes(candidate_format, &sniff_buffer)?;

        let hash = hasher.finalize().to_hex().to_string();

        Ok(StagedFile {
            guard,
            hash,
            format: candidate_format,
            size_bytes: total_bytes,
        })
    }

    /// Magic byte sniffing and validation for supported document types.
    pub fn validate_magic_bytes(format: DetectedFormat, bytes: &[u8]) -> Result<(), AppError> {
        if bytes.is_empty() {
            return Err(AppError::InvalidDocument {
                reason: "Document is empty (0 bytes)".to_string(),
            });
        }

        match format {
            DetectedFormat::Pdf => {
                if !bytes.starts_with(b"%PDF-") {
                    return Err(AppError::InvalidDocument {
                        reason: "File has .pdf extension but lacks %PDF- magic signature"
                            .to_string(),
                    });
                }
            }
            DetectedFormat::Epub => {
                if !bytes.starts_with(b"PK\x03\x04") {
                    return Err(AppError::InvalidDocument {
                        reason: "File has .epub extension but lacks PK\\x03\\x04 ZIP header"
                            .to_string(),
                    });
                }
            }
            DetectedFormat::Docx => {
                if !bytes.starts_with(b"PK\x03\x04") {
                    return Err(AppError::InvalidDocument {
                        reason: "File has .docx extension but lacks PK\\x03\\x04 ZIP header"
                            .to_string(),
                    });
                }
            }
            DetectedFormat::Rtf => {
                if !bytes.starts_with(b"{\\rtf1") {
                    return Err(AppError::InvalidDocument {
                        reason: "File has .rtf extension but lacks {\\rtf1 header".to_string(),
                    });
                }
            }
            DetectedFormat::Txt | DetectedFormat::Md => {
                // 1. Recognize UTF-16LE and UTF-16BE BOM signatures FIRST.
                // In UTF-16 encoding, characters in ASCII ranges inherently contain
                // interleaved null bytes (0x00), which must NOT trigger binary rejection.
                let has_utf16le_bom = bytes.starts_with(b"\xFF\xFE");
                let has_utf16be_bom = bytes.starts_with(b"\xFE\xFF");

                if has_utf16le_bom || has_utf16be_bom {
                    // Valid UTF-16 text with BOM; bypass null-byte and UTF-8 checks.
                    return Ok(());
                }

                // 2. For non-UTF-16 text documents, reject binary null bytes.
                if bytes.contains(&0x00) {
                    return Err(AppError::InvalidDocument {
                        reason: "Text document contains binary null bytes".to_string(),
                    });
                }

                // 3. Validate UTF-8 encoding (skipping UTF-8 BOM if present).
                let has_utf8_bom = bytes.starts_with(b"\xEF\xBB\xBF");
                let to_validate = if has_utf8_bom { &bytes[3..] } else { bytes };

                if let Err(e) = std::str::from_utf8(to_validate) {
                    let valid_up_to = e.valid_up_to();
                    // If invalid byte occurs before tail boundary (4 bytes for UTF-8 multibyte), reject
                    if valid_up_to < to_validate.len().saturating_sub(4) {
                        return Err(AppError::InvalidDocument {
                            reason: "Text document contains invalid UTF-8 encoding".to_string(),
                        });
                    }
                }
            }
        }

        Ok(())
    }

    /// Atomically commits a staged file to `library/documents/<document_id>.<ext>`.
    pub fn commit_file(
        &self,
        mut staged: TempFileGuard,
        document_id: &str,
        ext: &str,
    ) -> Result<PathBuf, AppError> {
        uuid::Uuid::parse_str(document_id).map_err(|_| AppError::InvalidInput {
            field: "document_id (must be a valid UUID v4)".to_string(),
        })?;

        let clean_ext = ext.trim_start_matches('.').to_ascii_lowercase();
        if !["txt", "md", "epub", "pdf", "docx", "rtf"].contains(&clean_ext.as_str()) {
            return Err(AppError::UnsupportedFormat { ext: clean_ext });
        }

        let relative = Path::new("library")
            .join("documents")
            .join(format!("{}.{}", document_id, clean_ext));
        let target_path = self.paths.resolve_safe_path(&relative)?;

        std::fs::rename(staged.path(), &target_path).map_err(AppError::from)?;
        staged.mark_committed();

        Ok(target_path)
    }

    /// Deletes a document file from `library/documents/<document_id>.<ext>`.
    pub fn delete_file(&self, document_id: &str, ext: &str) -> Result<(), AppError> {
        uuid::Uuid::parse_str(document_id).map_err(|_| AppError::InvalidInput {
            field: "document_id".to_string(),
        })?;

        let clean_ext = ext.trim_start_matches('.').to_ascii_lowercase();
        let relative = Path::new("library")
            .join("documents")
            .join(format!("{}.{}", document_id, clean_ext));

        let target_path = self.paths.resolve_safe_path(&relative)?;

        let docs_dir = self.paths.documents_dir();
        if target_path.exists() {
            let canonical_target = target_path.canonicalize().map_err(AppError::from)?;
            let canonical_docs = docs_dir.canonicalize().map_err(AppError::from)?;
            if !canonical_target.starts_with(&canonical_docs) {
                tracing::warn!(
                    "Refusing to delete file outside documents_dir: {:?}",
                    canonical_target
                );
                return Err(AppError::PermissionDenied);
            }

            std::fs::remove_file(&target_path).map_err(AppError::from)?;
        }

        Ok(())
    }

    /// Interface contract alias: `file_store.delete_document_file(doc_id, file_type)`
    pub fn delete_document_file(&self, document_id: &str, file_type: &str) -> Result<(), AppError> {
        self.delete_file(document_id, file_type)
    }

    /// Resolves the absolute path for an existing document.
    pub fn get_document_path(&self, document_id: &str, ext: &str) -> Result<PathBuf, AppError> {
        uuid::Uuid::parse_str(document_id).map_err(|_| AppError::InvalidInput {
            field: "document_id".to_string(),
        })?;

        let clean_ext = ext.trim_start_matches('.').to_ascii_lowercase();
        let relative = Path::new("library")
            .join("documents")
            .join(format!("{}.{}", document_id, clean_ext));

        let target_path = self.paths.resolve_safe_path(&relative)?;
        if !target_path.exists() {
            return Err(AppError::DocumentNotFound);
        }

        Ok(target_path)
    }

    /// Returns the database-relative path `library/documents/<document_id>.<ext>`.
    pub fn get_relative_path(&self, document_id: &str, ext: &str) -> Result<PathBuf, AppError> {
        uuid::Uuid::parse_str(document_id).map_err(|_| AppError::InvalidInput {
            field: "document_id".to_string(),
        })?;

        let clean_ext = ext.trim_start_matches('.').to_ascii_lowercase();
        Ok(Path::new("library")
            .join("documents")
            .join(format!("{}.{}", document_id, clean_ext)))
    }
}
