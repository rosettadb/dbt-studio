describe('loadOracleDriver', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.dontMock('oracledb');
  });

  afterEach(() => {
    jest.dontMock('oracledb');
  });

  it('loads lazily and shares the load across concurrent calls', async () => {
    const imported = jest.fn(() => ({ thin: true }));
    jest.doMock('oracledb', imported);
    const { loadOracleDriver } = await import(
      '../../../../../src/main/utils/oracleHelper'
    );
    expect(imported).not.toHaveBeenCalled();
    const first = loadOracleDriver();
    expect(loadOracleDriver()).toBe(first);
    const driver = await first;
    expect(driver.thin).toBe(true);
    expect(await loadOracleDriver()).toBe(driver);
    expect(imported).toHaveBeenCalledTimes(1);
  });

  it('reports an import failure and retries on the next call', async () => {
    const imported = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('module missing');
      })
      .mockReturnValue({ thin: true });
    jest.doMock('oracledb', imported);
    const { loadOracleDriver } = await import(
      '../../../../../src/main/utils/oracleHelper'
    );
    await expect(loadOracleDriver()).rejects.toThrow(
      'Oracle driver unavailable: module missing',
    );
    await expect(loadOracleDriver()).resolves.toMatchObject({ thin: true });
    expect(imported).toHaveBeenCalledTimes(2);
  });

  it('rejects a driver that has entered Thick mode', async () => {
    jest.doMock('oracledb', () => ({ thin: false }));
    const { loadOracleDriver } = await import(
      '../../../../../src/main/utils/oracleHelper'
    );
    await expect(loadOracleDriver()).rejects.toThrow(
      'Oracle driver unavailable: Oracle Thin mode is required',
    );
  });

  it('keeps output format per call and never initializes native code', async () => {
    const initOracleClient = jest.fn();
    const driver = { thin: true, outFormat: 4001, initOracleClient };
    jest.doMock('oracledb', () => driver);
    const { loadOracleDriver } = await import(
      '../../../../../src/main/utils/oracleHelper'
    );
    await loadOracleDriver();
    expect(driver.outFormat).toBe(4001);
    expect(initOracleClient).not.toHaveBeenCalled();
  });
});
