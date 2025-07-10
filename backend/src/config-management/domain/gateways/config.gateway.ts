import { ConfigObject } from '../config';

export interface IConfigGateway {
  addConfigFile: (config: ConfigObject) => Promise<ConfigObject>;
  getLatestConfigFile: () => Promise<ConfigObject | null>;
  deleteConfigFile: (id: string) => Promise<boolean>;
  deleteAllConfigFiles: () => Promise<boolean>;
}
