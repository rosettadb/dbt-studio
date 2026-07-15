import React from 'react';
import { Box } from '@mui/material';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

const stringifyToolValue = (value: unknown): string => {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(
      value,
      (_key, item) => {
        if (typeof item === 'bigint') return item.toString();
        if (typeof item === 'object' && item !== null) {
          if (seen.has(item)) return '[Circular]';
          seen.add(item);
        }
        return item;
      },
      2,
    );
  } catch (error) {
    return `[Unable to display arguments: ${String(error)}]`;
  }
};

const ToolJson: React.FC<{ value: unknown }> = ({ value }) => (
  <Box
    component="pre"
    sx={{
      m: 0,
      p: 1,
      borderRadius: 1,
      bgcolor: 'background.default',
      color: 'text.primary',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      maxHeight: 260,
      overflow: 'auto',
      fontSize: '0.72rem',
    }}
  >
    {stringifyToolValue(value)}
  </Box>
);

export const renderArguments = (toolName: string, args: any) => {
  if (!args || Object.keys(args).length === 0) {
    return (
      <Box sx={{ fontStyle: 'italic', opacity: 0.7 }}>
        No arguments provided
      </Box>
    );
  }

  switch (toolName) {
    case 'studio_ducklake_query':
    case 'studio_sql_query':
    case 'studio_monaco_update': {
      const code = args.sql || args.content;
      if (code) {
        return (
          <Box
            sx={{
              '& pre': {
                m: 0,
                p: 1,
                borderRadius: 1,
                bgcolor: 'background.default',
              },
            }}
          >
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {`\`\`\`sql\n${code}\n\`\`\``}
            </Markdown>
          </Box>
        );
      }
      break;
    }

    case 'studio_cli_run_dbt':
    case 'runDbtCommand': {
      const cmd = args.command || args.cliCommand || '';
      const select = args.select ? ` --select ${args.select}` : '';
      const fullCmd = `dbt ${cmd}${select}`;
      return (
        <Box
          sx={{
            fontFamily: 'monospace',
            bgcolor: 'background.default',
            p: 1,
            borderRadius: 1,
          }}
        >
          {fullCmd}
        </Box>
      );
    }

    case 'getDbtLogs':
      return <Box>Requested {args.lines || 'default'} lines</Box>;

    case 'readDbtModel':
    case 'readFile':
      return <Box>File: {args.filePath || args.path}</Box>;

    case 'writeDbtModel':
    case 'writeFile':
      return (
        <Box>
          <Box>File: {args.filePath || args.path}</Box>
          {args.content && (
            <Box
              sx={{
                '& pre': {
                  m: 0,
                  p: 1,
                  mt: 1,
                  borderRadius: 1,
                  bgcolor: 'background.default',
                  overflowX: 'auto',
                  maxHeight: 200,
                },
              }}
            >
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {`\`\`\`sql\n${args.content}\n\`\`\``}
              </Markdown>
            </Box>
          )}
        </Box>
      );

    case 'listDirectory':
      return (
        <Box>
          Directory: {args.dirPath}
          {args.recursive && ' (recursive)'}
        </Box>
      );

    case 'listDbtModels':
      return <Box>Filter: {args.filter ? `"${args.filter}"` : 'None'}</Box>;

    case 'loadSkill':
      return (
        <Box>
          Skill: <b>{args.name}</b>
        </Box>
      );

    case 'pathExists':
      return <Box>Path: {args.path || args.filePath}</Box>;

    case 'studio_connections_list':
      return <Box>Listing available connections</Box>;

    case 'studio_connections_test':
    case 'studio_cloud_connection_test':
      return <Box>Connection ID: {args.connectionId || args.id}</Box>;

    case 'studio_cloud_list_objects':
      return (
        <Box>
          Bucket: {args.bucket || args.path}
          {args.prefix && ` / prefix: ${args.prefix}`}
        </Box>
      );

    case 'studio_cloud_preview_data':
      return <Box>Previewing: {args.path || args.objectKey}</Box>;

    default:
      break;
  }

  // New and plugin-provided tools still expose their persisted arguments.
  return <ToolJson value={args} />;
};

