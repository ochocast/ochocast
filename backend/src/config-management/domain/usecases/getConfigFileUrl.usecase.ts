import { Inject, Injectable } from '@nestjs/common';
import { IConfigGateway } from '../gateways/config.gateway';

@Injectable()
export class GetConfigFileUrlUsecase {
  constructor(@Inject('ConfigGateway') private configGateway: IConfigGateway) {}

  async execute(): Promise<string> {
    const latestConfig = await this.configGateway.getLatestConfigFile();

    if (!latestConfig) {
      return 'default-config';
    }

    return latestConfig.fileUrl;
  }
}
