import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { MITVHomebridgePlatform } from './platform';
// import { MITVHomebridgePlugin } from './plugin';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  // let a = new Logger()
  // .debug('001 PLATFORM_NAME: ',PLATFORM_NAME);
  api.registerPlatform(PLATFORM_NAME, MITVHomebridgePlatform);
  // api.registerPlatform(PLATFORM_NAME, MITVHomebridgePlugin);
};