export const renderResult = (toolName: string, result: any) => {
  if (!result) return null;

  try {
    switch (toolName) {
      case 'studio_ducklake_query':
      case 'studio_sql_query':
        if (result.message) {
          return (
            <Box>
              {result.message}
              {result.meta?.duration && (
                <Box sx={{ fontSize: '0.7rem', opacity: 0.6, mt: 0.5 }}>
                  Executed in {result.meta.duration}ms
                </Box>
              )}
            </Box>
          );
        }
        break;

      case 'studio_monaco_update':
        if (result.data?.applied) {
          return (
            <Box>
              Successfully updated editor ({result.data.contentLength}{' '}
              characters applied).
              {result.meta?.duration && (
                <Box sx={{ fontSize: '0.7rem', opacity: 0.6, mt: 0.5 }}>
                  Completed in {result.meta.duration}ms
                </Box>
              )}
            </Box>
          );
        }
        break;

      case 'studio_ducklake_schema_extract':
      case 'studio_sql_schema_extract':
        if (result.data?.schemaCount !== undefined) {
          return (
            <Box>
              Successfully analyzed <b>{result.data.schemaCount}</b> schemas and{' '}
              <b>{result.data.tableCount}</b> tables.
              {result.meta?.duration && (
                <Box sx={{ fontSize: '0.7rem', opacity: 0.6, mt: 0.5 }}>
                  Completed in {result.meta.duration}ms
                </Box>
              )}
            </Box>
          );
        }
        break;

      case 'studio_cli_run_dbt':
      case 'runDbtCommand': {
        const output =
          result.output ||
          result.data?.output ||
          result.stdout ||
          result.data?.stdout;
        const isSuccess = result.success !== false && result.ok !== false;
        const errorMsg = result.error || result.data?.error;

        return (
          <Box>
            {!isSuccess && errorMsg && (
              <Box sx={{ color: 'error.main', mb: 1, fontSize: '0.85rem' }}>
                ❌ {errorMsg}
              </Box>
            )}
            {output && (
              <Box
                sx={{
                  '& pre': {
                    m: 0,
                    p: 1,
                    borderRadius: 1,
                    bgcolor: '#1e1e1e',
                    color: isSuccess ? '#d4d4d4' : '#ff8080',
                    overflowX: 'auto',
                    maxHeight: 300,
                    fontSize: '0.8rem',
                  },
                }}
              >
                <Markdown>{`\`\`\`text\n${output}\n\`\`\``}</Markdown>
              </Box>
            )}
          </Box>
        );
      }

      case 'writeDbtModel':
      case 'writeFile':
        if (result.success || result.bytesWritten !== undefined) {
          return (
            <Box>
              File saved successfully
              {result.bytesWritten !== undefined &&
                ` (${result.bytesWritten} bytes written)`}
              .
            </Box>
          );
        }
        break;

      case 'readDbtModel':
      case 'readFile':
        if (result.content) {
          return (
            <Box
              sx={{
                '& pre': {
                  m: 0,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: 'background.default',
                  overflowX: 'auto',
                  maxHeight: 300,
                  fontSize: '0.8rem',
                },
              }}
            >
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {`\`\`\`sql\n${result.content}\n\`\`\``}
              </Markdown>
            </Box>
          );
        }
        break;

      case 'listDirectory':
        if (result.entries && Array.isArray(result.entries)) {
          return (
            <Box>
              Found {result.count || result.entries.length} items in{' '}
              <b>{result.directory}</b>:
              <Box
                component="ul"
                sx={{
                  mt: 0.5,
                  mb: 0,
                  pl: 2,
                  maxHeight: 200,
                  overflowY: 'auto',
                }}
              >
                {result.entries.map((entry: any, idx: number) => (
                  <li key={idx}>
                    {entry.type === 'directory' ? '📁 ' : '📄 '}
                    {entry.path.split('/').pop() || entry.path}
                  </li>
                ))}
              </Box>
            </Box>
          );
        }
        break;

      case 'getDbtLogs':
        if (result.content) {
          return (
            <Box>
              <Box sx={{ mb: 1, fontSize: '0.8rem', opacity: 0.8 }}>
                Returned {result.returnedLines} lines from log
              </Box>
              <Box
                sx={{
                  '& pre': {
                    m: 0,
                    p: 1,
                    borderRadius: 1,
                    bgcolor: '#1e1e1e',
                    color: '#d4d4d4',
                    overflowX: 'auto',
                    maxHeight: 300,
                    fontSize: '0.8rem',
                  },
                }}
              >
                <Markdown>{`\`\`\`text\n${result.content}\n\`\`\``}</Markdown>
              </Box>
            </Box>
          );
        }
        break;

      case 'listDbtModels':
        if (result.models && Array.isArray(result.models)) {
          return (
            <Box>
              Found {result.count || result.models.length} models:
              <Box
                component="ul"
                sx={{
                  mt: 0.5,
                  mb: 0,
                  pl: 2,
                  maxHeight: 150,
                  overflowY: 'auto',
                }}
              >
                {result.models.map((model: string, idx: number) => (
                  <li key={idx}>{model}</li>
                ))}
              </Box>
            </Box>
          );
        }
        break;

      case 'loadSkill':
        if (result.content) {
          return (
            <Box>
              <Box sx={{ mb: 1, fontSize: '0.85rem', opacity: 0.9 }}>
                ✅ Skill <b>{result.skillDirectory?.split('/').pop()}</b> loaded
                successfully.
              </Box>
              <Box
                sx={{
                  '& pre': {
                    m: 0,
                    p: 1,
                    borderRadius: 1,
                    bgcolor: 'background.default',
                    overflowX: 'auto',
                    maxHeight: 250,
                    fontSize: '0.8rem',
                  },
                }}
              >
                <Markdown remarkPlugins={[remarkGfm]}>
                  {result.content}
                </Markdown>
              </Box>
            </Box>
          );
        }
        if (result.error) {
          return <Box sx={{ color: 'error.main' }}>{result.error}</Box>;
        }
        break;

      case 'pathExists':
        return (
          <Box>
            {result.exists ? '✅ Path exists' : '❌ Path does not exist'}
          </Box>
        );

      case 'studio_connections_list':
        if (result.connections && Array.isArray(result.connections)) {
          return (
            <Box>
              Found {result.connections.length} connection(s):
              <Box
                component="ul"
                sx={{
                  mt: 0.5,
                  mb: 0,
                  pl: 2,
                  maxHeight: 150,
                  overflowY: 'auto',
                }}
              >
                {result.connections.map((c: any, i: number) => (
                  <li key={i}>{c.name || c.id}</li>
                ))}
              </Box>
            </Box>
          );
        }
        break;

      case 'studio_connections_test':
      case 'studio_cloud_connection_test':
        return (
          <Box>
            {result.success || result.ok
              ? '✅ Connection successful'
              : `❌ Connection failed: ${result.error || result.message}`}
          </Box>
        );

      case 'studio_cloud_list_objects':
        if (result.objects && Array.isArray(result.objects)) {
          return (
            <Box>
              Found {result.objects.length} object(s):
              <Box
                component="ul"
                sx={{
                  mt: 0.5,
                  mb: 0,
                  pl: 2,
                  maxHeight: 150,
                  overflowY: 'auto',
                }}
              >
                {result.objects.map((o: any, i: number) => (
                  <li key={i}>{o.key || o.name || o}</li>
                ))}
              </Box>
            </Box>
          );
        }
        break;

      case 'studio_cloud_preview_data':
        if (result.rows && Array.isArray(result.rows)) {
          return <Box>Previewed {result.rows.length} rows of data.</Box>;
        }
        break;

      default:
        break;
    }
  } catch (e) {
    // If our custom parsing fails, fallback safely
    // eslint-disable-next-line no-console
    console.error('Failed to parse tool result for UI rendering', e);
  }

  // Fallback for unknown tools or unhandled structures
  if (typeof result === 'string') {
    const preview = result.length > 180 ? `${result.slice(0, 180)}...` : result;
    return <Box sx={{ whiteSpace: 'pre-wrap' }}>{preview}</Box>;
  }

  if (result && typeof result === 'object') {
    const structuredError = (result as any).error;
    const errorMessage =
      typeof structuredError === 'string'
        ? structuredError
        : structuredError?.message;
    const errorCode =
      structuredError && typeof structuredError === 'object'
        ? structuredError.code
        : undefined;
    const message =
      (result as any).message ||
      (result as any).summary ||
      (errorMessage && errorCode
        ? `${errorCode}: ${errorMessage}`
        : errorMessage) ||
      ((result as any).ok === true || (result as any).success === true
        ? 'Completed successfully'
        : null);

    if (message) {
      return <Box sx={{ whiteSpace: 'pre-wrap' }}>{String(message)}</Box>;
    }

    const keys = Object.keys(result);
    return (
      <Box sx={{ fontStyle: 'italic', opacity: 0.75 }}>
        Result available{keys.length > 0 ? ` (${keys.length} fields)` : ''}
      </Box>
    );
  }

  return (
    <Box sx={{ fontStyle: 'italic', opacity: 0.75 }}>Result available</Box>
  );
};
