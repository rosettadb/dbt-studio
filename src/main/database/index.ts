import { DB_FILE } from '../utils/setupHelpers';
import { DatabaseStore } from './store';

// Single shared instance for the whole main process — every service should
// import this rather than constructing its own DatabaseStore, otherwise the
// serialized queue that makes concurrent access safe would be per-instance
// instead of per-file.
const databaseStore = new DatabaseStore(DB_FILE);

export default databaseStore;
export { DatabaseStore } from './store';
export { CURRENT_SCHEMA_VERSION } from './migrations';
