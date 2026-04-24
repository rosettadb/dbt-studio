import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import type {
  MCPFileConfig,
  MCPServerFileEntry,
} from '../../../../types/backend';

const BUILT_IN_SERVERS: Record<string, MCPServerFileEntry> = {
  rosetta: {
    name: 'Rosetta CLI',
    description: 'Rosetta CLI documentation and source code reference',
    disabled: false,
    transport: 'http',
    url: 'https://gitmcp.io/rosettadb/rosetta',
  },
  'dbt-core': {
    name: 'dbt Core',
    description: 'dbt-labs/dbt-core documentation and source code reference',
    disabled: false,
    transport: 'http',
    url: 'https://gitmcp.io/dbt-labs/dbt-core',
  },
  duckdb: {
    name: 'DuckDB',
    description: 'DuckDB documentation and source code reference',
    disabled: false,
    transport: 'http',
    url: 'https://gitmcp.io/duckdb/duckdb',
  },
  ducklake: {
    name: 'DuckLake',
    description: 'DuckLake data lakehouse format documentation and source code',
    disabled: false,
    transport: 'http',
    url: 'https://gitmcp.io/duckdb/ducklake',
  },
};

export class MCPConfigService {
  private static get filePath() {
    return path.join(app.getPath('userData'), 'mcp.config.json');
  }

  static async load(): Promise<MCPFileConfig> {
    try {
      if (!fs.existsSync(this.filePath)) {
        const defaults: MCPFileConfig = { mcpServers: { ...BUILT_IN_SERVERS } };
        await fs.writeJson(this.filePath, defaults, { spaces: 2 });
        return defaults;
      }
      const raw = await fs.readJson(this.filePath);
      // Built-ins always win over stale user overrides — user can only customise non-built-in servers
      const merged: MCPFileConfig = {
        mcpServers: {
          ...raw.mcpServers,
          ...BUILT_IN_SERVERS, // built-ins always override stale file entries
        },
      };
      return merged;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[MCPConfigService] Failed to load config:', error);
      return { mcpServers: { ...BUILT_IN_SERVERS } };
    }
  }

  static async save(config: MCPFileConfig): Promise<void> {
    try {
      await fs.writeJson(this.filePath, config, { spaces: 2 });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[MCPConfigService] Failed to save config:', error);
      throw error;
    }
  }

  static async addServer(
    id: string,
    entry: MCPServerFileEntry,
  ): Promise<MCPFileConfig> {
    const config = await this.load();
    config.mcpServers[id] = entry;
    await this.save(config);
    return config;
  }

  static async removeServer(id: string): Promise<MCPFileConfig> {
    const config = await this.load();
    delete config.mcpServers[id];
    await this.save(config);
    return config;
  }

  static async toggleServer(
    id: string,
    disabled: boolean,
  ): Promise<MCPFileConfig> {
    const config = await this.load();
    if (config.mcpServers[id]) {
      config.mcpServers[id].disabled = disabled;
    }
    await this.save(config);
    return config;
  }

  static async getFilePath(): Promise<string> {
    return this.filePath;
  }

  static isBuiltIn(id: string): boolean {
    return id in BUILT_IN_SERVERS;
  }
}
