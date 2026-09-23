import { PROTOP_PLATFORMS, protopBrand } from './protopBrand.js';

export type ProtopPlatform = (typeof PROTOP_PLATFORMS)[number];

export const platforms: readonly ProtopPlatform[] = PROTOP_PLATFORMS;

export function shipsToStore(platform: ProtopPlatform): boolean {
  return platform === 'ios' || platform === 'android';
}

export const brandName: string = protopBrand.name;
