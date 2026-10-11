/**
 * Splits a T-SQL script into batches on lines that contain only `GO`,
 * the same convention sqlcmd and SQL Server Management Studio use.
 * `GO` is not SQL; it only tells the client where one batch ends.
 */
export function splitSqlBatches(script: string): string[] {
  return script
    .split(/^[ \t]*GO[ \t]*(?:--[^\r\n]*)?\r?$/gim)
    .map((batch) => batch.trim())
    .filter((batch) => batch.length > 0);
}
