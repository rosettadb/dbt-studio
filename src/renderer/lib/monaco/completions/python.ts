/* eslint-disable no-template-curly-in-string */
import type * as monaco from 'monaco-editor';
import { languageIntelligenceService } from '../../../services';
import { projectIdFromUri } from '../uri';

type Monaco = typeof monaco;

// ─────────────────────────────────────────────────────────────────────────────
// Comprehensive Data Engineering & Science Curated Module List
// Covers stdlib essentials + data warehouse stacks (Spark, Snowpark, BigQuery)
// + data science libraries commonly used in dbt Python models.
// ─────────────────────────────────────────────────────────────────────────────
const COMMON_MODULES: Array<{ name: string; doc: string; alias?: string }> = [
  // ── Standard Library ──
  { name: 'os', doc: 'Operating system interface' },
  { name: 'sys', doc: 'System-specific parameters and functions' },
  { name: 'pathlib', doc: 'Object-oriented filesystem paths' },
  { name: 'datetime', doc: 'Date and time types' },
  { name: 'json', doc: 'JSON encoder and decoder' },
  { name: 'csv', doc: 'CSV file reading and writing' },
  { name: 're', doc: 'Regular expression operations' },
  { name: 'typing', doc: 'Support for type hints' },
  {
    name: 'functools',
    doc: 'Higher-order functions and operations on callables',
  },
  { name: 'itertools', doc: 'Functions for efficient looping' },
  { name: 'collections', doc: 'Container datatypes' },
  { name: 'math', doc: 'Mathematical functions' },

  // ── Core Data Science & Computation ──
  {
    name: 'pandas',
    doc: 'Data analysis and manipulation library',
    alias: 'pd',
  },
  { name: 'numpy', doc: 'Numerical computing library', alias: 'np' },
  { name: 'polars', doc: 'Blazingly fast DataFrames', alias: 'pl' },
  { name: 'scipy', doc: 'Scientific computing and technical computing' },
  {
    name: 'pyarrow',
    doc: 'Apache Arrow library for columnar data',
    alias: 'pa',
  },

  // ── Machine Learning ──
  { name: 'sklearn', doc: 'Machine learning library (scikit-learn)' },
  { name: 'xgboost', doc: 'Scalable and Flexible Gradient Boosting' },
  { name: 'lightgbm', doc: 'Light Gradient Boosting Machine' },
  {
    name: 'statsmodels',
    doc: 'Statistical models, hypothesis tests, and data exploration',
  },

  // ── Databricks & Spark ──
  { name: 'pyspark', doc: 'Apache Spark Python API' },
  { name: 'pyspark.sql', doc: 'Spark SQL module' },
  {
    name: 'pyspark.sql.functions',
    doc: 'Spark SQL built-in functions',
    alias: 'F',
  },
  { name: 'pyspark.sql.types', doc: 'Spark SQL data types', alias: 'T' },
  { name: 'pyspark.ml', doc: 'Spark Machine Learning Library' },

  // ── Snowflake ──
  { name: 'snowflake.snowpark', doc: 'Snowflake Snowpark API' },
  {
    name: 'snowflake.snowpark.functions',
    doc: 'Snowpark built-in functions',
    alias: 'F',
  },
  { name: 'snowflake.snowpark.types', doc: 'Snowpark data types', alias: 'T' },

  // ── BigQuery & GCP ──
  { name: 'google.cloud.bigquery', doc: 'Google Cloud BigQuery client' },
  { name: 'google.cloud.storage', doc: 'Google Cloud Storage client' },

  // ── AWS ──
  { name: 'boto3', doc: 'AWS SDK for Python' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Known exports per module for `from X import` context.
// ─────────────────────────────────────────────────────────────────────────────
const MODULE_EXPORTS: Record<string, string[]> = {
  // Core
  pandas: [
    'DataFrame',
    'Series',
    'read_csv',
    'read_parquet',
    'read_json',
    'concat',
    'merge',
    'Timestamp',
    'isna',
    'notna',
    'to_datetime',
  ],
  numpy: [
    'array',
    'ndarray',
    'zeros',
    'ones',
    'arange',
    'linspace',
    'mean',
    'std',
    'sum',
    'nan',
    'inf',
    'where',
  ],
  polars: [
    'DataFrame',
    'Series',
    'read_csv',
    'read_parquet',
    'col',
    'lit',
    'when',
    'concat',
  ],

  // Stdlib
  datetime: ['datetime', 'date', 'time', 'timedelta', 'timezone'],
  typing: [
    'Optional',
    'List',
    'Dict',
    'Tuple',
    'Union',
    'Any',
    'Callable',
    'Generator',
    'Iterator',
    'Type',
    'cast',
  ],

  // Spark
  'pyspark.sql': ['SparkSession', 'DataFrame', 'Column', 'Row', 'Window'],
  'pyspark.sql.functions': [
    'col',
    'lit',
    'when',
    'count',
    'sum',
    'avg',
    'max',
    'min',
    'upper',
    'lower',
    'trim',
    'coalesce',
    'explode',
    'collect_list',
    'collect_set',
    'udf',
    'array',
    'struct',
  ],
  'pyspark.sql.types': [
    'StructType',
    'StructField',
    'StringType',
    'IntegerType',
    'LongType',
    'DoubleType',
    'FloatType',
    'BooleanType',
    'TimestampType',
    'DateType',
    'ArrayType',
    'MapType',
  ],

  // Snowflake
  'snowflake.snowpark': ['Session', 'DataFrame', 'Row', 'Window', 'Column'],
  'snowflake.snowpark.functions': [
    'col',
    'lit',
    'when',
    'iff',
    'coalesce',
    'sum',
    'avg',
    'min',
    'max',
    'count',
    'array_agg',
    'object_construct',
    'to_date',
    'to_timestamp',
    'call_udf',
  ],
  'snowflake.snowpark.types': [
    'StructType',
    'StructField',
    'StringType',
    'IntegerType',
    'FloatType',
    'DoubleType',
    'BooleanType',
    'DateType',
    'TimestampType',
    'VariantType',
    'ArrayType',
    'MapType',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Python language keywords — sourced from `keyword.kwlist` (Python 3.12)
// ─────────────────────────────────────────────────────────────────────────────
const PYTHON_KEYWORDS = [
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'case',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'match',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
];

// ─────────────────────────────────────────────────────────────────────────────
// Python built-in functions — from `dir(builtins)` (most commonly used)
// ─────────────────────────────────────────────────────────────────────────────
const PYTHON_BUILTINS: Array<{ name: string; doc: string }> = [
  {
    name: 'print',
    doc: 'print(*objects, sep=" ", end="\\n", file=sys.stdout, flush=False)',
  },
  { name: 'len', doc: 'Return the number of items in a container.' },
  { name: 'range', doc: 'range(stop) or range(start, stop[, step])' },
  { name: 'str', doc: 'Return a string version of the object.' },
  { name: 'int', doc: 'Return an integer object from a number or string.' },
  {
    name: 'float',
    doc: 'Return a floating-point number from a number or string.',
  },
  { name: 'bool', doc: 'Return a Boolean value.' },
  { name: 'list', doc: 'Return a list object.' },
  { name: 'dict', doc: 'Return a dictionary object.' },
  { name: 'set', doc: 'Return a new set object.' },
  { name: 'tuple', doc: 'Return an immutable sequence object.' },
  {
    name: 'enumerate',
    doc: 'Return an enumerate object. Adds a counter to an iterable.',
  },
  {
    name: 'zip',
    doc: 'zip(*iterables) — Iterate over several iterables in parallel.',
  },
  {
    name: 'map',
    doc: 'map(function, iterable) — Apply function to every item.',
  },
  {
    name: 'filter',
    doc: 'filter(function, iterable) — Filter items by a function.',
  },
  { name: 'sum', doc: 'sum(iterable, start=0) — Return sum of items.' },
  { name: 'min', doc: 'Return the smallest item.' },
  { name: 'max', doc: 'Return the largest item.' },
  { name: 'abs', doc: 'Return the absolute value of a number.' },
  { name: 'round', doc: 'round(number, ndigits=None)' },
  { name: 'sorted', doc: 'sorted(iterable, *, key=None, reverse=False)' },
  { name: 'reversed', doc: 'Return a reverse iterator.' },
  { name: 'any', doc: 'Return True if any element of the iterable is true.' },
  { name: 'all', doc: 'Return True if all elements of the iterable are true.' },
  { name: 'open', doc: 'open(file, mode="r", ...) — Open a file.' },
  { name: 'type', doc: 'type(object) — Return the type of an object.' },
  {
    name: 'isinstance',
    doc: 'isinstance(object, classinfo) — Return True if object is an instance of classinfo.',
  },
  { name: 'issubclass', doc: 'issubclass(class, classinfo)' },
  {
    name: 'hasattr',
    doc: 'hasattr(object, name) — Return True if object has the named attribute.',
  },
  { name: 'getattr', doc: 'getattr(object, name[, default])' },
  { name: 'setattr', doc: 'setattr(object, name, value)' },
  { name: 'delattr', doc: 'delattr(object, name)' },
  { name: 'vars', doc: 'vars([object]) — Return the __dict__ of the object.' },
  {
    name: 'dir',
    doc: 'dir([object]) — Return the list of names in scope or object attributes.',
  },
  { name: 'id', doc: 'id(object) — Return the identity of an object.' },
  { name: 'hash', doc: 'hash(object) — Return the hash value of the object.' },
  {
    name: 'repr',
    doc: 'repr(object) — Return a string containing a printable representation.',
  },
  { name: 'format', doc: 'format(value[, format_spec])' },
  { name: 'input', doc: 'input([prompt]) — Read a string from stdin.' },
  {
    name: 'super',
    doc: 'super() — Return a proxy object delegating to a parent class.',
  },
  {
    name: 'property',
    doc: '@property decorator — Return a property attribute.',
  },
  {
    name: 'staticmethod',
    doc: '@staticmethod — Transform a method into a static method.',
  },
  {
    name: 'classmethod',
    doc: '@classmethod — Transform a method into a class method.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Python built-in exception classes
// ─────────────────────────────────────────────────────────────────────────────
const PYTHON_EXCEPTIONS: Array<{ name: string; doc: string }> = [
  { name: 'Exception', doc: 'Base class for all non-system-exit exceptions.' },
  { name: 'BaseException', doc: 'The base class of all exceptions.' },
  {
    name: 'ValueError',
    doc: 'Raised when an operation receives an argument of correct type but inappropriate value.',
  },
  {
    name: 'TypeError',
    doc: 'Raised when an operation is applied to an object of an inappropriate type.',
  },
  { name: 'KeyError', doc: 'Raised when a mapping key is not found.' },
  {
    name: 'IndexError',
    doc: 'Raised when a sequence subscript is out of range.',
  },
  {
    name: 'AttributeError',
    doc: 'Raised when an attribute reference or assignment fails.',
  },
  { name: 'ImportError', doc: 'Raised when the import statement fails.' },
  { name: 'ModuleNotFoundError', doc: 'Raised when a module cannot be found.' },
  {
    name: 'FileNotFoundError',
    doc: 'Raised when a file or directory is requested but does not exist.',
  },
  {
    name: 'RuntimeError',
    doc: 'Raised when an error does not fall under any other category.',
  },
  {
    name: 'NotImplementedError',
    doc: 'Raised by abstract methods that must be overridden by subclasses.',
  },
  {
    name: 'StopIteration',
    doc: 'Raised by next() when no further items are produced.',
  },
  {
    name: 'OverflowError',
    doc: 'Raised when the result of an arithmetic operation is too large.',
  },
  { name: 'ZeroDivisionError', doc: 'Raised when division or modulo by zero.' },
  {
    name: 'PermissionError',
    doc: 'Raised when trying to run an operation without adequate permissions.',
  },
  {
    name: 'OSError',
    doc: 'Raised when a system function returns a system-related error.',
  },
  { name: 'IOError', doc: 'Alias for OSError.' },
  { name: 'TimeoutError', doc: 'Raised when a system function timed out.' },
  {
    name: 'KeyboardInterrupt',
    doc: 'Raised when the user hits the interrupt key (Ctrl+C).',
  },
  { name: 'MemoryError', doc: 'Raised when an operation runs out of memory.' },
  {
    name: 'RecursionError',
    doc: 'Raised when maximum recursion depth is exceeded.',
  },
  { name: 'AssertionError', doc: 'Raised when an assert statement fails.' },
  {
    name: 'NameError',
    doc: 'Raised when a local or global name is not found.',
  },
  {
    name: 'UnboundLocalError',
    doc: 'Raised when a local variable is referenced before assignment.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Type-to-Methods Map for Object Member Completions
// ─────────────────────────────────────────────────────────────────────────────
const OBJECT_MEMBERS: Record<string, string[]> = {
  // str methods
  str: [
    'upper',
    'lower',
    'strip',
    'lstrip',
    'rstrip',
    'split',
    'rsplit',
    'join',
    'replace',
    'startswith',
    'endswith',
    'find',
    'index',
    'count',
    'encode',
    'format',
    'format_map',
    'zfill',
    'center',
    'ljust',
    'rjust',
  ],
  // list methods
  list: [
    'append',
    'extend',
    'insert',
    'remove',
    'pop',
    'clear',
    'index',
    'count',
    'sort',
    'reverse',
    'copy',
  ],
  // dict methods
  dict: [
    'keys',
    'values',
    'items',
    'get',
    'pop',
    'update',
    'setdefault',
    'clear',
    'copy',
    'fromkeys',
  ],
  // set methods
  set: [
    'add',
    'remove',
    'discard',
    'pop',
    'clear',
    'union',
    'intersection',
    'difference',
    'symmetric_difference',
    'issubset',
    'issuperset',
  ],
  // pandas DataFrame
  DataFrame: [
    'head',
    'tail',
    'describe',
    'info',
    'shape',
    'columns',
    'index',
    'dtypes',
    'loc',
    'iloc',
    'filter',
    'select_dtypes',
    'assign',
    'rename',
    'drop',
    'fillna',
    'dropna',
    'sort_values',
    'groupby',
    'merge',
    'join',
    'pivot',
    'melt',
    'to_csv',
    'to_parquet',
    'to_json',
    'to_dict',
  ],
  // pandas Series
  Series: [
    'head',
    'tail',
    'describe',
    'value_counts',
    'unique',
    'nunique',
    'map',
    'apply',
    'fillna',
    'dropna',
    'astype',
    'sort_values',
    'reset_index',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Context detector — mirrors Python 3.14 REPL's import-context logic.
// Returns the completion mode for the current cursor position.
// ─────────────────────────────────────────────────────────────────────────────
type CompletionContext =
  | { kind: 'import' }
  | { kind: 'from-module'; partial: string }
  | { kind: 'from-import'; moduleName: string }
  | { kind: 'after-for' }
  | { kind: 'after-if' }
  | { kind: 'after-except' }
  | { kind: 'dot-member'; objectName: string }
  | { kind: 'dbt-ref'; partial: string }
  | { kind: 'dbt-source-name'; partial: string }
  | { kind: 'dbt-source-table'; sourceName: string; partial: string }
  | { kind: 'code' };

function detectContext(lineText: string, column: number): CompletionContext {
  const upToCursor = lineText.slice(0, column - 1);

  // `from pandas import |`  or  `from pandas import Da|`
  const fromImport = upToCursor.match(/^\s*from\s+(\S+)\s+import\s+\S*$/);
  if (fromImport) return { kind: 'from-import', moduleName: fromImport[1] };

  // `from pan|`  or  `from |`
  const fromModule = upToCursor.match(/^\s*from\s+(\S*)$/);
  if (fromModule) return { kind: 'from-module', partial: fromModule[1] };

  // `import pa|`  or  `import |`
  const importLine = upToCursor.match(/^\s*import\s+\S*$/);
  if (importLine) return { kind: 'import' };

  // `for <word> |` — suggest `in`
  const afterFor = upToCursor.match(/^\s*for\s+\S+\s+$/);
  if (afterFor) return { kind: 'after-for' };

  // `if <expr> |` or `elif <expr> |` — suggest boolean operators
  const afterIf = upToCursor.match(/^\s*(if|elif|while)\s+.+\s+$/);
  if (afterIf) return { kind: 'after-if' };

  // `except |` — suggest exception classes
  const afterExcept = upToCursor.match(/^\s*except\s+\S*$/);
  if (afterExcept) return { kind: 'after-except' };

  // `obj.` — member access trigger
  const dotAccess = upToCursor.match(/([a-zA-Z_][a-zA-Z0-9_]*)\.$/);
  if (dotAccess) return { kind: 'dot-member', objectName: dotAccess[1] };

  // `dbt.ref('`
  const dbtRef = upToCursor.match(/\bdbt\.ref\(\s*(['"]?)([^'")\s]*)$/);
  if (dbtRef) return { kind: 'dbt-ref', partial: dbtRef[2] };

  // `dbt.source('source_name', '`
  const dbtSourceTable = upToCursor.match(
    /\bdbt\.source\(\s*(['"])([^'"]+)\1\s*,\s*(['"]?)([^'")\s]*)$/,
  );
  if (dbtSourceTable)
    return {
      kind: 'dbt-source-table',
      sourceName: dbtSourceTable[2],
      partial: dbtSourceTable[4],
    };

  // `dbt.source('`
  const dbtSourceName = upToCursor.match(
    /\bdbt\.source\(\s*(['"]?)([^'",)\s]*)$/,
  );
  if (dbtSourceName)
    return { kind: 'dbt-source-name', partial: dbtSourceName[2] };

  return { kind: 'code' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build module name completion items
// ─────────────────────────────────────────────────────────────────────────────
function buildModuleItems(
  monacoNs: Monaco,
  range: monaco.IRange,
  withAlias = false,
): monaco.languages.CompletionItem[] {
  return COMMON_MODULES.map((mod) => ({
    label: mod.name,
    kind: monacoNs.languages.CompletionItemKind.Module,
    insertText:
      withAlias && mod.alias ? `${mod.name} as ${mod.alias}` : mod.name,
    documentation: mod.doc,
    detail: mod.alias
      ? `import ${mod.name} as ${mod.alias}`
      : `import ${mod.name}`,
    range,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build from-import export items for a given module
// ─────────────────────────────────────────────────────────────────────────────
function buildExportItems(
  monacoNs: Monaco,
  range: monaco.IRange,
  moduleName: string,
): monaco.languages.CompletionItem[] {
  const exports = MODULE_EXPORTS[moduleName] ?? [];
  return exports.map((name) => ({
    label: name,
    kind: monacoNs.languages.CompletionItemKind.Value,
    insertText: name,
    detail: `from ${moduleName} import ${name}`,
    range,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: dbt Python API snippets (shown in normal code context)
// ─────────────────────────────────────────────────────────────────────────────
function buildDbtSnippets(
  monacoNs: Monaco,
  range: monaco.IRange,
): monaco.languages.CompletionItem[] {
  const S = monacoNs.languages.CompletionItemKind.Snippet;
  const Fn = monacoNs.languages.CompletionItemKind.Function;
  const rule = monacoNs.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  return [
    {
      label: 'dbt model function',
      kind: S,
      insertText: [
        'def model(dbt, session):',
        '    dbt.config(materialized="${1|table,incremental|}")',
        '    df = dbt.ref("${2:model_name}")',
        '    return df',
      ].join('\n'),
      insertTextRules: rule,
      documentation: 'dbt Python model entry-point boilerplate',
      detail: 'dbt model boilerplate',
      range,
    },
    {
      label: 'dbt.ref',
      kind: Fn,
      insertText: 'dbt.ref("${1:model_name}")',
      insertTextRules: rule,
      documentation: 'Reference another dbt model. Returns a DataFrame.',
      detail: 'dbt.ref(model_name: str) -> DataFrame',
      range,
    },
    {
      label: 'dbt.source',
      kind: Fn,
      insertText: 'dbt.source("${1:source_name}", "${2:table_name}")',
      insertTextRules: rule,
      documentation: 'Reference a dbt source table.',
      detail: 'dbt.source(source_name: str, table_name: str) -> DataFrame',
      range,
    },
    {
      label: 'dbt.config',
      kind: Fn,
      insertText: 'dbt.config(materialized="${1|table,incremental,view|}")',
      insertTextRules: rule,
      documentation: 'Set model configuration in a Python model.',
      detail: 'dbt.config(**kwargs)',
      range,
    },
    {
      label: 'dbt.config incremental',
      kind: S,
      insertText: [
        'dbt.config(',
        '    materialized="incremental",',
        '    unique_key="${1:id}",',
        '    incremental_strategy="${2|merge,delete+insert,append|}",',
        ')',
      ].join('\n'),
      insertTextRules: rule,
      documentation: 'Incremental dbt Python model config block.',
      detail: 'dbt.config (incremental)',
      range,
    },
    {
      label: 'dbt.get_spark_session',
      kind: Fn,
      insertText: 'spark = dbt.get_spark_session()',
      insertTextRules: rule,
      documentation: 'Get the active Spark session (Databricks adapter).',
      detail: 'dbt.get_spark_session() -> SparkSession',
      range,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Python keyword completion items
// ─────────────────────────────────────────────────────────────────────────────
function buildKeywordItems(
  monacoNs: Monaco,
  range: monaco.IRange,
): monaco.languages.CompletionItem[] {
  return PYTHON_KEYWORDS.map((kw) => ({
    label: kw,
    kind: monacoNs.languages.CompletionItemKind.Keyword,
    insertText: kw,
    detail: 'Python keyword',
    range,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Python built-in function completion items
// ─────────────────────────────────────────────────────────────────────────────
function buildBuiltinItems(
  monacoNs: Monaco,
  range: monaco.IRange,
): monaco.languages.CompletionItem[] {
  return PYTHON_BUILTINS.map((fn) => ({
    label: fn.name,
    kind: monacoNs.languages.CompletionItemKind.Function,
    insertText: fn.name,
    documentation: fn.doc,
    detail: 'Python built-in',
    range,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Python built-in exception class completion items
// ─────────────────────────────────────────────────────────────────────────────
function buildExceptionItems(
  monacoNs: Monaco,
  range: monaco.IRange,
): monaco.languages.CompletionItem[] {
  return PYTHON_EXCEPTIONS.map((ex) => ({
    label: ex.name,
    kind: monacoNs.languages.CompletionItemKind.Class,
    insertText: ex.name,
    documentation: ex.doc,
    detail: 'Python built-in exception',
    range,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: General Python snippets
// ─────────────────────────────────────────────────────────────────────────────
function buildPythonSnippets(
  monacoNs: Monaco,
  range: monaco.IRange,
): monaco.languages.CompletionItem[] {
  const S = monacoNs.languages.CompletionItemKind.Snippet;
  const rule = monacoNs.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  return [
    {
      label: 'def',
      kind: S,
      insertText: 'def ${1:function_name}(${2:args}):\n    ${3:pass}',
      insertTextRules: rule,
      documentation: 'Define a Python function.',
      detail: 'def snippet',
      range,
    },
    {
      label: 'class',
      kind: S,
      insertText:
        'class ${1:ClassName}:\n    def __init__(self):\n        ${2:pass}',
      insertTextRules: rule,
      documentation: 'Define a Python class.',
      detail: 'class snippet',
      range,
    },
    {
      label: 'ifmain',
      kind: S,
      insertText: 'if __name__ == "__main__":\n    ${1:main()}',
      insertTextRules: rule,
      documentation: 'Standard Python entry-point guard.',
      detail: 'if __name__ == "__main__" snippet',
      range,
    },
    {
      label: 'try',
      kind: S,
      insertText:
        'try:\n    ${1:pass}\nexcept ${2:Exception} as ${3:e}:\n    ${4:raise}',
      insertTextRules: rule,
      documentation: 'try/except block.',
      detail: 'try/except snippet',
      range,
    },
    {
      label: 'with',
      kind: S,
      insertText: 'with ${1:open("${2:file.txt}")} as ${3:f}:\n    ${4:pass}',
      insertTextRules: rule,
      documentation: 'Context manager (with statement).',
      detail: 'with statement snippet',
      range,
    },
    {
      label: 'for',
      kind: S,
      insertText: 'for ${1:item} in ${2:iterable}:\n    ${3:pass}',
      insertTextRules: rule,
      documentation: 'for loop',
      detail: 'for loop snippet',
      range,
    },
    {
      label: 'lc',
      kind: S,
      insertText: '[${1:expr} for ${2:item} in ${3:iterable}]',
      insertTextRules: rule,
      documentation: 'List comprehension.',
      detail: 'list comprehension snippet',
      range,
    },
    {
      label: 'dc',
      kind: S,
      insertText: '{${1:key}: ${2:value} for ${3:item} in ${4:iterable}}',
      insertTextRules: rule,
      documentation: 'Dict comprehension.',
      detail: 'dict comprehension snippet',
      range,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: scan model text for variable names (heuristic, not AST-based)
// ─────────────────────────────────────────────────────────────────────────────
function buildScopeVariableItems(
  monacoNs: Monaco,
  range: monaco.IRange,
  modelText: string,
): monaco.languages.CompletionItem[] {
  const names = new Set<string>();

  // assignment: `name = ...` or `name, other = ...`
  const assignRe = /^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)\s*=/gm;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = assignRe.exec(modelText)) !== null) {
    names.add(m[1]);
  }

  // for loop variable: `for name in`
  const forRe = /\bfor\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in\b/g;
  // eslint-disable-next-line no-cond-assign
  while ((m = forRe.exec(modelText)) !== null) {
    names.add(m[1]);
  }

  // function parameters: `def fn(param1, param2=...)`
  const defRe = /\bdef\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(([^)]*)\)/g;
  // eslint-disable-next-line no-cond-assign
  while ((m = defRe.exec(modelText)) !== null) {
    const params = m[1].split(',');
    params.forEach((p) => {
      const name = p.trim().split(/[=:]/)[0].trim();
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) names.add(name);
    });
  }

  return Array.from(names).map((name) => ({
    label: name,
    kind: monacoNs.languages.CompletionItemKind.Variable,
    insertText: name,
    detail: 'local variable',
    range,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: object member completion items
// ─────────────────────────────────────────────────────────────────────────────
function buildMemberItems(
  monacoNs: Monaco,
  range: monaco.IRange,
  objectName: string,
  modelText: string,
): monaco.languages.CompletionItem[] {
  // Try to infer type from a known assignment pattern: `objectName = SomeType(...)`
  const typeRe = new RegExp(
    `\\b${objectName}\\s*=\\s*([A-Za-z][A-Za-z0-9_]*)\\s*[\\(\\[]`,
  );
  const typeMatch = modelText.match(typeRe);
  const inferredType = typeMatch?.[1];

  const methods: string[] =
    (inferredType ? OBJECT_MEMBERS[inferredType] : undefined) ??
    OBJECT_MEMBERS[objectName] ??
    [];

  return methods.map((method) => ({
    label: method,
    kind: monacoNs.languages.CompletionItemKind.Method,
    insertText: method,
    detail: `${objectName}.${method}`,
    range,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main provider registration
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Register context-aware Python completions for Monaco.
 *
 * Inspired by Python 3.14 REPL: detects `import` / `from X import` context
 * via line-text regex (same conceptual approach CPython's PyREPL uses) and
 * scopes suggestions accordingly — no running Python process required.
 */
export const registerPythonCompletions = (monacoNs: Monaco): void => {
  monacoNs.languages.registerCompletionItemProvider('python', {
    // Space triggers import-context suggestions after typing 'import '
    triggerCharacters: ['.', '"', "'", ' '],

    provideCompletionItems: async (
      model: monaco.editor.ITextModel,
      position: monaco.Position,
    ): Promise<monaco.languages.CompletionList> => {
      try {
        const projectId = projectIdFromUri(model.uri);
        const word = model.getWordUntilPosition(position);
        const range: monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const lineText = model.getLineContent(position.lineNumber);
        const ctx = detectContext(lineText, position.column);

        switch (ctx.kind) {
          case 'import':
            // `import pa|` → suggest module names (with alias inserted)
            return { suggestions: buildModuleItems(monacoNs, range, true) };

          case 'from-module':
            // `from pa|` → suggest module names (no alias in from-import)
            return { suggestions: buildModuleItems(monacoNs, range, false) };

          case 'from-import':
            // `from pandas import Da|` → suggest known exports of pandas
            return {
              suggestions: buildExportItems(monacoNs, range, ctx.moduleName),
            };

          case 'after-for':
            return {
              suggestions: [
                {
                  label: 'in',
                  kind: monacoNs.languages.CompletionItemKind.Keyword,
                  insertText: 'in',
                  range,
                },
              ],
            };

          case 'after-if':
            return {
              suggestions: [
                'and',
                'or',
                'is',
                'in',
                'not',
                'is not',
                'not in',
              ].map((kw) => ({
                label: kw,
                kind: monacoNs.languages.CompletionItemKind.Keyword,
                insertText: kw,
                range,
              })),
            };

          case 'after-except':
            return { suggestions: buildExceptionItems(monacoNs, range) };

          case 'dot-member':
            return {
              suggestions: buildMemberItems(
                monacoNs,
                range,
                ctx.objectName,
                model.getValue(),
              ),
            };

          case 'dbt-ref': {
            const res = await languageIntelligenceService.listModels(projectId);
            const lowerPartial = ctx.partial.toLowerCase();
            return {
              suggestions: res.models
                .filter(
                  (m) =>
                    !ctx.partial ||
                    m.name.toLowerCase().startsWith(lowerPartial),
                )
                .slice(0, 200)
                .map((m) => ({
                  label: m.name,
                  kind: monacoNs.languages.CompletionItemKind.Module,
                  insertText: m.name,
                  detail: m.packageName,
                  documentation: m.description,
                  range,
                })),
            };
          }

          case 'dbt-source-name': {
            const res =
              await languageIntelligenceService.listSources(projectId);
            const names = [...new Set(res.sources.map((s) => s.sourceName))];
            const lowerPartial = ctx.partial.toLowerCase();
            return {
              suggestions: names
                .filter(
                  (n) =>
                    !ctx.partial || n.toLowerCase().startsWith(lowerPartial),
                )
                .map((n) => ({
                  label: n,
                  kind: monacoNs.languages.CompletionItemKind.Module,
                  insertText: n,
                  range,
                })),
            };
          }

          case 'dbt-source-table': {
            const res =
              await languageIntelligenceService.listSources(projectId);
            const lowerPartial = ctx.partial.toLowerCase();
            return {
              suggestions: res.sources
                .filter((s) => s.sourceName === ctx.sourceName)
                .filter(
                  (s) =>
                    !ctx.partial ||
                    s.tableName.toLowerCase().startsWith(lowerPartial),
                )
                .slice(0, 200)
                .map((s) => ({
                  label: s.tableName,
                  kind: monacoNs.languages.CompletionItemKind.Field,
                  insertText: s.tableName,
                  documentation: s.description,
                  range,
                })),
            };
          }

          case 'code':
          default:
            return {
              suggestions: [
                ...buildScopeVariableItems(monacoNs, range, model.getValue()),
                ...buildDbtSnippets(monacoNs, range),
                ...buildKeywordItems(monacoNs, range),
                ...buildBuiltinItems(monacoNs, range),
                ...buildExceptionItems(monacoNs, range),
                ...buildPythonSnippets(monacoNs, range),
              ],
            };
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[python] completion provider error:', error);
        return { suggestions: [] };
      }
    },
  });
};
