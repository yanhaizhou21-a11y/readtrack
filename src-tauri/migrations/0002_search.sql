CREATE VIRTUAL TABLE search_index USING fts5(
  text,
  document_id UNINDEXED,
  kind        UNINDEXED,
  ref_id      UNINDEXED,
  page        UNINDEXED,
  pos         UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
