use crate::errors::AppError;
use crate::models::ExportData;
use chrono::{DateTime, Utc};
use rust_xlsxwriter::{Color, Format, FormatBorder, Workbook};
use std::path::Path;

fn to_export_err(err: impl std::fmt::Display) -> AppError {
    AppError::ExportFailed {
        reason: err.to_string(),
    }
}

pub struct XlsxExporter;

impl XlsxExporter {
    pub fn export(data: &ExportData, output_path: &Path) -> Result<(), AppError> {
        let mut workbook = Workbook::new();

        // Newsprint-styled Header & Cell Formats
        let title_format = Format::new()
            .set_bold()
            .set_font_size(16.0)
            .set_font_name("Segoe UI");

        let section_header_format = Format::new()
            .set_bold()
            .set_font_size(11.0)
            .set_background_color(Color::RGB(0x111111))
            .set_font_color(Color::RGB(0xFFFFFF))
            .set_border(FormatBorder::Thin);

        let table_header_format = Format::new()
            .set_bold()
            .set_font_size(10.0)
            .set_background_color(Color::RGB(0xE5E5E0))
            .set_font_color(Color::RGB(0x111111))
            .set_border(FormatBorder::Thin);

        let data_format = Format::new()
            .set_font_size(10.0)
            .set_border(FormatBorder::Thin);

        let number_format = Format::new()
            .set_font_size(10.0)
            .set_num_format("#,##0")
            .set_border(FormatBorder::Thin);

        let percent_format = Format::new()
            .set_font_size(10.0)
            .set_num_format("0.0%")
            .set_border(FormatBorder::Thin);

        let date_format = Format::new()
            .set_font_size(10.0)
            .set_border(FormatBorder::Thin);

        let kpi_label_format = Format::new()
            .set_bold()
            .set_font_size(10.5)
            .set_background_color(Color::RGB(0xF5F5F5))
            .set_border(FormatBorder::Thin);

        let kpi_value_format = Format::new()
            .set_font_size(10.5)
            .set_border(FormatBorder::Thin);

        // Helper to format timestamp
        let format_ts = |ts: Option<i64>| -> String {
            match ts {
                Some(ms) => DateTime::<Utc>::from_timestamp_millis(ms)
                    .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                    .unwrap_or_else(|| "-".to_string()),
                None => "-".to_string(),
            }
        };

        let now_str = Utc::now().format("%Y-%m-%d %H:%M:%S UTC").to_string();

        // ----------------------------------------------------
        // 1. Overview Sheet
        // ----------------------------------------------------
        let overview = workbook.add_worksheet();
        overview.set_name("Overview").map_err(to_export_err)?;
        overview.set_column_width(0, 38).map_err(to_export_err)?;
        overview.set_column_width(1, 26).map_err(to_export_err)?;
        overview.set_column_width(2, 45).map_err(to_export_err)?;

        overview.write_string_with_format(0, 0, "ReadTrack — Reading Analytics Report", &title_format)
            .map_err(to_export_err)?;
        overview.write_string(1, 0, format!("Generated on: {}", now_str))
            .map_err(to_export_err)?;

        overview.write_string_with_format(3, 0, "System Metric", &section_header_format)
            .map_err(to_export_err)?;
        overview.write_string_with_format(3, 1, "Formula / Value", &section_header_format)
            .map_err(to_export_err)?;
        overview.write_string_with_format(3, 2, "Description", &section_header_format)
            .map_err(to_export_err)?;

        let doc_end_row = if data.documents.is_empty() { 2 } else { data.documents.len() + 1 };
        let session_end_row = if data.sessions.is_empty() { 2 } else { data.sessions.len() + 1 };
        let bookmark_end_row = if data.bookmarks.is_empty() { 2 } else { data.bookmarks.len() + 1 };
        let highlight_end_row = if data.highlights.is_empty() { 2 } else { data.highlights.len() + 1 };
        let note_end_row = if data.notes.is_empty() { 2 } else { data.notes.len() + 1 };

        let kpis = [
            ("Total Documents", format!("=COUNTA(Documents!A2:A{})", doc_end_row), "Total publications registered in library"),
            ("Completed Documents", format!("=COUNTIF(Documents!I2:I{}, \"Yes\")", doc_end_row), "Documents read to completion (100%)"),
            ("Total Words in Library", format!("=SUM(Documents!F2:F{})", doc_end_row), "Combined word volume across documents"),
            ("Total Reading Sessions", format!("=COUNTA('Reading Sessions'!A2:A{})", session_end_row), "Discrete reading periods tracked"),
            ("Total Active Time (Minutes)", format!("=SUM('Reading Sessions'!F2:F{})", session_end_row), "Active engagement time excluding idle periods"),
            ("Total Highlights", format!("=COUNTA(Highlights!A2:A{})", highlight_end_row), "Extracted passages across library"),
            ("Total Notes", format!("=COUNTA(Notes!A2:A{})", note_end_row), "Annotated commentary recorded"),
            ("Total Bookmarks", format!("=COUNTA(Bookmarks!A2:A{})", bookmark_end_row), "Marked milestones and reference points"),
        ];

        for (idx, (label, formula, desc)) in kpis.into_iter().enumerate() {
            let row = (4 + idx) as u32;
            overview.write_string_with_format(row, 0, label, &kpi_label_format)
                .map_err(to_export_err)?;
            overview.write_formula_with_format(row, 1, formula.as_str(), &kpi_value_format)
                .map_err(to_export_err)?;
            overview.write_string_with_format(row, 2, desc, &data_format)
                .map_err(to_export_err)?;
        }

        // ----------------------------------------------------
        // 2. Documents Sheet
        // ----------------------------------------------------
        let docs_sheet = workbook.add_worksheet();
        docs_sheet.set_name("Documents").map_err(to_export_err)?;
        docs_sheet.set_freeze_panes(1, 0).map_err(to_export_err)?;

        let doc_headers = [
            ("Document ID", 38),
            ("Title", 35),
            ("Author", 20),
            ("Format", 10),
            ("File Size (KB)", 14),
            ("Word Count", 14),
            ("Units / Pages", 14),
            ("Progress", 12),
            ("Completed", 12),
            ("Created Date", 20),
            ("Last Opened", 20),
        ];

        for (col, (hdr, width)) in doc_headers.iter().enumerate() {
            docs_sheet.set_column_width(col as u16, *width)
                .map_err(to_export_err)?;
            docs_sheet.write_string_with_format(0, col as u16, *hdr, &table_header_format)
                .map_err(to_export_err)?;
        }

        if !data.documents.is_empty() {
            docs_sheet.autofilter(0, 0, data.documents.len() as u32, (doc_headers.len() - 1) as u16)
                .map_err(to_export_err)?;
        }

        for (idx, doc) in data.documents.iter().enumerate() {
            let r = (idx + 1) as u32;
            docs_sheet.write_string_with_format(r, 0, &doc.id, &data_format)
                .map_err(to_export_err)?;
            docs_sheet.write_string_with_format(r, 1, &doc.title, &data_format)
                .map_err(to_export_err)?;
            docs_sheet.write_string_with_format(r, 2, doc.author.as_deref().unwrap_or("-"), &data_format)
                .map_err(to_export_err)?;
            docs_sheet.write_string_with_format(r, 3, doc.file_type.to_uppercase(), &data_format)
                .map_err(to_export_err)?;
            docs_sheet.write_number_with_format(r, 4, (doc.file_size / 1024) as f64, &number_format)
                .map_err(to_export_err)?;
            docs_sheet.write_number_with_format(r, 5, doc.word_count.unwrap_or(0) as f64, &number_format)
                .map_err(to_export_err)?;
            docs_sheet.write_number_with_format(r, 6, doc.page_count.unwrap_or(0) as f64, &number_format)
                .map_err(to_export_err)?;
            docs_sheet.write_number_with_format(r, 7, doc.progress_percent, &percent_format)
                .map_err(to_export_err)?;
            docs_sheet.write_string_with_format(r, 8, if doc.completed { "Yes" } else { "No" }, &data_format)
                .map_err(to_export_err)?;
            docs_sheet.write_string_with_format(r, 9, format_ts(Some(doc.created_at)), &date_format)
                .map_err(to_export_err)?;
            docs_sheet.write_string_with_format(r, 10, format_ts(doc.last_opened_at), &date_format)
                .map_err(to_export_err)?;
        }

        // ----------------------------------------------------
        // 3. Reading Sessions Sheet
        // ----------------------------------------------------
        let session_sheet = workbook.add_worksheet();
        session_sheet.set_name("Reading Sessions").map_err(to_export_err)?;
        session_sheet.set_freeze_panes(1, 0).map_err(to_export_err)?;

        let session_headers = [
            ("Session ID", 38),
            ("Document Title", 35),
            ("Started At", 20),
            ("Ended At", 20),
            ("Duration (Min)", 15),
            ("Active Time (Min)", 18),
            ("Pages Read", 14),
            ("Segments Read", 15),
        ];

        for (col, (hdr, width)) in session_headers.iter().enumerate() {
            session_sheet.set_column_width(col as u16, *width)
                .map_err(to_export_err)?;
            session_sheet.write_string_with_format(0, col as u16, *hdr, &table_header_format)
                .map_err(to_export_err)?;
        }

        if !data.sessions.is_empty() {
            session_sheet.autofilter(0, 0, data.sessions.len() as u32, (session_headers.len() - 1) as u16)
                .map_err(to_export_err)?;
        }

        for (idx, sess) in data.sessions.iter().enumerate() {
            let r = (idx + 1) as u32;
            session_sheet.write_string_with_format(r, 0, &sess.id, &data_format)
                .map_err(to_export_err)?;
            session_sheet.write_string_with_format(r, 1, &sess.document_title, &data_format)
                .map_err(to_export_err)?;
            session_sheet.write_string_with_format(r, 2, format_ts(Some(sess.started_at)), &date_format)
                .map_err(to_export_err)?;
            session_sheet.write_string_with_format(r, 3, format_ts(sess.ended_at), &date_format)
                .map_err(to_export_err)?;
            session_sheet.write_number_with_format(r, 4, (sess.duration_seconds as f64) / 60.0, &number_format)
                .map_err(to_export_err)?;
            session_sheet.write_number_with_format(r, 5, (sess.active_seconds as f64) / 60.0, &number_format)
                .map_err(to_export_err)?;
            session_sheet.write_number_with_format(r, 6, sess.pages_read as f64, &number_format)
                .map_err(to_export_err)?;
            session_sheet.write_number_with_format(r, 7, sess.segments_read as f64, &number_format)
                .map_err(to_export_err)?;
        }

        // ----------------------------------------------------
        // 4. Reading Progress Sheet
        // ----------------------------------------------------
        let prog_sheet = workbook.add_worksheet();
        prog_sheet.set_name("Reading Progress").map_err(to_export_err)?;
        prog_sheet.set_freeze_panes(1, 0).map_err(to_export_err)?;

        let prog_headers = [
            ("Document Title", 35),
            ("Section Index", 14),
            ("Section Title", 30),
            ("Segment Index", 14),
            ("Status", 12),
            ("Dwell Time (Sec)", 16),
            ("Last Read At", 20),
        ];

        for (col, (hdr, width)) in prog_headers.iter().enumerate() {
            prog_sheet.set_column_width(col as u16, *width)
                .map_err(to_export_err)?;
            prog_sheet.write_string_with_format(0, col as u16, *hdr, &table_header_format)
                .map_err(to_export_err)?;
        }

        if !data.progress_segments.is_empty() {
            prog_sheet.autofilter(0, 0, data.progress_segments.len() as u32, (prog_headers.len() - 1) as u16)
                .map_err(to_export_err)?;
        }

        for (idx, seg) in data.progress_segments.iter().enumerate() {
            let r = (idx + 1) as u32;
            prog_sheet.write_string_with_format(r, 0, &seg.document_title, &data_format)
                .map_err(to_export_err)?;
            prog_sheet.write_number_with_format(r, 1, seg.section_index as f64, &number_format)
                .map_err(to_export_err)?;
            prog_sheet.write_string_with_format(r, 2, &seg.section_title, &data_format)
                .map_err(to_export_err)?;
            prog_sheet.write_number_with_format(r, 3, seg.segment_index as f64, &number_format)
                .map_err(to_export_err)?;
            prog_sheet.write_string_with_format(r, 4, &seg.status, &data_format)
                .map_err(to_export_err)?;
            prog_sheet.write_number_with_format(r, 5, (seg.dwell_ms as f64) / 1000.0, &number_format)
                .map_err(to_export_err)?;
            prog_sheet.write_string_with_format(r, 6, format_ts(seg.last_read_at), &date_format)
                .map_err(to_export_err)?;
        }

        // ----------------------------------------------------
        // 5. Bookmarks Sheet
        // ----------------------------------------------------
        let bm_sheet = workbook.add_worksheet();
        bm_sheet.set_name("Bookmarks").map_err(to_export_err)?;
        bm_sheet.set_freeze_panes(1, 0).map_err(to_export_err)?;

        let bm_headers = [
            ("Bookmark ID", 38),
            ("Document Title", 35),
            ("Page", 10),
            ("Section", 25),
            ("Title", 25),
            ("Excerpt", 45),
            ("Note", 30),
            ("Created Date", 20),
        ];

        for (col, (hdr, width)) in bm_headers.iter().enumerate() {
            bm_sheet.set_column_width(col as u16, *width)
                .map_err(to_export_err)?;
            bm_sheet.write_string_with_format(0, col as u16, *hdr, &table_header_format)
                .map_err(to_export_err)?;
        }

        if !data.bookmarks.is_empty() {
            bm_sheet.autofilter(0, 0, data.bookmarks.len() as u32, (bm_headers.len() - 1) as u16)
                .map_err(to_export_err)?;
        }

        for (idx, bm) in data.bookmarks.iter().enumerate() {
            let r = (idx + 1) as u32;
            bm_sheet.write_string_with_format(r, 0, &bm.id, &data_format)
                .map_err(to_export_err)?;
            bm_sheet.write_string_with_format(r, 1, &bm.document_title, &data_format)
                .map_err(to_export_err)?;
            bm_sheet.write_string_with_format(r, 2, bm.page.map(|p| p.to_string()).unwrap_or_else(|| "-".to_string()), &data_format)
                .map_err(to_export_err)?;
            bm_sheet.write_string_with_format(r, 3, bm.section_title.as_deref().unwrap_or("-"), &data_format)
                .map_err(to_export_err)?;
            bm_sheet.write_string_with_format(r, 4, bm.title.as_deref().unwrap_or("-"), &data_format)
                .map_err(to_export_err)?;
            bm_sheet.write_string_with_format(r, 5, bm.excerpt.as_deref().unwrap_or("-"), &data_format)
                .map_err(to_export_err)?;
            bm_sheet.write_string_with_format(r, 6, bm.note.as_deref().unwrap_or("-"), &data_format)
                .map_err(to_export_err)?;
            bm_sheet.write_string_with_format(r, 7, format_ts(Some(bm.created_at)), &date_format)
                .map_err(to_export_err)?;
        }

        // ----------------------------------------------------
        // 6. Highlights Sheet
        // ----------------------------------------------------
        let hl_sheet = workbook.add_worksheet();
        hl_sheet.set_name("Highlights").map_err(to_export_err)?;
        hl_sheet.set_freeze_panes(1, 0).map_err(to_export_err)?;

        let hl_headers = [
            ("Highlight ID", 38),
            ("Document Title", 35),
            ("Color", 12),
            ("Selected Passage", 50),
            ("Note", 30),
            ("Start Position", 14),
            ("End Position", 14),
            ("Created Date", 20),
        ];

        for (col, (hdr, width)) in hl_headers.iter().enumerate() {
            hl_sheet.set_column_width(col as u16, *width)
                .map_err(to_export_err)?;
            hl_sheet.write_string_with_format(0, col as u16, *hdr, &table_header_format)
                .map_err(to_export_err)?;
        }

        if !data.highlights.is_empty() {
            hl_sheet.autofilter(0, 0, data.highlights.len() as u32, (hl_headers.len() - 1) as u16)
                .map_err(to_export_err)?;
        }

        for (idx, hl) in data.highlights.iter().enumerate() {
            let r = (idx + 1) as u32;
            hl_sheet.write_string_with_format(r, 0, &hl.id, &data_format)
                .map_err(to_export_err)?;
            hl_sheet.write_string_with_format(r, 1, &hl.document_title, &data_format)
                .map_err(to_export_err)?;
            hl_sheet.write_string_with_format(r, 2, &hl.color, &data_format)
                .map_err(to_export_err)?;
            hl_sheet.write_string_with_format(r, 3, &hl.selected_text, &data_format)
                .map_err(to_export_err)?;
            hl_sheet.write_string_with_format(r, 4, hl.note.as_deref().unwrap_or("-"), &data_format)
                .map_err(to_export_err)?;
            hl_sheet.write_number_with_format(r, 5, hl.start_pos as f64, &number_format)
                .map_err(to_export_err)?;
            hl_sheet.write_number_with_format(r, 6, hl.end_pos as f64, &number_format)
                .map_err(to_export_err)?;
            hl_sheet.write_string_with_format(r, 7, format_ts(Some(hl.created_at)), &date_format)
                .map_err(to_export_err)?;
        }

        // ----------------------------------------------------
        // 7. Notes Sheet
        // ----------------------------------------------------
        let note_sheet = workbook.add_worksheet();
        note_sheet.set_name("Notes").map_err(to_export_err)?;
        note_sheet.set_freeze_panes(1, 0).map_err(to_export_err)?;

        let note_headers = [
            ("Note ID", 38),
            ("Document Title", 35),
            ("Commentary Content", 55),
            ("Created Date", 20),
        ];

        for (col, (hdr, width)) in note_headers.iter().enumerate() {
            note_sheet.set_column_width(col as u16, *width)
                .map_err(to_export_err)?;
            note_sheet.write_string_with_format(0, col as u16, *hdr, &table_header_format)
                .map_err(to_export_err)?;
        }

        if !data.notes.is_empty() {
            note_sheet.autofilter(0, 0, data.notes.len() as u32, (note_headers.len() - 1) as u16)
                .map_err(to_export_err)?;
        }

        for (idx, note) in data.notes.iter().enumerate() {
            let r = (idx + 1) as u32;
            note_sheet.write_string_with_format(r, 0, &note.id, &data_format)
                .map_err(to_export_err)?;
            note_sheet.write_string_with_format(r, 1, &note.document_title, &data_format)
                .map_err(to_export_err)?;
            note_sheet.write_string_with_format(r, 2, &note.content, &data_format)
                .map_err(to_export_err)?;
            note_sheet.write_string_with_format(r, 3, format_ts(Some(note.created_at)), &date_format)
                .map_err(to_export_err)?;
        }

        // Save workbook to output file
        workbook.save(output_path).map_err(to_export_err)?;

        Ok(())
    }
}
