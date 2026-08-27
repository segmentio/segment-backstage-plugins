import segmentModule from './alpha';
import { segmentAnalyticsModule } from './module';

describe('segmentAnalyticsModule', () => {
  it('provides an app frontend module through the alpha entry point', () => {
    expect(segmentModule).toBe(segmentAnalyticsModule);
    expect(segmentAnalyticsModule).toMatchObject({
      $$type: '@backstage/FrontendModule',
      pluginId: 'app',
    });
  });
});
