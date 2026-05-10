import withControlCenter, {
  type ControlCenterPluginProps,
} from '../plugin';

/**
 * Expo Config Plugin 호환을 위한 가짜 ExpoConfig.
 * 실제 사용자 app.json을 흉내내는 최소 객체.
 */
function makeFakeConfig(): Record<string, unknown> {
  return {
    name: 'TestApp',
    slug: 'test-app',
    ios: { bundleIdentifier: 'com.acme.app' },
  };
}

describe('withControlCenter (skeleton)', () => {
  const validProps: ControlCenterPluginProps = {
    controls: './src/controls.ts',
    urlScheme: 'myapp',
  };

  it('returns a modified config (does not throw with valid props)', () => {
    const result = withControlCenter(makeFakeConfig() as never, validProps);
    expect(result).toBeDefined();
  });

  it('preserves the original config fields', () => {
    const config = makeFakeConfig();
    const result = withControlCenter(config as never, validProps) as unknown as Record<
      string,
      unknown
    >;
    expect(result.name).toBe('TestApp');
    expect(result.slug).toBe('test-app');
  });

  it('throws when props is undefined', () => {
    expect(() =>
      withControlCenter(makeFakeConfig() as never, undefined as never)
    ).toThrow(/Plugin props are required/);
  });

  it('throws when controls path is missing', () => {
    expect(() =>
      withControlCenter(makeFakeConfig() as never, {
        urlScheme: 'myapp',
      } as never)
    ).toThrow(/`controls` prop/);
  });

  it('throws when urlScheme is missing', () => {
    expect(() =>
      withControlCenter(makeFakeConfig() as never, {
        controls: './src/controls.ts',
      } as never)
    ).toThrow(/`urlScheme` prop/);
  });

  it('accepts optional fields', () => {
    expect(() =>
      withControlCenter(makeFakeConfig() as never, {
        ...validProps,
        appGroupId: 'group.custom',
        extensionName: 'MyControls',
        deploymentTarget: '17.0',
        swiftVersion: '5.9',
      })
    ).not.toThrow();
  });
});
