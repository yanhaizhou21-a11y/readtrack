use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileType {
    Pdf,
    Docx,
    Rtf,
    Txt,
    Md,
    Epub,
}

impl FileType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Rtf => "rtf",
            Self::Txt => "txt",
            Self::Md => "md",
            Self::Epub => "epub",
        }
    }

    pub fn from_ext(ext: &str) -> Option<Self> {
        let clean = ext.trim_start_matches('.').to_ascii_lowercase();
        match clean.as_str() {
            "txt" => Some(Self::Txt),
            "md" | "markdown" => Some(Self::Md),
            "pdf" => Some(Self::Pdf),
            "epub" => Some(Self::Epub),
            "docx" => Some(Self::Docx),
            "rtf" => Some(Self::Rtf),
            _ => None,
        }
    }

    pub fn mime_type(&self) -> &'static str {
        match self {
            Self::Pdf => "application/pdf",
            Self::Docx => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            Self::Rtf => "application/rtf",
            Self::Txt => "text/plain",
            Self::Md => "text/markdown",
            Self::Epub => "application/epub+zip",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocMetadata {
    pub title: String,
    pub author: Option<String>,
    pub language: Option<String>,
    pub page_count: Option<u32>,
    pub word_count: u32,
    pub character_count: u32,
    pub parser_version: u32,
}

impl Default for DocMetadata {
    fn default() -> Self {
        Self {
            title: String::new(),
            author: None,
            language: None,
            page_count: None,
            word_count: 0,
            character_count: 0,
            parser_version: 1,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SectionKind {
    Chapter,
    Heading,
    Page,
    Body,
}

impl SectionKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Chapter => "chapter",
            Self::Heading => "heading",
            Self::Page => "page",
            Self::Body => "body",
        }
    }
}

pub type BlockId = String; // Format: "s{section_index}-b{block_index}"

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Block {
    Heading {
        id: BlockId,
        level: u8,
        inlines: Vec<Inline>,
    },
    Paragraph {
        id: BlockId,
        inlines: Vec<Inline>,
    },
    List {
        id: BlockId,
        ordered: bool,
        items: Vec<Vec<Block>>,
    },
    Quote {
        id: BlockId,
        blocks: Vec<Block>,
    },
    Image {
        id: BlockId,
        asset: Option<AssetRef>,
        alt: Option<String>,
    },
    Table {
        id: BlockId,
        rows: Vec<Vec<Vec<Inline>>>,
        header_rows: u8,
    },
    Code {
        id: BlockId,
        language: Option<String>,
        text: String,
    },
    Separator {
        id: BlockId,
    },
}

impl Block {
    pub fn id(&self) -> &str {
        match self {
            Self::Heading { id, .. }
            | Self::Paragraph { id, .. }
            | Self::List { id, .. }
            | Self::Quote { id, .. }
            | Self::Image { id, .. }
            | Self::Table { id, .. }
            | Self::Code { id, .. }
            | Self::Separator { id } => id.as_str(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Inline {
    pub text: String,
    pub marks: Vec<Mark>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Mark {
    Bold,
    Italic,
    Underline,
    Code,
    Strikethrough,
    Link { href: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRef {
    pub hash: String,
    pub mime_type: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub index: u32,
    pub kind: SectionKind,
    pub title: Option<String>,
    pub level: u8, // 1..6 for headings, 0 for body/unleveled
    pub blocks: Vec<Block>,
    pub word_count: u32,
    pub character_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TocEntry {
    pub title: String,
    pub section_index: u32,
    pub block_id: Option<String>,
    pub page: Option<u32>,
    pub level: u8,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<TocEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedDocument {
    pub metadata: DocMetadata,
    pub sections: Vec<Section>,
    pub toc: Vec<TocEntry>,
}

impl NormalizedDocument {
    pub fn empty(title: String) -> Self {
        Self {
            metadata: DocMetadata {
                title,
                author: None,
                language: None,
                page_count: None,
                word_count: 0,
                character_count: 0,
                parser_version: 1,
            },
            sections: vec![Section {
                index: 0,
                kind: SectionKind::Body,
                title: None,
                level: 0,
                blocks: Vec::new(),
                word_count: 0,
                character_count: 0,
            }],
            toc: Vec::new(),
        }
    }
}
