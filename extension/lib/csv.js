/**
 * One-row CSV for a single report. Playlist names are third-party data and end
 * up in spreadsheets, so any cell a spreadsheet could read as a formula is
 * prefixed with an apostrophe.
 */

export function csvCell(value) {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
}

export function buildCsv(playlist, botData) {
  const row = {
    name: playlist.name,
    curator: playlist.owner?.display_name,
    followers: playlist.followers?.total,
    tracks: playlist.tracks?.total,
    public: playlist.public,
    url: playlist.external_urls?.spotify,
    botScore: botData?.score,
    botLevel: botData?.level,
    signals: (botData?.factors || []).map(f => f.label).join('; '),
  };
  const headers = Object.keys(row);
  return [headers.join(','), headers.map(h => csvCell(row[h])).join(',')].join('\n');
}
