import { EventObject } from 'src/events/domain/event';
import { TrackObject } from 'src/tracks/domain/track';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
// import { TrackEntity } from 'src/tracks/infra/gateways/entities/track.entity';
// pas normal a changer avec ma nouvelle pr j'imagine

describe('EventObject', () => {
  const baseId = 'event-id-123';
  const baseName = 'Test Event';
  const baseDescription = 'An event for testing purposes';
  const baseTags = new TagEntity({
    id: 'tag1-id',
    name: 'tag1',
    videos: [],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  });
  const baseStartDate = new Date('2025-01-01T10:00:00Z');
  const baseEndDate = new Date('2025-01-02T10:00:00Z');
  const baseImageSlug = 'test-event';
  const baseCreatorId = 'creator-id-456';
  const baseCreatedAt = new Date('2025-01-01T09:00:00Z');
  const baseTracks: TrackObject[] = [];

  it('should correctly create an EventObject with provided properties', () => {
    const event = new EventObject(
      baseId,
      baseName,
      baseDescription,
      [baseTags],
      baseStartDate,
      baseEndDate,
      true, // published
      false, // isPrivate
      true, // closed
      baseImageSlug,
      baseTracks,
      baseCreatorId,
      baseCreatedAt,
      undefined,
      [],
    );

    expect(event.id).toBe(baseId);
    expect(event.name).toBe(baseName);
    expect(event.description).toBe(baseDescription);
    expect(event.tags).toEqual([baseTags]);
    expect(event.startDate).toEqual(baseStartDate);
    expect(event.endDate).toEqual(baseEndDate);
    expect(event.published).toBe(true);
    expect(event.isPrivate).toBe(false);
    expect(event.closed).toBe(true);
    expect(event.imageSlug).toBe(baseImageSlug);
    expect(event.tracks).toEqual(baseTracks);
    expect(event.creatorId).toBe(baseCreatorId);
    expect(event.createdAt).toEqual(baseCreatedAt);
  });

  it('should set default values when not explicitly provided', () => {
    const event = new EventObject(
      baseId,
      baseName,
      baseDescription,
      [baseTags],
      baseStartDate,
      baseEndDate,
      undefined, // published (should default to false)
      undefined, // isPrivate (should default to true)
      undefined, // closed (should default to false)
      baseImageSlug,
      baseTracks,
      baseCreatorId,
      baseCreatedAt,
      undefined,
      [],
    );

    expect(event.published).toBe(false);
    expect(event.isPrivate).toBe(true);
    expect(event.closed).toBe(false);
  });

  it('should accept an empty tracks array', () => {
    const event = new EventObject(
      baseId,
      baseName,
      baseDescription,
      [baseTags],
      baseStartDate,
      baseEndDate,
      false,
      true,
      false,
      baseImageSlug,
      [],
      baseCreatorId,
      baseCreatedAt,
      undefined,
      [],
    );

    expect(Array.isArray(event.tracks)).toBe(true);
    expect(event.tracks.length).toBe(0);
  });

  it('should properly handle dates', () => {
    const event = new EventObject(
      baseId,
      baseName,
      baseDescription,
      [baseTags],
      baseStartDate,
      baseEndDate,
      false,
      true,
      false,
      baseImageSlug,
      baseTracks,
      baseCreatorId,
      baseCreatedAt,
      undefined,
      [],
    );

    expect(event.startDate.getTime()).toBeLessThan(event.endDate.getTime());
    expect(event.createdAt).toBeInstanceOf(Date);
  });
});
