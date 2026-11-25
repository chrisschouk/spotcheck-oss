/** Plain-text reports for the command line tool and the MCP server. */
import type { CheckReport, ScanReport } from './check.js';
export declare function formatCheck(report: CheckReport): string;
export declare function formatScan(scan: ScanReport): string;
