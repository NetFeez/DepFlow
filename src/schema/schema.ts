import _TSConfig from './TSConfig.js';
import _ImportMap from './ImportMap.js';
import _Config from './Config/Config.js';
import _Resolver from './Config/Resolver.js';
import _Transform, { GlobalTransform as _GlobalTransform } from './Config/Transform.js';
import _Extractor from './Config/Extractor.js';
import _Builder from './Config/Builder.js';
import _Dependency from './Config/Dependency.js';

export { TSConfig } from './TSConfig.js';
export { ImportMap } from './ImportMap.js';
export { Config } from './Config/Config.js';
export { Resolver } from './Config/Resolver.js';
export { Transform, GlobalTransform } from './Config/Transform.js';
export { Extractor } from './Config/Extractor.js';
export { Builder } from './Config/Builder.js';
export { Dependency } from './Config/Dependency.js';

export namespace schema {
    export import TSConfig = _TSConfig;
    export import ImportMap = _ImportMap;
    export import Config = _Config;
    export import Resolver = _Resolver;
    export import Transform = _Transform;
    export import GlobalTransform = _GlobalTransform;
    export import Extractor = _Extractor;
    export import Builder = _Builder;
    export import Dependency = _Dependency;
}

export default schema;