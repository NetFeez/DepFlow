import _TSConfig from './TSConfig.js';
import _ImportMap from './ImportMap.js';

export { TSConfig } from './TSConfig.js';
export { ImportMap } from './ImportMap.js';

export namespace schema {
    export import TSConfig = _TSConfig;
    export import ImportMap = _ImportMap;
}

export default schema;