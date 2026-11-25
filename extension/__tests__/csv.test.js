import { describe, it, expect } from 'vitest';
import { buildCsv, csvCell } from '../lib/csv.js';

describe('csv export', () => {
  it('neutralises spreadsheet formulas and escapes quotes', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(null)).toBe('""');
  });

  it('builds one header row and one report row', () => {
    const csv = buildCsv(
      { name: 'Test', owner: { display_name: 'Curator' }, followers: { total: 10 }, tracks: { total: 5 }, public: true, external_urls: { spotify: 'https://open.spotify.com/playlist/abc' } },
      { score: 40, level: 'medium', factors: [{ label: 'a' }, { label: 'b' }] },
    );
    const [header, row] = csv.split('\n');
    expect(header).toBe('name,curator,followers,tracks,public,url,botScore,botLevel,signals');
    expect(row).toBe('"Test","Curator","10","5","true","https://open.spotify.com/playlist/abc","40","medium","a; b"');
  });
});
