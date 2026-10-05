pub mod docx;
pub mod epub;
pub mod markdown;
pub mod pdf;
pub mod registry;
pub mod segment_generator;
pub mod traits;
pub mod txt;

pub use docx::DocxParser;
pub use epub::EpubParser;
pub use markdown::MarkdownParser;
pub use pdf::PdfParser;
pub use registry::ParserRegistry;
pub use segment_generator::{GeneratedSegment, NewReadingSegment, SegmentGenerator, SegmentType};
pub use traits::DocumentParser;
pub use txt::TxtParser;
