/** Must equal CONNECTION_TYPES plus every alias (tested). */
const CONNECTION_TYPE_LITERALS = new Set([
  'postgres',
  'postgresql',
  'snowflake',
  'bigquery',
  'redshift',
  'databricks',
  'duckdb',
  'sqlite',
  'kinetica',
  'mysql',
  'oracle',
  'ducklake',
]);

/** Names whose values share literals with connection types but mean something else. */
const IGNORED_NAMES = new Set([
  'catalogType',
  'section',
  'currentSection',
  'adapter',
]);

const TABLE_THRESHOLD = 3;

function lastName(node) {
  if (!node) return null;
  switch (node.type) {
    case 'Identifier':
      return node.name;
    case 'MemberExpression':
      return !node.computed && node.property.type === 'Identifier'
        ? node.property.name
        : null;
    case 'ChainExpression':
    case 'TSAsExpression':
    case 'TSNonNullExpression':
      return lastName(node.expression);
    default:
      return null;
  }
}

const isConnectionLiteral = (node) =>
  !!node &&
  node.type === 'Literal' &&
  typeof node.value === 'string' &&
  CONNECTION_TYPE_LITERALS.has(node.value);

const keyName = (property) => {
  if (property.type !== 'Property' || property.computed) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal') return String(property.key.value);
  return null;
};

module.exports = {
  CONNECTION_TYPE_LITERALS,
  rules: {
    'no-connection-type-branch': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          branch:
            "Connection-type branch on '{{value}}'. Put per-database behavior in src/connections/<db>/ and read it through the registries.",
          table:
            'Table keyed by connection types. Move these values into each database descriptor or UI entry.',
        },
      },
      create(context) {
        const filename = context.getFilename().replace(/\\/g, '/');
        if (filename.includes('/src/connections/')) return {};
        return {
          BinaryExpression(node) {
            if (!['===', '!==', '==', '!='].includes(node.operator)) return;
            let literal = null;
            let other = null;
            if (isConnectionLiteral(node.right)) {
              literal = node.right;
              other = node.left;
            } else if (isConnectionLiteral(node.left)) {
              literal = node.left;
              other = node.right;
            }
            if (
              !literal ||
              isConnectionLiteral(other) ||
              IGNORED_NAMES.has(lastName(other))
            )
              return;
            context.report({
              node,
              messageId: 'branch',
              data: { value: literal.value },
            });
          },
          SwitchCase(node) {
            if (!isConnectionLiteral(node.test)) return;
            if (IGNORED_NAMES.has(lastName(node.parent.discriminant))) return;
            context.report({
              node,
              messageId: 'branch',
              data: { value: node.test.value },
            });
          },
          ObjectExpression(node) {
            const hits = node.properties
              .map(keyName)
              .filter((k) => k && CONNECTION_TYPE_LITERALS.has(k));
            if (hits.length >= TABLE_THRESHOLD)
              context.report({ node, messageId: 'table' });
          },
          ArrayExpression(node) {
            if (
              node.elements.filter(isConnectionLiteral).length >=
              TABLE_THRESHOLD
            ) {
              context.report({ node, messageId: 'table' });
            }
          },
        };
      },
    },
  },
};
