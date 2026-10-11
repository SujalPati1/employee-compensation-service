import { describe, expect, it } from 'vitest';
import { splitSqlBatches } from '../../scripts/lib/sqlBatches';

describe('splitSqlBatches', () => {
  it('splits on lines that contain only GO', () => {
    const script = 'CREATE TABLE a (id INT);\nGO\nCREATE VIEW v AS SELECT 1 AS x;\nGO\n';
    expect(splitSqlBatches(script)).toEqual(['CREATE TABLE a (id INT);', 'CREATE VIEW v AS SELECT 1 AS x;']);
  });

  it('accepts lower-case go, surrounding spaces, Windows line endings and a trailing comment', () => {
    const script = 'SELECT 1;\r\n  go  \r\nSELECT 2;\r\nGO -- end of batch\r\n';
    expect(splitSqlBatches(script)).toEqual(['SELECT 1;', 'SELECT 2;']);
  });

  it('does not split on GO inside a longer line', () => {
    const script = "SELECT 'GO' AS word, 1 AS GOAL;\nGO";
    expect(splitSqlBatches(script)).toEqual(["SELECT 'GO' AS word, 1 AS GOAL;"]);
  });

  it('returns a single batch when there is no GO', () => {
    expect(splitSqlBatches('SELECT 1;')).toEqual(['SELECT 1;']);
  });

  it('drops empty batches', () => {
    expect(splitSqlBatches('GO\n\nGO\nSELECT 1;\nGO\nGO')).toEqual(['SELECT 1;']);
  });
});
