// Just the parts of sql.js this app uses (the package ships no TypeScript types).
declare module 'sql.js' {
  export type SqlValue = number | string | Uint8Array | null;

  export interface Statement {
    getColumnNames(): string[];
    step(): boolean;
    get(): SqlValue[];
    free(): boolean;
  }

  export interface StatementIterator extends Iterator<Statement> {
    getRemainingSQL(): string;
  }

  export interface Database {
    iterateStatements(sql: string): StatementIterator;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new () => Database;
  }

  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
}
