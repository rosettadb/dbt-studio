/**
 * CSV Header Detection Helper
 * Contains logic for detecting if a CSV file has headers based on content analysis
 */

/**
 * Detect if a CSV file has headers by analyzing the first few rows
 * Uses multiple heuristics to determine if the first row contains headers or data
 */
export async function detectCsvHeaders(
  connection: any,
  filePath: string,
): Promise<boolean> {
  try {
    // Read the first three rows without header specification
    const sampleQuery = `SELECT * FROM read_csv('${filePath}', header=false) LIMIT 3`;
    const sampleResult = await connection.run(sampleQuery);
    const sampleRows = await sampleResult.getRows();

    if (sampleRows.length < 2) {
      // If there's only one row, assume it's data (no headers)
      return false;
    }

    const firstRow = sampleRows[0];
    const secondRow = sampleRows[1];

    if (!Array.isArray(firstRow) || !Array.isArray(secondRow)) {
      return false;
    }

    const totalCols = firstRow.length;
    let hasHeadersScore = 0;
    let noHeadersScore = 0;

    for (let i = 0; i < totalCols; i += 1) {
      const firstValue = String(firstRow[i] || '').trim();
      const secondValue = String(secondRow[i] || '').trim();

      // Rule 1: Text in first row, number in second row (strong indicator)
      const firstIsText = firstValue && Number.isNaN(Number(firstValue));
      const secondIsNumber = secondValue && !Number.isNaN(Number(secondValue));

      if (firstIsText && secondIsNumber) {
        hasHeadersScore += 3;
      }

      // Rule 2: Common header patterns (underscores, descriptive names)
      if (firstValue.includes('_') || firstValue.includes('-')) {
        hasHeadersScore += 2;
      }

      // Rule 3: If first row contains spaces or special characters
      if (
        firstValue.includes(' ') ||
        /[%$#@&()[\]{}|\\:;'<>,.?/+=*^~`!]/.test(firstValue)
      ) {
        hasHeadersScore += 2;
      }

      // Rule 4: Descriptive words that are commonly used in headers
      const commonHeaderWords = [
        'id',
        'name',
        'email',
        'date',
        'time',
        'type',
        'status',
        'code',
        'number',
        'count',
        'value',
        'amount',
        'price',
        'total',
        'address',
        'phone',
        'gender',
        'age',
        'active',
        'created',
        'updated',
        'user',
        'first',
        'last',
        'full',
        'description',
        'title',
        'category',
      ];

      const lowerFirstValue = firstValue.toLowerCase();
      const containsHeaderWord = commonHeaderWords.some((word) =>
        lowerFirstValue.includes(word),
      );

      if (containsHeaderWord) {
        hasHeadersScore += 2;
      }

      // Rule 5: If first row starts with capital letter
      if (/^[A-Z]/.test(firstValue)) {
        hasHeadersScore += 1;
      }

      // Rule 6: If first row is all alphabetic (no numbers)
      if (firstValue && /^[a-zA-Z_]+$/.test(firstValue)) {
        hasHeadersScore += 1;
      }

      // Rule 7: Strong data patterns in first row suggest no headers
      const isStrongDataPattern =
        /^\d+$/.test(firstValue) || // pure integers
        /^\d+\.\d+$/.test(firstValue) || // decimals
        /^\d{4}-\d{2}-\d{2}$/.test(firstValue) || // dates YYYY-MM-DD
        /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(firstValue) || // dates MM/DD/YYYY
        /^\d{1,2}:\d{2}/.test(firstValue) || // times
        /^(true|false)$/i.test(firstValue) || // booleans
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          firstValue,
        ); // UUIDs

      if (isStrongDataPattern) {
        noHeadersScore += 3;
      }

      // Rule 8: If both rows have same data type and pattern, likely no headers
      const firstIsNumeric = !Number.isNaN(Number(firstValue));
      const secondIsNumeric = !Number.isNaN(Number(secondValue));

      if (firstIsNumeric && secondIsNumeric) {
        noHeadersScore += 1;
      }

      // Rule 9: If first row looks like an email but second doesn't, likely headers
      const firstIsEmail = /@/.test(firstValue);
      const secondIsEmail = /@/.test(secondValue);

      if (firstIsEmail && !secondIsEmail) {
        noHeadersScore += 2; // First row is probably data
      } else if (!firstIsEmail && secondIsEmail) {
        hasHeadersScore += 2; // First row is probably header
      }
    }

    // Decision logic: use a more balanced approach
    const hasHeadersThreshold = Math.max(3, totalCols * 0.5);
    const strongDataThreshold = Math.max(2, totalCols * 0.4);

    // If we have strong data patterns, lean towards no headers
    if (noHeadersScore >= strongDataThreshold) {
      return false;
    }

    // Otherwise, use headers score
    const hasHeaders = hasHeadersScore >= hasHeadersThreshold;

    return hasHeaders;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(
      'Failed to detect CSV headers, defaulting to no headers:',
      error,
    );
    return false;
  }
}
