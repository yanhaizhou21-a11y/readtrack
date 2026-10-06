use crate::errors::AppError;
use crate::models::ExportData;
use chrono::{DateTime, Utc};
use printpdf::*;
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

pub struct PdfExporter;

impl PdfExporter {
    pub fn export(data: &ExportData, output_path: &Path) -> Result<(), AppError> {
        let page_w = Mm(210.0);
        let page_h = Mm(297.0);

        let (doc, page1, layer1) =
            PdfDocument::new("ReadTrack Reading Report", page_w, page_h, "Main");

        let font = doc
            .add_builtin_font(BuiltinFont::Helvetica)
            .map_err(|e| AppError::ExportFailed {
                reason: e.to_string(),
            })?;
        let font_bold = doc
            .add_builtin_font(BuiltinFont::HelveticaBold)
            .map_err(|e| AppError::ExportFailed {
                reason: e.to_string(),
            })?;
        let font_italic = doc
            .add_builtin_font(BuiltinFont::HelveticaOblique)
            .map_err(|e| AppError::ExportFailed {
                reason: e.to_string(),
            })?;

        let mut current_page = page1;
        let mut current_layer_idx = layer1;
        let mut current_layer = doc.get_page(current_page).get_layer(current_layer_idx);

        let margin_l = 20.0;
        let margin_r = 190.0;
        let bottom_limit = 30.0;
        let mut y = 275.0;
        let mut page_num = 1;

        // Helper to draw horizontal line
        let draw_line = |layer: &PdfLayerReference, y_pos: f32, thickness: f32| {
            layer.set_outline_thickness(thickness);
            layer.set_outline_color(Color::Rgb(Rgb::new(0.07, 0.07, 0.07, None)));
            let shape = Line {
                points: vec![
                    (Point::new(Mm(margin_l), Mm(y_pos)), false),
                    (Point::new(Mm(margin_r), Mm(y_pos)), false),
                ],
                is_closed: false,
            };
            layer.add_line(shape);
        };

        // Helper for page break
        let check_page_break = |needed: f32,
                                    doc_ref: &PdfDocumentReference,
                                    y_ref: &mut f32,
                                    page_ref: &mut PdfPageIndex,
                                    layer_idx_ref: &mut PdfLayerIndex,
                                    layer_ref: &mut PdfLayerReference,
                                    p_num: &mut usize| {
            if *y_ref - needed < bottom_limit {
                // Footer for current page
                layer_ref.use_text(
                    format!("ReadTrack · Local-First Confidential Ledger · Page {}", *p_num),
                    8.0,
                    Mm(margin_l),
                    Mm(15.0),
                    &font,
                );

                let (np, nl) = doc_ref.add_page(page_w, page_h, "Main");
                *page_ref = np;
                *layer_idx_ref = nl;
                *layer_ref = doc_ref.get_page(*page_ref).get_layer(*layer_idx_ref);
                *y_ref = 275.0;
                *p_num += 1;
            }
        };

        // ---------------- Header ----------------
        current_layer.use_text("READTRACK", 22.0, Mm(margin_l), Mm(y), &font_bold);
        y -= 6.0;

        current_layer.use_text(
            "THE OFFICIAL READING DOSSIER & ARCHIVAL REPORT",
            10.0,
            Mm(margin_l),
            Mm(y),
            &font_bold,
        );
        y -= 4.0;

        draw_line(&current_layer, y, 2.0);
        y -= 2.0;
        draw_line(&current_layer, y, 0.5);
        y -= 7.0;

        let now_str = Utc::now().format("%A, %B %d, %Y | %H:%M UTC").to_string();
        current_layer.use_text(
            format!("EDITION: {} | STATUS: VERIFIED OFFLINE", now_str),
            8.0,
            Mm(margin_l),
            Mm(y),
            &font,
        );
        y -= 8.0;

        // ---------------- Executive Summary ----------------
        current_layer.use_text("I. EXECUTIVE SUMMARY", 12.0, Mm(margin_l), Mm(y), &font_bold);
        y -= 4.0;
        draw_line(&current_layer, y, 0.75);
        y -= 7.0;

        let total_docs = data.documents.len();
        let completed_docs = data.documents.iter().filter(|d| d.completed).count();
        let total_words: i64 = data.documents.iter().map(|d| d.word_count.unwrap_or(0)).sum();
        let total_sessions = data.sessions.len();
        let total_active_mins: i64 = data.sessions.iter().map(|s| s.active_seconds / 60).sum();
        let total_notes = data.notes.len();
        let total_highlights = data.highlights.len();
        let total_bookmarks = data.bookmarks.len();

        let summary_text_1 = format!(
            "Total Publications: {}  |  Completed: {}  |  Aggregate Volume: {} words",
            total_docs, completed_docs, total_words
        );
        let summary_text_2 = format!(
            "Logged Sessions: {}  |  Active Reading Time: {} mins  |  Annotations: {} ({} HL, {} Notes, {} BM)",
            total_sessions, total_active_mins, (total_notes + total_highlights + total_bookmarks),
            total_highlights, total_notes, total_bookmarks
        );

        current_layer.use_text(&summary_text_1, 9.5, Mm(margin_l), Mm(y), &font);
        y -= 5.0;
        current_layer.use_text(&summary_text_2, 9.5, Mm(margin_l), Mm(y), &font);
        y -= 10.0;

        // ---------------- Library Inventory ----------------
        check_page_break(
            25.0,
            &doc,
            &mut y,
            &mut current_page,
            &mut current_layer_idx,
            &mut current_layer,
            &mut page_num,
        );

        current_layer.use_text("II. LIBRARY INVENTORY", 12.0, Mm(margin_l), Mm(y), &font_bold);
        y -= 4.0;
        draw_line(&current_layer, y, 0.75);
        y -= 7.0;

        if data.documents.is_empty() {
            current_layer.use_text(
                "No documents registered in this export dossier.",
                9.0,
                Mm(margin_l),
                Mm(y),
                &font_italic,
            );
            y -= 8.0;
        } else {
            for (idx, doc_item) in data.documents.iter().enumerate() {
                check_page_break(
                    16.0,
                    &doc,
                    &mut y,
                    &mut current_page,
                    &mut current_layer_idx,
                    &mut current_layer,
                    &mut page_num,
                );

                let progress_pct = (doc_item.progress_percent * 100.0).round() as i64;
                let status_label = if doc_item.completed {
                    "COMPLETED"
                } else if progress_pct > 0 {
                    "IN PROGRESS"
                } else {
                    "UNREAD"
                };

                let doc_line_1 = format!(
                    "{}. {} ({})",
                    idx + 1,
                    if doc_item.title.len() > 50 {
                        format!("{}...", &doc_item.title[..47])
                    } else {
                        doc_item.title.clone()
                    },
                    doc_item.file_type.to_uppercase()
                );
                current_layer.use_text(&doc_line_1, 9.5, Mm(margin_l), Mm(y), &font_bold);

                let doc_line_2 = format!(
                    "    Status: {} ({}%)  |  Words: {}  |  Author: {}",
                    status_label,
                    progress_pct,
                    doc_item.word_count.unwrap_or(0),
                    doc_item.author.as_deref().unwrap_or("Unknown")
                );
                y -= 4.5;
                current_layer.use_text(&doc_line_2, 8.5, Mm(margin_l), Mm(y), &font);
                y -= 6.0;
            }
        }

        y -= 4.0;

        // ---------------- Recent Reading Sessions ----------------
        check_page_break(
            25.0,
            &doc,
            &mut y,
            &mut current_page,
            &mut current_layer_idx,
            &mut current_layer,
            &mut page_num,
        );

        current_layer.use_text(
            "III. RECENT READING SESSIONS",
            12.0,
            Mm(margin_l),
            Mm(y),
            &font_bold,
        );
        y -= 4.0;
        draw_line(&current_layer, y, 0.75);
        y -= 7.0;

        if data.sessions.is_empty() {
            current_layer.use_text(
                "No reading sessions logged for the selected scope.",
                9.0,
                Mm(margin_l),
                Mm(y),
                &font_italic,
            );
            y -= 8.0;
        } else {
            for sess in data.sessions.iter().take(10) {
                check_page_break(
                    12.0,
                    &doc,
                    &mut y,
                    &mut current_page,
                    &mut current_layer_idx,
                    &mut current_layer,
                    &mut page_num,
                );

                let start_date = DateTime::<Utc>::from_timestamp_millis(sess.started_at)
                    .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
                    .unwrap_or_else(|| "-".to_string());

                let sess_line = format!(
                    "• {}  |  {}  |  Active: {}m (Pages: {}, Segments: {})",
                    start_date,
                    if sess.document_title.len() > 30 {
                        format!("{}...", &sess.document_title[..27])
                    } else {
                        sess.document_title.clone()
                    },
                    sess.active_seconds / 60,
                    sess.pages_read,
                    sess.segments_read
                );
                current_layer.use_text(&sess_line, 8.5, Mm(margin_l), Mm(y), &font);
                y -= 5.0;
            }
        }

        y -= 4.0;

        // ---------------- Key Annotations & Excerpts ----------------
        check_page_break(
            25.0,
            &doc,
            &mut y,
            &mut current_page,
            &mut current_layer_idx,
            &mut current_layer,
            &mut page_num,
        );

        current_layer.use_text(
            "IV. SELECTED HIGHLIGHTS & NOTES",
            12.0,
            Mm(margin_l),
            Mm(y),
            &font_bold,
        );
        y -= 4.0;
        draw_line(&current_layer, y, 0.75);
        y -= 7.0;

        if data.highlights.is_empty() && data.notes.is_empty() {
            current_layer.use_text(
                "No annotations recorded for this scope.",
                9.0,
                Mm(margin_l),
                Mm(y),
                &font_italic,
            );
        } else {
            for hl in data.highlights.iter().take(8) {
                check_page_break(
                    14.0,
                    &doc,
                    &mut y,
                    &mut current_page,
                    &mut current_layer_idx,
                    &mut current_layer,
                    &mut page_num,
                );

                let excerpt = if hl.selected_text.len() > 70 {
                    format!("\"{}...\"", &hl.selected_text[..67])
                } else {
                    format!("\"{}\"", hl.selected_text)
                };

                current_layer.use_text(
                    format!("- [HIGHLIGHT - {}] {}", hl.color.to_uppercase(), excerpt),
                    8.5,
                    Mm(margin_l),
                    Mm(y),
                    &font_bold,
                );
                y -= 4.0;

                let meta_str = format!("    Publication: {}", hl.document_title);
                current_layer.use_text(&meta_str, 8.0, Mm(margin_l), Mm(y), &font_italic);
                y -= 5.5;
            }

            for note in data.notes.iter().take(5) {
                check_page_break(
                    14.0,
                    &doc,
                    &mut y,
                    &mut current_page,
                    &mut current_layer_idx,
                    &mut current_layer,
                    &mut page_num,
                );

                let note_content = if note.content.len() > 70 {
                    format!("{}...", &note.content[..67])
                } else {
                    note.content.clone()
                };

                current_layer.use_text(
                    format!("- [NOTE] {}", note_content),
                    8.5,
                    Mm(margin_l),
                    Mm(y),
                    &font_bold,
                );
                y -= 4.0;

                let meta_str = format!("    Publication: {}", note.document_title);
                current_layer.use_text(&meta_str, 8.0, Mm(margin_l), Mm(y), &font_italic);
                y -= 5.5;
            }
        }

        // Final page footer
        current_layer.use_text(
            format!("ReadTrack | Local-First Confidential Ledger | Page {}", page_num),
            8.0,
            Mm(margin_l),
            Mm(15.0),
            &font,
        );

        // Save PDF to output file
        let file = File::create(output_path).map_err(AppError::from)?;
        let mut writer = BufWriter::new(file);
        doc.save(&mut writer)
            .map_err(|e| AppError::ExportFailed {
                reason: e.to_string(),
            })?;

        Ok(())
    }
}
