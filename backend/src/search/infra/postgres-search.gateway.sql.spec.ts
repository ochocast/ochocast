import { segmentsSql } from './postgres-search.gateway';

describe('segmentsSql', () => {
  it('has no highlight branch without a tsquery', () => {
    const sql = segmentsSql(null);
    expect(sql).not.toContain('ts_headline');
    expect(sql).toContain('NULL::text AS marked');
  });

  it('highlights the segments that match the tsquery', () => {
    const sql = segmentsSql('$2::tsquery');
    expect(sql).toContain('s.tsv_fr @@ $2::tsquery');
    expect(sql).toContain('ts_headline');
  });
});
