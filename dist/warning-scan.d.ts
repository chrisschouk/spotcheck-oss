/**
 * Artificial streaming warning scan: the pure half.
 *
 * An artist whose distributor flagged a track pastes the playlists from their
 * Spotify for Artists page. This module turns that paste into playlist ids,
 * orders the scored results, and drafts the messages the artist needs to send.
 * scan.ts does the fetching and scoring.
 */
import type { ScoreFactor, ScoreLevel } from './bot-scorer.js';
export declare const MAX_SCAN_LINKS = 50;
export type SkipReason = 'invalid' | 'duplicate' | 'spotify_owned' | 'not_found' | 'error';
export type ScoredRow = {
    kind: 'scored';
    playlistId: string;
    url: string;
    name: string;
    owner: string;
    followers: number;
    tracks: number;
    score: number;
    level: ScoreLevel;
    reason: string;
};
export type SkippedRow = {
    kind: 'skipped';
    input: string;
    playlistId: string | null;
    why: SkipReason;
};
export type FullRow = ScoredRow | SkippedRow;
type Counts = {
    flagged: number;
    scanned: number;
    scannedAt: string;
};
/** Every verdict, ranked by score, with the playlists that could not be scored after them. */
export type FullReport = Counts & {
    rows: FullRow[];
};
export type DraftFields = {
    artistName: string;
    trackName: string;
    distributor: string;
};
export type ParsedScanInput = {
    ids: string[];
    skipped: SkippedRow[];
    /** Valid, distinct links past MAX_SCAN_LINKS that were left out. */
    overCap: number;
};
export declare const CLEAN_REASON = "No warning signs in public data";
export declare function parseScanInput(text: string): ParsedScanInput;
/** The label of the most severe factor, or the clean wording when none warns. */
export declare function reasonFor(factors: ScoreFactor[]): string;
export declare function isFlagged(row: FullRow): row is ScoredRow;
export declare function orderRows(rows: FullRow[]): FullRow[];
export declare function buildReport(rows: FullRow[], scannedAt?: Date): FullReport;
export declare function distributorReply(report: FullReport, fields: DraftFields): string;
export declare function removalRequest(row: ScoredRow, fields: DraftFields): string;
export {};
