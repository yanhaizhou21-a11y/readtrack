use crate::models::{LogicalPosition, ResolvedPosition, NormalizedDocument};
use crate::errors::AppError;

pub struct PositionService;

impl PositionService {
    pub fn new() -> Self {
        Self
    }

    pub fn resolve(&self, position: LogicalPosition, doc: &NormalizedDocument) -> Result<ResolvedPosition, AppError> {
        // Tier 5: PDF
        if position.page.is_some() || doc.metadata.page_count.is_some() {
            let page_count = doc.metadata.page_count.unwrap_or(1) as i64;
            let mut page = position.page.unwrap_or(1);
            if page < 1 { page = 1; }
            if page > page_count { page = page_count; }
            
            let mut page_offset = position.page_offset.unwrap_or(0.0);
            if page_offset < 0.0 { page_offset = 0.0; }
            if page_offset > 1.0 { page_offset = 1.0; }
            
            let linear_pos = (page - 1) * 1_000_000 + (page_offset * 999_999.0).round() as i64;
            
            return Ok(ResolvedPosition {
                section_index: (page - 1).max(0),
                block_id: None,
                offset: None,
                page: Some(page),
                page_offset: Some(page_offset),
                percentage: position.percentage,
                linear_pos,
                fallback_tier: "Tier 5: PDF Page".to_string(),
            });
        }

        // Tier 4: Empty Doc
        if doc.sections.is_empty() || (doc.sections.len() == 1 && doc.sections[0].blocks.is_empty()) {
            return Ok(ResolvedPosition {
                section_index: 0,
                block_id: None,
                offset: Some(0),
                page: None,
                page_offset: None,
                percentage: 0.0,
                linear_pos: 0,
                fallback_tier: "Tier 4: Empty Document".to_string(),
            });
        }

        let mut cumulative_chars = 0i64;
        let parser_match = position.parser_version == doc.metadata.parser_version as i64;
        
        if parser_match {
            if let Some(sec_id) = position.section_id {
                if let Some(sec) = doc.sections.iter().find(|s| s.index == sec_id as u32) {
                    if let Some(ref bid) = position.block_id {
                        let mut block_found = false;
                        let _block_start_chars = cumulative_chars; // Simplify for now
                        
                        for s in &doc.sections {
                            if s.index == sec_id as u32 {
                                break;
                            }
                            cumulative_chars += s.character_count as i64;
                        }
                        
                        let current_section_start = cumulative_chars;
                        
                        for b in &sec.blocks {
                            if b.id() == bid {
                                block_found = true;
                                break;
                            }
                            cumulative_chars += 10; // rough mock length
                        }
                        
                        if block_found {
                            let offset = position.offset.unwrap_or(0).max(0);
                            return Ok(ResolvedPosition {
                                section_index: sec_id,
                                block_id: Some(bid.clone()),
                                offset: Some(offset),
                                page: None,
                                page_offset: None,
                                percentage: position.percentage,
                                linear_pos: cumulative_chars + offset,
                                fallback_tier: "Tier 1: Exact Match".to_string(),
                            });
                        }
                        
                        // Tier 2: Nearest block in same section
                        return Ok(ResolvedPosition {
                            section_index: sec_id,
                            block_id: sec.blocks.first().map(|b| b.id().to_string()),
                            offset: Some(0),
                            page: None,
                            page_offset: None,
                            percentage: position.percentage,
                            linear_pos: current_section_start,
                            fallback_tier: "Tier 2: Nearest in Section".to_string(),
                        });
                    }
                }
            }
        }
        
        // Tier 3: Percentage
        let total_chars = doc.metadata.character_count as f64;
        let target_chars = (position.percentage * total_chars) as i64;
        
        let mut best_section = 0;
        let mut best_block = None;
        let mut current_chars = 0;
        let mut min_diff = i64::MAX;
        let mut best_linear = 0;
        
        for sec in &doc.sections {
            for b in &sec.blocks {
                let diff = (current_chars - target_chars).abs();
                if diff < min_diff {
                    min_diff = diff;
                    best_section = sec.index as i64;
                    best_block = Some(b.id().to_string());
                    best_linear = current_chars;
                }
                current_chars += 10;
            }
        }
        
        if best_block.is_none() && !doc.sections.is_empty() {
            best_section = doc.sections[0].index as i64;
        }

        Ok(ResolvedPosition {
            section_index: best_section,
            block_id: best_block,
            offset: Some(0),
            page: None,
            page_offset: None,
            percentage: position.percentage,
            linear_pos: best_linear,
            fallback_tier: "Tier 3: Percentage Fallback".to_string(),
        })
    }
}
