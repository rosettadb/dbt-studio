import * as fs from 'fs-extra';
import * as path from 'path';

// Context item interface for context providers (without messageId)
export interface ResolvedContextItem {
  id: string;
  type: string;
  name: string;
  description: string;
  content: string;
  metadata?: Record<string, any>;
}

// DBT file type definitions
export type DBTFileType =
  | 'model'
  | 'macro'
  | 'test'
  | 'snapshot'
  | 'seed'
  | 'schema'
  | 'project_config'
  | 'other';

// DBT context enhancement interface
export interface DBTContextEnhancement {
  type: DBTFileType;
  summary?: string;
  dependencies?: string[];
  metadata: Record<string, any>;
}

export class SelectedFileContextProvider {
  // Token counting cache for performance
  private static tokenCache = new Map<string, number>();

  /**
   * Resolve selected file context with DBT-specific enhancements
   */
  static async resolveSelectedFileContext(
    filePath: string,
    projectPath: string,
  ): Promise<ResolvedContextItem> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      const relativePath = path.relative(projectPath, filePath);

      // DBT-specific enhancements
      const fileType = this.detectDBTFileType(filePath);
      const contextEnhancement = await this.enhanceDBTContext(
        filePath,
        content,
        fileType,
      );

      return {
        id: `selected-file:${filePath}`,
        type: 'file',
        name: path.basename(filePath),
        description: `Currently selected file: ${relativePath}`,
        content: this.formatFileContent(
          content,
          relativePath,
          contextEnhancement,
        ),
        metadata: {
          path: filePath,
          relativePath,
          size: stats.size,
          fileType,
          isSelected: true,
          language: this.detectLanguage(filePath),
          dbtContext: contextEnhancement,
          tokenCount: this.countTokens(content),
          lastModified: stats.mtime.toISOString(),
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to resolve selected file context: ${errorMessage}`,
      );
    }
  }

  /**
   * Detect DBT file type based on file path and content
   */
  static detectDBTFileType(filePath: string): DBTFileType {
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Path-based detection
    if (normalizedPath.includes('/models/')) return 'model';
    if (normalizedPath.includes('/macros/')) return 'macro';
    if (normalizedPath.includes('/tests/')) return 'test';
    if (normalizedPath.includes('/snapshots/')) return 'snapshot';
    if (normalizedPath.includes('/seeds/')) return 'seed';

    // File name-based detection
    const fileName = path.basename(filePath);
    if (fileName === 'dbt_project.yml') return 'project_config';
    if (fileName.endsWith('schema.yml') || fileName.endsWith('_schema.yml'))
      return 'schema';
    if (fileName.includes('schema') && fileName.endsWith('.yml'))
      return 'schema';

    return 'other';
  }

  /**
   * Enhance context with DBT-specific information
   */
  private static async enhanceDBTContext(
    filePath: string,
    content: string,
    fileType: DBTFileType,
  ): Promise<DBTContextEnhancement> {
    switch (fileType) {
      case 'model':
        return this.enhanceModelContext(filePath, content);
      case 'schema':
        return this.enhanceSchemaContext(filePath, content);
      case 'macro':
        return this.enhanceMacroContext(filePath, content);
      case 'test':
        return this.enhanceTestContext(filePath, content);
      default:
        return {
          type: fileType,
          metadata: {
            fileType,
            hasDBTSyntax: this.hasDBTSyntax(content),
          },
        };
    }
  }

  /**
   * Enhance model context with dependencies and metadata
   */
  private static enhanceModelContext(
    filePath: string,
    content: string,
  ): DBTContextEnhancement {
    const modelName = path.basename(filePath, '.sql');
    const dependencies = this.extractModelDependencies(content);
    const columns = this.extractColumnReferences(content);
    const materializations = this.extractMaterializations(content);
    const hasConfig = content.includes('{{ config(');

    return {
      type: 'model',
      summary: `DBT model "${modelName}" with ${dependencies.length} dependencies`,
      dependencies,
      metadata: {
        modelName,
        columns: columns.slice(0, 10), // Limit to first 10 columns
        materializations,
        hasConfig,
        hasJinja: this.hasJinjaSyntax(content),
        lineCount: content.split('\n').length,
      },
    };
  }

  /**
   * Enhance schema context with model and source information
   */
  private static enhanceSchemaContext(
    filePath: string,
    content: string,
  ): DBTContextEnhancement {
    try {
      // Basic YAML parsing for schema files
      const models = this.extractYAMLModels(content);
      const sources = this.extractYAMLSources(content);

      return {
        type: 'schema',
        summary: `Schema configuration with ${models.length} models and ${sources.length} sources`,
        dependencies: [],
        metadata: {
          models: models.slice(0, 5), // Limit to first 5 models
          sources: sources.slice(0, 5), // Limit to first 5 sources
          hasTests: content.includes('tests:'),
          hasDocumentation: content.includes('description:'),
        },
      };
    } catch (error) {
      return {
        type: 'schema',
        summary: 'Schema configuration file',
        dependencies: [],
        metadata: {
          parseError: true,
          hasTests: content.includes('tests:'),
          hasDocumentation: content.includes('description:'),
        },
      };
    }
  }

  /**
   * Enhance macro context
   */
  private static enhanceMacroContext(
    filePath: string,
    content: string,
  ): DBTContextEnhancement {
    const macroName = path.basename(filePath, '.sql');
    const macroDefinitions = this.extractMacroDefinitions(content);

    return {
      type: 'macro',
      summary: `DBT macro file with ${macroDefinitions.length} macro definitions`,
      dependencies: [],
      metadata: {
        macroName,
        macroDefinitions: macroDefinitions.slice(0, 5),
        hasDocumentation: content.includes('{%- docs '),
      },
    };
  }

  /**
   * Enhance test context
   */
  private static enhanceTestContext(
    filePath: string,
    content: string,
  ): DBTContextEnhancement {
    const testName = path.basename(filePath, '.sql');
    const testedModels = this.extractModelDependencies(content);

    return {
      type: 'test',
      summary: `DBT test "${testName}" testing ${testedModels.length} models`,
      dependencies: testedModels,
      metadata: {
        testName,
        testedModels: testedModels.slice(0, 5),
        isGenericTest: content.includes('{{ test_'),
      },
    };
  }

  /**
   * Extract model dependencies from SQL content
   */
  private static extractModelDependencies(content: string): string[] {
    const dependencies: string[] = [];

    // Extract ref() calls
    const refMatches =
      content.match(/\{\{\s*ref\(['"`]([^'"`]+)['"`]\)\s*\}\}/g) || [];
    refMatches.forEach((match) => {
      const refMatch = match.match(/ref\(['"`]([^'"`]+)['"`]\)/);
      if (refMatch) {
        dependencies.push(refMatch[1]);
      }
    });

    // Extract source() calls
    const sourceMatches =
      content.match(
        /\{\{\s*source\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)\s*\}\}/g,
      ) || [];
    sourceMatches.forEach((match) => {
      const sourceMatch = match.match(
        /source\(['"`]([^'"`]+)['"`],\s*['"`]([^'"`]+)['"`]\)/,
      );
      if (sourceMatch) {
        dependencies.push(`${sourceMatch[1]}.${sourceMatch[2]}`);
      }
    });

    return [...new Set(dependencies)]; // Remove duplicates
  }

  /**
   * Extract column references from SQL content
   */
  private static extractColumnReferences(content: string): string[] {
    const columns: string[] = [];

    // Simple column extraction from SELECT statements
    const selectMatches = content.match(/SELECT\s+([\s\S]*?)\s+FROM/gi) || [];
    selectMatches.forEach((match) => {
      const columnPart = match
        .replace(/SELECT\s+/i, '')
        .replace(/\s+FROM$/i, '');
      const columnLines = columnPart.split(',');
      columnLines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.includes('*')) {
          // Extract column name (basic parsing)
          const columnMatch = trimmed.match(/(\w+)(?:\s+as\s+\w+)?/i);
          if (columnMatch) {
            columns.push(columnMatch[1]);
          }
        }
      });
    });

    return [...new Set(columns)].slice(0, 20); // Limit and remove duplicates
  }

  /**
   * Extract materialization configurations
   */
  private static extractMaterializations(content: string): string[] {
    const materializations: string[] = [];

    const configMatches =
      content.match(/\{\{\s*config\(([\s\S]*?)\)\s*\}\}/g) || [];
    configMatches.forEach((match) => {
      const matMatch = match.match(/materialized\s*=\s*['"`]([^'"`]+)['"`]/);
      if (matMatch) {
        materializations.push(matMatch[1]);
      }
    });

    return materializations;
  }

  /**
   * Extract YAML models (basic parsing)
   */
  private static extractYAMLModels(content: string): string[] {
    const models: string[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim().startsWith('- name:')) {
        const nameMatch = line.match(/- name:\s*['"`]?([^'"`\s]+)['"`]?/);
        if (nameMatch) {
          models.push(nameMatch[1]);
        }
      }
    }

    return models;
  }

  /**
   * Extract YAML sources (basic parsing)
   */
  private static extractYAMLSources(content: string): string[] {
    const sources: string[] = [];
    const lines = content.split('\n');
    let inSources = false;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim().startsWith('sources:')) {
        inSources = true;
      } else if (inSources && line.trim().startsWith('models:')) {
        inSources = false;
      } else if (inSources && line.trim().startsWith('- name:')) {
        const nameMatch = line.match(/- name:\s*['"`]?([^'"`\s]+)['"`]?/);
        if (nameMatch) {
          sources.push(nameMatch[1]);
        }
      }
    }

    return sources;
  }

  /**
   * Extract macro definitions
   */
  private static extractMacroDefinitions(content: string): string[] {
    const macros: string[] = [];
    const macroMatches = content.match(/\{%\s*macro\s+(\w+)\s*\(/g) || [];

    macroMatches.forEach((match) => {
      const macroMatch = match.match(/macro\s+(\w+)/);
      if (macroMatch) {
        macros.push(macroMatch[1]);
      }
    });

    return macros;
  }

  /**
   * Check if content has DBT syntax
   */
  private static hasDBTSyntax(content: string): boolean {
    return (
      content.includes('{{') ||
      content.includes('{%') ||
      content.includes('ref(') ||
      content.includes('source(')
    );
  }

  /**
   * Check if content has Jinja syntax
   */
  private static hasJinjaSyntax(content: string): boolean {
    return content.includes('{%') || content.includes('{{');
  }

  /**
   * Detect programming language from file extension
   */
  private static detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.sql': 'sql',
      '.py': 'python',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.json': 'json',
      '.md': 'markdown',
      '.txt': 'text',
      '.csv': 'csv',
    };

    return languageMap[ext] || 'text';
  }

  /**
   * Format file content for AI consumption
   */
  private static formatFileContent(
    content: string,
    relativePath: string,
    enhancement: DBTContextEnhancement,
  ): string {
    let formattedContent = `Currently selected file: ${relativePath}\n\n`;

    // Add DBT-specific summary
    if (enhancement.summary) {
      formattedContent += `File Summary: ${enhancement.summary}\n\n`;
    }

    // Add dependencies if present
    if (enhancement.dependencies && enhancement.dependencies.length > 0) {
      formattedContent += `Dependencies: ${enhancement.dependencies.join(', ')}\n\n`;
    }

    // Add metadata context
    if (enhancement.metadata && Object.keys(enhancement.metadata).length > 0) {
      const metadataLines: string[] = [];
      if (enhancement.metadata.hasConfig) metadataLines.push('Has DBT config');
      if (enhancement.metadata.hasJinja)
        metadataLines.push('Uses Jinja templating');
      if (enhancement.metadata.hasTests)
        metadataLines.push('Has tests defined');
      if (enhancement.metadata.hasDocumentation)
        metadataLines.push('Has documentation');

      if (metadataLines.length > 0) {
        formattedContent += `Context: ${metadataLines.join(', ')}\n\n`;
      }
    }

    // Add the actual file content
    const language = this.getLanguageFromPath(relativePath);
    formattedContent += `\`\`\`${language}\n${content}\n\`\`\``;

    return formattedContent;
  }

  /**
   * Get language identifier for syntax highlighting
   */
  private static getLanguageFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.sql': 'sql',
      '.py': 'python',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.json': 'json',
      '.md': 'markdown',
    };

    return languageMap[ext] || '';
  }

  /**
   * Count tokens in text (enhanced version with caching)
   */
  private static countTokens(text: string): number {
    if (!text) return 0;

    // Check cache first
    if (this.tokenCache.has(text)) {
      return this.tokenCache.get(text)!;
    }

    // Rough approximation: ~4 characters per token for English text
    // For production, consider using tiktoken or similar
    const tokenCount = Math.ceil(text.length / 4);

    // Cache the result (with size limit)
    if (this.tokenCache.size > 1000) {
      // Clear cache when it gets too large
      this.tokenCache.clear();
    }
    this.tokenCache.set(text, tokenCount);

    return tokenCount;
  }

  /**
   * Clear token cache
   */
  static clearTokenCache(): void {
    this.tokenCache.clear();
  }
}
