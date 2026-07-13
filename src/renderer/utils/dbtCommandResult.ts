const ANSI_ESCAPE_REGEX = /\[[0-9;]*m/g;
const ERROR_SUMMARY_REGEX = /ERROR=(\d+)/i;
const NON_ZERO_EXIT_REGEX = /Process exited with code\s+(\d+)/i;
const ERROR_HINT_REGEX =
  /(Error importing adapter|Encountered an error|Runtime Error|Traceback|Database Error|Compilation Error|^ERROR:?\b|\bERROR\b)/i;
const ERROR_HINT_IGNORE_REGEX = /ERROR=0\b/i;

const sanitizeCliLine = (line: string): string =>
  line.replace(ANSI_ESCAPE_REGEX, '').trimEnd();

export const extractCliErrorDetails = (
  output: string[],
  errors: string[],
  exitCode: number | null = null,
): string[] => {
  const details = new Set<string>();

  if (exitCode !== null && exitCode !== 0) {
    details.add(`Process exited with code ${exitCode}`);
  }

  errors.forEach((err) => {
    const sanitizedError = sanitizeCliLine(err);
    if (sanitizedError) details.add(sanitizedError);
  });

  const cleanedOutput = output.map(sanitizeCliLine);

  cleanedOutput.forEach((line) => {
    const match = line.match(ERROR_SUMMARY_REGEX);
    if (match && Number(match[1]) > 0) details.add(line);
  });

  cleanedOutput.forEach((line) => {
    const match = line.match(NON_ZERO_EXIT_REGEX);
    if (match && Number(match[1]) !== 0) details.add(line);
  });

  cleanedOutput.forEach((line) => {
    if (!ERROR_HINT_IGNORE_REGEX.test(line) && ERROR_HINT_REGEX.test(line)) {
      details.add(line);
    }
  });

  return Array.from(details);
};
