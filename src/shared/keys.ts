export const keys = {
  connection: (isDM: boolean, connectionId: string): string =>
    `conn#${isDM ? 'DM' : 'PLAYERS'}#${connectionId}`,
  connPrefix: (): string => 'conn#',
  connByType: (isDM: boolean): string => `conn#${isDM ? 'DM' : 'PLAYERS'}#`,
  sceneData: (sceneId: string): string => `scenes#${sceneId}#scenedata`,
  fogData: (sceneId: string): string => `scenes#${sceneId}#fogdata`,
  drawData: (sceneId: string): string => `scenes#${sceneId}#drawdata`,
  tokenData: (sceneId: string, tokenId: string): string => `scenes#${sceneId}#tokens#${tokenId}`,
  scenePrefix: (sceneId: string): string => `scenes#${sceneId}`,
  dmScene: (): string => 'dmscene',
  playerScene: (): string => 'playerscene',
  campaignData: (): string => 'campaigndata',
};
