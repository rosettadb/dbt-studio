import mysql from 'mysql2/promise';
import MySqlExtractor from '../../../../src/connections/mysql/mysql.extractor.main';
import type { Table } from '../../../../src/types/backend';

const { GenericContainer, Wait } = require('testcontainers');

describe('MySQL schema extractor foreign keys', () => {
  // Container startup must fit inside the timeout.
  jest.setTimeout(180000);

  let container: any;
  let config: {
    user: string;
    host: string;
    database: string;
    password: string;
    port: number;
  };

  beforeAll(async () => {
    container = await new GenericContainer('mysql:8.0')
      .withEnvironment({
        MYSQL_ROOT_PASSWORD: 'testpassword',
        MYSQL_DATABASE: 'shop',
      })
      .withExposedPorts(3306)
      // The first server during setup listens on port 0; the real one on 3306.
      .withWaitStrategy(Wait.forLogMessage(/ready for connections.*port: 3306/))
      .withStartupTimeout(170000)
      .start();

    config = {
      user: 'root',
      host: container.getHost(),
      database: 'shop',
      password: 'testpassword',
      port: container.getMappedPort(3306),
    };

    const connection = await mysql.createConnection(config);
    try {
      await connection.query('CREATE DATABASE billing');
      await connection.query(
        'CREATE TABLE shop.customers (id INT PRIMARY KEY, name TEXT)',
      );
      await connection.query(
        `CREATE TABLE shop.orders (
           id INT PRIMARY KEY,
           customer_id INT,
           FOREIGN KEY (customer_id) REFERENCES shop.customers(id) ON DELETE CASCADE
         )`,
      );
      await connection.query(
        `CREATE TABLE billing.invoices (
           id INT PRIMARY KEY,
           order_id INT,
           FOREIGN KEY (order_id) REFERENCES shop.orders(id)
         )`,
      );
    } finally {
      await connection.end();
    }
  });

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  it('reads foreign keys, also into another database', async () => {
    const extractor = new MySqlExtractor(config);
    await extractor.connect();
    let tables: Table[];
    try {
      ({ tables } = await extractor.extractSchema());
    } finally {
      await extractor.disconnect();
    }

    const keysOf = (schema: string, table: string, column: string) =>
      tables
        .find((t) => t.schema === schema && t.name === table)!
        .columns.find((c) => c.name === column)!
        .foreignKeys!.map(
          (fk) =>
            `${fk.primaryTableSchema}.${fk.primaryTableName}.${fk.primaryColumnName} ${fk.deleteRule}`,
        );

    expect(keysOf('shop', 'orders', 'customer_id')).toEqual([
      'shop.customers.id CASCADE',
    ]);
    expect(keysOf('shop', 'orders', 'id')).toEqual([]);
    expect(keysOf('billing', 'invoices', 'order_id')).toEqual([
      'shop.orders.id NO ACTION',
    ]);
  });
});
