export interface PersonProfile {
  id: string;
  displayName: string;
  title?: string;
  churchName?: string;
  subtitle?: string;
  notes?: string;
  /**
   * A label the operator can search and filter by — "Gospel Band", "Preachers".
   *
   * Optional and free text on purpose. It is a way of finding people, not a
   * taxonomy: every record without one is a person like any other, and nothing
   * anywhere requires a group to exist or to be from a fixed list.
   */
  group?: string;
  headshotAssetId?: string;
  logoAssetId?: string;
  favorite?: boolean;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonProfileInput {
  displayName: string;
  title?: string;
  churchName?: string;
  subtitle?: string;
  notes?: string;
  group?: string;
  headshotAssetId?: string;
  logoAssetId?: string;
  favorite?: boolean;
}
