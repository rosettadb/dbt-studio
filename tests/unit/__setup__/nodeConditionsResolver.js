/**
 * Jest resolver: the unit config runs in jsdom, which resolves package
 * `exports` with the `browser` condition. AWS SDK v3 / Smithy packages map that
 * condition to browser-only ES modules that Jest cannot parse, so resolve those
 * packages with Node conditions. Every other request uses the default resolver.
 */
const NODE_CONDITION_PACKAGES = /^@(aws-sdk|smithy|aws-crypto)\//;

module.exports = (request, options) =>
  options.defaultResolver(
    request,
    NODE_CONDITION_PACKAGES.test(request)
      ? { ...options, conditions: ['node', 'require', 'default'] }
      : options,
  );
