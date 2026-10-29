import { createEntityId, toISODateString, EntityId, ISODateString } from './index';

describe('shared-types', () => {
  describe('createEntityId', () => {
    it('creates an EntityId from string', () => {
      const id = createEntityId('test-id');
      expect(id).toBe('test-id');
      expect(typeof id).toBe('string');
    });
  });

  describe('toISODateString', () => {
    it('converts Date to ISO string', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const isoString = toISODateString(date);
      expect(isoString).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('type brands', () => {
    it('EntityId is branded string', () => {
      const id: EntityId = createEntityId('test');
      expect(id).toBeDefined();
    });

    it('ISODateString is branded string', () => {
      const dateStr: ISODateString = toISODateString(new Date());
      expect(dateStr).toBeDefined();
    });
  });
});
