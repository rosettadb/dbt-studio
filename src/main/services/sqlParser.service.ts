import { spawn } from 'child_process';
import SettingsService from './settings.service';

const PYTHON_SCRIPT = `
import sys
import json
import io

# Ensure UTF-8 encoding for stdin/stdout
# Using safe wrapper for environments where sys.stdin/out might not be standard
try:
    sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
except Exception:
    pass # Might fail in some embedded contexts, safe to ignore if already utf-8

try:
    import sqlglot
    from sqlglot import exp
    from sqlglot.optimizer.qualify import qualify
except ImportError:
    print(json.dumps({"error": "sqlglot not installed"}))
    sys.exit(0)

def extract_lineage(sql, dialect):
    try:
        parsed = sqlglot.parse_one(sql, read=dialect)
    except Exception as e:
        return {"error": "Parse error: " + str(e)}

    # Optimize and expand stars (handle CTEs like 'select * from cte')
    try:
        # infer_schema=False prevents errors on unknown tables
        parsed = qualify(parsed, expand_stars=True, infer_schema=False)
    except Exception:
        # If qualifying fails (e.g. ambiguity), fall back to original parsed AST
        pass

    # 1. Extract Tables using AST traversal
    tables = []
    for table in parsed.find_all(exp.Table):
        tables.append(table.sql())
    
    # 2. Extract Column Dependencies
    columns = {}
    
    if isinstance(parsed, exp.Select):
        for expression in parsed.expressions:
            output_col = None
            if isinstance(expression, exp.Alias):
                output_col = expression.alias
            elif isinstance(expression, exp.Column):
                output_col = expression.name
            else:
                output_col = expression.sql()
            
            deps = []
            for col in expression.find_all(exp.Column):
                deps.append(col.sql())
            
            columns[output_col] = list(set(deps))

    return {
        "tables": list(set(tables)),
        "transpiled": parsed.sql(),
        "columns": columns
    }

def main():
    try:
        input_data = json.load(sys.stdin)
        sql = input_data.get("sql")
        dialect = input_data.get("dialect", "snowflake")
        
        # Determine dialect mapping
        if dialect not in ['snowflake', 'bigquery', 'databricks', 'redshift', 'postgres']:
            pass

        result = extract_lineage(sql, dialect)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()
`;

export type ParseResult = {
  tables: string[];
  transpiled: string;
  columns: Record<string, string[]>;
  error?: string;
};

export default class SqlParserService {
  static async parseSql(
    sql: string,
    dialect: string = 'snowflake',
  ): Promise<ParseResult> {
    const settings = await SettingsService.loadSettings();

    // Determine python executable path
    let pythonPath = 'python';
    if (settings.pythonPath) {
      pythonPath = settings.pythonPath;
    }

    return new Promise((resolve, reject) => {
      const process = spawn(pythonPath, ['-c', PYTHON_SCRIPT]);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          // Check if it was an import error handled by our script
          try {
            const jsonResponse = JSON.parse(stdout);
            if (jsonResponse.error) {
              resolve({
                tables: [],
                transpiled: '',
                columns: {},
                error: jsonResponse.error,
              });
              return;
            }
          } catch (e) {
            // Ignore
          }
          reject(
            new Error(`Python process exited with code ${code}: ${stderr}`),
          );
          return;
        }

        try {
          const result = JSON.parse(stdout);
          if (result.error) {
            resolve({
              tables: [],
              transpiled: '',
              columns: {},
              error: result.error,
            });
          } else {
            resolve(result as ParseResult);
          }
        } catch (e) {
          reject(
            new Error(`Failed to parse Python output: ${stdout || stderr}`),
          );
        }
      });

      // Write input to stdin
      const input = JSON.stringify({ sql, dialect });
      process.stdin.write(input);
      process.stdin.end();
    });
  }
}
